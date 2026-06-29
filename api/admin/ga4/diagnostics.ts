import {
  getGoogleAnalyticsLastForwardStatus,
  getGoogleAnalyticsRealtimeEventCounts,
  getGoogleAnalyticsStatus,
  validateGoogleAnalyticsEvent
} from "../../../src/server/services/googleAnalytics";
import { sendJson, sendMethodNotAllowed, type ApiRequest, type ApiResponse } from "../../_utils";

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "GET") {
    sendMethodNotAllowed(response, ["GET"]);
    return;
  }

  try {
    const validation = await validateGoogleAnalyticsEvent({
      eventName: "product_selected",
      productIds: ["prod_terra_grip"],
      value: 156,
      metadata: {
        gaClientId: `${Math.floor(Date.now() / 1000)}.${Date.now() % 1_000_000}`,
        gaSessionId: String(Math.floor(Date.now() / 1000)),
        preference: "weather",
        source: "ga4_diagnostics"
      }
    });
    const realtimeResult = await getGoogleAnalyticsRealtimeDiagnostics();

    sendJson(response, 200, {
      status: getGoogleAnalyticsStatus(),
      lastForwardStatus: getGoogleAnalyticsLastForwardStatus(),
      validationMessages: validation.validationMessages ?? [],
      realtimeEvents: realtimeResult.events,
      realtimeError: realtimeResult.error
    });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "GA4 diagnostics failed." });
  }
}

async function getGoogleAnalyticsRealtimeDiagnostics() {
  try {
    return {
      events: await getGoogleAnalyticsRealtimeEventCounts(),
      error: null
    };
  } catch (error) {
    return {
      events: [],
      error: error instanceof Error ? error.message : "GA4 realtime report failed"
    };
  }
}
