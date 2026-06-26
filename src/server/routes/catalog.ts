import { Router } from "express";
import { loadCatalog, searchCatalog } from "../services/catalog";

export function createCatalogRouter() {
  const router = Router();

  router.get("/", async (request, response, next) => {
    try {
      const query = typeof request.query.q === "string" ? request.query.q : undefined;
      const category = typeof request.query.category === "string" ? request.query.category : undefined;
      const maxPrice = parseNumber(request.query.maxPrice);
      const limit = parseNumber(request.query.limit) ?? 8;
      const strictBudget = request.query.strictBudget === "true";
      const tags = parseTags(request.query.tags);
      const hasFilters = Boolean(query || category || maxPrice || tags.length);
      const products = hasFilters
        ? await searchCatalog({ query, category, maxPrice, tags, limit, strictBudget })
        : await loadCatalog();
      response.json({ products });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function parseNumber(value: unknown) {
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseTags(value: unknown) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => (typeof item === "string" ? item.split(",") : []));
  }

  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
