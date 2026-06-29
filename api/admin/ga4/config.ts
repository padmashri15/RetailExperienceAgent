import { env, isGoogleAnalyticsMeasurementConfigured } from "../../../src/server/config/env";
import { sendJson, sendMethodNotAllowed, type ApiRequest, type ApiResponse } from "../../_utils";

export default function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "GET") {
    sendMethodNotAllowed(response, ["GET"]);
    return;
  }

  sendJson(response, 200, {
    enabled: Boolean(env.googleAnalyticsMeasurementId),
    measurementConfigured: isGoogleAnalyticsMeasurementConfigured(),
    measurementId: env.googleAnalyticsMeasurementId ?? null,
    debugMode: env.googleAnalyticsDebugMode
  });
}
