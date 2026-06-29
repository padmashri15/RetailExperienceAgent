import { randomUUID } from "node:crypto";
import type { ChatRequest, ChatResponse } from "../src/shared/types";
import { validateChatRequest } from "../src/shared/validation";
import { runRetailAgent } from "../src/server/agent/retailAgent";
import { createTelemetryRepository } from "../src/server/db/repository";
import { searchCatalog } from "../src/server/services/catalog";
import { buildMerchandisingSuggestions } from "../src/server/services/merchandising";
import { evaluateBrandGovernance, getGuardrailFlags, inferIntent, inferJourneyStage } from "../src/server/agent/policy";
import { readJsonBody, sendJson, sendMethodNotAllowed, type ApiRequest, type ApiResponse } from "./_utils";

const repository = createTelemetryRepository();

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

    try {
      sendJson(response, 200, await runRetailAgent(validation.value, repository));
    } catch (agentError) {
      console.warn(agentError instanceof Error ? agentError.message : "Live chat agent failed; using catalog fallback.");
      sendJson(response, 200, await runCatalogFallback(validation.value));
    }
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Chat request failed." });
  }
}

async function runCatalogFallback(request: ChatRequest): Promise<ChatResponse> {
  const started = Date.now();
  const guardrailFlags = getGuardrailFlags(request.message);
  const recommendedProducts = await searchCatalog({
    query: request.message,
    maxPrice: request.customerProfile?.budget,
    tags: request.customerProfile?.preferences,
    strictBudget: false,
    limit: 4
  });
  const merchandising = await buildMerchandisingSuggestions(recommendedProducts);
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
  const citations = [{ title: "Product catalog", quote: "Fallback recommendations are grounded in the approved product catalog." }];
  const governance = evaluateBrandGovernance({
    message: request.message,
    answer,
    citations,
    guardrailFlags,
    recommendedProductCount: recommendedProducts.length
  });

  return {
    conversationId: request.conversationId ?? randomUUID(),
    answer,
    intent: inferIntent(request.message),
    journeyStage: inferJourneyStage(request.message, request.customerProfile),
    recommendedProducts,
    merchandising,
    citations,
    guardrailFlags,
    governance,
    latencyMs: Date.now() - started,
    mode: "demo"
  };
}
