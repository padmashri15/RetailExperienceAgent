import { env } from "../config/env";

export type ToolDefinition = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict: true;
};

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = []
): Record<string, unknown> => ({
  type: "object",
  properties,
  required: required.length ? required : Object.keys(properties),
  additionalProperties: false
});

const nullable = (schema: Record<string, unknown>) => ({
  anyOf: [schema, { type: "null" }]
});

export const functionTools: ToolDefinition[] = [
  {
    type: "function",
    name: "searchProducts",
    description: "Search the retail product catalog for products matching a customer's intent, filters, budget, or preferences.",
    parameters: objectSchema(
      {
        query: { type: "string", description: "Natural language product need or search phrase." },
        category: nullable({ type: "string", description: "Product category filter." }),
        maxPrice: nullable({ type: "number", description: "Maximum product price in USD." }),
        tags: nullable({ type: "array", items: { type: "string" }, description: "Preference tags such as marathon, travel, breathable, recovery." }),
        limit: nullable({ type: "number", description: "Maximum number of products to return." })
      }
    ),
    strict: true
  },
  {
    type: "function",
    name: "compareProducts",
    description: "Compare two or more catalog products by benefits, materials, sustainability, price, and use case.",
    parameters: objectSchema(
      {
        productIds: { type: "array", items: { type: "string" }, description: "Catalog product IDs to compare." },
        customerNeed: { type: "string", description: "The customer's stated shopping need." }
      },
      ["productIds", "customerNeed"]
    ),
    strict: true
  },
  {
    type: "function",
    name: "checkInventory",
    description: "Check current inventory for a product by product ID or SKU.",
    parameters: objectSchema(
      {
        productId: nullable({ type: "string", description: "Catalog product ID." }),
        sku: nullable({ type: "string", description: "Product SKU." })
      }
    ),
    strict: true
  },
  {
    type: "function",
    name: "addToCart",
    description: "Add a selected product to the customer's cart.",
    parameters: objectSchema(
      {
        customerId: nullable({ type: "string", description: "Customer ID if known." }),
        productId: { type: "string", description: "Catalog product ID." },
        quantity: { type: "number", description: "Quantity to add." }
      }
    ),
    strict: true
  },
  {
    type: "function",
    name: "startCheckout",
    description: "Create a checkout initiation event and return a checkout URL.",
    parameters: objectSchema(
      {
        customerId: nullable({ type: "string", description: "Customer ID if known." }),
        productIds: { type: "array", items: { type: "string" }, description: "Products in checkout." }
      }
    ),
    strict: true
  },
  {
    type: "function",
    name: "createLead",
    description: "Create a CRM lead for a high-intent customer or enterprise opportunity.",
    parameters: objectSchema(
      {
        customerName: nullable({ type: "string" }),
        email: nullable({ type: "string" }),
        intent: { type: "string" },
        notes: { type: "string" }
      }
    ),
    strict: true
  },
  {
    type: "function",
    name: "updateCustomerProfile",
    description: "Persist known customer preferences, budget, location, loyalty tier, or shopping goals.",
    parameters: objectSchema(
      {
        customerId: nullable({ type: "string" }),
        updates: objectSchema({
          gender: nullable({ type: "string" }),
          ageGroup: nullable({ type: "string" }),
          budget: nullable({ type: "number" }),
          location: nullable({ type: "string" }),
          preferences: nullable({ type: "array", items: { type: "string" } }),
          shoppingHistory: nullable({ type: "array", items: { type: "string" } }),
          purchaseIntent: nullable({ type: "string" }),
          loyaltyTier: nullable({ type: "string" })
        })
      }
    ),
    strict: true
  },
  {
    type: "function",
    name: "getLoyaltyStatus",
    description: "Return loyalty status and benefits for a customer.",
    parameters: objectSchema(
      {
        customerId: nullable({ type: "string" }),
        email: nullable({ type: "string" })
      }
    ),
    strict: true
  },
  {
    type: "function",
    name: "getOrderStatus",
    description: "Look up order status and shipping details.",
    parameters: objectSchema(
      {
        orderId: { type: "string" },
        email: nullable({ type: "string" })
      }
    ),
    strict: true
  },
  {
    type: "function",
    name: "createReturnRequest",
    description: "Create a return request for an eligible order item.",
    parameters: objectSchema(
      {
        orderId: { type: "string" },
        productId: { type: "string" },
        reason: { type: "string" }
      },
      ["orderId", "productId", "reason"]
    ),
    strict: true
  },
  {
    type: "function",
    name: "trackIntent",
    description: "Track detected customer intent, journey stage, and confidence for marketing intelligence.",
    parameters: objectSchema(
      {
        intent: { type: "string" },
        journeyStage: { type: "string" },
        confidence: nullable({ type: "number" }),
        metadata: objectSchema({
          source: nullable({ type: "string" }),
          signal: nullable({ type: "string" }),
          productIds: nullable({ type: "array", items: { type: "string" } })
        })
      }
    ),
    strict: true
  },
  {
    type: "function",
    name: "trackConversionEvent",
    description: "Track cart, checkout, purchase, lead, or drop-off conversion events.",
    parameters: objectSchema(
      {
        eventName: { type: "string" },
        productIds: nullable({ type: "array", items: { type: "string" } }),
        value: nullable({ type: "number" }),
        metadata: objectSchema({
          source: nullable({ type: "string" }),
          channel: nullable({ type: "string" }),
          notes: nullable({ type: "string" })
        })
      }
    ),
    strict: true
  }
];

export function buildOpenAITools() {
  const tools: unknown[] = [...functionTools];

  if (env.openaiVectorStoreId) {
    tools.unshift({
      type: "file_search",
      vector_store_ids: [env.openaiVectorStoreId],
      max_num_results: 5
    });
  }

  return tools;
}
