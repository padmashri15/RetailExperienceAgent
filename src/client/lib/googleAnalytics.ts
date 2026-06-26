import { getClientId, getSessionId } from "./clientIdentity";

const apiBase = import.meta.env.VITE_API_BASE ?? "";
const scriptId = "ga4-gtag-script";
const buildMeasurementId = (import.meta.env.VITE_GA4_MEASUREMENT_ID ?? "").trim();
const buildDebugMode = parseBoolean(import.meta.env.VITE_GA4_DEBUG_MODE, true);

interface GoogleAnalyticsClientConfig {
  debugMode: boolean;
  enabled: boolean;
  measurementConfigured: boolean;
  measurementId: string | null;
  source: "vite_env" | "server_config";
}

interface BrowserAnalyticsEvent {
  eventName: string;
  productIds?: string[];
  value?: number;
  metadata?: Record<string, unknown>;
}

interface GoogleAnalyticsDebugState {
  configSource?: GoogleAnalyticsClientConfig["source"];
  dataLayerSize: number;
  enabled: boolean;
  eventCount: number;
  initialized: boolean;
  lastError?: string;
  lastEventName?: string;
  measurementId: string | null;
  scriptLoaded: boolean;
  scriptRequested: boolean;
}

type GtagCommand = "js" | "config" | "event" | "set";
type GtagFunction = (command: GtagCommand, target: string | Date, params?: Record<string, unknown>) => void;

declare global {
  interface Window {
    brandExperienceGa?: GoogleAnalyticsDebugState;
    dataLayer?: unknown[];
    gtag?: GtagFunction;
  }
}

let configPromise: Promise<GoogleAnalyticsClientConfig | null> | null = null;
let initializedMeasurementId: string | null = null;
let scriptLoadPromise: Promise<void> | null = null;

export async function initializeGoogleAnalytics() {
  const config = await getGoogleAnalyticsClientConfig();

  updateDebugState({
    configSource: config?.source,
    enabled: Boolean(config?.enabled && config.measurementId),
    measurementId: config?.measurementId ?? null
  });

  if (!config?.enabled || !config.measurementId) return null;

  installGtagStub();
  startGtagScriptLoad(config.measurementId);

  if (initializedMeasurementId !== config.measurementId) {
    window.gtag?.("js", new Date());
    window.gtag?.("config", config.measurementId, {
      client_id: getClientId(),
      debug_mode: config.debugMode,
      send_page_view: false,
      transport_type: "beacon"
    });
    if (config.debugMode) {
      console.info(`[GA4] initialized browser tag ${config.measurementId}`, {
        measurementId: config.measurementId,
        source: config.source
      });
    }
    initializedMeasurementId = config.measurementId;
  }

  updateDebugState({ initialized: true });
  return config;
}

export async function trackGoogleAnalyticsEvent(input: BrowserAnalyticsEvent) {
  const config = await initializeGoogleAnalytics();
  if (!config?.measurementId) return { sent: false, eventName: input.eventName };

  const event = buildGtagEvent(input, config);
  window.gtag?.("event", event.name, event.params);
  if (config.debugMode) {
    console.info(`[GA4] browser event sent: ${event.name}`, {
      eventName: event.name,
      originalEventName: input.eventName,
      productCount: input.productIds?.length ?? 0,
      source: config.source
    });
  }

  updateDebugState({
    eventCount: (window.brandExperienceGa?.eventCount ?? 0) + 1,
    lastEventName: event.name
  });

  return { sent: true, eventName: event.name };
}

async function getGoogleAnalyticsClientConfig() {
  if (!configPromise) {
    configPromise = resolveGoogleAnalyticsClientConfig();
  }

  return configPromise;
}

async function resolveGoogleAnalyticsClientConfig(): Promise<GoogleAnalyticsClientConfig | null> {
  const buildConfig = getBuildTimeGoogleAnalyticsConfig();
  if (buildConfig) return buildConfig;

  return fetch(`${apiBase}/api/admin/ga4/config`)
    .then(async (response) => {
      if (!response.ok) return null;
      const body = (await response.json()) as Omit<GoogleAnalyticsClientConfig, "source">;
      if (!body.measurementId) return null;

      return {
        debugMode: body.debugMode,
        enabled: body.enabled,
        measurementConfigured: Boolean(body.measurementId),
        measurementId: body.measurementId,
        source: "server_config" as const
      };
    })
    .catch((error: unknown) => {
      updateDebugState({ lastError: error instanceof Error ? error.message : "Unable to load GA4 client config" });
      return null;
    });
}

function getBuildTimeGoogleAnalyticsConfig(): GoogleAnalyticsClientConfig | null {
  if (!buildMeasurementId) return null;

  return {
    debugMode: buildDebugMode,
    enabled: true,
    measurementConfigured: true,
    measurementId: buildMeasurementId,
    source: "vite_env"
  };
}

function installGtagStub() {
  window.dataLayer = window.dataLayer ?? [];
  window.gtag =
    window.gtag ??
    function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
}

function startGtagScriptLoad(measurementId: string) {
  updateDebugState({ scriptRequested: true });

  const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (existingScript) {
    updateDebugState({ scriptLoaded: existingScript.dataset.loaded === "true" });
    return scriptLoadPromise ?? Promise.resolve();
  }

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    script.onload = () => {
      script.dataset.loaded = "true";
      updateDebugState({ scriptLoaded: true });
      resolve();
    };
    script.onerror = () => {
      updateDebugState({ lastError: "Unable to load Google Analytics tag", scriptLoaded: false });
      reject(new Error("Unable to load Google Analytics tag"));
    };
    document.head.appendChild(script);
  });

  scriptLoadPromise.catch(() => undefined);
  return scriptLoadPromise;
}

function buildGtagEvent(input: BrowserAnalyticsEvent, config: GoogleAnalyticsClientConfig) {
  const metadata = input.metadata ?? {};
  const eventName = normalizeEventName(input.eventName);
  const itemNames = toArray(metadata.product_names ?? metadata.productNames);
  const itemCategories = toArray(metadata.product_categories ?? metadata.productCategories);
  const itemListName = String(metadata.item_list_name ?? metadata.source ?? "Brand Experience Agent");
  const items = (input.productIds ?? []).map((productId, index) => ({
    item_id: productId,
    item_name: itemNames[index] ?? productId,
    item_category: itemCategories[index] ?? metadata.category,
    item_list_id: normalizeListId(itemListName),
    item_list_name: itemListName,
    index,
    quantity: 1
  }));

  const params: Record<string, unknown> = {
    ...sanitizeMetadata(metadata),
    app_event_name: input.eventName,
    currency: "USD",
    debug_mode: config.debugMode,
    engagement_time_msec: 100,
    ga_transport: "browser_gtag",
    item_list_id: normalizeListId(itemListName),
    item_list_name: itemListName,
    send_to: config.measurementId,
    session_id: getSessionId(),
    transport_type: "beacon",
    value: input.value ?? 0
  };

  if (items.length) params.items = items;

  return {
    name: eventName,
    params
  };
}

function normalizeEventName(eventName: string) {
  return (
    {
      cart_add: "add_to_cart",
      checkout_started: "begin_checkout",
      page_viewed: "page_view",
      product_impression: "view_item_list",
      product_viewed: "view_item",
      product_selected: "select_item"
    }[eventName] ?? eventName
  )
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^[^a-zA-Z]+/, "event_")
    .slice(0, 40);
}

function sanitizeMetadata(metadata: Record<string, unknown>) {
  const hiddenKeys = new Set([
    "gaClientId",
    "gaForwardedByClient",
    "gaSessionId",
    "gaTransport",
    "product_categories",
    "productCategories",
    "product_names",
    "productNames",
    "sessionId"
  ]);
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (hiddenKeys.has(key)) continue;
    const paramValue = sanitizeValue(value);
    if (paramValue === undefined) continue;
    sanitized[normalizeParamName(key)] = paramValue;
  }

  return sanitized;
}

function sanitizeValue(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 100);
  if (Array.isArray(value)) return value.map((item) => String(item)).join("|").slice(0, 100);
  if (typeof value === "object") return JSON.stringify(value).slice(0, 100);
  return String(value).slice(0, 100);
}

function toArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function normalizeParamName(key: string) {
  const normalized = key.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_");
  return (/^[a-zA-Z]/.test(normalized) ? normalized : `param_${normalized}`).slice(0, 40);
}

function normalizeListId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() !== "false";
}

function updateDebugState(update: Partial<GoogleAnalyticsDebugState>) {
  const current = window.brandExperienceGa ?? {
    dataLayerSize: 0,
    enabled: false,
    eventCount: 0,
    initialized: false,
    measurementId: null,
    scriptLoaded: false,
    scriptRequested: false
  };

  window.brandExperienceGa = {
    ...current,
    ...update,
    dataLayerSize: window.dataLayer?.length ?? current.dataLayerSize
  };
}
