import type { MerchandisingSuggestion, Product } from "../../shared/types";
import { findProductsByIds, loadCatalog } from "./catalog";

export async function buildMerchandisingSuggestions(products: Product[]): Promise<MerchandisingSuggestion[]> {
  if (!products.length) return [];

  const catalog = await loadCatalog();
  const selectedIds = new Set(products.map((product) => product.id));
  const suggestions: MerchandisingSuggestion[] = [];

  for (const product of products.slice(0, 3)) {
    const [pairedProduct] = (await findProductsByIds(product.compatibleProductIds)).filter(
      (candidate) => !selectedIds.has(candidate.id)
    );

    if (pairedProduct) {
      suggestions.push({
        type: "cross_sell",
        product: pairedProduct,
        anchorProductId: product.id,
        reason: `Pairs naturally with ${product.name} for the customer's selected use case.`
      });
    }

    const premiumAlternative = catalog
      .filter((candidate) => candidate.id !== product.id)
      .filter((candidate) => candidate.price > product.price)
      .filter((candidate) => hasMerchandisingOverlap(product, candidate))
      .sort((a, b) => a.price - b.price)[0];

    if (premiumAlternative) {
      suggestions.push({
        type: "upsell",
        product: premiumAlternative,
        anchorProductId: product.id,
        reason: `${premiumAlternative.name} is a higher-value alternative when the customer wants more capability or a more polished kit.`
      });
    }
  }

  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = `${suggestion.type}:${suggestion.product.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

function hasMerchandisingOverlap(a: Product, b: Product) {
  if (a.category === b.category) return true;

  const aTags = new Set(a.tags.map(normalize));
  return b.tags.some((tag) => aTags.has(normalize(tag)));
}

function normalize(value: string) {
  return value.toLowerCase().trim();
}
