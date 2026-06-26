import { describe, expect, it } from "vitest";
import { inferIntent, inferJourneyStage, isSensitiveRequest } from "../src/server/agent/policy";

describe("agent policy", () => {
  it("detects product discovery", () => {
    expect(inferIntent("I need running shoes under $150")).toBe("product_discovery");
    expect(inferJourneyStage("I need running shoes under $150")).toBe("consideration");
  });

  it("flags sensitive support requests", () => {
    expect(isSensitiveRequest("I have a refund dispute and want a legal answer")).toBe(true);
  });
});
