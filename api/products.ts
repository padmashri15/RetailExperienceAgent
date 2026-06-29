import { sanitizeProductFilters } from "../src/shared/validation";
import { loadCatalog, searchCatalog } from "../src/server/services/catalog";
import { getQuery, getQueryValue, sendJson, sendMethodNotAllowed, type ApiRequest, type ApiResponse } from "./_utils";

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "GET") {
    sendMethodNotAllowed(response, ["GET"]);
    return;
  }

  try {
    const query = getQuery(request);
    const filters = sanitizeProductFilters({
      query: getQueryValue(query, "q"),
      category: getQueryValue(query, "category"),
      maxPrice: getQueryValue(query, "maxPrice"),
      limit: getQueryValue(query, "limit") ?? 8,
      strictBudget: getQueryValue(query, "strictBudget") === "true",
      tags: getQueryValue(query, "tags")?.split(",")
    });
    const hasFilters = Boolean(filters.query || filters.category || filters.maxPrice || filters.tags?.length);
    const products = hasFilters ? await searchCatalog(filters) : await loadCatalog();

    sendJson(response, 200, { products });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Product request failed." });
  }
}
