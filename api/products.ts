import catalogData from "../data/catalog/products.json";
import type { Product } from "../src/shared/types";
import { sanitizeProductFilters } from "../src/shared/validation";
import { getQuery, getQueryValue, sendJson, sendMethodNotAllowed, type ApiRequest, type ApiResponse } from "./_utils";

const catalog = catalogData as Product[];

export default function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "GET") {
    sendMethodNotAllowed(response, ["GET"]);
    return;
  }

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
  const products = hasFilters ? searchCatalog(filters) : catalog;

  sendJson(response, 200, { products });
}

function searchCatalog(options: {
  query?: string;
  category?: string;
  maxPrice?: number;
  tags?: string[];
  limit?: number;
  strictBudget?: boolean;
}) {
  const query = normalize(options.query ?? "");
  const tags = (options.tags ?? []).map(normalize);
  const category = normalize(options.category ?? "");
  const limit = options.limit ?? 8;
  const strictBudget = options.strictBudget ?? true;

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
      if (options.maxPrice && product.price <= options.maxPrice) score += 2;
      if (options.maxPrice && !strictBudget && product.price > options.maxPrice && product.price <= options.maxPrice + 35) score += 1;
      for (const tag of tags) {
        if (product.tags.map(normalize).some((productTag) => productTag.includes(tag))) score += 2;
      }
      if (score === 0 && !query && !category && !tags.length) score = product.rating;

      return { product, score };
    })
    .filter(({ product, score }) => score > 0 && (!options.maxPrice || !strictBudget || product.price <= options.maxPrice))
    .sort((a, b) => b.score - a.score || b.product.rating - a.product.rating)
    .slice(0, limit)
    .map(({ product }) => product);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
