import type { CustomerProfile, ShoppingContext } from "../../shared/types";

export const preferenceProfiles = {
  marathon: {
    label: "Marathon",
    query: "marathon running breathable hydration recovery long run",
    tags: ["marathon", "road running", "hydration", "breathable", "recovery"],
    summary: "Long-run footwear, breathable apparel, hydration, and recovery essentials.",
    welcome:
      "Welcome back, {name}. Your marathon journey is ready with long-run shoes, hydration, breathable layers, and recovery support within your budget.",
    starters: [
      "I need running shoes for marathon training under $150.",
      "Build me a marathon long-run setup.",
      "What should I pair with the marathon trainer?"
    ]
  },
  travel: {
    label: "Travel",
    query: "travel work gym layering premium weekender tote merino",
    tags: ["travel", "work", "gym", "layering", "premium"],
    summary: "Polished layers, easy packing, and commute-to-weekend pieces.",
    welcome:
      "Welcome back, {name}. Your travel profile is set for polished layers, flexible packing, and pieces that move from work to weekend.",
    starters: [
      "I need a polished travel setup for a 3-day trip.",
      "Compare the merino hoodie and weekender tote.",
      "What travel pieces work for work and gym?"
    ]
  },
  recovery: {
    label: "Recovery",
    query: "recovery post run comfort soft warm slides",
    tags: ["recovery", "post run", "comfort", "warm"],
    summary: "Post-training comfort, recovery footwear, and soft layering.",
    welcome:
      "Welcome back, {name}. Your recovery edit is tuned for post-run comfort, soft layers, and low-effort products after hard training days.",
    starters: [
      "What recovery products help after long runs?",
      "Recommend comfortable post-run gear.",
      "What should I add after buying marathon shoes?"
    ]
  },
  weather: {
    label: "Weather",
    query: "weather resistant rain trail windproof hiking jacket",
    tags: ["weather resistant", "rain", "windproof", "hiking", "trail"],
    summary: "Rain-ready shells, grippy footwear, and outdoor layers.",
    welcome:
      "Welcome back, {name}. Your weather-ready path highlights rain protection, reliable traction, and outdoor layers for changing conditions.",
    starters: [
      "I need weather-resistant gear for rainy commutes.",
      "Compare the hiking shoe with the weather jacket.",
      "What should I wear for wet trail weekends?"
    ]
  }
} as const;

export type PreferenceKey = keyof typeof preferenceProfiles;

export const preferenceKeys: PreferenceKey[] = ["travel", "marathon", "weather", "recovery"];

interface PreferenceSignalRule {
  label: string;
  pattern: RegExp;
  weight: number;
}

export interface InferredPreference {
  confidence: number;
  matchedSignals: string[];
  preference: PreferenceKey;
}

export interface InferredBudget {
  budget: number;
  confidence: number;
  matchedSignal: string;
}

const preferenceSignalRules: Record<PreferenceKey, PreferenceSignalRule[]> = {
  marathon: [
    { label: "marathon", pattern: /\bmarathons?\b/i, weight: 6 },
    { label: "race", pattern: /\b(race|race day|next week|event)\b/i, weight: 2 },
    { label: "running shoe", pattern: /\b(running shoes?|runner|trainers?|long runs?|road running)\b/i, weight: 4 },
    { label: "training", pattern: /\b(training plan|speedwork|tempo|hydration|breathable)\b/i, weight: 2 }
  ],
  travel: [
    { label: "travel", pattern: /\b(travel|trip|flight|airport|packing|packable|luggage)\b/i, weight: 5 },
    { label: "weekend", pattern: /\b(weekender|3-day|three-day|vacation|hotel)\b/i, weight: 3 },
    { label: "commute", pattern: /\b(commute|office|work trip|business trip)\b/i, weight: 2 },
    { label: "carry", pattern: /\b(tote|bag|carry-on|layering|merino)\b/i, weight: 2 }
  ],
  weather: [
    { label: "weather", pattern: /\b(weather|rain|rainy|raining|storm|wind|windy)\b/i, weight: 5 },
    { label: "wet", pattern: /\b(wet|waterproof|water-resistant|weather-resistant)\b/i, weight: 4 },
    { label: "trail", pattern: /\b(trail|hiking|hike|outdoor|grip|traction)\b/i, weight: 3 },
    { label: "jacket", pattern: /\b(jacket|shell|windproof|layer)\b/i, weight: 2 }
  ],
  recovery: [
    { label: "recovery", pattern: /\b(recovery|recover|post-run|post run|after run)\b/i, weight: 5 },
    { label: "comfort", pattern: /\b(comfort|comfortable|soft|relax|rest|sore)\b/i, weight: 3 },
    { label: "slides", pattern: /\b(slides?|sandals?|warm layers?|hoodie)\b/i, weight: 3 },
    { label: "after training", pattern: /\b(after training|after workout|cooldown|foam)\b/i, weight: 2 }
  ]
};

export function buildShoppingContext(preference: PreferenceKey, budget: number): ShoppingContext {
  const profile = preferenceProfiles[preference];

  return {
    preference,
    preferenceLabel: profile.label,
    budget,
    query: profile.query,
    tags: [...profile.tags],
    summary: profile.summary
  };
}

export function getPreferenceStarters(preference: PreferenceKey) {
  return preferenceProfiles[preference].starters;
}

export function buildPreferenceWelcome(preference: PreferenceKey, profile: CustomerProfile) {
  const profileName = profile.name?.trim() || "shopper";
  return preferenceProfiles[preference].welcome.replace("{name}", profileName);
}

export function inferPreferenceFromText(text: string, currentPreference?: PreferenceKey): InferredPreference | null {
  const trimmedText = text.trim();
  if (!trimmedText) return null;

  const ranked = preferenceKeys
    .map((preference) => {
      const matchedRules = preferenceSignalRules[preference].filter((rule) => rule.pattern.test(trimmedText));
      const score = matchedRules.reduce((total, rule) => total + rule.weight, 0);

      return {
        confidence: Number(Math.min(0.95, 0.52 + score * 0.06).toFixed(2)),
        matchedSignals: matchedRules.map((rule) => rule.label),
        preference,
        score
      };
    })
    .sort((a, b) => b.score - a.score);

  const [winner, runnerUp] = ranked;
  if (!winner || winner.score < 3) return null;
  if (runnerUp && winner.score === runnerUp.score && winner.preference !== currentPreference) return null;

  return {
    confidence: winner.confidence,
    matchedSignals: winner.matchedSignals,
    preference: winner.preference
  };
}

export function inferBudgetFromText(text: string): InferredBudget | null {
  const trimmedText = text.trim();
  if (!trimmedText) return null;

  const budgetPatterns: Array<{ pattern: RegExp; signal: string; confidence: number }> = [
    { pattern: /\b(?:under|below|less than|up to|max|maximum|budget(?: is)?|within)\s*\$?\s*(\d{2,4})\b/i, signal: "budget ceiling", confidence: 0.9 },
    { pattern: /\$\s*(\d{2,4})\b/i, signal: "explicit price", confidence: 0.82 },
    { pattern: /\b(\d{2,4})\s*(?:dollars|usd)\b/i, signal: "currency amount", confidence: 0.82 }
  ];

  for (const { confidence, pattern, signal } of budgetPatterns) {
    const match = pattern.exec(trimmedText);
    const amount = Number(match?.[1]);
    if (!Number.isFinite(amount)) continue;

    return {
      budget: clampBudget(amount),
      confidence,
      matchedSignal: signal
    };
  }

  return null;
}

function clampBudget(value: number) {
  return Math.min(Math.max(Math.round(value / 5) * 5, 40), 250);
}
