import { env } from "../config/env";
import type { BrandGovernanceResult, CustomerProfile, JourneyStage, SourceCitation } from "../../shared/types";

const sensitivePatterns = [
  /refund dispute/i,
  /lawsuit|legal|attorney|lawyer/i,
  /injury|medical|diagnosis|pain advice/i,
  /chargeback/i,
  /complaint/i,
  /override policy/i
];

export function getGuardrailFlags(message: string) {
  return sensitivePatterns.filter((pattern) => pattern.test(message)).map((pattern) => pattern.source);
}

export function isSensitiveRequest(message: string) {
  return getGuardrailFlags(message).length > 0;
}

export function inferJourneyStage(message: string, profile?: CustomerProfile): JourneyStage {
  const normalized = message.toLowerCase();

  if (profile?.purchaseIntent === "ready_to_buy" || /checkout|buy|cart|purchase|order now/.test(normalized)) {
    return "purchase";
  }

  if (/return|warranty|order status|shipping|delivery|loyalty|points/.test(normalized)) {
    return "post_purchase";
  }

  if (/compare|versus|vs|alternative|difference/.test(normalized)) {
    return "evaluation";
  }

  if (/recommend|under \$?\d+|budget|need|looking for|which/.test(normalized)) {
    return "consideration";
  }

  if (/member|loyalty|points|tier/.test(normalized)) {
    return "loyalty";
  }

  return "awareness";
}

export function inferIntent(message: string) {
  const normalized = message.toLowerCase();

  if (/compare|versus|vs|difference/.test(normalized)) return "product_comparison";
  if (/checkout|cart|buy|purchase/.test(normalized)) return "checkout";
  if (/order status|where is my order|tracking/.test(normalized)) return "order_support";
  if (/return|refund|exchange|warranty/.test(normalized)) return "returns_support";
  if (/loyalty|points|tier/.test(normalized)) return "loyalty";
  if (/shipping|delivery/.test(normalized)) return "shipping";
  if (/recommend|need|looking for|under|budget|best/.test(normalized)) return "product_discovery";
  return "brand_engagement";
}

export function buildAgentInstructions(profile?: CustomerProfile) {
  const profileContext = JSON.stringify(profile ?? {}, null, 2);

  return [
    `You are the premium digital sales associate for ${env.brandName}.`,
    "Prioritize conversion, customer trust, product discovery clarity, and brand consistency.",
    "Use the product, inventory, cart, checkout, CRM, loyalty, order, returns, and analytics function tools when they can ground the answer or complete a customer task.",
    "Use file_search for brand, FAQ, campaign, returns, warranty, and policy knowledge when a vector store is available.",
    "Cite approved source content whenever file_search results support the response.",
    "When recommending products, explain the practical fit and mention one contextual cross-sell or premium alternative only if it helps the customer's stated goal.",
    "Do not invent discounts, unsupported product claims, delivery commitments, warranties, or competitor criticisms.",
    "Never say a product is sustainable without naming the specific listed material, program, or policy.",
    "Upsell and cross-sell only when contextually relevant and helpful.",
    "For complaints, refund disputes, legal concerns, medical injury advice, or policy override requests, acknowledge the concern and route to a human associate.",
    "Keep the tone helpful, premium, friendly, trustworthy, and consultative.",
    `Current customer profile:\n${profileContext}`
  ].join("\n");
}

export function evaluateBrandGovernance(input: {
  message: string;
  answer: string;
  citations: SourceCitation[];
  guardrailFlags: string[];
  recommendedProductCount: number;
}): BrandGovernanceResult {
  const requiresPolicyGrounding = /return|refund|warranty|shipping|delivery|loyalty|promotion|discount|sustainab|policy/i.test(
    `${input.message} ${input.answer}`
  );
  const unsupportedDiscount = /discount|promo|coupon|sale|free shipping/i.test(input.answer) && !input.citations.length;
  const unsupportedSuperlative = /\b(best|guaranteed|perfect|zero impact|fully sustainable|always|never)\b/i.test(input.answer);
  const hasEscalation = input.guardrailFlags.length > 0;

  const checks = [
    {
      id: "tone",
      label: "Premium consultative tone",
      status: "pass" as const,
      detail: "Response is constrained to a helpful, friendly, trustworthy sales-associate voice."
    },
    {
      id: "source_grounding",
      label: "Source grounding",
      status: requiresPolicyGrounding && !input.citations.length ? ("watch" as const) : ("pass" as const),
      detail:
        requiresPolicyGrounding && !input.citations.length
          ? "Policy or brand content was discussed without a retrieved source citation."
          : "Policy and brand claims are either not required or supported by retrieved source content."
    },
    {
      id: "unsupported_discounts",
      label: "No invented discounts",
      status: unsupportedDiscount ? ("watch" as const) : ("pass" as const),
      detail: unsupportedDiscount
        ? "Discount or promotion language appeared without approved campaign source content."
        : "No unsupported discount or promotion claim detected."
    },
    {
      id: "claim_control",
      label: "Claim control",
      status: unsupportedSuperlative ? ("watch" as const) : ("pass" as const),
      detail: unsupportedSuperlative
        ? "Broad superlative language detected; keep product claims specific and catalog-backed."
        : "No broad unsupported superlatives detected."
    },
    {
      id: "escalation",
      label: "Sensitive request routing",
      status: hasEscalation ? ("escalate" as const) : ("pass" as const),
      detail: hasEscalation
        ? "Sensitive request detected; route to a human associate."
        : "No sensitive escalation trigger detected."
    },
    {
      id: "merchandising",
      label: "Merchandising discipline",
      status: input.recommendedProductCount > 4 ? ("watch" as const) : ("pass" as const),
      detail:
        input.recommendedProductCount > 4
          ? "Recommendation count is high; keep the customer path focused."
          : "Recommendation set is focused and appropriate for guided shopping."
    }
  ];

  const requiredEscalation = checks.some((check) => check.status === "escalate");
  const watch = checks.some((check) => check.status === "watch");

  return {
    status: requiredEscalation ? "escalate" : watch ? "watch" : "approved",
    tone: "premium_consultative",
    checks,
    requiredEscalation
  };
}
