import { validateChatRequest } from "../src/shared/validation";
import { runRetailAgent } from "../src/server/agent/retailAgent";
import { createTelemetryRepository } from "../src/server/db/repository";
import { readJsonBody, sendJson, sendMethodNotAllowed, type ApiRequest, type ApiResponse } from "./_utils";

const repository = createTelemetryRepository();

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    sendMethodNotAllowed(response, ["POST"]);
    return;
  }

  try {
    const validation = validateChatRequest(await readJsonBody(request));
    if (!validation.ok) {
      sendJson(response, 400, { error: validation.error });
      return;
    }

    sendJson(response, 200, await runRetailAgent(validation.value, repository));
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Chat request failed." });
  }
}
