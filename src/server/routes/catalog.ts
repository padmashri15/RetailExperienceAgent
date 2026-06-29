import { Router } from "express";
import { sanitizeProductFilters } from "../../shared/validation";
import { loadCatalog, searchCatalog } from "../services/catalog";

export function createCatalogRouter() {
  const router = Router();

  router.get("/", async (request, response, next) => {
    try {
      const filters = sanitizeProductFilters({
        query: typeof request.query.q === "string" ? request.query.q : undefined,
        category: typeof request.query.category === "string" ? request.query.category : undefined,
        maxPrice: request.query.maxPrice,
        limit: request.query.limit ?? 8,
        strictBudget: request.query.strictBudget === "true",
        tags: parseTags(request.query.tags)
      });
      const hasFilters = Boolean(filters.query || filters.category || filters.maxPrice || filters.tags?.length);
      const products = hasFilters
        ? await searchCatalog(filters)
        : await loadCatalog();
      response.json({ products });
    } catch (error) {
      next(error);
    }
  });

  return router;
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
