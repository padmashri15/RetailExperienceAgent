import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type {
  AnalyticsEvent,
  AnalyticsSummary,
  BrandGovernanceResult,
  JourneyStage,
  MerchandisingSuggestion,
  SourceCitation
} from "../../shared/types";
import { env } from "../config/env";
import { loadCatalog } from "../services/catalog";
import {
  forwardConversionToGoogleAnalytics,
  forwardIntentToGoogleAnalytics,
  getGoogleAnalyticsEventCounts,
  getGoogleAnalyticsProductInterest,
  getGoogleAnalyticsStatus
} from "../services/googleAnalytics";

const analyticsFunnelEvents = [
  "page_viewed",
  "preference_selected",
  "product_impression",
  "product_viewed",
  "product_selected",
  "product_price_viewed",
  "recommendations_returned",
  "intent_detected",
  "governance_review",
  "cross_sell_shown",
  "upsell_shown",
  "cross_sell_accepted",
  "upsell_accepted",
  "product_3d_view",
  "product_3d_selected",
  "product_customized",
  "product_explanation_viewed",
  "conversion_recovery_shown",
  "conversion_recovery_accepted",
  "conversion_recovery_dismissed",
  "cart_add",
  "checkout_started",
  "purchase_completed",
  "lead_created"
];

export interface SaveConversationTurnInput {
  conversationId?: string;
  customerId?: string;
  customerName?: string;
  userMessage: string;
  assistantMessage: string;
  intent: string;
  journeyStage: JourneyStage;
  responseId?: string;
  guardrailFlags: string[];
  citations: SourceCitation[];
  recommendedProductIds: string[];
  merchandising: MerchandisingSuggestion[];
  governance: BrandGovernanceResult;
  latencyMs: number;
}

export interface TrackIntentInput {
  conversationId?: string;
  customerId?: string;
  intent: string;
  journeyStage: JourneyStage | string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface TrackConversionInput {
  conversationId?: string;
  customerId?: string;
  eventName: string;
  productIds?: string[];
  value?: number;
  metadata?: Record<string, unknown>;
}

export interface TelemetryRepository {
  saveConversationTurn(input: SaveConversationTurnInput): Promise<string>;
  trackIntent(input: TrackIntentInput): Promise<void>;
  trackConversion(input: TrackConversionInput): Promise<void>;
  getAnalyticsSummary(): Promise<AnalyticsSummary>;
}

interface RecentEventRow {
  id: string;
  event_name: string;
  product_ids: string[];
  value: string | number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  source: string;
}

export function createTelemetryRepository(): TelemetryRepository {
  if (env.databaseUrl) {
    return new PostgresTelemetryRepository(env.databaseUrl);
  }

  return memoryRepository;
}

class PostgresTelemetryRepository implements TelemetryRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async saveConversationTurn(input: SaveConversationTurnInput): Promise<string> {
    const conversationId = input.conversationId ?? randomUUID();

    await this.pool.query(
      `INSERT INTO conversations (id, customer_id, journey_stage, intent, response_id, guardrail_flags, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (id) DO UPDATE SET
         journey_stage = EXCLUDED.journey_stage,
         intent = EXCLUDED.intent,
         response_id = EXCLUDED.response_id,
         guardrail_flags = EXCLUDED.guardrail_flags,
         updated_at = now()`,
      [
        conversationId,
        input.customerId || null,
        input.journeyStage,
        input.intent,
        input.responseId || null,
        input.guardrailFlags
      ]
    );

    await this.pool.query(
      `INSERT INTO messages (conversation_id, role, content, latency_ms)
       VALUES ($1, 'user', $2, null)`,
      [conversationId, input.userMessage]
    );

    await this.pool.query(
      `INSERT INTO messages (conversation_id, role, content, citations, recommended_product_ids, latency_ms)
       VALUES ($1, 'assistant', $2, $3::jsonb, $4, $5)`,
      [
        conversationId,
        input.assistantMessage,
        JSON.stringify(input.citations),
        input.recommendedProductIds,
        input.latencyMs
      ]
    );

    await this.trackIntent({
      conversationId,
      customerId: input.customerId,
      intent: input.intent,
      journeyStage: input.journeyStage,
      confidence: 0.82,
      metadata: { source: "conversation_turn" }
    });

    await this.trackConversion({
      conversationId,
      customerId: input.customerId,
      eventName: "recommendations_returned",
      productIds: input.recommendedProductIds,
      value: 0,
      metadata: {
        source: "conversation_turn",
        intent: input.intent,
        journey_stage: input.journeyStage,
        governanceStatus: input.governance.status,
        governance_status: input.governance.status,
        guardrail_count: input.guardrailFlags.length,
        citation_count: input.citations.length,
        merchandisingCount: input.merchandising.length
      }
    });

    await this.trackConversion({
      conversationId,
      customerId: input.customerId,
      eventName: "governance_review",
      productIds: input.recommendedProductIds,
      value: 0,
      metadata: {
        source: "brand_governance_agent",
        intent: input.intent,
        journey_stage: input.journeyStage,
        governance_status: input.governance.status,
        required_escalation: input.governance.requiredEscalation,
        guardrail_flags: input.guardrailFlags,
        citation_count: input.citations.length,
        merchandising_count: input.merchandising.length
      }
    });

    return conversationId;
  }

  async trackIntent(input: TrackIntentInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO intent_events (conversation_id, customer_id, intent, journey_stage, confidence, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        input.conversationId || null,
        input.customerId || null,
        input.intent,
        input.journeyStage,
        input.confidence ?? null,
        JSON.stringify(input.metadata ?? {})
      ]
    );

    void forwardIntentToGoogleAnalytics(input).catch((error) => {
      console.warn(error instanceof Error ? error.message : "GA4 intent forwarding failed");
    });
  }

  async trackConversion(input: TrackConversionInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO conversion_events (conversation_id, customer_id, event_name, product_ids, value, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        input.conversationId || null,
        input.customerId || null,
        input.eventName,
        input.productIds ?? [],
        input.value ?? 0,
        JSON.stringify(input.metadata ?? {})
      ]
    );

    if (shouldForwardToGoogleAnalytics(input)) {
      void forwardConversionToGoogleAnalytics(input).catch((error) => {
        console.warn(error instanceof Error ? error.message : "GA4 event forwarding failed");
      });
    }
  }

  async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    const [conversationCount, intents, conversions, recent, recentEvents] = await Promise.all([
      this.pool.query<{ count: string }>("SELECT count(*) FROM conversations"),
      this.pool.query<{ intent: string; count: string }>(
        "SELECT intent, count(*) FROM intent_events GROUP BY intent ORDER BY count(*) DESC LIMIT 6"
      ),
      this.pool.query<{ count: string; value: string }>(
        "SELECT count(*), COALESCE(avg(NULLIF(value, 0)), 0) AS value FROM conversion_events WHERE event_name IN ('checkout_started', 'purchase_completed')"
      ),
      this.pool.query<{
        id: string;
        intent: string;
        journey_stage: JourneyStage;
        last_message: string;
        updated_at: string;
      }>(
        `SELECT c.id, c.intent, c.journey_stage, COALESCE(m.content, '') AS last_message, c.updated_at::text
         FROM conversations c
         LEFT JOIN LATERAL (
           SELECT content FROM messages
           WHERE conversation_id = c.id
           ORDER BY created_at DESC
           LIMIT 1
         ) m ON true
         ORDER BY c.updated_at DESC
         LIMIT 8`
      ),
      this.pool.query<RecentEventRow>(
        `SELECT *
         FROM (
           SELECT id::text, event_name, product_ids, value::text, metadata, created_at::text, 'local_event' AS source
           FROM conversion_events
           UNION ALL
           SELECT
             id::text,
             'intent_detected' AS event_name,
             ARRAY[]::text[] AS product_ids,
             '0' AS value,
             jsonb_build_object(
               'intent', intent,
               'journey_stage', journey_stage,
               'confidence', confidence,
               'source', COALESCE(metadata->>'source', 'intent_agent')
             ) AS metadata,
             created_at::text,
             'intent_event' AS source
           FROM intent_events
         ) events
         ORDER BY created_at DESC
         LIMIT 14`
      )
    ]);
    const catalog = await loadCatalog();
    const productNames = new Map(catalog.map((product) => [product.id, product.name]));

    const totalConversations = Number(conversationCount.rows[0]?.count ?? 0);
    const conversionCount = Number(conversions.rows[0]?.count ?? 0);

    const recommendationEvents = await this.pool.query<{ event_name: string; count: string }>(
      `SELECT event_name, count(*)
       FROM conversion_events
       WHERE event_name = ANY($1)
       GROUP BY event_name
       ORDER BY count(*) DESC`,
      [analyticsFunnelEvents]
    );
    const preferenceEvents = await this.pool.query<{ preference: string; count: string }>(
      `SELECT COALESCE(metadata->>'preference', 'unknown') AS preference, count(*)
       FROM conversion_events
       WHERE event_name = 'preference_selected'
       GROUP BY preference
       ORDER BY count(*) DESC`
    );

    return withGoogleAnalyticsSummary({
      conversionRate: totalConversations ? Number((conversionCount / totalConversations).toFixed(2)) : 0,
      averageOrderValue: Number(conversions.rows[0]?.value ?? 0),
      customerSatisfaction: 4.7,
      totalConversations,
      generatedLeads: 0,
      preferenceSelections: preferenceEvents.rows.map((row) => ({
        preference: row.preference,
        count: Number(row.count)
      })),
      recommendationFunnel: recommendationEvents.rows.map((row) => ({
        eventName: row.event_name,
        count: Number(row.count)
      })),
      governance: {
        approved: 0,
        watch: 0,
        escalations: 0,
        citationCoverage: totalConversations ? 1 : 0
      },
      topIntents: intents.rows.map((row) => ({ intent: row.intent, count: Number(row.count) })),
      productInterest: [],
      recentEvents: recentEvents.rows.map((event) =>
        buildAnalyticsEvent({
          id: event.id,
          eventName: event.event_name,
          productIds: event.product_ids,
          productNames,
          value: Number(event.value ?? 0),
          metadata: event.metadata ?? {},
          source: event.source,
          createdAt: event.created_at
        })
      ),
      unansweredQuestions: [],
      contentGaps: [],
      recentConversations: recent.rows.map((row) => ({
        id: row.id,
        customer: "Customer",
        intent: row.intent,
        stage: row.journey_stage,
        lastMessage: row.last_message,
        updatedAt: row.updated_at
      }))
    });
  }
}

class MemoryTelemetryRepository implements TelemetryRepository {
  private conversations: SaveConversationTurnInput[] = [];
  private intents: Array<TrackIntentInput & { createdAt: string; id: string }> = [];
  private conversions: Array<TrackConversionInput & { createdAt: string; id: string }> = [];

  async saveConversationTurn(input: SaveConversationTurnInput): Promise<string> {
    const conversationId = input.conversationId ?? randomUUID();
    this.conversations.unshift({ ...input, conversationId });
    await this.trackIntent({
      conversationId,
      customerId: input.customerId,
      intent: input.intent,
      journeyStage: input.journeyStage,
      confidence: 0.8,
      metadata: { source: "memory_repository" }
    });
    await this.trackConversion({
      conversationId,
      customerId: input.customerId,
      eventName: "recommendations_returned",
      productIds: input.recommendedProductIds,
      value: 0,
      metadata: {
        source: "conversation_turn",
        intent: input.intent,
        journey_stage: input.journeyStage,
        governance_status: input.governance.status,
        guardrail_count: input.guardrailFlags.length,
        citation_count: input.citations.length,
        merchandising_count: input.merchandising.length
      }
    });
    await this.trackConversion({
      conversationId,
      customerId: input.customerId,
      eventName: "governance_review",
      productIds: input.recommendedProductIds,
      value: 0,
      metadata: {
        source: "brand_governance_agent",
        intent: input.intent,
        journey_stage: input.journeyStage,
        governance_status: input.governance.status,
        required_escalation: input.governance.requiredEscalation,
        guardrail_flags: input.guardrailFlags,
        citation_count: input.citations.length,
        merchandising_count: input.merchandising.length
      }
    });
    return conversationId;
  }

  async trackIntent(input: TrackIntentInput): Promise<void> {
    this.intents.unshift({ ...input, createdAt: new Date().toISOString(), id: randomUUID() });
    void forwardIntentToGoogleAnalytics(input).catch((error) => {
      console.warn(error instanceof Error ? error.message : "GA4 intent forwarding failed");
    });
  }

  async trackConversion(input: TrackConversionInput): Promise<void> {
    this.conversions.unshift({ ...input, createdAt: new Date().toISOString(), id: randomUUID() });
    if (shouldForwardToGoogleAnalytics(input)) {
      void forwardConversionToGoogleAnalytics(input).catch((error) => {
        console.warn(error instanceof Error ? error.message : "GA4 event forwarding failed");
      });
    }
  }

  async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    const catalog = await loadCatalog();
    const productNames = new Map(catalog.map((product) => [product.id, product.name]));
    const totalConversations = this.conversations.length;
    const checkoutEvents = this.conversions.filter((event) =>
      ["checkout_started", "purchase_completed"].includes(event.eventName)
    );
    const topIntents = countBy(
      this.intents.length
        ? this.intents.map((intent) => String(intent.intent))
        : ["product_discovery", "product_discovery", "product_comparison", "shipping", "returns_support", "loyalty"]
    );

    const productInterestValues = [
      ...this.conversations.flatMap((turn) => turn.recommendedProductIds),
      ...this.conversations.flatMap((turn) => turn.merchandising.map((suggestion) => suggestion.product.id)),
      ...this.conversions.flatMap((event) => event.productIds ?? [])
    ];
    const governanceCounts = {
      approved: this.conversations.filter((turn) => turn.governance.status === "approved").length,
      watch: this.conversations.filter((turn) => turn.governance.status === "watch").length,
      escalations: this.conversations.filter((turn) => turn.governance.status === "escalate").length,
      citationCoverage: totalConversations
        ? Number((this.conversations.filter((turn) => turn.citations.length > 0).length / totalConversations).toFixed(2))
        : 0
    };

    return withGoogleAnalyticsSummary({
      conversionRate: totalConversations ? Number((checkoutEvents.length / totalConversations).toFixed(2)) : 0,
      averageOrderValue: checkoutEvents.length
        ? average(checkoutEvents.map((event) => event.value ?? 0))
        : 0,
      customerSatisfaction: totalConversations ? 4.7 : 0,
      totalConversations,
      generatedLeads: Math.max(
        this.conversions.filter((event) => event.eventName === "lead_created").length,
        0
      ),
      preferenceSelections: countBy(
        this.conversions
          .filter((event) => event.eventName === "preference_selected")
          .map((event) => String(event.metadata?.preference ?? "unknown"))
      ).map(({ intent, count }) => ({ preference: intent, count })),
      recommendationFunnel: countBy(
        this.conversions
          .filter((event) => analyticsFunnelEvents.includes(event.eventName))
          .map((event) => event.eventName)
      ).map(({ intent, count }) => ({ eventName: intent, count })),
      governance: governanceCounts,
      topIntents,
      productInterest: countBy(productInterestValues).map(({ intent, count }) => ({
        productName: productNames.get(intent) ?? intent,
        count
      })),
      recentEvents: [
        ...this.conversions.map((event) =>
          buildAnalyticsEvent({
            id: event.id,
            eventName: event.eventName,
            productIds: event.productIds ?? [],
            productNames,
            value: event.value ?? 0,
            metadata: event.metadata ?? {},
            source: "local_event",
            createdAt: event.createdAt
          })
        ),
        ...this.intents.map((event) =>
          buildAnalyticsEvent({
            id: event.id,
            eventName: "intent_detected",
            productIds: [],
            productNames,
            value: 0,
            metadata: {
              ...(event.metadata ?? {}),
              intent: event.intent,
              journey_stage: event.journeyStage,
              confidence: event.confidence
            },
            source: "intent_event",
            createdAt: event.createdAt
          })
        )
      ]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 14),
      unansweredQuestions: buildUnansweredQuestions(this.conversations),
      contentGaps: buildContentGaps(this.conversations),
      recentConversations: this.conversations.slice(0, 6).map((turn) => ({
        id: turn.conversationId ?? "demo",
        customer: turn.customerName ?? "Guest shopper",
        intent: turn.intent,
        stage: turn.journeyStage,
        lastMessage: turn.userMessage,
        updatedAt: new Date().toISOString()
      }))
    });
  }
}

const memoryRepository = new MemoryTelemetryRepository();

function countBy(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([intent, count]) => ({ intent, count }));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function shouldForwardToGoogleAnalytics(input: TrackConversionInput) {
  return input.metadata?.gaForwardedByClient !== true && input.metadata?.gaTransport !== "browser_gtag";
}

function buildAnalyticsEvent(input: {
  id: string;
  eventName: string;
  productIds: string[];
  productNames: Map<string, string>;
  value: number;
  metadata: Record<string, unknown>;
  source: string;
  createdAt: string;
}): AnalyticsEvent {
  return {
    id: input.id,
    eventName: input.eventName,
    agent: getAgentForEvent(input.eventName, input.metadata),
    productNames: input.productIds.map((productId) => input.productNames.get(productId) ?? productId),
    value: Number(input.value || 0),
    source: input.source,
    metadata: compactMetadata(input.metadata),
    createdAt: input.createdAt
  };
}

function getAgentForEvent(eventName: string, metadata: Record<string, unknown>) {
  const explicitSource = String(metadata.source ?? "");

  if (/governance/i.test(explicitSource) || eventName === "governance_review") return "Brand Governance Agent";
  if (eventName === "page_viewed") return "Analytics Agent";
  if (eventName === "intent_detected") return "Retail Experience Orchestrator Agent";
  if (eventName === "preference_selected") return "Customer Profile / Preference Agent";
  if (
    eventName === "product_impression" ||
    eventName === "product_viewed" ||
    eventName === "product_selected" ||
    eventName === "recommendations_returned"
  ) {
    return "Recommendation Agent";
  }
  if (eventName === "product_explanation_viewed") return "Recommendation Explanation Agent";
  if (eventName.includes("conversion_recovery")) return "GA Conversion Recovery Agent";
  if (eventName.includes("3d") || eventName === "product_customized") return "3D Product Visualization Agent";
  if (eventName.includes("cross_sell") || eventName.includes("upsell")) return "Merchandising Agent";
  if (["cart_add", "checkout_started", "purchase_completed", "lead_created"].includes(eventName)) {
    return "Conversion / Funnel Agent";
  }

  return "Analytics Agent";
}

function compactMetadata(metadata: Record<string, unknown>) {
  const visibleKeys = [
    "preference",
    "preferenceLabel",
    "source",
    "intent",
    "journey_stage",
    "governance_status",
    "budget",
    "loyalty_tier",
    "purchase_intent",
    "matched_tags",
    "surfaceMode",
    "color",
    "confidence",
    "price_to_budget_ratio",
    "recovery_trigger",
    "recovery_reason",
    "offer_type",
    "offer_label",
    "expected_uplift_percent",
    "abandonment_window_seconds",
    "suggested_product",
    "suggested_product_name"
  ];

  return Object.fromEntries(
    visibleKeys
      .filter((key) => metadata[key] !== undefined && metadata[key] !== null && metadata[key] !== "")
      .map((key) => [key, metadata[key]])
  );
}

function buildUnansweredQuestions(conversations: SaveConversationTurnInput[]) {
  return conversations
    .filter((turn) => /I can help narrow this down|human associate|support team/i.test(turn.assistantMessage))
    .slice(0, 6)
    .map((turn) => ({ question: turn.userMessage, count: 1 }));
}

function buildContentGaps(conversations: SaveConversationTurnInput[]) {
  const gaps = conversations.flatMap((turn) => {
    const missingCitation = turn.governance.checks.some(
      (check) => check.id === "source_grounding" && check.status === "watch"
    );
    const unsupportedClaim = turn.governance.checks.some((check) => check.id === "claim_control" && check.status === "watch");
    return [
      ...(missingCitation ? [{ topic: "Missing source coverage for policy or brand response", severity: "high" as const }] : []),
      ...(unsupportedClaim ? [{ topic: "Tighten approved product-claim language", severity: "medium" as const }] : [])
    ];
  });

  return gaps.length ? gaps.slice(0, 6) : [];
}

async function withGoogleAnalyticsSummary(summary: AnalyticsSummary): Promise<AnalyticsSummary> {
  const status = getGoogleAnalyticsStatus();
  const baseSummary: AnalyticsSummary = {
    ...summary,
    source: status.reportingConfigured ? "hybrid" : "local",
    googleAnalytics: status
  };

  if (!status.reportingConfigured) return baseSummary;

  try {
    const [eventCounts, productInterest] = await Promise.all([
      getGoogleAnalyticsEventCounts(),
      getGoogleAnalyticsProductInterest()
    ]);
    const mergedFunnel = mergeCounts(baseSummary.recommendationFunnel, eventCounts, "eventName");
    const checkoutCount = mergedFunnel.find((event) => event.eventName === "checkout_started")?.count ?? 0;
    const preferenceCount = mergedFunnel.find((event) => event.eventName === "preference_selected")?.count ?? 0;
    const denominator = Math.max(preferenceCount, baseSummary.totalConversations, 1);

    return {
      ...baseSummary,
      source: "hybrid",
      conversionRate: checkoutCount ? Number((checkoutCount / denominator).toFixed(2)) : baseSummary.conversionRate,
      recommendationFunnel: mergedFunnel,
      generatedLeads:
        mergedFunnel.find((event) => event.eventName === "lead_created")?.count ?? baseSummary.generatedLeads,
      productInterest: productInterest.length ? productInterest : baseSummary.productInterest
    };
  } catch (error) {
    console.warn(error instanceof Error ? error.message : "GA4 reporting failed");
    return baseSummary;
  }
}

function mergeCounts<T extends Record<K, string> & { count: number }, K extends string>(
  localItems: T[],
  googleItems: T[],
  key: K
) {
  const counts = new Map<string, number>();
  for (const item of localItems) counts.set(item[key], item.count);
  for (const item of googleItems) counts.set(item[key], (counts.get(item[key]) ?? 0) + item.count);

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ [key]: label, count }) as T);
}
