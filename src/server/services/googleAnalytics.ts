import { createSign } from "node:crypto";
import { env, isGoogleAnalyticsMeasurementConfigured, isGoogleAnalyticsReportingConfigured } from "../config/env";
import type { TrackConversionInput, TrackIntentInput } from "../db/repository";
import { loadCatalog } from "./catalog";

interface GoogleAnalyticsToken {
  accessToken: string;
  expiresAt: number;
}

interface GoogleAnalyticsRunReportResponse {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
}

interface GoogleAnalyticsValidationResponse {
  validationMessages?: Array<{
    fieldPath?: string;
    description?: string;
    validationCode?: string;
  }>;
}

interface GoogleAnalyticsForwardStatus {
  eventName: string;
  gaEventName: string;
  httpStatus?: number;
  ok: boolean;
  productCount: number;
  sentAt: string;
  message?: string;
}

let cachedToken: GoogleAnalyticsToken | null = null;
let lastForwardStatus: GoogleAnalyticsForwardStatus | null = null;
const privateMetadataKeys = new Set(["gaClientId", "gaSessionId", "sessionId"]);
const gaClientIdPattern = /^\d+\.\d+$/;

export function getGoogleAnalyticsStatus() {
  return {
    measurementConfigured: isGoogleAnalyticsMeasurementConfigured(),
    reportingConfigured: isGoogleAnalyticsReportingConfigured()
  };
}

export async function forwardConversionToGoogleAnalytics(input: TrackConversionInput) {
  await forwardEventToGoogleAnalytics(input);
}

export function getGoogleAnalyticsLastForwardStatus() {
  return lastForwardStatus;
}

export async function forwardIntentToGoogleAnalytics(input: TrackIntentInput) {
  await forwardEventToGoogleAnalytics({
    conversationId: input.conversationId,
    customerId: input.customerId,
    eventName: "intent_detected",
    value: 0,
    metadata: {
      ...(input.metadata ?? {}),
      intent: input.intent,
      journey_stage: input.journeyStage,
      confidence: input.confidence
    }
  });
}

async function forwardEventToGoogleAnalytics(input: TrackConversionInput) {
  if (!isGoogleAnalyticsMeasurementConfigured()) return;

  const request = await buildGoogleAnalyticsRequest(input, false);

  const response = await fetch(request.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request.payload)
  });

  lastForwardStatus = {
    eventName: input.eventName,
    gaEventName: request.eventName,
    httpStatus: response.status,
    ok: response.ok,
    productCount: input.productIds?.length ?? 0,
    sentAt: new Date().toISOString()
  };

  if (!response.ok) {
    lastForwardStatus.message = `GA4 Measurement Protocol failed: ${response.status}`;
    throw new Error(`GA4 Measurement Protocol failed: ${response.status}`);
  }
}

export async function sendGoogleAnalyticsDiagnosticEvent() {
  await forwardEventToGoogleAnalytics({
    eventName: "product_selected",
    productIds: ["prod_terra_grip"],
    value: 156,
    metadata: {
      gaClientId: `${Math.floor(Date.now() / 1000)}.${Date.now() % 1_000_000}`,
      gaSessionId: String(Math.floor(Date.now() / 1000)),
      preference: "weather",
      source: "ga4_diagnostic_real_send"
    }
  });

  return lastForwardStatus;
}

export async function validateGoogleAnalyticsEvent(input: TrackConversionInput): Promise<GoogleAnalyticsValidationResponse> {
  if (!isGoogleAnalyticsMeasurementConfigured()) {
    return {
      validationMessages: [
        {
          fieldPath: "configuration",
          description: "GA4_MEASUREMENT_ID and GA4_API_SECRET are required for Measurement Protocol validation.",
          validationCode: "VALUE_REQUIRED"
        }
      ]
    };
  }

  const request = await buildGoogleAnalyticsRequest(input, true);
  const response = await fetch(request.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...request.payload,
      validation_behavior: "ENFORCE_RECOMMENDATIONS"
    })
  });

  if (!response.ok) {
    throw new Error(`GA4 validation failed: ${response.status}`);
  }

  return response.json() as Promise<GoogleAnalyticsValidationResponse>;
}

export async function getGoogleAnalyticsEventCounts() {
  if (!isGoogleAnalyticsReportingConfigured()) return [];

  const report = await runReport({
    dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    limit: "50",
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }]
  });

  return (report.rows ?? []).map((row) => ({
    eventName: mapGoogleAnalyticsEventName(row.dimensionValues?.[0]?.value ?? "unknown"),
    count: Number(row.metricValues?.[0]?.value ?? 0)
  }));
}

export async function getGoogleAnalyticsRealtimeEventCounts() {
  if (!isGoogleAnalyticsReportingConfigured()) return [];

  const report = await runRealtimeReport({
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    limit: "20",
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }]
  });

  return (report.rows ?? []).map((row) => ({
    eventName: mapGoogleAnalyticsEventName(row.dimensionValues?.[0]?.value ?? "unknown"),
    count: Number(row.metricValues?.[0]?.value ?? 0)
  }));
}

export async function getGoogleAnalyticsProductInterest() {
  if (!isGoogleAnalyticsReportingConfigured()) return [];

  try {
    const report = await runReport({
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      dimensions: [{ name: "itemName" }],
      metrics: [{ name: "itemsAddedToCart" }],
      limit: "20",
      orderBys: [{ metric: { metricName: "itemsAddedToCart" }, desc: true }]
    });

    return (report.rows ?? [])
      .map((row) => ({
        productName: row.dimensionValues?.[0]?.value ?? "Unknown product",
        count: Number(row.metricValues?.[0]?.value ?? 0)
      }))
      .filter((row) => row.productName !== "(not set)" && row.count > 0);
  } catch {
    return [];
  }
}

async function runReport(body: Record<string, unknown>): Promise<GoogleAnalyticsRunReportResponse> {
  const token = await getAccessToken();
  const propertyId = env.googleAnalyticsPropertyId;
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(await buildGoogleAnalyticsApiError("GA4 Data API report failed", response));
  }

  return response.json() as Promise<GoogleAnalyticsRunReportResponse>;
}

async function runRealtimeReport(body: Record<string, unknown>): Promise<GoogleAnalyticsRunReportResponse> {
  const token = await getAccessToken();
  const propertyId = env.googleAnalyticsPropertyId;
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(await buildGoogleAnalyticsApiError("GA4 Realtime report failed", response));
  }

  return response.json() as Promise<GoogleAnalyticsRunReportResponse>;
}

async function buildGoogleAnalyticsApiError(prefix: string, response: Response) {
  try {
    const body = (await response.json()) as { error?: { message?: string; status?: string } };
    const message = body.error?.message;
    return message ? `${prefix}: ${response.status} ${message}` : `${prefix}: ${response.status}`;
  } catch {
    return `${prefix}: ${response.status}`;
  }
}

async function buildGoogleAnalyticsRequest(input: TrackConversionInput, debug: boolean) {
  const catalog = await loadCatalog();
  const productById = new Map(catalog.map((product) => [product.id, product]));
  const productIds = input.productIds ?? [];
  const gaEventName = normalizeEventName(input.eventName);
  const clientId = buildClientId(input);
  const metadata = input.metadata ?? {};
  const itemListName = String(metadata.item_list_name ?? metadata.source ?? "Brand Experience Agent");
  const baseParams: Record<string, unknown> = {
    engagement_time_msec: 100,
    session_id: String(metadata.sessionId ?? metadata.gaSessionId ?? Math.floor(Date.now() / 1000)),
    debug_mode: true,
    app_event_name: input.eventName,
    source: metadata.source ?? "brand_experience_agent",
    preference: metadata.preference,
    recommendation_source: metadata.source,
    conversation_id: input.conversationId,
    item_list_id: normalizeListId(itemListName),
    item_list_name: itemListName,
    value: input.value ?? 0,
    currency: "USD"
  };

  const items = productIds
    .map((productId, index) => ({ product: productById.get(productId), index }))
    .filter((item): item is { product: NonNullable<(typeof item)["product"]>; index: number } => Boolean(item.product))
    .map(({ product, index }) => ({
      item_id: product.id,
      item_name: product.name,
      item_brand: env.brandName,
      item_category: product.category,
      item_list_id: normalizeListId(itemListName),
      item_list_name: itemListName,
      price: product.price,
      currency: product.currency,
      google_business_vertical: "retail",
      index,
      quantity: 1
    }));

  const url = new URL(debug ? "/debug/mp/collect" : "/mp/collect", env.googleAnalyticsCollectHost);
  url.searchParams.set("measurement_id", env.googleAnalyticsMeasurementId ?? "");
  url.searchParams.set("api_secret", env.googleAnalyticsApiSecret ?? "");

  return {
    eventName: gaEventName,
    url,
    payload: {
      client_id: clientId,
      user_id: input.customerId,
      events: [
        {
          name: gaEventName,
          params: sanitizeParams({ ...metadata, ...baseParams }, items)
        }
      ]
    }
  };
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const credentials = getServiceAccountCredentials();
  if (!credentials) throw new Error("GA4 reporting credentials are not configured");

  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    {
      alg: "RS256",
      typ: "JWT"
    },
    {
      iss: credentials.clientEmail,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    },
    credentials.privateKey
  );

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  if (!tokenResponse.ok) {
    throw new Error(`GA4 auth failed: ${tokenResponse.status}`);
  }

  const tokenBody = (await tokenResponse.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: tokenBody.access_token,
    expiresAt: Date.now() + tokenBody.expires_in * 1000
  };

  return cachedToken.accessToken;
}

function getServiceAccountCredentials() {
  if (env.googleAnalyticsServiceAccountJson) {
    const parsed = JSON.parse(env.googleAnalyticsServiceAccountJson) as {
      client_email?: string;
      private_key?: string;
    };

    if (parsed.client_email && parsed.private_key) {
      return {
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key.replace(/\\n/g, "\n")
      };
    }
  }

  if (env.googleAnalyticsClientEmail && env.googleAnalyticsPrivateKey) {
    return {
      clientEmail: env.googleAnalyticsClientEmail,
      privateKey: env.googleAnalyticsPrivateKey
    };
  }

  return null;
}

function signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, privateKey: string) {
  const unsignedToken = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createSign("RSA-SHA256").update(unsignedToken).sign(privateKey);
  return `${unsignedToken}.${base64url(signature)}`;
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function buildClientId(input: TrackConversionInput) {
  const rawClientId = String(
    input.metadata?.gaClientId ??
      input.metadata?.clientId ??
      input.customerId ??
      input.conversationId ??
      "brand-experience-agent.1"
  );

  return normalizeGoogleAnalyticsClientId(rawClientId);
}

function normalizeListId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function normalizeGoogleAnalyticsClientId(value: string) {
  if (gaClientIdPattern.test(value)) return value;

  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  const left = Math.max(1, hash);
  const right = Math.max(1, value.length * 1_000_003 + hash);
  return `${left}.${right}`;
}

function normalizeEventName(eventName: string) {
  const mappedEventName =
    {
      cart_add: "add_to_cart",
      checkout_started: "begin_checkout",
      page_viewed: "page_view",
      product_impression: "view_item_list",
      product_viewed: "view_item",
      product_selected: "select_item"
    }[eventName] ?? eventName;

  return mappedEventName
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^[^a-zA-Z]+/, "event_")
    .slice(0, 40);
}

function mapGoogleAnalyticsEventName(eventName: string) {
  if (eventName === "add_to_cart") return "cart_add";
  if (eventName === "begin_checkout") return "checkout_started";
  if (eventName === "page_view") return "page_viewed";
  if (eventName === "view_item_list") return "product_impression";
  if (eventName === "view_item") return "product_viewed";
  if (eventName === "select_item") return "product_selected";
  return eventName;
}

function sanitizeParams(params: Record<string, unknown>, items: Array<Record<string, unknown>>) {
  const sanitized: Record<string, unknown> = {};
  const maxParamCount = items.length ? 24 : 25;

  for (const [key, value] of Object.entries(params)) {
    if (privateMetadataKeys.has(key)) continue;
    const paramValue = sanitizeParamValue(value);
    if (paramValue === undefined) continue;

    sanitized[normalizeParamName(key)] = paramValue;
    if (Object.keys(sanitized).length >= maxParamCount) break;
  }

  if (items.length) {
    sanitized.items = items;
  }

  return sanitized;
}

function normalizeParamName(key: string) {
  const normalized = key.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_");
  return (/^[a-zA-Z]/.test(normalized) ? normalized : `param_${normalized}`).slice(0, 40);
}

function sanitizeParamValue(value: unknown): string | number | boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 100);
  if (Array.isArray(value)) return value.map((item) => String(item)).join("|").slice(0, 100);
  if (typeof value === "object") return JSON.stringify(value).slice(0, 100);
  return String(value).slice(0, 100);
}
