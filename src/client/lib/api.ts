import type { AnalyticsSummary, ChatRequest, ChatResponse, HealthStatus, Product, ProductFilters } from "../../shared/types";
import { getClientId, getSessionId } from "./clientIdentity";
import { trackGoogleAnalyticsEvent } from "./googleAnalytics";

const apiBase = import.meta.env.VITE_API_BASE ?? "";

export async function sendChat(request: ChatRequest): Promise<ChatResponse> {
  const response = await fetch(`${apiBase}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(await buildApiErrorMessage(response, "Chat request failed"));
  }

  return response.json() as Promise<ChatResponse>;
}

export async function fetchHealth(): Promise<HealthStatus> {
  const response = await fetch(`${apiBase}/health`);

  if (!response.ok) {
    throw new Error(await buildApiErrorMessage(response, "Health request failed"));
  }

  return response.json() as Promise<HealthStatus>;
}

export async function fetchAnalytics(): Promise<AnalyticsSummary> {
  const response = await fetch(`${apiBase}/api/admin/analytics`);

  if (!response.ok) {
    throw new Error(await buildApiErrorMessage(response, "Analytics request failed"));
  }

  return response.json() as Promise<AnalyticsSummary>;
}

export async function trackAnalyticsEvent(input: {
  eventName: string;
  productIds?: string[];
  value?: number;
  metadata?: Record<string, unknown>;
}) {
  void trackGoogleAnalyticsEvent(input).catch(() => undefined);

  const payload = {
    ...input,
    metadata: {
      ...(input.metadata ?? {}),
      gaForwardedByClient: true,
      gaClientId: getClientId(),
      gaSessionId: getSessionId(),
      gaTransport: "browser_gtag"
    }
  };

  await fetch(`${apiBase}/api/admin/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function fetchProducts(filters: ProductFilters = {}): Promise<Product[]> {
  const params = new URLSearchParams();

  if (filters.query) params.set("q", filters.query);
  if (filters.category) params.set("category", filters.category);
  if (filters.maxPrice) params.set("maxPrice", String(filters.maxPrice));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.strictBudget !== undefined) params.set("strictBudget", String(filters.strictBudget));
  if (filters.tags?.length) params.set("tags", filters.tags.join(","));

  const query = params.toString();
  const response = await fetch(`${apiBase}/api/products${query ? `?${query}` : ""}`);

  if (!response.ok) {
    throw new Error(await buildApiErrorMessage(response, "Product request failed"));
  }

  const body = (await response.json()) as { products: Product[] };
  return body.products;
}

async function buildApiErrorMessage(response: Response, fallback: string) {
  const body = await response
    .json()
    .catch(() => undefined) as { error?: string } | undefined;
  return body?.error ? `${fallback}: ${body.error}` : `${fallback}: ${response.status}`;
}
