import { Router } from "express";
import { sanitizeStringArray, sanitizeText } from "../../shared/validation";
import { env, isGoogleAnalyticsMeasurementConfigured } from "../config/env";
import type { TelemetryRepository } from "../db/repository";
import {
  getGoogleAnalyticsLastForwardStatus,
  getGoogleAnalyticsRealtimeEventCounts,
  getGoogleAnalyticsStatus,
  sendGoogleAnalyticsDiagnosticEvent,
  validateGoogleAnalyticsEvent
} from "../services/googleAnalytics";

export function createAdminRouter(repository: TelemetryRepository) {
  const router = Router();

  router.get("/analytics", async (_request, response, next) => {
    try {
      response.json(await repository.getAnalyticsSummary());
    } catch (error) {
      next(error);
    }
  });

  router.get("/ga4/diagnostics", async (_request, response, next) => {
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

      response.json({
        status: getGoogleAnalyticsStatus(),
        lastForwardStatus: getGoogleAnalyticsLastForwardStatus(),
        validationMessages: validation.validationMessages ?? [],
        realtimeEvents: realtimeResult.events,
        realtimeError: realtimeResult.error
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/ga4/config", (_request, response) => {
    response.json({
      enabled: Boolean(env.googleAnalyticsMeasurementId),
      measurementConfigured: isGoogleAnalyticsMeasurementConfigured(),
      measurementId: env.googleAnalyticsMeasurementId ?? null,
      debugMode: env.googleAnalyticsDebugMode
    });
  });

  router.post("/ga4/diagnostics/test-event", async (_request, response, next) => {
    try {
      const lastForwardStatus = await sendGoogleAnalyticsDiagnosticEvent();
      const realtimeResult = await getGoogleAnalyticsRealtimeDiagnostics();

      response.json({
        status: getGoogleAnalyticsStatus(),
        lastForwardStatus,
        realtimeEvents: realtimeResult.events,
        realtimeError: realtimeResult.error
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/events", async (request, response, next) => {
    try {
      const body = request.body as {
        eventName?: string;
        productIds?: string[];
        value?: number;
        metadata?: Record<string, unknown>;
      };
      const eventName = sanitizeText(body.eventName, 80);

      if (!eventName) {
        response.status(400).json({ error: "eventName is required" });
        return;
      }

      await repository.trackConversion({
        eventName,
        productIds: sanitizeStringArray(body.productIds) ?? [],
        value: typeof body.value === "number" && Number.isFinite(body.value) ? Math.max(0, body.value) : 0,
        metadata: sanitizeMetadata(body.metadata)
      });

      response.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function sanitizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => Boolean(sanitizeText(key, 60)))
      .slice(0, 24)
      .map(([key, entry]) => [key, sanitizeMetadataValue(entry)])
  );
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeText(value, 200);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 12).map(sanitizeMetadataValue).filter((item) => item !== undefined);
  return undefined;
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
