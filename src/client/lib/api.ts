import type { AnalyticsSummary, ChatRequest, ChatResponse, HealthStatus, Product, ProductFilters } from "../../shared/types";
import { sanitizeProductFilters, validateChatRequest } from "../../shared/validation";
import { getClientId, getSessionId } from "./clientIdentity";
import { trackGoogleAnalyticsEvent } from "./googleAnalytics";
import { buildApiErrorMessage, readJsonResponse } from "./http";

const apiBase = import.meta.env.VITE_API_BASE ?? "";

export async function sendChat(request: ChatRequest): Promise<ChatResponse> {
  const validation = validateChatRequest(request);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const response = await fetch(`${apiBase}/api/chat`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(validation.value)
  });

  return readJsonResponse<ChatResponse>(response, "Chat request failed", "/api/chat");
}

export async function fetchHealth(): Promise<HealthStatus> {
  const response = await fetch(`${apiBase}/health`);

  return readJsonResponse<HealthStatus>(response, "Health request failed", "/health");
}

export async function fetchAnalytics(): Promise<AnalyticsSummary> {
  const response = await fetch(`${apiBase}/api/admin/analytics`);

  return readJsonResponse<AnalyticsSummary>(response, "Analytics request failed", "/api/admin/analytics");
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
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).catch(() => undefined);
}

export async function fetchProducts(filters: ProductFilters = {}): Promise<Product[]> {
  const safeFilters = sanitizeProductFilters(filters);
  const params = new URLSearchParams();

  if (safeFilters.query) params.set("q", safeFilters.query);
  if (safeFilters.category) params.set("category", safeFilters.category);
  if (safeFilters.maxPrice) params.set("maxPrice", String(safeFilters.maxPrice));
  if (safeFilters.limit) params.set("limit", String(safeFilters.limit));
  if (safeFilters.strictBudget !== undefined) params.set("strictBudget", String(safeFilters.strictBudget));
  if (safeFilters.tags?.length) params.set("tags", safeFilters.tags.join(","));

  const query = params.toString();

  try {
    const response = await fetch(`${apiBase}/api/products${query ? `?${query}` : ""}`);
    const body = await readJsonResponse<{ products: Product[] }>(response, "Product request failed", "/api/products");
    return body.products;
  } catch (error) {
    console.warn(error instanceof Error ? error.message : "Product API unavailable; using static catalog fallback");
    return fetchStaticProducts(safeFilters);
  }
}

async function fetchStaticProducts(filters: ProductFilters) {
  const response = await fetch("/catalog/products.json", { cache: "no-store" });

  if (!response.ok) {
    throw new Error(await buildApiErrorMessage(response, "Static product catalog request failed", "/catalog/products.json"));
  }

  const products = await readJsonResponse<Product[]>(response, "Static product catalog request failed", "/catalog/products.json");
  return filterProducts(products, filters);
}

function filterProducts(catalog: Product[], filters: ProductFilters) {
  const query = normalize(filters.query ?? "");
  const tags = (filters.tags ?? []).map(normalize);
  const category = normalize(filters.category ?? "");
  const limit = filters.limit ?? catalog.length;
  const strictBudget = filters.strictBudget ?? true;
  const hasFilters = Boolean(query || category || filters.maxPrice || tags.length);

  if (!hasFilters) return catalog.slice(0, limit);

  return catalog
    .map((product) => {
      const searchable = normalize(
        [
          product.name,
          product.category,
          product.description,
          product.tags.join(" "),
          product.benefits.join(" "),
          product.materials.join(" ")
        ].join(" ")
      );
      let score = 0;

      if (query && searchable.includes(query)) score += 4;

      for (const token of query.split(/\s+/).filter(Boolean)) {
        if (searchable.includes(token)) score += 1;
      }

      if (category && normalize(product.category).includes(category)) score += 3;
      if (filters.maxPrice && product.price <= filters.maxPrice) score += 2;
      if (filters.maxPrice && !strictBudget && product.price > filters.maxPrice && product.price <= filters.maxPrice + 35) {
        score += 1;
      }

      for (const tag of tags) {
        if (product.tags.map(normalize).some((productTag) => productTag.includes(tag))) score += 2;
      }

      return { product, score };
    })
    .filter(({ product, score }) => score > 0 && (!filters.maxPrice || !strictBudget || product.price <= filters.maxPrice))
    .sort((a, b) => b.score - a.score || b.product.rating - a.product.rating)
    .slice(0, limit)
    .map(({ product }) => product);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
