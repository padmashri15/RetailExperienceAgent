import { env } from "../src/server/config/env";
import { getGoogleAnalyticsStatus } from "../src/server/services/googleAnalytics";
import { sendJson, sendMethodNotAllowed, type ApiRequest, type ApiResponse } from "./_utils";

export default function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "GET") {
    sendMethodNotAllowed(response, ["GET"]);
    return;
  }

  sendJson(response, 200, {
    status: "ok",
    mode: env.openaiApiKey ? "live_openai" : "demo",
    model: env.openaiModel,
    vectorStoreConfigured: Boolean(env.openaiVectorStoreId),
    openai: {
      configured: Boolean(env.openaiApiKey),
      fallbackToDemo: env.openaiFallbackToDemo,
      insecureTlsAllowed: env.openaiAllowInsecureTls,
      extraCaCertsConfigured: env.nodeExtraCaCertsConfigured
    },
    googleAnalytics: getGoogleAnalyticsStatus()
  });
}
