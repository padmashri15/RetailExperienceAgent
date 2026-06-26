import "dotenv/config";

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function normalizeGooglePrivateKey(value?: string) {
  if (!value) return undefined;

  const normalized = value.trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
  if (normalized.includes("-----BEGIN PRIVATE KEY-----")) return normalized;

  const compactKey = normalized.replace(/\\/g, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(compactKey) || compactKey.length < 200) return normalized;

  const wrappedKey = compactKey.match(/.{1,64}/g)?.join("\n") ?? compactKey;
  return `-----BEGIN PRIVATE KEY-----\n${wrappedKey}\n-----END PRIVATE KEY-----\n`;
}

const openaiAllowInsecureTls = parseBoolean(process.env.OPENAI_ALLOW_INSECURE_TLS, false);

if (openaiAllowInsecureTls && process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

export const env = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://127.0.0.1:5173",
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-5.5",
  openaiVectorStoreId: process.env.OPENAI_VECTOR_STORE_ID,
  openaiFallbackToDemo: parseBoolean(process.env.OPENAI_FALLBACK_TO_DEMO, true),
  openaiAllowInsecureTls,
  nodeExtraCaCertsConfigured: Boolean(process.env.NODE_EXTRA_CA_CERTS),
  databaseUrl: process.env.DATABASE_URL,
  googleAnalyticsMeasurementId: process.env.GA4_MEASUREMENT_ID,
  googleAnalyticsApiSecret: process.env.GA4_API_SECRET,
  googleAnalyticsPropertyId: process.env.GA4_PROPERTY_ID,
  googleAnalyticsClientEmail: process.env.GA4_CLIENT_EMAIL,
  googleAnalyticsPrivateKey: normalizeGooglePrivateKey(process.env.GA4_PRIVATE_KEY),
  googleAnalyticsServiceAccountJson: process.env.GA4_SERVICE_ACCOUNT_JSON,
  googleAnalyticsCollectHost: process.env.GA4_COLLECT_HOST ?? "https://www.google-analytics.com",
  googleAnalyticsDebugMode: process.env.GA4_DEBUG_MODE !== "false",
  brandName: process.env.BRAND_NAME ?? "Aster & Ridge"
};

export function isLiveOpenAIConfigured() {
  return Boolean(env.openaiApiKey);
}

export function isGoogleAnalyticsMeasurementConfigured() {
  return Boolean(env.googleAnalyticsMeasurementId && env.googleAnalyticsApiSecret);
}

export function isGoogleAnalyticsReportingConfigured() {
  return Boolean(
    env.googleAnalyticsPropertyId &&
      (env.googleAnalyticsServiceAccountJson || (env.googleAnalyticsClientEmail && env.googleAnalyticsPrivateKey))
  );
}
