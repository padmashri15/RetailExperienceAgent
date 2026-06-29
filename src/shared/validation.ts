import type { ChatRequest, ConversationMessage, CustomerProfile, ProductFilters } from "./types";

const maxTextLength = 160;
const maxChatMessageLength = 1_000;
const maxHistoryMessages = 12;
const maxArrayItems = 12;
const minBudget = 40;
const maxBudget = 250;
const allowedLoyaltyTiers = new Set(["guest", "member", "silver", "gold", "platinum"]);
const allowedPurchaseIntents = new Set(["researching", "comparing", "ready_to_buy", "support"]);

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };
type ProductFilterInput = Omit<ProductFilters, "maxPrice" | "limit"> & {
  maxPrice?: unknown;
  limit?: unknown;
};

export function validateChatRequest(input: unknown): ValidationResult<ChatRequest> {
  if (!isRecord(input)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const message = sanitizeText(input.message, maxChatMessageLength);
  if (!message) {
    return { ok: false, error: "Message is required." };
  }

  const customerProfile = sanitizeCustomerProfile(input.customerProfile);
  const history = sanitizeConversationHistory(input.history);
  const conversationId = sanitizeText(input.conversationId, 80);

  return {
    ok: true,
    value: {
      ...(conversationId ? { conversationId } : {}),
      ...(customerProfile ? { customerProfile } : {}),
      ...(history.length ? { history } : {}),
      message
    }
  };
}

export function sanitizeCustomerProfile(input: unknown): CustomerProfile | undefined {
  if (!isRecord(input)) return undefined;

  const budget = sanitizeBudget(input.budget);
  const loyaltyTier = sanitizeEnum(input.loyaltyTier, allowedLoyaltyTiers);
  const purchaseIntent = sanitizeEnum(input.purchaseIntent, allowedPurchaseIntents);

  return {
    id: sanitizeText(input.id, 80),
    name: sanitizeText(input.name),
    gender: sanitizeText(input.gender, 40),
    ageGroup: sanitizeText(input.ageGroup, 40),
    ...(budget === undefined ? {} : { budget }),
    location: sanitizeText(input.location),
    preferences: sanitizeStringArray(input.preferences),
    shoppingHistory: sanitizeStringArray(input.shoppingHistory),
    ...(purchaseIntent ? { purchaseIntent: purchaseIntent as CustomerProfile["purchaseIntent"] } : {}),
    ...(loyaltyTier ? { loyaltyTier: loyaltyTier as CustomerProfile["loyaltyTier"] } : {})
  };
}

export function sanitizeConversationHistory(input: unknown): ConversationMessage[] {
  if (!Array.isArray(input)) return [];

  return input
    .slice(-maxHistoryMessages)
    .map((item): ConversationMessage | null => {
      if (!isRecord(item) || (item.role !== "user" && item.role !== "assistant")) return null;
      const content = sanitizeText(item.content, maxChatMessageLength);
      return content ? { role: item.role, content } : null;
    })
    .filter((item): item is ConversationMessage => Boolean(item));
}

export function sanitizeProductFilters(input: ProductFilterInput = {}): ProductFilters {
  const maxPrice = sanitizeBudget(input.maxPrice);
  const limit = clampNumber(input.limit, 1, 24);

  return {
    query: sanitizeText(input.query),
    category: sanitizeText(input.category, 80),
    ...(maxPrice === undefined ? {} : { maxPrice }),
    tags: sanitizeStringArray(input.tags),
    ...(limit === undefined ? {} : { limit }),
    strictBudget: typeof input.strictBudget === "boolean" ? input.strictBudget : undefined
  };
}

export function sanitizeBudget(value: unknown) {
  return clampNumber(value, minBudget, maxBudget);
}

export function sanitizeText(value: unknown, maxLength = maxTextLength) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

export function sanitizeStringArray(value: unknown, maxItems = maxArrayItems) {
  if (!Array.isArray(value)) return undefined;

  const items = value
    .map((item) => sanitizeText(item, 80))
    .filter((item): item is string => Boolean(item));

  return [...new Set(items)].slice(0, maxItems);
}

function clampNumber(value: unknown, min: number, max: number) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : undefined;
  if (numberValue === undefined || !Number.isFinite(numberValue)) return undefined;
  return Math.min(max, Math.max(min, Math.round(numberValue)));
}

function sanitizeEnum(value: unknown, allowedValues: Set<string>) {
  if (typeof value !== "string") return undefined;
  return allowedValues.has(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
