import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  Gauge,
  HeartHandshake,
  MessageSquareText,
  Pause,
  Play,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TrendingUp,
  UsersRound
} from "lucide-react";
import type { AnalyticsEvent, AnalyticsSummary } from "../../shared/types";
import { fetchAnalytics } from "../lib/api";
import type { AgentActivityInput } from "../lib/agentActivity";

type FocusMode = "overview" | "merchandising" | "governance" | "conversations";
type SortMode = "volume" | "name";

interface ActiveDetail {
  title: string;
  value: string;
  description: string;
  tone: "pine" | "iris" | "coral" | "saffron";
}

const fallbackAnalytics: AnalyticsSummary = {
  conversionRate: 0.34,
  averageOrderValue: 148,
  customerSatisfaction: 4.7,
  totalConversations: 12,
  generatedLeads: 3,
  preferenceSelections: [],
  recommendationFunnel: [],
  governance: {
    approved: 0,
    watch: 0,
    escalations: 0,
    citationCoverage: 0
  },
  topIntents: [
    { intent: "product_discovery", count: 8 },
    { intent: "product_comparison", count: 5 },
    { intent: "returns_support", count: 3 }
  ],
  productInterest: [
    { productName: "AeroStride Marathon Trainer", count: 21 },
    { productName: "Momentum Hydration Vest", count: 13 },
    { productName: "TrailForm All Weather Jacket", count: 9 }
  ],
  recentEvents: [],
  unansweredQuestions: [{ question: "Do you have wide sizing?", count: 4 }],
  contentGaps: [{ topic: "Wide sizing size guide", severity: "high" }],
  recentConversations: []
};

const focusOptions: Array<{ icon: ReactNode; id: FocusMode; label: string }> = [
  { id: "overview", label: "Overview", icon: <Gauge size={15} /> },
  { id: "merchandising", label: "Merchandising", icon: <Target size={15} /> },
  { id: "governance", label: "Governance", icon: <ShieldCheck size={15} /> },
  { id: "conversations", label: "Conversations", icon: <MessageSquareText size={15} /> }
];

const funnelOrder = [
  "page_viewed",
  "preference_selected",
  "product_impression",
  "product_viewed",
  "product_selected",
  "product_price_viewed",
  "recommendations_returned",
  "product_explanation_viewed",
  "product_3d_view",
  "product_3d_selected",
  "conversion_recovery_shown",
  "conversion_recovery_accepted",
  "cross_sell_shown",
  "cross_sell_accepted",
  "upsell_shown",
  "upsell_accepted",
  "cart_add",
  "checkout_started",
  "lead_created"
];

export function Dashboard({ onAgentActivity }: { onAgentActivity: (activity: AgentActivityInput) => void }) {
  const [analytics, setAnalytics] = useState<AnalyticsSummary>(fallbackAnalytics);
  const [activeFocus, setActiveFocus] = useState<FocusMode>("overview");
  const [activeDetail, setActiveDetail] = useState<ActiveDetail>({
    title: "Experience pulse",
    value: "Live",
    description: "Usage signals are flowing from customer preference, chat, recommendation, merchandising, and governance events.",
    tone: "pine"
  });
  const [sortMode, setSortMode] = useState<SortMode>("volume");
  const [searchTerm, setSearchTerm] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchAnalytics()
      .then((summary) => {
        setAnalytics(summary);
        setLastUpdated(new Date());
        setRefreshError(null);
      })
      .catch(() => {
        setAnalytics(fallbackAnalytics);
        setRefreshError("Using fallback analytics");
      });
  }, []);

  const announceAnalytics = useCallback(
    (action: string, detail: string, tone: AgentActivityInput["tone"] = "iris") => {
      onAgentActivity({
        agent: "Analytics Agent",
        action,
        detail,
        tone
      });
    },
    [onAgentActivity]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (isPaused) return undefined;
    const intervalId = window.setInterval(refresh, 5000);

    return () => window.clearInterval(intervalId);
  }, [isPaused, refresh]);

  const topIntents = useMemo(() => sortByMode(analytics.topIntents, sortMode, (item) => item.intent), [analytics.topIntents, sortMode]);
  const productInterest = useMemo(
    () => sortByMode(analytics.productInterest, sortMode, (item) => item.productName),
    [analytics.productInterest, sortMode]
  );
  const preferenceSelections = useMemo(
    () => sortByMode(analytics.preferenceSelections, sortMode, (item) => item.preference),
    [analytics.preferenceSelections, sortMode]
  );
  const recommendationFunnel = useMemo(() => buildFunnel(analytics), [analytics]);
  const filteredConversations = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return analytics.recentConversations;

    return analytics.recentConversations.filter((conversation) =>
      [conversation.customer, conversation.intent, conversation.stage, conversation.lastMessage]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [analytics.recentConversations, searchTerm]);

  const governanceTotal = analytics.governance.approved + analytics.governance.watch + analytics.governance.escalations;
  const lastUpdatedLabel = lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Pending";

  return (
    <section className="grid min-w-0 gap-5">
      <div className="panel min-w-0 p-4 sm:p-5">
        <div className="grid min-w-0 gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="flex min-w-0 flex-wrap gap-2">
            {focusOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setActiveFocus(option.id);
                  announceAnalytics(
                    `${option.label} analytics selected`,
                    "Changes the dashboard lens while reading the same live event stream.",
                    option.id === "governance" ? "pine" : option.id === "conversations" ? "coral" : "iris"
                  );
                }}
                className={[
                  "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition",
                  activeFocus === option.id
                    ? "border-pine bg-pine text-white"
                    : "border-slate-200 bg-white text-graphite hover:border-pine hover:text-pine"
                ].join(" ")}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-graphite">
              <SlidersHorizontal size={15} />
              <select
                value={sortMode}
                onChange={(event) => {
                  setSortMode(event.target.value as SortMode);
                  announceAnalytics("Sort mode changed", "Reorders analytics rows for comparison by volume or name.", "iris");
                }}
                className="bg-transparent text-sm font-semibold text-ink outline-none"
              >
                <option value="volume">Volume</option>
                <option value="name">Name</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setIsPaused((paused) => !paused);
                announceAnalytics("Polling control changed", "Pauses or resumes live dashboard refresh for demo inspection.", "saffron");
              }}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-graphite transition hover:border-pine hover:text-pine"
            >
              {isPaused ? <Play size={15} /> : <Pause size={15} />}
              {isPaused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={() => {
                announceAnalytics("Manual refresh requested", "Pulls the latest preference, product, funnel, governance, and conversation metrics.", "iris");
                refresh();
              }}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-graphite transition hover:border-pine hover:text-pine"
            >
              <RefreshCcw size={15} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Metric
              active={activeDetail.title === "Conversion"}
              icon={<TrendingUp size={18} />}
              label="Conversion"
              value={`${Math.round(analytics.conversionRate * 100)}%`}
              onClick={() => {
                setActiveDetail({
                  title: "Conversion",
                  value: `${Math.round(analytics.conversionRate * 100)}%`,
                  description: "Completed conversion signals divided by total tracked conversations.",
                  tone: "pine"
                });
                announceAnalytics("Conversion metric drilled into", "Shows checkout-start and purchase-completion impact on conversion rate.", "pine");
              }}
            />
            <Metric
              active={activeDetail.title === "Average order"}
              icon={<CircleDollarSign size={18} />}
              label="AOV"
              value={`$${Math.round(analytics.averageOrderValue)}`}
              onClick={() => {
                setActiveDetail({
                  title: "Average order",
                  value: `$${Math.round(analytics.averageOrderValue)}`,
                  description: "Estimated basket value from cart and conversion intent events.",
                  tone: "iris"
                });
                announceAnalytics("Average order metric drilled into", "Shows basket value from conversion telemetry.", "iris");
              }}
            />
            <Metric
              active={activeDetail.title === "Customer satisfaction"}
              icon={<HeartHandshake size={18} />}
              label="CSAT"
              value={analytics.customerSatisfaction.toFixed(1)}
              onClick={() => {
                setActiveDetail({
                  title: "Customer satisfaction",
                  value: analytics.customerSatisfaction.toFixed(1),
                  description: "Blended satisfaction score from guided selling interactions.",
                  tone: "coral"
                });
                announceAnalytics("CSAT metric drilled into", "Explains the experience quality signal for the demo.", "coral");
              }}
            />
            <Metric
              active={activeDetail.title === "Conversations"}
              icon={<MessageSquareText size={18} />}
              label="Conversations"
              value={String(analytics.totalConversations)}
              onClick={() => {
                setActiveDetail({
                  title: "Conversations",
                  value: String(analytics.totalConversations),
                  description: "Total customer conversations currently represented in the analytics store.",
                  tone: "saffron"
                });
                announceAnalytics("Conversation metric drilled into", "Shows how many guided selling turns are included in analytics.", "saffron");
              }}
            />
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-graphite lg:min-w-[230px]">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-ink">Last refresh</span>
              <span>{lastUpdatedLabel}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="font-semibold text-ink">Polling</span>
              <span>{isPaused ? "Paused" : "5s"}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="font-semibold text-ink">Source</span>
              <span>{analytics.source === "hybrid" ? "Local + GA4" : "Local"}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="font-semibold text-ink">GA4</span>
              <span>{analytics.googleAnalytics?.measurementConfigured ? "Events ready" : "Not configured"}</span>
            </div>
            {refreshError ? <div className="mt-2 text-xs font-semibold text-coral">{refreshError}</div> : null}
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <InsightPanel detail={activeDetail} />
        <EventStream
          events={analytics.recentEvents}
          onSelect={(event) => {
            setActiveDetail({
              title: formatLabel(event.eventName),
              value: event.productNames.length ? event.productNames.length.toString() : event.value ? `$${Math.round(event.value)}` : "Live",
              description: buildEventDescription(event),
              tone: getEventTone(event.eventName)
            });
            announceAnalytics(
              "Analytics event inspected",
              `${formatLabel(event.eventName)} was captured by the ${event.agent}.`,
              getEventTone(event.eventName)
            );
          }}
        />
      </div>

      {activeFocus === "overview" ? (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <ChartPanel icon={<BarChart3 size={18} className="text-iris" />} title="Top intents">
            <Bars
              items={topIntents.map((intent) => ({ label: formatLabel(intent.intent), value: intent.count }))}
              empty="No intent data yet."
              tone="iris"
              onSelect={(item) => {
                setActiveDetail({
                  title: item.label,
                  value: String(item.value),
                  description: "Intent volume from recent customer conversations.",
                  tone: "iris"
                });
                announceAnalytics("Intent row inspected", `Opened ${item.label} intent volume.`, "iris");
              }}
            />
          </ChartPanel>

          <ChartPanel icon={<Activity size={18} className="text-coral" />} title="Product demand">
            <Bars
              items={productInterest.map((product) => ({ label: product.productName, value: product.count }))}
              empty="No product demand yet."
              tone="coral"
              onSelect={(item) => {
                setActiveDetail({
                  title: item.label,
                  value: String(item.value),
                  description: "Product interest from impressions, recommendations, and merchandising events.",
                  tone: "coral"
                });
                announceAnalytics("Product demand row inspected", `Opened demand signals for ${item.label}.`, "coral");
              }}
            />
          </ChartPanel>
        </div>
      ) : null}

      {activeFocus === "merchandising" ? (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <ChartPanel icon={<TrendingUp size={18} className="text-pine" />} title="Preference demand">
            <Bars
              items={preferenceSelections.map((item) => ({ label: formatLabel(item.preference), value: item.count }))}
              empty="No preference events yet."
              tone="pine"
              onSelect={(item) => {
                setActiveDetail({
                  title: item.label,
                  value: String(item.value),
                  description: "Preference selection volume from the associate workspace.",
                  tone: "pine"
                });
                announceAnalytics("Preference row inspected", `Opened ${item.label} preference demand.`, "pine");
              }}
            />
          </ChartPanel>

          <ChartPanel icon={<Target size={18} className="text-iris" />} title="Recommendation funnel">
            <FunnelStepper
              items={recommendationFunnel}
              onSelect={(item) => {
                setActiveDetail({
                  title: formatLabel(item.eventName),
                  value: String(item.count),
                  description: "Recommendation funnel stage captured from the retail experience.",
                  tone: "iris"
                });
                announceAnalytics("Funnel stage inspected", `Opened ${formatLabel(item.eventName)} funnel activity.`, "iris");
              }}
            />
          </ChartPanel>
        </div>
      ) : null}

      {activeFocus === "governance" ? (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <ChartPanel icon={<ShieldCheck size={18} className="text-pine" />} title="Brand governance">
            <div className="grid gap-3 sm:grid-cols-2">
              <GovernanceMetric
                label="Approved"
                value={analytics.governance.approved}
                total={governanceTotal}
                tone="pine"
                onClick={() => {
                  setActiveDetail({
                    title: "Approved",
                    value: String(analytics.governance.approved),
                    description: "Responses that passed brand, merchandising, and escalation checks.",
                    tone: "pine"
                  });
                  announceAnalytics("Governance approved inspected", "Reviews responses that passed policy and brand controls.", "pine");
                }}
              />
              <GovernanceMetric
                label="Watch"
                value={analytics.governance.watch}
                total={governanceTotal}
                tone="saffron"
                onClick={() => {
                  setActiveDetail({
                    title: "Watch",
                    value: String(analytics.governance.watch),
                    description: "Responses with language that should be tightened before production scaling.",
                    tone: "saffron"
                  });
                  announceAnalytics("Governance watch inspected", "Reviews responses that need tighter wording or stronger grounding.", "saffron");
                }}
              />
              <GovernanceMetric
                label="Escalations"
                value={analytics.governance.escalations}
                total={governanceTotal}
                tone="coral"
                onClick={() => {
                  setActiveDetail({
                    title: "Escalations",
                    value: String(analytics.governance.escalations),
                    description: "Sensitive or unsupported requests routed toward human review.",
                    tone: "coral"
                  });
                  announceAnalytics("Escalation metric inspected", "Reviews sensitive or unsupported requests routed for human review.", "coral");
                }}
              />
              <GovernanceMetric
                label="Citation coverage"
                value={`${Math.round(analytics.governance.citationCoverage * 100)}%`}
                total={100}
                tone="iris"
                onClick={() => {
                  setActiveDetail({
                    title: "Citation coverage",
                    value: `${Math.round(analytics.governance.citationCoverage * 100)}%`,
                    description: "Share of responses grounded with retrieved source citations when policy or brand facts are involved.",
                    tone: "iris"
                  });
                  announceAnalytics("Citation coverage inspected", "Reviews source-grounding coverage for knowledge-backed answers.", "iris");
                }}
              />
            </div>
          </ChartPanel>

          <div className="grid min-w-0 gap-5">
            <IssuePanel
              icon={<ShieldAlert size={18} className="text-coral" />}
              title="Content gaps"
              items={analytics.contentGaps.map((gap) => ({
                label: gap.topic,
                value: gap.severity,
                tone: gap.severity === "high" ? "coral" : gap.severity === "medium" ? "saffron" : "pine"
              }))}
              empty="No content gaps."
            />
            <IssuePanel
              icon={<MessageSquareText size={18} className="text-saffron" />}
              title="Unanswered questions"
              items={analytics.unansweredQuestions.map((question) => ({
                label: question.question,
                value: String(question.count),
                tone: "saffron"
              }))}
              empty="No unanswered questions."
            />
          </div>
        </div>
      ) : null}

      {activeFocus === "conversations" ? (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[360px_1fr]">
          <div className="panel min-w-0 p-5">
            <div className="flex items-center gap-2">
              <Search size={18} className="text-pine" />
              <h2 className="text-sm font-semibold text-ink">Conversation search</h2>
            </div>
            <input
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                announceAnalytics("Conversation search applied", "Filters recent conversations by intent, stage, customer, or message.", "coral");
              }}
              placeholder="Search intent, stage, or message"
              className="mt-4 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-ink outline-none focus:border-pine"
            />
            <div className="mt-4 grid gap-3">
              <SmallStat icon={<UsersRound size={16} />} label="Generated leads" value={String(analytics.generatedLeads)} />
              <SmallStat icon={<MessageSquareText size={16} />} label="Matched rows" value={String(filteredConversations.length)} />
            </div>
          </div>

          <ChartPanel icon={<MessageSquareText size={18} className="text-coral" />} title="Recent conversations">
            <EmptyAware items={filteredConversations} empty="No conversations match this view." />
            <div className="grid gap-3">
              {filteredConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => {
                    setActiveDetail({
                      title: formatLabel(conversation.intent),
                      value: formatLabel(conversation.stage),
                      description: conversation.lastMessage,
                      tone: "coral"
                    });
                    announceAnalytics("Conversation row inspected", "Shows the selected conversation's intent, stage, and customer message.", "coral");
                  }}
                  className="rounded-md border border-slate-200 bg-white p-3 text-left transition hover:border-pine hover:shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold capitalize text-ink">{formatLabel(conversation.intent)}</span>
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold capitalize text-graphite">
                      {formatLabel(conversation.stage)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-graphite">{conversation.lastMessage}</p>
                </button>
              ))}
            </div>
          </ChartPanel>
        </div>
      ) : null}
    </section>
  );
}

function InsightPanel({ detail }: { detail: ActiveDetail }) {
  const toneClass = getToneClass(detail.tone);

  return (
    <div className={`min-w-0 rounded-md border p-4 shadow-panel ${toneClass.surface}`}>
      <div className="grid min-w-0 gap-3 md:grid-cols-[auto_1fr_auto] md:items-center">
        <span className={`grid h-11 w-11 place-items-center justify-self-start rounded-md ${toneClass.icon}`}>
          <ArrowUpRight size={18} />
        </span>
        <div>
          <div className="text-sm font-semibold text-ink">{detail.title}</div>
          <p className="mt-1 text-sm text-graphite">{detail.description}</p>
        </div>
        <div className="text-3xl font-semibold text-ink">{detail.value}</div>
      </div>
    </div>
  );
}

function EventStream({ events, onSelect }: { events: AnalyticsEvent[]; onSelect: (event: AnalyticsEvent) => void }) {
  return (
    <div className="panel min-w-0 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-iris" />
          <h2 className="text-sm font-semibold text-ink">Live event stream</h2>
        </div>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-graphite">{events.length} recent</span>
      </div>
      {events.length ? (
        <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {events.map((event) => {
            const tone = getEventTone(event.eventName);
            const toneClass = getToneClass(tone);
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => onSelect(event)}
                className="block w-full min-w-0 rounded-md border border-slate-200 bg-white p-3 text-left transition hover:border-pine hover:shadow-sm"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-2 py-1 text-[11px] font-semibold ${toneClass.badge}`}>
                        {formatLabel(event.eventName)}
                      </span>
                      <span className="text-[11px] font-semibold text-graphite">{formatEventTime(event.createdAt)}</span>
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold text-ink">{event.agent}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-graphite">{buildEventDescription(event)}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-graphite">
                    {event.value ? `$${Math.round(event.value)}` : event.productNames.length ? event.productNames.length : "Signal"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-graphite">
          No live events captured yet.
        </div>
      )}
    </div>
  );
}

function Metric({
  active,
  icon,
  label,
  onClick,
  value
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  value: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "min-w-0 rounded-md border p-4 text-left transition",
        active ? "border-pine bg-emerald-50 shadow-sm" : "border-slate-200 bg-white hover:border-pine hover:shadow-sm"
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-md bg-slate-100 text-ink">{icon}</span>
        <span className="text-xs font-semibold uppercase text-graphite">{label}</span>
      </div>
      <div className="mt-5 text-3xl font-semibold text-ink">{value}</div>
    </button>
  );
}

function ChartPanel({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <div className="panel min-w-0 p-5">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Bars({
  empty,
  items,
  onSelect,
  tone
}: {
  empty: string;
  items: Array<{ label: string; value: number }>;
  onSelect: (item: { label: string; value: number }) => void;
  tone: ActiveDetail["tone"];
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  const toneClass = getToneClass(tone);

  if (!items.length) return <p className="text-sm text-graphite">{empty}</p>;

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={() => onSelect(item)}
          className="block w-full min-w-0 rounded-md p-1 text-left hover:bg-slate-50"
        >
          <div className="mb-2 flex items-center justify-between gap-4 text-sm">
            <span className="min-w-0 truncate font-medium capitalize text-ink">{item.label}</span>
            <span className="text-graphite">{item.value}</span>
          </div>
          <div className="h-2 rounded bg-slate-100">
            <div className={`h-2 rounded ${toneClass.bar}`} style={{ width: `${Math.max(8, (item.value / max) * 100)}%` }} />
          </div>
        </button>
      ))}
    </div>
  );
}

function FunnelStepper({
  items,
  onSelect
}: {
  items: Array<{ eventName: string; count: number }>;
  onSelect: (item: { eventName: string; count: number }) => void;
}) {
  const max = Math.max(...items.map((item) => item.count), 1);

  return (
    <div className="grid gap-3">
      {items.map((item, index) => (
        <button
          key={item.eventName}
          type="button"
          onClick={() => onSelect(item)}
          className="grid min-w-0 gap-3 rounded-md border border-slate-200 bg-white p-3 text-left transition hover:border-pine hover:shadow-sm sm:grid-cols-[84px_1fr_auto] sm:items-center"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-sm font-semibold text-pine">
            {index + 1}
          </span>
          <div>
            <div className="text-sm font-semibold capitalize text-ink">{formatLabel(item.eventName)}</div>
            <div className="mt-2 h-2 rounded bg-slate-100">
              <div className="h-2 rounded bg-pine" style={{ width: `${Math.max(8, (item.count / max) * 100)}%` }} />
            </div>
          </div>
          <span className="text-xl font-semibold text-ink">{item.count}</span>
        </button>
      ))}
    </div>
  );
}

function GovernanceMetric({
  label,
  onClick,
  tone,
  total,
  value
}: {
  label: string;
  onClick: () => void;
  tone: ActiveDetail["tone"];
  total: number;
  value: number | string;
}) {
  const numericValue = typeof value === "number" ? value : Number.parseInt(value, 10);
  const percent = total > 0 && Number.isFinite(numericValue) ? Math.min(100, (numericValue / total) * 100) : 0;
  const toneClass = getToneClass(tone);

  return (
    <button type="button" onClick={onClick} className="min-w-0 rounded-md border border-slate-200 bg-white p-3 text-left transition hover:border-pine">
      <div className="text-xs font-semibold uppercase text-graphite">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-ink">{value}</div>
      <div className="mt-3 h-2 rounded bg-slate-100">
        <div className={`h-2 rounded ${toneClass.bar}`} style={{ width: `${Math.max(8, percent)}%` }} />
      </div>
    </button>
  );
}

function IssuePanel({
  empty,
  icon,
  items,
  title
}: {
  empty: string;
  icon: ReactNode;
  items: Array<{ label: string; tone: ActiveDetail["tone"]; value: string }>;
  title: string;
}) {
  return (
    <ChartPanel icon={icon} title={title}>
      <EmptyAware items={items} empty={empty} />
      <div className="grid gap-3">
        {items.map((item) => {
          const toneClass = getToneClass(item.tone);
          return (
            <div key={item.label} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3">
              <span className="text-sm font-medium text-ink">{item.label}</span>
              <span className={`rounded px-2 py-1 text-xs font-semibold capitalize ${toneClass.badge}`}>{item.value}</span>
            </div>
          );
        })}
      </div>
    </ChartPanel>
  );
}

function SmallStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-graphite">
        {icon}
        {label}
      </span>
      <span className="text-lg font-semibold text-ink">{value}</span>
    </div>
  );
}

function EmptyAware<T>({ empty, items }: { empty: string; items: T[] }) {
  if (items.length) return null;
  return <p className="text-sm text-graphite">{empty}</p>;
}

function buildFunnel(analytics: AnalyticsSummary) {
  return funnelOrder.map((eventName) => ({
    eventName,
    count: analytics.recommendationFunnel.find((event) => event.eventName === eventName)?.count ?? 0
  }));
}

function sortByMode<T extends { count: number }>(items: T[], sortMode: SortMode, getLabel: (item: T) => string) {
  return [...items].sort((a, b) => {
    if (sortMode === "name") return getLabel(a).localeCompare(getLabel(b));
    return b.count - a.count;
  });
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function formatEventTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function buildEventDescription(event: AnalyticsEvent) {
  const productText = event.productNames.length ? ` Products: ${event.productNames.slice(0, 2).join(", ")}.` : "";
  const metadataText = Object.entries(event.metadata)
    .slice(0, 3)
    .map(([key, value]) => `${formatLabel(key)} ${formatMetadataValue(value)}`)
    .join(", ");

  return `${event.agent} captured ${formatLabel(event.eventName)}.${productText}${metadataText ? ` Signals: ${metadataText}.` : ""}`;
}

function formatMetadataValue(value: unknown) {
  if (Array.isArray(value)) return value.join("/");
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

function getEventTone(eventName: string): ActiveDetail["tone"] {
  if (eventName.includes("governance")) return "pine";
  if (eventName.includes("cart") || eventName.includes("checkout") || eventName.includes("purchase") || eventName.includes("lead")) {
    return "saffron";
  }
  if (eventName.includes("conversion_recovery")) return "saffron";
  if (eventName.includes("3d") || eventName.includes("customized")) return "iris";
  if (eventName.includes("explanation") || eventName.includes("recommend")) return "coral";
  return "iris";
}

function getToneClass(tone: ActiveDetail["tone"]) {
  switch (tone) {
    case "iris":
      return {
        badge: "bg-violet-50 text-iris",
        bar: "bg-iris",
        icon: "bg-violet-100 text-iris",
        surface: "border-violet-100 bg-violet-50"
      };
    case "coral":
      return {
        badge: "bg-red-50 text-coral",
        bar: "bg-coral",
        icon: "bg-red-100 text-coral",
        surface: "border-red-100 bg-red-50"
      };
    case "saffron":
      return {
        badge: "bg-amber-50 text-amber-800",
        bar: "bg-saffron",
        icon: "bg-amber-100 text-amber-800",
        surface: "border-amber-100 bg-amber-50"
      };
    default:
      return {
        badge: "bg-emerald-50 text-pine",
        bar: "bg-pine",
        icon: "bg-emerald-100 text-pine",
        surface: "border-emerald-100 bg-emerald-50"
      };
  }
}
