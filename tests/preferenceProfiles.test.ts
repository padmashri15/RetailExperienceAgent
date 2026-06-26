import { describe, expect, it } from "vitest";
import { inferBudgetFromText, inferPreferenceFromText } from "../src/client/lib/preferenceProfiles";

describe("chat preference inference", () => {
  it("infers marathon from a race shoe request", () => {
    const result = inferPreferenceFromText("I am going to participate in a marathon next week and need a running shoe.");

    expect(result?.preference).toBe("marathon");
  });

  it("infers weather from rainy trail needs", () => {
    const result = inferPreferenceFromText("I need waterproof gear for a rainy trail weekend.");

    expect(result?.preference).toBe("weather");
  });

  it("infers travel from trip and packing language", () => {
    const result = inferPreferenceFromText("Build a polished travel setup for a three-day work trip.");

    expect(result?.preference).toBe("travel");
  });

  it("infers recovery from post-run comfort language", () => {
    const result = inferPreferenceFromText("Recommend soft recovery slides after a long run.");

    expect(result?.preference).toBe("recovery");
  });

  it("infers budget from chat language", () => {
    const result = inferBudgetFromText("I am running a marathon next week and need shoes under $150.");

    expect(result?.budget).toBe(150);
  });
});
