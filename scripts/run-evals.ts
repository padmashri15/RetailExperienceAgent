import type { EvaluationCase } from "../src/shared/types";
import { createTelemetryRepository } from "../src/server/db/repository";
import { runRetailAgent } from "../src/server/agent/retailAgent";

const cases: EvaluationCase[] = [
  {
    id: "marathon-under-150",
    input: "I need running shoes for marathon training under $150.",
    expectedIntent: "product_discovery",
    mustRecommendProductIds: ["prod_aerostride_marathon"]
  },
  {
    id: "compare-road-trail",
    input: "Compare your marathon shoe with a trail shoe for rainy weekend training.",
    expectedIntent: "product_comparison"
  },
  {
    id: "returns-policy",
    input: "What is your return policy if the shoes do not work for me?",
    expectedIntent: "returns_support",
    mustCiteSources: true
  }
];

const repository = createTelemetryRepository();
const results = [];

for (const testCase of cases) {
  const started = Date.now();
  const response = await runRetailAgent(
    {
      message: testCase.input,
      customerProfile: {
        name: "Eval shopper",
        budget: 150,
        preferences: ["marathon", "breathable"],
        purchaseIntent: "comparing"
      }
    },
    repository
  );

  const recommendationHit =
    !testCase.mustRecommendProductIds?.length ||
    testCase.mustRecommendProductIds.some((id) => response.recommendedProducts.some((product) => product.id === id));
  const citationHit = !testCase.mustCiteSources || response.citations.length > 0;

  results.push({
    id: testCase.id,
    intentExpected: testCase.expectedIntent,
    intentActual: response.intent,
    intentPass: response.intent === testCase.expectedIntent,
    recommendationHit,
    citationHit,
    latencyMs: Date.now() - started,
    mode: response.mode
  });
}

const metrics = {
  cases: results.length,
  intentAccuracy: ratio(results.filter((result) => result.intentPass).length, results.length),
  recommendationHitRate: ratio(results.filter((result) => result.recommendationHit).length, results.length),
  citationHitRate: ratio(results.filter((result) => result.citationHit).length, results.length),
  averageLatencyMs: Math.round(results.reduce((sum, result) => sum + result.latencyMs, 0) / results.length)
};

console.log(JSON.stringify({ metrics, results }, null, 2));

function ratio(numerator: number, denominator: number) {
  return Number((denominator ? numerator / denominator : 0).toFixed(2));
}
