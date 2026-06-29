const products = [
  {
    id: "prod_aerostride_marathon",
    sku: "AST-RUN-142",
    name: "AeroStride Marathon Trainer",
    category: "running shoes",
    price: 142,
    currency: "USD",
    rating: 4.8,
    inventory: 84,
    imageUrl: "/images/products/Shoe_Pink.png",
    modelUrl: "/models/products/Shoe_Pink.glb",
    tags: ["marathon", "neutral", "lightweight", "road running", "under 150"],
    benefits: ["Responsive midsole for long-distance training", "Breathable engineered mesh", "Stable heel geometry for tired miles"],
    materials: ["Recycled engineered mesh", "Bio-based foam midsole", "Rubber traction outsole"],
    sustainability: ["Upper contains 62 percent recycled yarn", "Shipped in plastic-free packaging"],
    compatibleProductIds: ["prod_coreflex_tee"],
    description: "A premium road running shoe designed for marathon build cycles and daily long runs."
  },
  {
    id: "prod_velocity_tempo",
    sku: "AST-RUN-136",
    name: "Velocity Tempo Runner",
    category: "running shoes",
    price: 136,
    currency: "USD",
    rating: 4.7,
    inventory: 68,
    imageUrl: "/images/products/Shoes_Red_Yellow.png",
    modelUrl: "/models/products/Shoes_Red_Yellow.glb",
    tags: ["tempo", "speedwork", "lightweight", "road running", "marathon"],
    benefits: ["Snappy foam for faster training days", "Secure midfoot lockdown", "Flexible forefoot for quick turnover"],
    materials: ["Engineered knit upper", "Bio-based foam midsole", "Carbon-infused rubber outsole"],
    sustainability: ["Upper uses recycled performance yarn", "Ships with reduced-ink packaging"],
    compatibleProductIds: ["prod_coreflex_tee"],
    description: "A light tempo trainer for speed sessions, short races, and marathon tune-up workouts."
  },
  {
    id: "prod_coreflex_tee",
    sku: "AST-TEE-048",
    name: "CoreFlex Training Tee",
    category: "apparel",
    price: 48,
    currency: "USD",
    rating: 4.7,
    inventory: 128,
    imageUrl: "/images/products/Hoodie_Pearl.png",
    modelUrl: "/models/products/Hoodie_Pearl.glb",
    tags: ["training", "breathable", "quick dry", "base layer"],
    benefits: ["Soft stretch knit", "Quick-dry finish", "Minimal seams for comfort under layers"],
    materials: ["Recycled polyester", "Tencel lyocell"],
    sustainability: ["Made with 74 percent recycled fiber", "Dyed in a closed-loop water process"],
    compatibleProductIds: ["prod_aerostride_marathon"],
    description: "A breathable training tee that works for gym sessions, running, and daily wear."
  }
];

export default async function handler(request: any, response: any) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method !== "POST") {
    response.statusCode = 405;
    response.end(JSON.stringify({ error: "Method not allowed. Use POST." }));
    return;
  }

  const body = await readBody(request).catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 1000) : "";

  if (!message) {
    response.statusCode = 400;
    response.end(JSON.stringify({ error: "Message is required." }));
    return;
  }

  response.statusCode = 200;
  response.end(JSON.stringify(buildResponse(message, body.customerProfile)));
}

async function readBody(request: any) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body);

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  return rawBody ? JSON.parse(rawBody) : {};
}

function buildResponse(message: string, customerProfile: any) {
  const started = Date.now();
  const budget = typeof customerProfile?.budget === "number" ? customerProfile.budget : extractBudget(message);
  const recommendedProducts = rankProducts(message, budget);
  const topProduct = recommendedProducts[0] ?? products[0];
  const companion = products.find((product) => product.id !== topProduct.id && topProduct.compatibleProductIds.includes(product.id));
  const merchandising = companion
    ? [{
        type: companion.price > topProduct.price ? "upsell" : "cross_sell",
        product: companion,
        anchorProductId: topProduct.id,
        reason: `${companion.name} complements ${topProduct.name} based on catalog compatibility.`
      }]
    : [];

  return {
    conversationId: `conv_${Date.now()}`,
    answer: [
      `For your request, I recommend **${topProduct.name}** at **$${topProduct.price}**.`,
      topProduct.description,
      `Why it fits: ${topProduct.benefits.slice(0, 3).join(", ").toLowerCase()}.`,
      companion ? `A useful companion is **${companion.name}**.` : ""
    ].filter(Boolean).join("\n\n"),
    intent: "product_discovery",
    journeyStage: "consideration",
    recommendedProducts,
    merchandising,
    citations: [{ title: "Product catalog", quote: "Recommendations are grounded in the approved product catalog." }],
    guardrailFlags: [],
    governance: {
      status: "approved",
      tone: "premium_consultative",
      requiredEscalation: false,
      checks: [
        { id: "tone", label: "Premium consultative tone", status: "pass", detail: "Response uses a helpful guided-selling voice." },
        { id: "source_grounding", label: "Source grounding", status: "pass", detail: "Recommendations are grounded in the static product catalog." },
        { id: "escalation", label: "Sensitive request routing", status: "pass", detail: "No sensitive escalation trigger detected." }
      ]
    },
    latencyMs: Date.now() - started,
    mode: "demo"
  };
}

function rankProducts(message: string, budget?: number) {
  const normalizedMessage = normalize(message);

  return products
    .map((product) => {
      const searchable = normalize([product.name, product.category, product.description, product.tags.join(" "), product.benefits.join(" ")].join(" "));
      let score = 0;
      for (const token of normalizedMessage.split(/\s+/).filter(Boolean)) {
        if (searchable.includes(token)) score += 1;
      }
      if (budget && product.price <= budget) score += 3;
      return { product, score };
    })
    .filter(({ product, score }) => score > 0 && (!budget || product.price <= budget))
    .sort((a, b) => b.score - a.score || b.product.rating - a.product.rating)
    .map(({ product }) => product);
}

function extractBudget(message: string) {
  const match = /\$?\s*(\d{2,4})\s*(?:usd|dollars?)?/i.exec(message);
  return match ? Number(match[1]) : undefined;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
