import { randomUUID } from "node:crypto";
import catalogData from "../data/catalog/products.json";
import type { BrandGovernanceResult, ChatRequest, ChatResponse, JourneyStage, Product } from "../src/shared/types";
import { validateChatRequest } from "../src/shared/validation";
import { readJsonBody, sendJson, sendMethodNotAllowed, type ApiRequest, type ApiResponse } from "./_utils";

const catalog = catalogData as Product[];

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    sendMethodNotAllowed(response, ["POST"]);
    return;
  }

  try {
    const validation = validateChatRequest(await readJsonBody(request));
    if (!validation.ok) {
      sendJson(response, 400, { error: validation.error });
      return;
    }

    sendJson(response, 200, buildCatalogResponse(validation.value));
  } catch (error) {
    sendJson(response, 200, buildCatalogResponse({ message: "I need product recommendations." }));
  }
}

function buildCatalogResponse(request: ChatRequest): ChatResponse {
  const started = Date.now();
  const recommendedProducts = searchCatalog({
    query: request.message,
    maxPrice: request.customerProfile?.budget,
    tags: request.customerProfile?.preferences,
    limit: 4
  });
  const merchandising = buildMerchandising(recommendedProducts);
  const topProduct = recommendedProducts[0];
  const answer = topProduct
    ? [
        `For your request, I recommend **${topProduct.name}** at **$${topProduct.price}**.`,
        topProduct.description,
        `Why it fits: ${topProduct.benefits.slice(0, 3).join(", ").toLowerCase()}.`,
        merchandising[0]
          ? `A useful ${merchandising[0].type === "cross_sell" ? "companion" : "alternative"} is **${merchandising[0].product.name}**.`
          : ""
      ]
        .filter(Boolean)
        .join("\n\n")
    : "I can help narrow this down. Share your budget, preferred use case, and any fit or material preferences, and I will recommend the closest catalog products.";
  const guardrailFlags = getGuardrailFlags(request.message);

  return {
    conversationId: request.conversationId ?? randomUUID(),
    answer,
    intent: inferIntent(request.message),
    journeyStage: inferJourneyStage(request.message),
    recommendedProducts,
    merchandising,
    citations: [{ title: "Product catalog", quote: "Recommendations are grounded in the approved product catalog." }],
    guardrailFlags,
    governance: buildGovernance(guardrailFlags, recommendedProducts.length),
    latencyMs: Date.now() - started,
    mode: "demo"
  };
}

function searchCatalog(options: { query?: string; maxPrice?: number; tags?: string[]; limit?: number }) {
  const query = normalize(options.query ?? "");
  const tags = (options.tags ?? []).map(normalize);
  const limit = options.limit ?? 4;

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
      for (const tag of tags) {
        if (product.tags.map(normalize).some((productTag) => productTag.includes(tag))) score += 2;
      }
      if (options.maxPrice && product.price <= options.maxPrice) score += 2;
      if (!query && !tags.length) score = product.rating;

      return { product, score };
    })
    .filter(({ product, score }) => score > 0 && (!options.maxPrice || product.price <= options.maxPrice))
    .sort((a, b) => b.score - a.score || b.product.rating - a.product.rating)
    .slice(0, limit)
    .map(({ product }) => product);
}

function buildMerchandising(products: Product[]): ChatResponse["merchandising"] {
  return products.slice(0, 3).flatMap((product) => {
    const companion = catalog.find((candidate) => product.compatibleProductIds.includes(candidate.id));
    if (!companion) return [];

    return [{
      type: companion.price > product.price ? "upsell" as const : "cross_sell" as const,
      product: companion,
      anchorProductId: product.id,
      reason: `${companion.name} complements ${product.name} based on catalog compatibility.`
    }];
  }).slice(0, 3);
}

function buildGovernance(guardrailFlags: string[], recommendedProductCount: number): BrandGovernanceResult {
  const status = guardrailFlags.length ? "escalate" : "approved";

  return {
    status,
    tone: "premium_consultative",
    requiredEscalation: Boolean(guardrailFlags.length),
    checks: [
      {
        id: "tone",
        label: "Premium consultative tone",
        status: "pass",
        detail: "Response uses a helpful guided-selling voice."
      },
      {
        id: "source_grounding",
        label: "Source grounding",
        status: recommendedProductCount ? "pass" : "watch",
        detail: "Recommendations are grounded in the static product catalog."
      },
      {
        id: "escalation",
        label: "Sensitive request routing",
        status: guardrailFlags.length ? "escalate" : "pass",
        detail: guardrailFlags.length ? "Sensitive language detected." : "No sensitive escalation trigger detected."
      }
    ]
  };
}

function inferIntent(message: string) {
  const normalized = normalize(message);
  if (/\b(return|refund|exchange|order|shipping|support)\b/.test(normalized)) return "support";
  if (/\b(compare|versus|vs)\b/.test(normalized)) return "product_comparison";
  return "product_discovery";
}

function inferJourneyStage(message: string): JourneyStage {
  const normalized = normalize(message);
  if (/\b(buy|cart|checkout|purchase)\b/.test(normalized)) return "purchase";
  if (/\b(compare|versus|vs)\b/.test(normalized)) return "evaluation";
  return "consideration";
}

function getGuardrailFlags(message: string) {
  const normalized = normalize(message);
  return /\b(legal|lawsuit|medical|injury|dispute)\b/.test(normalized) ? ["sensitive_request"] : [];
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
