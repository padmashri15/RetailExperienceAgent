export type JourneyStage =
  | "awareness"
  | "consideration"
  | "evaluation"
  | "purchase"
  | "post_purchase"
  | "loyalty";

export interface CustomerProfile {
  id?: string;
  name?: string;
  gender?: string;
  ageGroup?: string;
  budget?: number;
  location?: string;
  preferences?: string[];
  shoppingHistory?: string[];
  purchaseIntent?: "researching" | "comparing" | "ready_to_buy" | "support";
  loyaltyTier?: "guest" | "member" | "silver" | "gold" | "platinum";
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  currency: string;
  rating: number;
  inventory: number;
  imageUrl: string;
  modelUrl?: string;
  tags: string[];
  benefits: string[];
  materials: string[];
  sustainability: string[];
  compatibleProductIds: string[];
  description: string;
}

export interface ProductFilters {
  query?: string;
  category?: string;
  maxPrice?: number;
  tags?: string[];
  limit?: number;
  strictBudget?: boolean;
}

export interface ShoppingContext {
  preference: string;
  preferenceLabel: string;
  budget: number;
  query: string;
  tags: string[];
  summary: string;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  conversationId?: string;
  customerProfile?: CustomerProfile;
  history?: ConversationMessage[];
  message: string;
}

export interface SourceCitation {
  title: string;
  fileId?: string;
  quote?: string;
  score?: number;
}

export interface MerchandisingSuggestion {
  type: "cross_sell" | "upsell";
  product: Product;
  anchorProductId?: string;
  reason: string;
}

export interface BrandGovernanceCheck {
  id: string;
  label: string;
  status: "pass" | "watch" | "escalate";
  detail: string;
}

export interface BrandGovernanceResult {
  status: "approved" | "watch" | "escalate";
  tone: "premium_consultative";
  checks: BrandGovernanceCheck[];
  requiredEscalation: boolean;
}

export interface ChatResponse {
  conversationId: string;
  responseId?: string;
  answer: string;
  journeyStage: JourneyStage;
  intent: string;
  recommendedProducts: Product[];
  merchandising: MerchandisingSuggestion[];
  citations: SourceCitation[];
  guardrailFlags: string[];
  governance: BrandGovernanceResult;
  latencyMs: number;
  mode: "live_openai" | "demo";
}

export interface HealthStatus {
  status: "ok";
  mode: "live_openai" | "demo";
  model: string;
  vectorStoreConfigured: boolean;
  openai?: {
    configured: boolean;
    fallbackToDemo: boolean;
    insecureTlsAllowed: boolean;
    extraCaCertsConfigured: boolean;
  };
  googleAnalytics?: {
    measurementConfigured: boolean;
    reportingConfigured: boolean;
  };
}

export interface AnalyticsSummary {
  source?: "local" | "google_analytics" | "hybrid";
  googleAnalytics?: {
    measurementConfigured: boolean;
    reportingConfigured: boolean;
  };
  conversionRate: number;
  averageOrderValue: number;
  customerSatisfaction: number;
  totalConversations: number;
  generatedLeads: number;
  preferenceSelections: Array<{ preference: string; count: number }>;
  recommendationFunnel: Array<{ eventName: string; count: number }>;
  governance: {
    approved: number;
    watch: number;
    escalations: number;
    citationCoverage: number;
  };
  topIntents: Array<{ intent: string; count: number }>;
  productInterest: Array<{ productName: string; count: number }>;
  recentEvents: AnalyticsEvent[];
  unansweredQuestions: Array<{ question: string; count: number }>;
  contentGaps: Array<{ topic: string; severity: "low" | "medium" | "high" }>;
  recentConversations: Array<{
    id: string;
    customer: string;
    intent: string;
    stage: JourneyStage;
    lastMessage: string;
    updatedAt: string;
  }>;
}

export interface AnalyticsEvent {
  id: string;
  eventName: string;
  agent: string;
  productNames: string[];
  value: number;
  source: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface EvaluationCase {
  id: string;
  input: string;
  expectedIntent: string;
  mustRecommendProductIds?: string[];
  mustCiteSources?: boolean;
}
