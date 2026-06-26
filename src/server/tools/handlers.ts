import type { Product } from "../../shared/types";
import { findProductsByIds, loadCatalog, searchCatalog } from "../services/catalog";
import type { TelemetryRepository } from "../db/repository";

export interface ToolExecutionContext {
  conversationId?: string;
  customerId?: string;
  repository: TelemetryRepository;
}

export async function executeToolCall(name: string, args: Record<string, unknown>, context: ToolExecutionContext) {
  switch (name) {
    case "searchProducts":
      return searchProducts(args);
    case "compareProducts":
      return compareProducts(args);
    case "checkInventory":
      return checkInventory(args);
    case "addToCart":
      return addToCart(args, context);
    case "startCheckout":
      return startCheckout(args, context);
    case "createLead":
      return createLead(args, context);
    case "updateCustomerProfile":
      return updateCustomerProfile(args);
    case "getLoyaltyStatus":
      return getLoyaltyStatus(args);
    case "getOrderStatus":
      return getOrderStatus(args);
    case "createReturnRequest":
      return createReturnRequest(args);
    case "trackIntent":
      return trackIntent(args, context);
    case "trackConversionEvent":
      return trackConversionEvent(args, context);
    default:
      return { ok: false, error: `Unknown function ${name}` };
  }
}

async function searchProducts(args: Record<string, unknown>) {
  const products = await searchCatalog({
    query: stringArg(args.query),
    category: stringArg(args.category),
    maxPrice: numberArg(args.maxPrice),
    tags: arrayArg(args.tags),
    limit: numberArg(args.limit) ?? 4
  });

  return {
    ok: true,
    products,
    merchandisingGuidance:
      "Lead with the best-fit product, mention one practical complement only when it helps the customer's goal."
  };
}

async function compareProducts(args: Record<string, unknown>) {
  const products = await findProductsByIds(arrayArg(args.productIds));
  const customerNeed = stringArg(args.customerNeed);

  return {
    ok: true,
    customerNeed,
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      category: product.category,
      benefits: product.benefits,
      materials: product.materials,
      sustainability: product.sustainability,
      bestFor: product.tags.slice(0, 4)
    }))
  };
}

async function checkInventory(args: Record<string, unknown>) {
  const catalog = await loadCatalog();
  const product = catalog.find(
    (item) => item.id === stringArg(args.productId) || item.sku === stringArg(args.sku)
  );

  if (!product) {
    return { ok: false, status: "not_found" };
  }

  return {
    ok: true,
    productId: product.id,
    sku: product.sku,
    inventory: product.inventory,
    availability: product.inventory > 10 ? "in_stock" : product.inventory > 0 ? "low_stock" : "out_of_stock"
  };
}

async function addToCart(args: Record<string, unknown>, context: ToolExecutionContext) {
  const [product] = await findProductsByIds([stringArg(args.productId)]);
  const quantity = numberArg(args.quantity) ?? 1;

  if (!product) {
    return { ok: false, status: "not_found" };
  }

  await context.repository.trackConversion({
    conversationId: context.conversationId,
    customerId: stringArg(args.customerId) || context.customerId,
    eventName: "cart_add",
    productIds: [product.id],
    value: product.price * quantity,
    metadata: { quantity }
  });

  return {
    ok: true,
    cartId: `cart_${Date.now()}`,
    product,
    quantity,
    subtotal: Number((product.price * quantity).toFixed(2))
  };
}

async function startCheckout(args: Record<string, unknown>, context: ToolExecutionContext) {
  const productIds = arrayArg(args.productIds);
  const products = await findProductsByIds(productIds);
  const value = products.reduce((sum, product) => sum + product.price, 0);

  await context.repository.trackConversion({
    conversationId: context.conversationId,
    customerId: stringArg(args.customerId) || context.customerId,
    eventName: "checkout_started",
    productIds,
    value,
    metadata: { source: "agent_tool" }
  });

  return {
    ok: true,
    checkoutUrl: `https://checkout.example.com/session/${Date.now()}`,
    productIds,
    value: Number(value.toFixed(2))
  };
}

async function createLead(args: Record<string, unknown>, context: ToolExecutionContext) {
  await context.repository.trackConversion({
    conversationId: context.conversationId,
    customerId: context.customerId,
    eventName: "lead_created",
    productIds: [],
    value: 0,
    metadata: args
  });

  return {
    ok: true,
    leadId: `lead_${Date.now()}`,
    owner: "retail-experience-team",
    nextStep: "Human associate follow-up within one business day"
  };
}

async function updateCustomerProfile(args: Record<string, unknown>) {
  return {
    ok: true,
    customerId: stringArg(args.customerId) || `guest_${Date.now()}`,
    updates: args.updates ?? {},
    status: "profile_updated"
  };
}

async function getLoyaltyStatus(args: Record<string, unknown>) {
  const email = stringArg(args.email);
  const tier = email.includes("vip") ? "gold" : "member";

  return {
    ok: true,
    tier,
    pointsBalance: tier === "gold" ? 4200 : 780,
    benefits: tier === "gold" ? ["early capsule access", "free standard shipping"] : ["points on eligible purchases"]
  };
}

async function getOrderStatus(args: Record<string, unknown>) {
  return {
    ok: true,
    orderId: stringArg(args.orderId),
    status: "in_transit",
    estimatedDelivery: "3 to 5 business days after processing",
    trackingUrl: "https://tracking.example.com/demo"
  };
}

async function createReturnRequest(args: Record<string, unknown>) {
  return {
    ok: true,
    returnRequestId: `ret_${Date.now()}`,
    orderId: stringArg(args.orderId),
    productId: stringArg(args.productId),
    status: "created",
    nextStep: "A support associate will review eligibility and send return instructions."
  };
}

async function trackIntent(args: Record<string, unknown>, context: ToolExecutionContext) {
  await context.repository.trackIntent({
    conversationId: context.conversationId,
    customerId: context.customerId,
    intent: stringArg(args.intent) || "unknown",
    journeyStage: stringArg(args.journeyStage) || "awareness",
    confidence: numberArg(args.confidence),
    metadata: (args.metadata as Record<string, unknown>) ?? {}
  });

  return { ok: true, status: "intent_tracked" };
}

async function trackConversionEvent(args: Record<string, unknown>, context: ToolExecutionContext) {
  await context.repository.trackConversion({
    conversationId: context.conversationId,
    customerId: context.customerId,
    eventName: stringArg(args.eventName) || "unknown",
    productIds: arrayArg(args.productIds),
    value: numberArg(args.value) ?? 0,
    metadata: (args.metadata as Record<string, unknown>) ?? {}
  });

  return { ok: true, status: "conversion_tracked" };
}

export function collectProductsFromToolResults(results: unknown[]): Product[] {
  const products: Product[] = [];

  for (const result of results) {
    if (!isRecord(result)) continue;
    if (Array.isArray(result.products)) {
      products.push(...(result.products.filter(isProduct) as Product[]));
    }
    if (isProduct(result.product)) {
      products.push(result.product);
    }
  }

  const seen = new Set<string>();
  return products.filter((product) => {
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
}

function stringArg(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberArg(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function arrayArg(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isProduct(value: unknown): value is Product {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string";
}
