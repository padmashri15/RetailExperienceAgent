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

export default function handler(request: any, response: any) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end(JSON.stringify({ error: "Method not allowed. Use GET." }));
    return;
  }

  const url = new URL(request.url ?? "/", "https://retail-experience-agent.local");
  const query = normalize(url.searchParams.get("q") ?? "");
  const maxPrice = Number(url.searchParams.get("maxPrice") ?? "");
  const limit = Number(url.searchParams.get("limit") ?? "8");
  const filteredProducts = query || Number.isFinite(maxPrice)
    ? rankProducts(query, Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : undefined).slice(0, Number.isFinite(limit) ? limit : 8)
    : products;

  response.statusCode = 200;
  response.end(JSON.stringify({ products: filteredProducts }));
}

function rankProducts(query: string, budget?: number) {
  return products
    .map((product) => {
      const searchable = normalize([product.name, product.category, product.description, product.tags.join(" "), product.benefits.join(" ")].join(" "));
      let score = 0;
      for (const token of query.split(/\s+/).filter(Boolean)) {
        if (searchable.includes(token)) score += 1;
      }
      if (budget && product.price <= budget) score += 3;
      if (!query && !budget) score = product.rating;
      return { product, score };
    })
    .filter(({ product, score }) => score > 0 && (!budget || product.price <= budget))
    .sort((a, b) => b.score - a.score || b.product.rating - a.product.rating)
    .map(({ product }) => product);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
