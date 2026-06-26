import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, BadgeCheck, Box, Eye, Leaf, Lightbulb, Loader2, PackagePlus, ShoppingCart, Sparkles, Star } from "lucide-react";
import type { MerchandisingSuggestion, Product, ShoppingContext } from "../../shared/types";
import { trackAnalyticsEvent } from "../lib/api";
import type { AgentActivityInput } from "../lib/agentActivity";
import { IconButton } from "./IconButton";
import { Product3DViewer } from "./Product3DViewer";

interface ProductRailProps {
  allProducts: Product[];
  context: ShoppingContext;
  isLoading: boolean;
  onAgentActivity: (activity: AgentActivityInput) => void;
  products: Product[];
  sourceLabel: string;
}

interface ConversionRecovery {
  budget: number;
  evidence: string[];
  expectedLift: number;
  key: string;
  offerLabel: string;
  preference: string;
  preferenceLabel: string;
  product: Product;
  reason: string;
  suggestion?: MerchandisingSuggestion;
  totalValue: number;
  trigger: string;
}

export function ProductRail({ allProducts, context, isLoading, onAgentActivity, products, sourceLabel }: ProductRailProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>();
  const [cartProductIds, setCartProductIds] = useState<Set<string>>(() => new Set());
  const [dismissedRecoveryKeys, setDismissedRecoveryKeys] = useState<Set<string>>(() => new Set());
  const [recovery, setRecovery] = useState<ConversionRecovery | null>(null);
  const shownRecoveryKeysRef = useRef<Set<string>>(new Set());
  const productsKey = products.map((product) => product.id).join("|");
  const merchandising = useMemo(
    () => buildClientMerchandising(products, allProducts),
    [allProducts, products]
  );
  const selectableProducts = useMemo(() => {
    const productsById = new Map<string, Product>();
    [...products, ...merchandising.map((suggestion) => suggestion.product)].forEach((product) => {
      productsById.set(product.id, product);
    });
    return [...productsById.values()];
  }, [merchandising, products]);
  const selectedProduct = selectableProducts.find((product) => product.id === selectedProductId) ?? products[0];
  const supportingProducts = products.filter((product) => product.id !== selectedProduct?.id);

  useEffect(() => {
    if (!products.length) return;
    setSelectedProductId(products[0].id);
    setCartProductIds(new Set());
    setDismissedRecoveryKeys(new Set());
    setRecovery(null);
  }, [products, productsKey]);

  useEffect(() => {
    if (!selectedProduct) return;
    const rationale = buildProductRationale(selectedProduct, context);

    trackAnalyticsEvent({
      eventName: "product_viewed",
      productIds: [selectedProduct.id],
      value: selectedProduct.price,
      metadata: {
        preference: context.preference,
        preferenceLabel: context.preferenceLabel,
        source: "featured_product",
        budget: context.budget,
        category: selectedProduct.category,
        product_categories: [selectedProduct.category],
        product_names: [selectedProduct.name]
      }
    }).catch(() => undefined);

    trackAnalyticsEvent({
      eventName: "product_explanation_viewed",
      productIds: [selectedProduct.id],
      metadata: {
        preference: context.preference,
        preferenceLabel: context.preferenceLabel,
        source: "why_this_product",
        budget: context.budget,
        product_categories: [selectedProduct.category],
        product_names: [selectedProduct.name],
        matched_tags: rationale.matchedTags
      }
    }).catch(() => undefined);

    trackAnalyticsEvent({
      eventName: "product_price_viewed",
      productIds: [selectedProduct.id],
      value: selectedProduct.price,
      metadata: {
        preference: context.preference,
        preferenceLabel: context.preferenceLabel,
        source: "featured_price",
        budget: context.budget,
        price_to_budget_ratio: Number((selectedProduct.price / Math.max(context.budget, 1)).toFixed(2)),
        product_categories: [selectedProduct.category],
        product_names: [selectedProduct.name]
      }
    }).catch(() => undefined);

    onAgentActivity({
      agent: "Recommendation Explanation Agent",
      action: `Why ${selectedProduct.name}`,
      detail: rationale.summary,
      tone: "coral"
    });
  }, [context, onAgentActivity, selectedProduct]);

  useEffect(() => {
    const crossSellProducts = merchandising.filter((suggestion) => suggestion.type === "cross_sell").map((suggestion) => suggestion.product);
    const upsellProducts = merchandising.filter((suggestion) => suggestion.type === "upsell").map((suggestion) => suggestion.product);
    const crossSellIds = crossSellProducts.map((product) => product.id);
    const upsellIds = upsellProducts.map((product) => product.id);

    if (crossSellIds.length) {
      trackAnalyticsEvent({
        eventName: "cross_sell_shown",
        productIds: crossSellIds,
        metadata: {
          preference: context.preference,
          product_categories: crossSellProducts.map((product) => product.category),
          product_names: crossSellProducts.map((product) => product.name)
        }
      }).catch(() => undefined);
    }

    if (upsellIds.length) {
      trackAnalyticsEvent({
        eventName: "upsell_shown",
        productIds: upsellIds,
        metadata: {
          preference: context.preference,
          product_categories: upsellProducts.map((product) => product.category),
          product_names: upsellProducts.map((product) => product.name)
        }
      }).catch(() => undefined);
    }

    if (merchandising.length) {
      onAgentActivity({
        agent: "Merchandising Agent",
        action: "Cross-sell and upsell generated",
        detail: "Builds complementary add-ons and premium alternatives from product compatibility, tags, and price bands.",
        tone: "iris"
      });
    }
  }, [context.preference, merchandising, onAgentActivity]);

  useEffect(() => {
    if (!selectedProduct) return undefined;

    const recoveryKey = buildRecoveryKey(productsKey, selectedProduct, context);
    if (cartProductIds.has(selectedProduct.id) || dismissedRecoveryKeys.has(recoveryKey) || shownRecoveryKeysRef.current.has(recoveryKey)) {
      return undefined;
    }

    setRecovery(null);
    const timeoutId = window.setTimeout(() => {
      const nextRecovery = buildConversionRecovery(selectedProduct, merchandising, context, recoveryKey);
      shownRecoveryKeysRef.current.add(recoveryKey);
      setRecovery(nextRecovery);

      trackAnalyticsEvent({
        eventName: "conversion_recovery_shown",
        productIds: getRecoveryProductIds(nextRecovery),
        value: nextRecovery.totalValue,
        metadata: buildRecoveryAnalyticsMetadata(nextRecovery, "conversion_recovery_agent")
      }).catch(() => undefined);

      onAgentActivity({
        agent: "GA Conversion Recovery Agent",
        action: "High-intent drop-off detected",
        detail: `${nextRecovery.trigger} without cart_add. Showing ${nextRecovery.offerLabel.toLowerCase()} with estimated ${nextRecovery.expectedLift}% recovery lift.`,
        tone: "saffron"
      });
    }, 4200);

    return () => window.clearTimeout(timeoutId);
  }, [cartProductIds, context, dismissedRecoveryKeys, merchandising, onAgentActivity, productsKey, selectedProduct]);

  function handleAddToCart(product: Product, source: string) {
    setCartProductIds((current) => new Set(current).add(product.id));
    if (recovery?.product.id === product.id) setRecovery(null);

    trackAnalyticsEvent({
      eventName: "cart_add",
      productIds: [product.id],
      value: product.price,
      metadata: {
        preference: context.preference,
        source,
        product_categories: [product.category],
        product_names: [product.name]
      }
    }).catch(() => undefined);

    trackAnalyticsEvent({
      eventName: "checkout_started",
      productIds: [product.id],
      value: product.price,
      metadata: {
        preference: context.preference,
        source,
        product_categories: [product.category],
        product_names: [product.name],
        demoSignal: true
      }
    }).catch(() => undefined);

    onAgentActivity({
      agent: "Conversion / Funnel Agent",
      action: `${product.name} added to cart`,
      detail: "Captures cart intent, product interest, checkout-start signal, and basket value for the analytics dashboard.",
      tone: "saffron"
    });
  }

  function handleAcceptRecovery(nextRecovery: ConversionRecovery) {
    const productIds = getRecoveryProductIds(nextRecovery);
    const suggestion = nextRecovery.suggestion;

    setCartProductIds((current) => {
      const next = new Set(current);
      productIds.forEach((productId) => next.add(productId));
      return next;
    });
    setRecovery(null);

    trackAnalyticsEvent({
      eventName: "conversion_recovery_accepted",
      productIds,
      value: nextRecovery.totalValue,
      metadata: buildRecoveryAnalyticsMetadata(nextRecovery, "conversion_recovery_offer")
    }).catch(() => undefined);

    if (suggestion) {
      trackAnalyticsEvent({
        eventName: suggestion.type === "cross_sell" ? "cross_sell_accepted" : "upsell_accepted",
        productIds: [suggestion.product.id],
        value: suggestion.product.price,
        metadata: {
          preference: context.preference,
          source: "conversion_recovery_offer",
          anchor_product: nextRecovery.product.name,
          suggested_product: suggestion.product.id,
          suggested_product_name: suggestion.product.name,
          product_categories: [suggestion.product.category],
          product_names: [suggestion.product.name]
        }
      }).catch(() => undefined);
    }

    trackAnalyticsEvent({
      eventName: "cart_add",
      productIds,
      value: nextRecovery.totalValue,
      metadata: {
        ...buildRecoveryAnalyticsMetadata(nextRecovery, "conversion_recovery_offer"),
        demoSignal: true
      }
    }).catch(() => undefined);

    trackAnalyticsEvent({
      eventName: "checkout_started",
      productIds,
      value: nextRecovery.totalValue,
      metadata: {
        ...buildRecoveryAnalyticsMetadata(nextRecovery, "conversion_recovery_offer"),
        demoSignal: true
      }
    }).catch(() => undefined);

    onAgentActivity({
      agent: "GA Conversion Recovery Agent",
      action: "Recovery play accepted",
      detail: `Converted a 3D/price drop-off into cart intent for ${nextRecovery.product.name}${suggestion ? ` plus ${suggestion.product.name}` : ""}.`,
      tone: "pine"
    });
  }

  function handleDismissRecovery(nextRecovery: ConversionRecovery) {
    setDismissedRecoveryKeys((current) => new Set(current).add(nextRecovery.key));
    setRecovery(null);

    trackAnalyticsEvent({
      eventName: "conversion_recovery_dismissed",
      productIds: getRecoveryProductIds(nextRecovery),
      value: nextRecovery.totalValue,
      metadata: buildRecoveryAnalyticsMetadata(nextRecovery, "conversion_recovery_dismissed")
    }).catch(() => undefined);

    onAgentActivity({
      agent: "GA Conversion Recovery Agent",
      action: "Recovery play dismissed",
      detail: "Stores the dismissal as a negative signal so future offers can be tuned by segment and intent.",
      tone: "coral"
    });
  }

  function handleProductSelect(product: Product, source: string) {
    setSelectedProductId(product.id);
    trackAnalyticsEvent({
      eventName: "product_selected",
      productIds: [product.id],
      value: product.price,
      metadata: {
        preference: context.preference,
        preferenceLabel: context.preferenceLabel,
        source,
        budget: context.budget,
        category: product.category,
        product_categories: [product.category],
        product_names: [product.name]
      }
    }).catch(() => undefined);

    onAgentActivity({
      agent: "Recommendation Agent",
      action: `${product.name} selected`,
      detail: "Captures product selection intent and updates the featured product experience for the shopper.",
      tone: "pine"
    });
  }

  function handleSelectFor3D(product: Product) {
    handleProductSelect(product, "product_3d_button");
    trackAnalyticsEvent({
      eventName: "product_3d_selected",
      productIds: [product.id],
      metadata: {
        preference: context.preference,
        source: "product_rail",
        product_categories: [product.category],
        product_names: [product.name]
      }
    }).catch(() => undefined);

    onAgentActivity({
      agent: "3D Product Visualization Agent",
      action: `${product.name} selected`,
      detail: "Switches the Three.js model to the shopper-selected product so color, surface, rotation, and zoom choices stay contextual.",
      tone: "iris"
    });
  }

  if (!products.length) {
    return (
      <section className="panel flex min-h-[320px] flex-col justify-center p-5">
        <p className="text-sm font-semibold text-ink">{context.preferenceLabel} recommendations</p>
        <p className="mt-2 text-sm text-graphite">
          Product recommendations will appear after the customer shares a goal, budget, or preference.
        </p>
      </section>
    );
  }

  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">{context.preferenceLabel} recommendations</h2>
            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-pine">
              {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {sourceLabel}
            </span>
          </div>
          <p className="mt-2 text-sm text-graphite">{context.summary}</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-graphite">{products.length} matched</span>
      </div>
      <div className="grid gap-4">
        {selectedProduct ? (
          <FeaturedProduct
            product={selectedProduct}
            context={context}
            onAddToCart={handleAddToCart}
            onAgentActivity={onAgentActivity}
          />
        ) : null}
        {recovery ? (
          <ConversionRecoveryCard recovery={recovery} onAccept={handleAcceptRecovery} onDismiss={handleDismissRecovery} />
        ) : null}
        {supportingProducts.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {supportingProducts.map((product) => (
              <ProductCard
                key={product.id}
                context={context}
                product={product}
                onProductSelect={(selectedProduct) => handleProductSelect(selectedProduct, "recommendation_card")}
                onSelectFor3D={handleSelectFor3D}
              />
            ))}
          </div>
        ) : null}
      </div>
      {merchandising.length ? (
        <div className="mt-5 border-t border-slate-200 pt-5">
          <div className="mb-3 flex items-center gap-2">
            <PackagePlus size={17} className="text-iris" />
            <h3 className="text-sm font-semibold text-ink">Smart add-ons and upgrades</h3>
          </div>
          <div className="grid gap-3">
            {merchandising.map((suggestion) => (
              <MerchandisingRow
                key={`${suggestion.type}-${suggestion.product.id}`}
                context={context}
                onAddToCart={handleAddToCart}
                onProductSelect={(selectedProduct) => handleProductSelect(selectedProduct, suggestion.type)}
                onSelect={handleSelectFor3D}
                suggestion={suggestion}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function FeaturedProduct({
  context,
  onAddToCart,
  onAgentActivity,
  product
}: {
  context: ShoppingContext;
  onAddToCart: (product: Product, source: string) => void;
  onAgentActivity: (activity: AgentActivityInput) => void;
  product: Product;
}) {
  return (
    <article className="overflow-hidden rounded-md border border-slate-200 bg-white">
      {is3DEnabled(product) ? (
        <Product3DViewer product={product} onAgentActivity={onAgentActivity} />
      ) : (
        <ProductImageStage product={product} context={context} />
      )}
      <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:p-5">
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-graphite">Featured fit</span>
            <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-pine">{context.preferenceLabel}</span>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-graphite">{product.description}</p>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-lg font-semibold text-ink">${product.price}</span>
            <span className="inline-flex items-center gap-1 text-graphite">
              <Star size={14} className="fill-saffron text-saffron" />
              {product.rating}
            </span>
            <span className="text-graphite">{product.inventory} in stock</span>
          </div>
          <div className="grid gap-2 text-sm text-graphite">
            {product.benefits.slice(0, 3).map((benefit) => (
              <span key={benefit} className="inline-flex items-start gap-2">
                <BadgeCheck size={15} className="mt-[2px] shrink-0 text-pine" />
                {benefit}
              </span>
            ))}
          </div>
          <div className="inline-flex items-start gap-2 rounded-md bg-emerald-50 p-3 text-sm text-pine">
            <Leaf size={15} className="mt-[2px] shrink-0" />
            <span>{product.sustainability[0]}</span>
          </div>
          <WhyThisProduct context={context} product={product} />
        </div>
        <div className="flex items-end justify-end">
          <IconButton label={`Add ${product.name} to cart`} onClick={() => onAddToCart(product, "featured_product")}>
            <ShoppingCart size={17} />
          </IconButton>
        </div>
      </div>
    </article>
  );
}

function ConversionRecoveryCard({
  onAccept,
  onDismiss,
  recovery
}: {
  onAccept: (recovery: ConversionRecovery) => void;
  onDismiss: (recovery: ConversionRecovery) => void;
  recovery: ConversionRecovery;
}) {
  return (
    <article className="rounded-md border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded bg-white px-2 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-100">
              <Sparkles size={13} />
              GA Conversion Recovery Agent
            </span>
            <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
              +{recovery.expectedLift}% expected lift
            </span>
          </div>
          <h3 className="mt-3 text-sm font-semibold text-ink">High intent detected without cart action</h3>
          <p className="mt-2 text-sm leading-6 text-graphite">{recovery.reason}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {recovery.evidence.map((signal) => (
              <span key={signal} className="rounded bg-white px-2 py-1 text-xs font-semibold text-graphite ring-1 ring-amber-100">
                {signal}
              </span>
            ))}
          </div>
          <div className="mt-3 rounded-md bg-white p-3 text-sm text-ink ring-1 ring-amber-100">
            <span className="font-semibold">{recovery.offerLabel}</span>
            {recovery.suggestion ? (
              <span className="text-graphite"> with {recovery.suggestion.product.name} as the recovery add-on.</span>
            ) : (
              <span className="text-graphite"> to reduce hesitation and continue checkout.</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => onDismiss(recovery)}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-200 bg-white px-3 text-xs font-semibold text-graphite transition hover:border-amber-300 hover:text-amber-900"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => onAccept(recovery)}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-pine bg-pine px-3 text-xs font-semibold text-white transition hover:bg-emerald-800"
          >
            <ShoppingCart size={15} />
            Apply recovery play
          </button>
        </div>
      </div>
    </article>
  );
}

function ProductImageStage({ context, product }: { context: ShoppingContext; product: Product }) {
  return (
    <div className="relative min-h-[320px] overflow-hidden bg-ink sm:min-h-[390px]">
      <img src={product.imageUrl} alt={product.name} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(23,32,51,0.04),rgba(23,32,51,0.76))]" />
      <div className="absolute inset-x-0 bottom-0 p-4 text-white sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-white/18 px-2 py-1 text-xs font-semibold backdrop-blur">Product image</span>
          <span className="rounded bg-emerald-400/25 px-2 py-1 text-xs font-semibold">{context.preferenceLabel}</span>
        </div>
        <h3 className="mt-3 text-2xl font-semibold leading-tight sm:text-3xl">{product.name}</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/82">{product.category}</p>
      </div>
    </div>
  );
}

function ProductCard({
  context,
  onProductSelect,
  onSelectFor3D,
  product
}: {
  context: ShoppingContext;
  onProductSelect: (product: Product) => void;
  onSelectFor3D: (product: Product) => void;
  product: Product;
}) {
  const rationale = buildProductRationale(product, context);

  return (
    <article className="grid grid-cols-[92px_1fr] gap-3 rounded-md border border-slate-200 bg-white p-3">
      <img src={product.imageUrl} alt={product.name} className="h-[92px] w-[92px] rounded-md object-cover" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">{product.name}</h3>
          <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-medium text-graphite">{product.category}</span>
        </div>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-graphite">{product.description}</p>
        <p className="mt-2 inline-flex items-start gap-2 rounded-md bg-violet-50 p-2 text-xs leading-5 text-iris">
          <Lightbulb size={13} className="mt-[3px] shrink-0" />
          <span>{rationale.summary}</span>
        </p>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3 text-xs text-graphite">
              <span className="font-semibold text-ink">${product.price}</span>
              <span className="inline-flex items-center gap-1">
                <Star size={13} className="fill-saffron text-saffron" />
                {product.rating}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {product.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="rounded bg-slate-100 px-2 py-1 text-[11px] font-medium text-graphite">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <IconButton label={`Select ${product.name}`} onClick={() => onProductSelect(product)}>
              <Eye size={16} />
            </IconButton>
            {is3DEnabled(product) ? (
              <IconButton label={`View ${product.name} in 3D`} onClick={() => onSelectFor3D(product)}>
                <Box size={16} />
              </IconButton>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function MerchandisingRow({
  context,
  onAddToCart,
  onProductSelect,
  onSelect,
  suggestion
}: {
  context: ShoppingContext;
  onAddToCart: (product: Product, source: string) => void;
  onProductSelect: (product: Product) => void;
  onSelect: (product: Product) => void;
  suggestion: MerchandisingSuggestion;
}) {
  const Icon = suggestion.type === "cross_sell" ? PackagePlus : ArrowUpRight;
  const label = suggestion.type === "cross_sell" ? "Cross-sell" : "Premium alternative";
  const rationale = buildProductRationale(suggestion.product, context);

  return (
    <article className="grid grid-cols-[72px_1fr_auto] gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <img src={suggestion.product.imageUrl} alt={suggestion.product.name} className="h-[72px] w-[72px] rounded-md object-cover" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-[11px] font-semibold text-graphite">
            <Icon size={12} />
            {label}
          </span>
          <span className="text-xs font-semibold text-ink">${suggestion.product.price}</span>
        </div>
        <p className="mt-2 text-sm font-semibold text-ink">{suggestion.product.name}</p>
        <p className="mt-1 line-clamp-2 text-xs text-graphite">{suggestion.reason}</p>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-iris">{rationale.summary}</p>
      </div>
      <div className="grid gap-2">
        <IconButton label={`Select ${suggestion.product.name}`} onClick={() => onProductSelect(suggestion.product)}>
          <Eye size={16} />
        </IconButton>
        {is3DEnabled(suggestion.product) ? (
          <IconButton label={`View ${suggestion.product.name} in 3D`} onClick={() => onSelect(suggestion.product)}>
            <Box size={16} />
          </IconButton>
        ) : null}
        <IconButton label={`Add ${suggestion.product.name} to cart`} onClick={() => onAddToCart(suggestion.product, suggestion.type)}>
          <ShoppingCart size={17} />
        </IconButton>
      </div>
    </article>
  );
}

function is3DEnabled(product: Product) {
  return Boolean(product.modelUrl);
}

function WhyThisProduct({ context, product }: { context: ShoppingContext; product: Product }) {
  const rationale = buildProductRationale(product, context);

  return (
    <div className="rounded-md border border-violet-100 bg-violet-50 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-iris">
        <Lightbulb size={15} />
        Why this product?
      </div>
      <p className="mt-2 text-sm leading-6 text-graphite">{rationale.summary}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {rationale.signals.map((signal) => (
          <span key={signal} className="rounded bg-white px-2 py-2 text-xs font-semibold text-graphite">
            {signal}
          </span>
        ))}
      </div>
    </div>
  );
}

function buildRecoveryKey(productsKey: string, product: Product, context: ShoppingContext) {
  return `${productsKey}:${product.id}:${context.preference}:${context.budget}`;
}

function buildConversionRecovery(
  product: Product,
  merchandising: MerchandisingSuggestion[],
  context: ShoppingContext,
  key: string
): ConversionRecovery {
  const suggestion = pickRecoverySuggestion(product, merchandising);
  const has3DSignal = is3DEnabled(product);
  const priceToBudgetRatio = product.price / Math.max(context.budget, 1);
  const expectedLift = suggestion ? (has3DSignal ? 14 : 11) : 8;
  const trigger = has3DSignal ? "3D model + price viewed" : "Product detail + price viewed";
  const offerLabel = suggestion
    ? `Approved demo bundle for ${context.preferenceLabel.toLowerCase()} shoppers`
    : `Approved demo checkout assist for ${context.preferenceLabel.toLowerCase()} shoppers`;
  const reason =
    priceToBudgetRatio >= 0.9
      ? `${product.name} is close to the shopper's $${context.budget} budget, so the agent uses price-view and 3D engagement as a hesitation signal.`
      : `${product.name} has strong engagement signals but no cart_add event, so the agent offers the next best conversion step.`;

  return {
    budget: context.budget,
    evidence: [
      has3DSignal ? "product_3d_view" : "product_viewed",
      "product_price_viewed",
      "no cart_add after 4s"
    ],
    expectedLift,
    key,
    offerLabel,
    preference: context.preference,
    preferenceLabel: context.preferenceLabel,
    product,
    reason,
    suggestion,
    totalValue: product.price + (suggestion?.product.price ?? 0),
    trigger
  };
}

function pickRecoverySuggestion(product: Product, merchandising: MerchandisingSuggestion[]) {
  return (
    merchandising.find((suggestion) => suggestion.anchorProductId === product.id && suggestion.type === "cross_sell") ??
    merchandising.find((suggestion) => suggestion.anchorProductId === product.id) ??
    merchandising.find((suggestion) => suggestion.type === "cross_sell") ??
    merchandising[0]
  );
}

function getRecoveryProductIds(recovery: ConversionRecovery) {
  return [recovery.product.id, recovery.suggestion?.product.id].filter((productId): productId is string => Boolean(productId));
}

function buildRecoveryAnalyticsMetadata(recovery: ConversionRecovery, source: string) {
  return {
    preference: recovery.preference,
    preferenceLabel: recovery.preferenceLabel,
    source,
    budget: recovery.budget,
    recovery_trigger: recovery.trigger,
    recovery_reason: recovery.reason,
    offer_type: recovery.suggestion?.type ?? "checkout_assist",
    offer_label: recovery.offerLabel,
    expected_uplift_percent: recovery.expectedLift,
    abandonment_window_seconds: 4,
    suggested_product: recovery.suggestion?.product.id,
    suggested_product_name: recovery.suggestion?.product.name,
    product_categories: [recovery.product.category, recovery.suggestion?.product.category].filter(Boolean),
    product_names: [recovery.product.name, recovery.suggestion?.product.name].filter(Boolean)
  };
}

function buildProductRationale(product: Product, context: ShoppingContext) {
  const contextTags = context.tags.map((tag) => tag.toLowerCase());
  const matchedTags = product.tags.filter((tag) =>
    contextTags.some((contextTag) => tag.toLowerCase().includes(contextTag) || contextTag.includes(tag.toLowerCase()))
  );
  const primaryMatch = matchedTags[0] ?? product.tags[0] ?? product.category;
  const budgetSignal =
    product.price <= context.budget
      ? `Fits $${context.budget} budget`
      : `Premium stretch $${Math.round(product.price - context.budget)} over`;
  const benefit = product.benefits[0] ?? product.description;
  const sustainability = product.sustainability[0] ?? "Sustainability detail available";
  const ratingSignal = `${product.rating.toFixed(1)} rating`;
  const matchSignal = matchedTags.length ? `${matchedTags.length} preference signals` : product.category;

  return {
    matchedTags,
    summary: `Matched to ${context.preferenceLabel.toLowerCase()} because it connects ${primaryMatch} intent with ${benefit.toLowerCase()}.`,
    signals: [budgetSignal, ratingSignal, matchSignal, sustainability].slice(0, 3)
  };
}

function buildClientMerchandising(products: Product[], allProducts: Product[]): MerchandisingSuggestion[] {
  const selectedIds = new Set(products.map((product) => product.id));
  const suggestions: MerchandisingSuggestion[] = [];

  for (const product of products.slice(0, 3)) {
    const crossSell = product.compatibleProductIds
      .map((id) => allProducts.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is Product => Boolean(candidate))
      .find((candidate) => !selectedIds.has(candidate.id));

    if (crossSell) {
      suggestions.push({
        type: "cross_sell",
        product: crossSell,
        anchorProductId: product.id,
        reason: `Complements ${product.name} without changing the customer's original direction.`
      });
    }

    const upsell = allProducts
      .filter((candidate) => candidate.id !== product.id)
      .filter((candidate) => candidate.price > product.price)
      .filter((candidate) => candidate.category === product.category || candidate.tags.some((tag) => product.tags.includes(tag)))
      .sort((a, b) => a.price - b.price)[0];

    if (upsell) {
      suggestions.push({
        type: "upsell",
        product: upsell,
        anchorProductId: product.id,
        reason: `A higher-value option when the customer wants more capability, materials, or polish.`
      });
    }
  }

  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = `${suggestion.type}-${suggestion.product.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
}
