import { describe, expect, it } from "vitest";
import { buildShoppingContext, preferenceKeys } from "../src/client/lib/preferenceProfiles";
import { searchCatalog } from "../src/server/services/catalog";

describe("catalog search", () => {
  it("finds marathon shoes under 150", async () => {
    const products = await searchCatalog({
      query: "marathon running shoes",
      maxPrice: 150,
      limit: 3
    });

    expect(products[0]?.id).toBe("prod_aerostride_marathon");
    expect(products.every((product) => product.price <= 150)).toBe(true);
  });

  it("surfaces 3D-capable products for every demo preference", async () => {
    for (const preference of preferenceKeys) {
      const context = buildShoppingContext(preference, 170);
      const products = await searchCatalog({
        query: context.query,
        tags: context.tags,
        maxPrice: context.budget,
        strictBudget: false,
        limit: 4
      });

      expect(products.some((product) => product.modelUrl), preference).toBe(true);
    }
  });
});
