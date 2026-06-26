import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  DatabaseZap,
  Gauge,
  MessageSquareText,
  PackageSearch,
  PlugZap,
  Radio,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  WifiOff
} from "lucide-react";
import type { CustomerProfile, Product, ShoppingContext } from "../shared/types";
import { fetchProducts, trackAnalyticsEvent } from "./lib/api";
import type { AgentActivity, AgentActivityInput } from "./lib/agentActivity";
import { readStoredCustomerProfile, storeCustomerProfile } from "./lib/customerProfile";
import { initializeGoogleAnalytics } from "./lib/googleAnalytics";
import { buildShoppingContext } from "./lib/preferenceProfiles";
import { AgentCallout } from "./components/AgentCallout";
import { AgentActivityTimeline } from "./components/AgentActivityTimeline";
import { ChatPanel } from "./components/ChatPanel";
import { Dashboard } from "./components/Dashboard";
import { ProductRail } from "./components/ProductRail";
import { IconButton } from "./components/IconButton";

type ViewMode = "associate" | "analytics";
type GoogleAnalyticsMode = "checking" | "live" | "blocked" | "demo";

function timestamp() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const initialAgentActivity: AgentActivity = {
  agent: "Retail Experience Orchestrator Agent",
  action: "Demo workspace ready",
  detail: "Coordinating profile, product discovery, merchandising, knowledge, governance, and analytics agents.",
  tone: "pine",
  timestamp: timestamp()
};

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("associate");
  const [products, setProducts] = useState<Product[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [shoppingContext, setShoppingContext] = useState<ShoppingContext>(() => buildShoppingContext("travel", 150));
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile>(() => readStoredCustomerProfile());
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [railSource, setRailSource] = useState("Preference match");
  const [agentActivity, setAgentActivity] = useState<AgentActivity>(() => initialAgentActivity);
  const [agentActivities, setAgentActivities] = useState<AgentActivity[]>(() => [initialAgentActivity]);
  const [googleAnalyticsMode, setGoogleAnalyticsMode] = useState<GoogleAnalyticsMode>("checking");
  const [googleAnalyticsDetail, setGoogleAnalyticsDetail] = useState("Checking GA diagnostics");

  useEffect(() => {
    initializeGoogleAnalytics().catch(() => undefined);
    trackAnalyticsEvent({
      eventName: "page_viewed",
      metadata: {
        page_location: window.location.href,
        page_title: document.title || "Brand Experience Agent",
        source: "app_load"
      }
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    fetchProducts()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/admin/ga4/diagnostics")
      .then(async (response) => {
        if (!response.ok) throw new Error(`GA diagnostics failed: ${response.status}`);
        return response.json() as Promise<{
          realtimeError?: string | null;
          status?: { measurementConfigured?: boolean; reportingConfigured?: boolean };
        }>;
      })
      .then((diagnostics) => {
        if (!isMounted) return;
        if (diagnostics.realtimeError) {
          setGoogleAnalyticsMode("blocked");
          setGoogleAnalyticsDetail(diagnostics.realtimeError.includes("Data API") ? "Data API disabled" : "GA readback blocked");
          return;
        }

        if (diagnostics.status?.measurementConfigured) {
          setGoogleAnalyticsMode("live");
          setGoogleAnalyticsDetail("GA events configured");
          return;
        }

        setGoogleAnalyticsMode("demo");
        setGoogleAnalyticsDetail("GA not configured");
      })
      .catch(() => {
        if (!isMounted) return;
        setGoogleAnalyticsMode("demo");
        setGoogleAnalyticsDetail("Using in-app analytics");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setIsLoadingProducts(true);
    fetchProducts({
      query: shoppingContext.query,
      tags: shoppingContext.tags,
      maxPrice: shoppingContext.budget,
      strictBudget: false,
      limit: 4
    })
      .then((catalog) => {
        setProducts(catalog);
        setRailSource("Preference match");
      })
      .catch(() => setProducts([]))
      .finally(() => setIsLoadingProducts(false));

    trackAnalyticsEvent({
      eventName: "preference_selected",
      metadata: {
        preference: shoppingContext.preference,
        preferenceLabel: shoppingContext.preferenceLabel,
        budget: shoppingContext.budget,
        loyalty_tier: customerProfile.loyaltyTier,
        purchase_intent: customerProfile.purchaseIntent,
        preference_count: customerProfile.preferences?.length ?? 0
      }
    }).catch(() => undefined);
  }, [customerProfile.loyaltyTier, customerProfile.preferences?.length, customerProfile.purchaseIntent, shoppingContext]);

  useEffect(() => {
    if (!products.length) return;

    trackAnalyticsEvent({
      eventName: "product_impression",
      productIds: products.map((product) => product.id),
      metadata: {
        preference: shoppingContext.preference,
        source: railSource,
        budget: shoppingContext.budget,
        product_count: products.length,
        product_categories: [...new Set(products.map((product) => product.category))],
        product_names: products.map((product) => product.name),
        loyalty_tier: customerProfile.loyaltyTier,
        purchase_intent: customerProfile.purchaseIntent
      }
    }).catch(() => undefined);
  }, [customerProfile.loyaltyTier, customerProfile.purchaseIntent, products, railSource, shoppingContext.budget, shoppingContext.preference]);

  const handleProductsFromChat = useCallback((nextProducts: Product[]) => {
    if (!nextProducts.length) return;
    setProducts(nextProducts);
    setRailSource("Live chat recommendation");
  }, []);

  const showAgentActivity = useCallback((activity: AgentActivityInput) => {
    const nextActivity = {
      ...activity,
      timestamp: timestamp()
    };

    setAgentActivity(nextActivity);
    setAgentActivities((current) => [nextActivity, ...current].slice(0, 10));
  }, []);

  const handleShoppingContextChange = useCallback((context: ShoppingContext) => {
    setShoppingContext(context);
  }, []);

  const handleCustomerProfileChange = useCallback((profile: CustomerProfile) => {
    setCustomerProfile(profile);
    storeCustomerProfile(profile);
  }, []);

  return (
    <main className="min-h-screen bg-cloud text-ink">
      <AgentCallout activity={agentActivity} />
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[92px_1fr]">
        <aside className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:h-screen lg:flex-col lg:items-center lg:justify-start lg:border-b-0 lg:border-r lg:px-0 lg:py-5">
          <div className="grid h-12 w-12 place-items-center rounded-md bg-ink text-white shadow-panel">
            <Sparkles size={21} />
          </div>
          <nav className="flex gap-3 lg:mt-8 lg:flex-col">
            <IconButton
              label="Associate workspace"
              active={viewMode === "associate"}
              onClick={() => {
                setViewMode("associate");
                showAgentActivity({
                  agent: "Retail Experience Orchestrator Agent",
                  action: "Associate workspace opened",
                  detail: "Prepares customer context, preference state, live product rail, and guided selling tools.",
                  tone: "pine"
                });
              }}
            >
              <MessageSquareText size={18} />
            </IconButton>
            <IconButton
              label="Analytics dashboard"
              active={viewMode === "analytics"}
              onClick={() => {
                setViewMode("analytics");
                showAgentActivity({
                  agent: "Analytics Agent",
                  action: "Analytics workspace opened",
                  detail: "Reads conversation, product, funnel, profile, and governance telemetry for the dashboard.",
                  tone: "iris"
                });
              }}
            >
              <BarChart3 size={18} />
            </IconButton>
          </nav>
          <div className="hidden h-12 w-12 place-items-center rounded-md bg-slate-100 text-graphite lg:mt-auto lg:grid">
            <PackageSearch size={19} />
          </div>
        </aside>

        <section className="min-w-0 p-3 sm:p-5 xl:p-6">
          <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">
              {viewMode === "associate" ? (
                <div className="grid min-w-0 gap-5">
                  <RetailContextBand context={shoppingContext} customerProfile={customerProfile} heroProduct={products[0] ?? catalog[0]} />
                  <AgentHandoffBand
                    context={shoppingContext}
                    googleAnalyticsDetail={googleAnalyticsDetail}
                    googleAnalyticsMode={googleAnalyticsMode}
                  />
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(460px,1.05fr)]">
                    <ChatPanel
                      customerProfile={customerProfile}
                      onAgentActivity={showAgentActivity}
                      onCustomerProfileChange={handleCustomerProfileChange}
                      onProducts={handleProductsFromChat}
                      onShoppingContextChange={handleShoppingContextChange}
                    />
                    <ProductRail
                      allProducts={catalog}
                      context={shoppingContext}
                      isLoading={isLoadingProducts}
                      products={products}
                      sourceLabel={railSource}
                      onAgentActivity={showAgentActivity}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid min-w-0 gap-5">
                  <DashboardHeader />
                  <Dashboard onAgentActivity={showAgentActivity} />
                </div>
              )}
            </div>
            <AgentActivityTimeline activities={agentActivities} />
          </div>
        </section>
      </div>
    </main>
  );
}

function AgentHandoffBand({
  context,
  googleAnalyticsDetail,
  googleAnalyticsMode
}: {
  context: ShoppingContext;
  googleAnalyticsDetail: string;
  googleAnalyticsMode: GoogleAnalyticsMode;
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-3 shadow-panel">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-9 items-center gap-2 rounded-md bg-emerald-50 px-3 text-xs font-semibold text-pine ring-1 ring-emerald-100">
            <Sparkles size={14} />
            Preference Agent
          </span>
          <ArrowRight size={16} className="text-graphite" />
          <span className="inline-flex min-h-9 items-center gap-2 rounded-md bg-violet-50 px-3 text-xs font-semibold text-iris ring-1 ring-violet-100">
            <PackageSearch size={14} />
            Recommendation Agent
          </span>
          <span className="rounded bg-slate-100 px-3 py-2 text-xs font-semibold text-graphite">
            {context.preferenceLabel} / ${context.budget}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <GoogleAnalyticsModePill mode={googleAnalyticsMode} detail={googleAnalyticsDetail} />
          <McpBadge label="Commerce MCP" />
          <McpBadge label="CMS MCP" />
          <McpBadge label="Analytics MCP" />
        </div>
      </div>
    </section>
  );
}

function GoogleAnalyticsModePill({ detail, mode }: { detail: string; mode: GoogleAnalyticsMode }) {
  const status =
    mode === "live"
      ? { icon: <Radio size={13} />, label: "GA Live", className: "border-emerald-200 bg-emerald-50 text-pine" }
      : mode === "blocked"
        ? { icon: <WifiOff size={13} />, label: "GA Blocked", className: "border-amber-200 bg-amber-50 text-amber-900" }
        : mode === "checking"
          ? { icon: <Radio size={13} />, label: "GA Checking", className: "border-slate-200 bg-slate-50 text-graphite" }
          : { icon: <WifiOff size={13} />, label: "GA Demo", className: "border-slate-200 bg-slate-50 text-graphite" };

  return (
    <span className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${status.className}`} title={detail}>
      {status.icon}
      {status.label}
      <span className="hidden max-w-[160px] truncate font-medium opacity-80 sm:inline">{detail}</span>
    </span>
  );
}

function McpBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-graphite">
      <PlugZap size={13} className="text-iris" />
      {label}
      <DatabaseZap size={13} className="text-pine" />
    </span>
  );
}

function RetailContextBand({
  context,
  customerProfile,
  heroProduct
}: {
  context: ShoppingContext;
  customerProfile: CustomerProfile;
  heroProduct?: Product;
}) {
  return (
    <section className="retail-band overflow-hidden rounded-md border border-slate-200 bg-ink text-white shadow-panel">
      {heroProduct ? (
        <img src={heroProduct.imageUrl} alt={heroProduct.name} className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(23,32,51,0.92),rgba(23,32,51,0.62),rgba(23,32,51,0.18))]" />
      <div className="relative grid min-h-[210px] gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-3xl">
          {/* <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-white/15 px-3 py-1 text-xs font-semibold">Aster & Ridge</span>
            <span className="rounded bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-50">{context.preferenceLabel} journey</span>
          </div> */}
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">HCLTech NextGen AI RetailAssist</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/82 sm:text-base">
            {customerProfile.name ? `${customerProfile.name} ` : ""}
            {/* {context.summary.charAt(0).toLowerCase()}
            {context.summary.slice(1)} */}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:w-[430px]">
          <BandMetric icon={<TrendingUp size={17} />} label="Budget" value={`$${context.budget}`} />
          <BandMetric icon={<ShieldCheck size={17} />} label="Profile" value={customerProfile.loyaltyTier ?? "Member"} />
          <BandMetric icon={<Gauge size={17} />} label="Mode" value="Live" />
        </div>
      </div>
    </section>
  );
}

function BandMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/15 bg-white/12 p-3 backdrop-blur">
      <div className="flex items-center justify-between gap-3 text-white/75">
        {icon}
        <span className="text-xs font-semibold uppercase">{label}</span>
      </div>
      <div className="mt-3 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

function DashboardHeader() {
  return (
    <section className="min-w-0 rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex min-w-0 flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-pine">
            <BarChart3 size={17} />
            Retail intelligence
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-ink">Brand experience performance</h1>
          <p className="mt-2 max-w-2xl text-sm text-graphite">
            Live signals from preference selection, product interest, recommendations, governance checks, and conversion intent.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center sm:min-w-[380px]">
          <div className="rounded-md bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase text-graphite">Refresh</div>
            <div className="mt-2 text-lg font-semibold text-ink">5s</div>
          </div>
          <div className="rounded-md bg-emerald-50 p-3">
            <div className="text-xs font-semibold uppercase text-pine">OpenAI</div>
            <div className="mt-2 text-lg font-semibold text-pine">Live</div>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase text-graphite">KB</div>
            <div className="mt-2 text-lg font-semibold text-ink">Vector</div>
          </div>
        </div>
      </div>
    </section>
  );
}
