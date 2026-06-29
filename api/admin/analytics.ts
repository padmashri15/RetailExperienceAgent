import { createTelemetryRepository } from "../../src/server/db/repository";
import { sendJson, sendMethodNotAllowed, type ApiRequest, type ApiResponse } from "../_utils";

const repository = createTelemetryRepository();

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "GET") {
    sendMethodNotAllowed(response, ["GET"]);
    return;
  }

  try {
    sendJson(response, 200, await repository.getAnalyticsSummary());
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Analytics request failed." });
  }
}
