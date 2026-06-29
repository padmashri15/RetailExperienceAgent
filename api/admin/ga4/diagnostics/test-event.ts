import {
  getGoogleAnalyticsRealtimeEventCounts,
  getGoogleAnalyticsStatus,
  sendGoogleAnalyticsDiagnosticEvent
} from "../../../../src/server/services/googleAnalytics";
import { sendJson, sendMethodNotAllowed, type ApiRequest, type ApiResponse } from "../../../_utils";

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    sendMethodNotAllowed(response, ["POST"]);
    return;
  }

  try {
    const lastForwardStatus = await sendGoogleAnalyticsDiagnosticEvent();
    const realtimeResult = await getGoogleAnalyticsRealtimeDiagnostics();

    sendJson(response, 200, {
      status: getGoogleAnalyticsStatus(),
      lastForwardStatus,
      realtimeEvents: realtimeResult.events,
      realtimeError: realtimeResult.error
    });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "GA4 test event failed." });
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
