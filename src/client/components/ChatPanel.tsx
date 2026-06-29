import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Bot,
  Check,
  CircleAlert,
  Loader2,
  MapPin,
  PencilLine,
  PlayCircle,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  WalletCards,
  X
} from "lucide-react";
import type {
  BrandGovernanceResult,
  ChatResponse,
  ConversationMessage,
  CustomerProfile,
  Product,
  ShoppingContext
} from "../../shared/types";
import { sanitizeBudget, sanitizeCustomerProfile, sanitizeText } from "../../shared/validation";
import { fetchHealth, fetchProducts, sendChat, trackAnalyticsEvent } from "../lib/api";
import type { AgentActivityInput } from "../lib/agentActivity";
import {
  buildPreferenceWelcome,
  buildShoppingContext,
  getPreferenceStarters,
  inferBudgetFromText,
  inferPreferenceFromText,
  preferenceKeys,
  type PreferenceKey
} from "../lib/preferenceProfiles";
import { IconButton } from "./IconButton";
import { SourceList } from "./SourceList";

interface ChatPanelProps {
  customerProfile: CustomerProfile;
  onAgentActivity: (activity: AgentActivityInput) => void;
  onCustomerProfileChange: (profile: CustomerProfile) => void;
  onProducts: (products: Product[]) => void;
  onShoppingContextChange: (context: ShoppingContext) => void;
}

export function ChatPanel({
  customerProfile,
  onAgentActivity,
  onCustomerProfileChange,
  onProducts,
  onShoppingContextChange
}: ChatPanelProps) {
  const initialPreference = getProfilePreference(customerProfile);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ConversationMessage[]>(() => [
    { role: "assistant", content: buildPreferenceWelcome(initialPreference, customerProfile) }
  ]);
  const [input, setInput] = useState("");
  const [budget, setBudget] = useState(customerProfile.budget ?? 150);
  const [preference, setPreference] = useState<PreferenceKey>(initialPreference);
  const [profileDraft, setProfileDraft] = useState<CustomerProfile>(customerProfile);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState<ChatResponse | null>(null);
  const [runtimeMode, setRuntimeMode] = useState<ChatResponse["mode"]>("demo");
  const [error, setError] = useState<string | null>(null);
  const [isRunningDemo, setIsRunningDemo] = useState(false);

  const profile: CustomerProfile = useMemo(
    () => ({
      ...customerProfile,
      budget,
      preferences: mergePreferences(preference, customerProfile.preferences)
    }),
    [budget, customerProfile, preference]
  );
  const shoppingContext = useMemo(() => buildShoppingContext(preference, budget), [budget, preference]);
  const starterMessages = useMemo(() => getPreferenceStarters(preference), [preference]);
  const welcomeMessage = useMemo(() => buildPreferenceWelcome(preference, profile), [preference, profile]);
  const hasUserMessages = messages.some((message) => message.role === "user");

  useEffect(() => {
    fetchHealth()
      .then((health) => setRuntimeMode(health.mode))
      .catch(() => setRuntimeMode("demo"));
  }, []);

  useEffect(() => {
    onShoppingContextChange(shoppingContext);
  }, [onShoppingContextChange, shoppingContext]);

  useEffect(() => {
    const nextPreferences = mergePreferences(preference, customerProfile.preferences);
    const shouldStore =
      customerProfile.budget !== budget ||
      JSON.stringify(customerProfile.preferences ?? []) !== JSON.stringify(nextPreferences);

    if (shouldStore) {
      onCustomerProfileChange({
        ...customerProfile,
        budget,
        preferences: nextPreferences
      });
    }
  }, [budget, customerProfile, onCustomerProfileChange, preference]);

  useEffect(() => {
    setProfileDraft(profile);
  }, [profile]);

  useEffect(() => {
    if (hasUserMessages) return;
    setMessages([{ role: "assistant", content: welcomeMessage }]);
  }, [hasUserMessages, welcomeMessage]);

  function saveProfileDraft() {
    const safeDraft = sanitizeCustomerProfile(profileDraft) ?? {};
    const nextProfile: CustomerProfile = {
      ...profile,
      ...safeDraft,
      budget,
      preferences: mergePreferences(preference, safeDraft.preferences)
    };

    onCustomerProfileChange(nextProfile);
    onAgentActivity({
      agent: "Customer Profile / Preference Agent",
      action: "Profile saved",
      detail: "Stores shopper identity, location, loyalty tier, purchase intent, history, budget, and active preference.",
      tone: "pine"
    });
    setIsProfileOpen(false);
  }

  function handlePreferenceChange(nextPreference: PreferenceKey) {
    if (!preferenceKeys.includes(nextPreference)) return;
    setPreference(nextPreference);
    onShoppingContextChange(buildShoppingContext(nextPreference, budget));
    onAgentActivity({
      agent: "Customer Profile / Preference Agent",
      action: `${buildShoppingContext(nextPreference, budget).preferenceLabel} preference selected`,
      detail: "Updates the stored shopper profile and triggers product discovery for the selected retail journey.",
      tone: "pine"
    });
  }

  function handleBudgetChange(nextBudget: number) {
    const safeBudget = sanitizeBudget(nextBudget) ?? 150;
    setBudget(safeBudget);
    onShoppingContextChange(buildShoppingContext(preference, safeBudget));
    onAgentActivity({
      agent: "Customer Profile / Preference Agent",
      action: `Budget changed to $${safeBudget}`,
      detail: "Refreshes recommendation constraints and stores the shopper's budget ceiling for future turns.",
      tone: "pine"
    });
  }

  function toggleProfileEditor() {
    setIsProfileOpen((open) => !open);
    onAgentActivity({
      agent: "Customer Profile / Preference Agent",
      action: isProfileOpen ? "Profile editor closed" : "Profile editor opened",
      detail: "Shows the stored shopper profile that personalizes the welcome message and recommendations.",
      tone: "pine"
    });
  }

  async function submit(message: string) {
    const safeMessage = sanitizeText(message, 1_000);
    if (isLoading) return;
    if (!safeMessage) {
      setError("Please enter a message before sending.");
      return;
    }

    const inferredPreference = inferPreferenceFromText(safeMessage, preference);
    const inferredBudget = inferBudgetFromText(safeMessage);
    const activePreference = inferredPreference?.preference ?? preference;
    const activeBudget = inferredBudget?.budget ?? budget;
    const activeContext = buildShoppingContext(activePreference, activeBudget);
    const activeProfile: CustomerProfile = {
      ...profile,
      budget: activeBudget,
      preferences: mergePreferences(activePreference, profile.preferences)
    };

    onAgentActivity({
      agent: "Retail Experience Orchestrator Agent",
      action: "Customer request submitted",
      detail: "Classifies intent, sends context to OpenAI, calls product tools, and coordinates downstream agents.",
      tone: "iris"
    });

    if (inferredPreference || inferredBudget) {
      if (activePreference !== preference) setPreference(activePreference);
      if (activeBudget !== budget) setBudget(activeBudget);
      onShoppingContextChange(activeContext);
      if (activePreference !== preference || activeBudget !== budget) {
        onCustomerProfileChange({
          ...customerProfile,
          budget: activeBudget,
          preferences: activeProfile.preferences
        });
      }

      if (inferredPreference) {
        onAgentActivity({
          agent: "Customer Profile / Preference Agent",
          action:
            activePreference === preference
              ? `${activeContext.preferenceLabel} intent confirmed from chat`
              : `${activeContext.preferenceLabel} intent inferred from chat`,
          detail: `Detected ${inferredPreference.matchedSignals.join(", ")} signals at ${Math.round(
            inferredPreference.confidence * 100
          )}% confidence and handed the context to product discovery.`,
          tone: "pine"
        });
      }

      if (inferredBudget) {
        onAgentActivity({
          agent: "Customer Profile / Preference Agent",
          action: `Budget inferred at $${activeBudget}`,
          detail: `Detected ${inferredBudget.matchedSignal} from chat at ${Math.round(
            inferredBudget.confidence * 100
          )}% confidence and updated the budget slider.`,
          tone: "saffron"
        });
      }
    }

    const nextMessages: ConversationMessage[] = [...messages, { role: "user", content: safeMessage }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const result = await sendChat({
        conversationId,
        customerProfile: activeProfile,
        history: messages,
        message: safeMessage
      });

      setConversationId(result.conversationId);
      setLastResponse(result);
      setRuntimeMode(result.mode);
      onProducts(result.recommendedProducts);
      if (result.recommendedProducts.length) {
        onAgentActivity({
          agent: "Recommendation Agent",
          action: `${activeContext.preferenceLabel} products refreshed from chat`,
          detail: `Uses the inferred ${activeContext.preferenceLabel.toLowerCase()} preference, budget, profile, and catalog tags to update the product rail.`,
          tone: "pine"
        });
      }
      setMessages([...nextMessages, { role: "assistant", content: result.answer }]);
      onAgentActivity({
        agent: "Brand Governance Agent",
        action: `${result.governance.status} response review`,
        detail: "Checks tone, unsupported claims, invented discounts, escalation triggers, and merchandising discipline before the answer is shown.",
        tone: result.governance.status === "approved" ? "pine" : result.governance.status === "watch" ? "saffron" : "coral"
      });
    } catch (requestError) {
      onAgentActivity({
        agent: "Escalation / Guardrail Agent",
        action: "Agent service error",
        detail: "Flags the failed request path so a human can retry or inspect the live service.",
        tone: "coral"
      });
      setError(requestError instanceof Error ? requestError.message : "Unable to reach the agent service.");
    } finally {
      setIsLoading(false);
    }
  }

  async function runDemoJourney() {
    if (isLoading || isRunningDemo) return;

    const demoPreference: PreferenceKey = "marathon";
    const demoBudget = 150;
    const demoContext = buildShoppingContext(demoPreference, demoBudget);
    const demoMessage = "I am going to participate in a marathon next week and need a running shoe under $150.";
    const demoProfile: CustomerProfile = {
      ...customerProfile,
      budget: demoBudget,
      purchaseIntent: "ready_to_buy",
      preferences: mergePreferences(demoPreference, customerProfile.preferences)
    };

    setIsRunningDemo(true);
    setError(null);
    setPreference(demoPreference);
    setBudget(demoBudget);
    onCustomerProfileChange(demoProfile);
    onShoppingContextChange(demoContext);
    setMessages((current) => [
      ...current,
      { role: "user", content: demoMessage },
      {
        role: "assistant",
        content:
          "I picked a marathon-ready shoe setup under $150, detected a 3D/price-view hesitation, then triggered a recovery bundle before cart and checkout events."
      }
    ]);

    onAgentActivity({
      agent: "Retail Experience Orchestrator Agent",
      action: "Run Demo Journey started",
      detail: "Triggers preference inference, product selection, 3D and price signals, conversion recovery, cart intent, and analytics events in one guided path.",
      tone: "iris"
    });

    try {
      const demoProducts = await fetchProducts({
        query: demoContext.query,
        tags: demoContext.tags,
        maxPrice: demoBudget,
        strictBudget: false,
        limit: 4
      });
      onProducts(demoProducts);

      const featuredProduct = demoProducts[0];
      const threeDProduct = demoProducts.find((product) => product.modelUrl) ?? featuredProduct;
      const recoveryProduct = demoProducts.find((product) => product.id !== featuredProduct?.id) ?? demoProducts[1];

      await trackAnalyticsEvent({
        eventName: "preference_selected",
        metadata: {
          preference: demoContext.preference,
          preferenceLabel: demoContext.preferenceLabel,
          budget: demoBudget,
          source: "run_demo_journey"
        }
      });

      if (featuredProduct) {
        await trackAnalyticsEvent({
          eventName: "product_selected",
          productIds: [featuredProduct.id],
          value: featuredProduct.price,
          metadata: {
            preference: demoContext.preference,
            source: "run_demo_journey",
            product_categories: [featuredProduct.category],
            product_names: [featuredProduct.name]
          }
        });
        await trackAnalyticsEvent({
          eventName: "product_price_viewed",
          productIds: [featuredProduct.id],
          value: featuredProduct.price,
          metadata: {
            preference: demoContext.preference,
            preferenceLabel: demoContext.preferenceLabel,
            source: "run_demo_journey",
            budget: demoBudget,
            price_to_budget_ratio: Number((featuredProduct.price / demoBudget).toFixed(2)),
            product_categories: [featuredProduct.category],
            product_names: [featuredProduct.name]
          }
        });
        if (threeDProduct) {
          await trackAnalyticsEvent({
            eventName: "product_3d_selected",
            productIds: [threeDProduct.id],
            metadata: {
              preference: demoContext.preference,
              source: "run_demo_journey",
              product_categories: [threeDProduct.category],
              product_names: [threeDProduct.name]
            }
          });
        }
        await trackAnalyticsEvent({
          eventName: "conversion_recovery_shown",
          productIds: [featuredProduct.id, recoveryProduct?.id].filter((productId): productId is string => Boolean(productId)),
          value: featuredProduct.price + (recoveryProduct?.price ?? 0),
          metadata: {
            preference: demoContext.preference,
            preferenceLabel: demoContext.preferenceLabel,
            source: "run_demo_journey",
            budget: demoBudget,
            recovery_trigger: "3D model + price viewed",
            recovery_reason: "High-intent product engagement without cart_add",
            offer_type: recoveryProduct ? "cross_sell" : "checkout_assist",
            offer_label: "Approved demo recovery bundle",
            expected_uplift_percent: 14,
            abandonment_window_seconds: 4,
            suggested_product: recoveryProduct?.id,
            suggested_product_name: recoveryProduct?.name,
            product_categories: [featuredProduct.category, recoveryProduct?.category].filter(Boolean),
            product_names: [featuredProduct.name, recoveryProduct?.name].filter(Boolean)
          }
        });
        await trackAnalyticsEvent({
          eventName: "conversion_recovery_accepted",
          productIds: [featuredProduct.id, recoveryProduct?.id].filter((productId): productId is string => Boolean(productId)),
          value: featuredProduct.price + (recoveryProduct?.price ?? 0),
          metadata: {
            preference: demoContext.preference,
            preferenceLabel: demoContext.preferenceLabel,
            source: "run_demo_journey",
            budget: demoBudget,
            recovery_trigger: "3D model + price viewed",
            offer_type: recoveryProduct ? "cross_sell" : "checkout_assist",
            offer_label: "Approved demo recovery bundle",
            expected_uplift_percent: 14,
            suggested_product: recoveryProduct?.id,
            suggested_product_name: recoveryProduct?.name,
            product_categories: [featuredProduct.category, recoveryProduct?.category].filter(Boolean),
            product_names: [featuredProduct.name, recoveryProduct?.name].filter(Boolean)
          }
        });
        if (recoveryProduct) {
          await trackAnalyticsEvent({
            eventName: "cross_sell_accepted",
            productIds: [recoveryProduct.id],
            value: recoveryProduct.price,
            metadata: {
              preference: demoContext.preference,
              source: "run_demo_journey",
              anchor_product: featuredProduct.name,
              suggested_product: recoveryProduct.id,
              suggested_product_name: recoveryProduct.name,
              product_categories: [recoveryProduct.category],
              product_names: [recoveryProduct.name]
            }
          });
        }
        await trackAnalyticsEvent({
          eventName: "cart_add",
          productIds: [featuredProduct.id, recoveryProduct?.id].filter((productId): productId is string => Boolean(productId)),
          value: featuredProduct.price + (recoveryProduct?.price ?? 0),
          metadata: {
            preference: demoContext.preference,
            source: "run_demo_journey",
            product_categories: [featuredProduct.category, recoveryProduct?.category].filter(Boolean),
            product_names: [featuredProduct.name, recoveryProduct?.name].filter(Boolean)
          }
        });
        await trackAnalyticsEvent({
          eventName: "checkout_started",
          productIds: [featuredProduct.id, recoveryProduct?.id].filter((productId): productId is string => Boolean(productId)),
          value: featuredProduct.price + (recoveryProduct?.price ?? 0),
          metadata: {
            preference: demoContext.preference,
            source: "run_demo_journey",
            demoSignal: true,
            recovery_trigger: "3D model + price viewed",
            product_categories: [featuredProduct.category, recoveryProduct?.category].filter(Boolean),
            product_names: [featuredProduct.name, recoveryProduct?.name].filter(Boolean)
          }
        });
      }

      onAgentActivity({
        agent: "GA Conversion Recovery Agent",
        action: "Demo recovery journey completed",
        detail: `Used 3D and price signals for ${featuredProduct?.name ?? "a marathon product"} to trigger a recovery play, bundle suggestion, cart intent, and checkout intent.`,
        tone: "saffron"
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to run demo journey.");
    } finally {
      setIsRunningDemo(false);
    }
  }

  return (
    <section className="panel flex min-h-[620px] flex-col overflow-hidden">
      <div className="border-b border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Guided selling console</h2>
            <p className="mt-1 text-sm text-graphite">Conversation, customer context, and policy controls in one workflow</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={runDemoJourney}
              disabled={isLoading || isRunningDemo}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-pine bg-pine px-3 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRunningDemo ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={15} />}
              Run Demo Journey
            </button>
            <span className="rounded bg-emerald-50 px-3 py-1 text-xs font-semibold text-pine">
              {(lastResponse?.mode ?? runtimeMode) === "live_openai" ? "Live OpenAI" : "Demo"}
            </span>
          </div>
        </div>

        <div className="mt-5 rounded-md border border-emerald-100 bg-emerald-50 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-pine text-white">
                <UserRound size={18} />
              </span>
              <div>
                <div className="text-sm font-semibold text-ink">{welcomeMessage}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-graphite">
                  <span className="rounded bg-white px-2 py-1 ring-1 ring-emerald-100">{profile.location ?? "Store visitor"}</span>
                  <span className="rounded bg-white px-2 py-1 capitalize ring-1 ring-emerald-100">{profile.loyaltyTier ?? "member"} member</span>
                  <span className="rounded bg-white px-2 py-1 capitalize ring-1 ring-emerald-100">{profile.purchaseIntent?.replace(/_/g, " ") ?? "comparing"}</span>
                </div>
              </div>
            </div>
            <IconButton label={isProfileOpen ? "Close customer profile" : "Edit customer profile"} onClick={toggleProfileEditor}>
              {isProfileOpen ? <X size={17} /> : <PencilLine size={17} />}
            </IconButton>
          </div>
          {isProfileOpen ? (
            <CustomerProfileForm
              draft={profileDraft}
              onChange={setProfileDraft}
              onCancel={() => {
                setProfileDraft(profile);
                setIsProfileOpen(false);
              }}
              onSave={saveProfileDraft}
            />
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
          <SignalTile icon={<SlidersHorizontal size={15} />} label="Need state" value={shoppingContext.preferenceLabel} />
          <SignalTile icon={<WalletCards size={15} />} label="Budget ceiling" value={`$${budget}`} />
          <SignalTile icon={<MapPin size={15} />} label="Journey" value="Consideration" />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <label className="text-xs font-semibold uppercase text-graphite">
            Preference
            <select
              value={preference}
              onChange={(event) => handlePreferenceChange(event.target.value as PreferenceKey)}
              className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-medium normal-case text-ink outline-none focus:border-pine"
            >
              <option value="marathon">Marathon</option>
              <option value="travel">Travel</option>
              <option value="recovery">Recovery</option>
              <option value="weather">Weather</option>
            </select>
          </label>
          <label className="text-xs font-semibold uppercase text-graphite">
            Budget
            <div className="mt-2 grid grid-cols-[1fr_72px] items-center gap-3">
              <input
                aria-label="Budget slider"
                value={budget}
                min={40}
                max={250}
                step={5}
                onChange={(event) => handleBudgetChange(Number(event.target.value))}
                type="range"
                className="accent-pine"
              />
              <input
                aria-label="Budget amount"
                value={budget}
                min={40}
                max={250}
                step={5}
                onChange={(event) => handleBudgetChange(Number(event.target.value))}
                type="number"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-medium normal-case text-ink outline-none focus:border-pine"
              />
            </div>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {shoppingContext.tags.slice(0, 5).map((tag) => (
            <span key={tag} className="rounded bg-white px-2 py-1 text-xs font-semibold text-graphite ring-1 ring-slate-200">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white p-4 sm:p-5">
        <form
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit(input);
          }}
        >
          <IconButton label="Customer settings" onClick={toggleProfileEditor}>
            <SlidersHorizontal size={17} />
          </IconButton>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            maxLength={1000}
            placeholder={`Ask about ${shoppingContext.preferenceLabel.toLowerCase()} products, policies, orders, or checkout`}
            className="h-10 min-w-0 rounded-md border border-slate-200 bg-white px-4 text-sm text-ink outline-none focus:border-pine"
          />
          <IconButton label="Send message" type="submit" disabled={isLoading}>
            {isLoading ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
          </IconButton>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {starterMessages.map((message) => (
            <button
              key={message}
              type="button"
              onClick={() => submit(message)}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-graphite transition hover:border-pine hover:bg-emerald-50 hover:text-pine"
            >
              {message}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[260px] flex-1 overflow-y-auto bg-[linear-gradient(180deg,#ffffff,#f8fafc)] p-4 sm:p-5">
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={[
                "flex gap-3",
                message.role === "user" ? "justify-end" : "justify-start"
              ].join(" ")}
            >
              {message.role === "assistant" ? (
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-pine text-white">
                  <Bot size={18} />
                </div>
              ) : null}
              <div
                className={[
                  "max-w-[82%] rounded-md px-4 py-3 text-sm leading-6 shadow-sm",
                  message.role === "user" ? "bg-ink text-white" : "border border-slate-200 bg-white text-ink"
                ].join(" ")}
              >
                {message.role === "assistant" ? <FormattedAssistantMessage content={message.content} /> : message.content}
              </div>
              {message.role === "user" ? (
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-coral text-white">
                  <UserRound size={18} />
                </div>
              ) : null}
            </div>
          ))}
          {isLoading ? (
            <div className="flex items-center gap-3 text-sm text-graphite">
              <Loader2 size={18} className="animate-spin" />
              Thinking through product, policy, and intent signals
            </div>
          ) : null}
        </div>

        {lastResponse ? <SourceList citations={lastResponse.citations} /> : null}

        {lastResponse ? <GovernancePanel governance={lastResponse.governance} /> : null}

        {lastResponse?.guardrailFlags.length ? (
          <div className="mt-4 flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <CircleAlert size={18} />
            Human escalation recommended for this request.
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        ) : null}
      </div>

    </section>
  );
}

function SignalTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-white p-3 ring-1 ring-slate-200">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-emerald-50 text-pine">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase text-graphite">{label}</div>
        <div className="truncate text-sm font-semibold text-ink">{value}</div>
      </div>
    </div>
  );
}

type MessageBlock =
  | { type: "heading"; depth: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

function FormattedAssistantMessage({ content }: { content: string }) {
  const blocks = parseMessageBlocks(content);

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const HeadingTag = block.depth <= 2 ? "h3" : "h4";
          return (
            <HeadingTag key={`${block.type}-${index}`} className="text-sm font-semibold leading-6 text-ink">
              {renderInline(block.text)}
            </HeadingTag>
          );
        }

        if (block.type === "ul") {
          return (
            <ul key={`${block.type}-${index}`} className="space-y-2 pl-4">
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`} className="list-disc text-sm leading-6 text-ink marker:text-pine">
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === "ol") {
          return (
            <ol key={`${block.type}-${index}`} className="space-y-2 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`} className="list-decimal text-sm leading-6 text-ink marker:font-semibold marker:text-pine">
                  {renderInline(item)}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p key={`${block.type}-${index}`} className="text-sm leading-6 text-ink">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}

function parseMessageBlocks(content: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  const paragraphLines: string[] = [];
  let activeList: { type: "ul" | "ol"; items: string[] } | null = null;

  function flushParagraph() {
    if (!paragraphLines.length) return;
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ").trim() });
    paragraphLines.length = 0;
  }

  function flushList() {
    if (!activeList) return;
    blocks.push(activeList);
    activeList = null;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", depth: headingMatch[1].length, text: headingMatch[2].trim() });
      continue;
    }

    const unorderedMatch = /^[-*]\s+(.+)$/.exec(line);
    if (unorderedMatch) {
      flushParagraph();
      if (activeList?.type !== "ul") flushList();
      activeList = activeList ?? { type: "ul", items: [] };
      activeList.items.push(unorderedMatch[1].trim());
      continue;
    }

    const orderedMatch = /^\d+[.)]\s+(.+)$/.exec(line);
    if (orderedMatch) {
      flushParagraph();
      if (activeList?.type !== "ol") flushList();
      activeList = activeList ?? { type: "ol", items: [] };
      activeList.items.push(orderedMatch[1].trim());
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks.length ? blocks : [{ type: "paragraph", text: content }];
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={`${part}-${index}`} className="rounded bg-slate-100 px-1 py-0.5 text-[0.92em] font-semibold text-ink">
          {part.slice(1, -1)}
        </code>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function CustomerProfileForm({
  draft,
  onCancel,
  onChange,
  onSave
}: {
  draft: CustomerProfile;
  onCancel: () => void;
  onChange: (profile: CustomerProfile) => void;
  onSave: () => void;
}) {
  const shoppingHistory = draft.shoppingHistory?.join(", ") ?? "";

  return (
    <div className="mt-4 grid gap-3 border-t border-emerald-100 pt-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold uppercase text-graphite">
          Name
          <input
            value={draft.name ?? ""}
            maxLength={160}
            onChange={(event) => onChange({ ...draft, name: sanitizeText(event.target.value) ?? "" })}
            className="mt-2 h-10 w-full rounded-md border border-emerald-100 bg-white px-3 text-sm font-medium normal-case text-ink outline-none focus:border-pine"
          />
        </label>
        <label className="text-xs font-semibold uppercase text-graphite">
          Location
          <input
            value={draft.location ?? ""}
            maxLength={160}
            onChange={(event) => onChange({ ...draft, location: sanitizeText(event.target.value) ?? "" })}
            className="mt-2 h-10 w-full rounded-md border border-emerald-100 bg-white px-3 text-sm font-medium normal-case text-ink outline-none focus:border-pine"
          />
        </label>
        <label className="text-xs font-semibold uppercase text-graphite">
          Loyalty
          <select
            value={draft.loyaltyTier ?? "member"}
            onChange={(event) => onChange({ ...draft, loyaltyTier: event.target.value as CustomerProfile["loyaltyTier"] })}
            className="mt-2 h-10 w-full rounded-md border border-emerald-100 bg-white px-3 text-sm font-medium normal-case text-ink outline-none focus:border-pine"
          >
            <option value="guest">Guest</option>
            <option value="member">Member</option>
            <option value="silver">Silver</option>
            <option value="gold">Gold</option>
            <option value="platinum">Platinum</option>
          </select>
        </label>
        <label className="text-xs font-semibold uppercase text-graphite">
          Intent
          <select
            value={draft.purchaseIntent ?? "comparing"}
            onChange={(event) => onChange({ ...draft, purchaseIntent: event.target.value as CustomerProfile["purchaseIntent"] })}
            className="mt-2 h-10 w-full rounded-md border border-emerald-100 bg-white px-3 text-sm font-medium normal-case text-ink outline-none focus:border-pine"
          >
            <option value="researching">Researching</option>
            <option value="comparing">Comparing</option>
            <option value="ready_to_buy">Ready to buy</option>
            <option value="support">Support</option>
          </select>
        </label>
      </div>
      <label className="text-xs font-semibold uppercase text-graphite">
        History
        <input
          value={shoppingHistory}
          maxLength={300}
          onChange={(event) =>
            onChange({
              ...draft,
              shoppingHistory: event.target.value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
            })
          }
          className="mt-2 h-10 w-full rounded-md border border-emerald-100 bg-white px-3 text-sm font-medium normal-case text-ink outline-none focus:border-pine"
        />
      </label>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-graphite transition hover:border-slate-300"
        >
          <X size={15} />
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-pine bg-pine px-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
        >
          <Check size={15} />
          Save profile
        </button>
      </div>
    </div>
  );
}

function GovernancePanel({ governance }: { governance: BrandGovernanceResult }) {
  const statusClass =
    governance.status === "approved"
      ? "border-emerald-200 bg-emerald-50 text-pine"
      : governance.status === "escalate"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-slate-50 text-graphite";

  return (
    <div className={`mt-4 rounded-md border p-3 ${statusClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck size={16} />
          Brand governance
        </div>
        <span className="rounded bg-white/70 px-2 py-1 text-xs font-semibold capitalize">{governance.status}</span>
      </div>
      <div className="mt-3 grid gap-2">
        {governance.checks.map((check) => (
          <div key={check.id} className="rounded bg-white/70 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-ink">{check.label}</span>
              <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold capitalize text-graphite">{check.status}</span>
            </div>
            <p className="mt-1 text-xs text-graphite">{check.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function getProfilePreference(profile: CustomerProfile): PreferenceKey {
  const storedPreference = profile.preferences?.find((preference): preference is PreferenceKey =>
    preferenceKeys.includes(preference as PreferenceKey)
  );

  return storedPreference ?? "travel";
}

function mergePreferences(preference: PreferenceKey, preferences: string[] = []) {
  return [preference, ...preferences.filter((item) => item !== preference)].slice(0, 6);
}
