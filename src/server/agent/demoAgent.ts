import type { ChatRequest, ChatResponse } from "../../shared/types";
import { searchCatalog } from "../services/catalog";
import type { TelemetryRepository } from "../db/repository";
import { buildMerchandisingSuggestions } from "../services/merchandising";
import { evaluateBrandGovernance, getGuardrailFlags, inferIntent, inferJourneyStage } from "./policy";

export async function runDemoAgent(request: ChatRequest, repository: TelemetryRepository): Promise<ChatResponse> {
  const started = Date.now();
  const intent = inferIntent(request.message);
  const journeyStage = inferJourneyStage(request.message, request.customerProfile);
  const products = await searchCatalog({
    query: request.message,
    maxPrice: request.customerProfile?.budget,
    tags: request.customerProfile?.preferences,
    limit: 3
  });
  const guardrailFlags = getGuardrailFlags(request.message);
  const topProduct = products[0];
  const merchandising = await buildMerchandisingSuggestions(products);

  const answer = guardrailFlags.length
    ? "I can help document this and route it to a human associate so the issue is handled carefully. I will avoid making policy or refund promises before the support team reviews the details."
    : topProduct
      ? [
          `For that goal, I would start with the ${topProduct.name}. It fits because ${topProduct.benefits[0].toLowerCase()} and it is currently $${topProduct.price}.`,
          merchandising[0]
            ? `A useful ${merchandising[0].type === "cross_sell" ? "companion" : "premium alternative"} is the ${merchandising[0].product.name}, because ${merchandising[0].reason.toLowerCase()}`
            : "",
          "I can compare options, check inventory, or help move the best fit into checkout."
        ]
          .filter(Boolean)
          .join(" ")
      : "I can help narrow this down. Share your budget, preferred use case, and any material or fit preferences, and I will recommend the closest approved products.";

  const citations = [{ title: "Demo catalog", quote: "Recommendations are grounded in data/catalog/products.json" }];
  const governance = evaluateBrandGovernance({
    message: request.message,
    answer,
    citations,
    guardrailFlags,
    recommendedProductCount: products.length
  });

  const conversationId = await repository.saveConversationTurn({
    conversationId: request.conversationId,
    customerId: request.customerProfile?.id,
    customerName: request.customerProfile?.name,
    userMessage: request.message,
    assistantMessage: answer,
    intent,
    journeyStage,
    guardrailFlags,
    citations,
    recommendedProductIds: products.map((product) => product.id),
    merchandising,
    governance,
    latencyMs: Date.now() - started
  });

  return {
    conversationId,
    answer,
    intent,
    journeyStage,
    recommendedProducts: products,
    merchandising,
    citations,
    guardrailFlags,
    governance,
    latencyMs: Date.now() - started,
    mode: "demo"
  };
}
