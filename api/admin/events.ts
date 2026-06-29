import { sanitizeStringArray, sanitizeText } from "../../src/shared/validation";
import { createTelemetryRepository } from "../../src/server/db/repository";
import { readJsonBody, sendJson, sendMethodNotAllowed, type ApiRequest, type ApiResponse } from "../_utils";

const repository = createTelemetryRepository();

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    sendMethodNotAllowed(response, ["POST"]);
    return;
  }

  try {
    const body = await readJsonBody(request);
    const event = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const eventName = sanitizeText(event.eventName, 80);

    if (!eventName) {
      sendJson(response, 400, { error: "eventName is required" });
      return;
    }

    await repository.trackConversion({
      eventName,
      productIds: sanitizeStringArray(event.productIds) ?? [],
      value: typeof event.value === "number" && Number.isFinite(event.value) ? Math.max(0, event.value) : 0,
      metadata: sanitizeMetadata(event.metadata)
    });

    sendJson(response, 200, { ok: true });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Analytics event failed." });
  }
}

function sanitizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => Boolean(sanitizeText(key, 60)))
      .slice(0, 24)
      .map(([key, entry]) => [key, sanitizeMetadataValue(entry)])
      .filter(([, entry]) => entry !== undefined)
  );
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeText(value, 200);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 12).map(sanitizeMetadataValue).filter((item) => item !== undefined);
  return undefined;
}
