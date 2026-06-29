import { describe, expect, it } from "vitest";
import { sanitizeProductFilters, validateChatRequest } from "../src/shared/validation";

describe("application input validation", () => {
  it("normalizes the reported marathon shoe chat prompt", () => {
    const result = validateChatRequest({
      message: "  suggest me marathon shoe for 150USD  ",
      customerProfile: {
        budget: "150",
        preferences: ["marathon", "marathon", "road running"]
      }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.message).toBe("suggest me marathon shoe for 150USD");
      expect(result.value.customerProfile?.budget).toBe(150);
      expect(result.value.customerProfile?.preferences).toEqual(["marathon", "road running"]);
    }
  });

  it("rejects empty chat messages", () => {
    const result = validateChatRequest({ message: "   " });

    expect(result).toEqual({ ok: false, error: "Message is required." });
  });

  it("clamps product filters to supported ranges", () => {
    expect(
      sanitizeProductFilters({
        query: "running shoes",
        maxPrice: "999",
        limit: "999",
        strictBudget: true,
        tags: [" marathon ", "marathon"]
      })
    ).toEqual({
      query: "running shoes",
      maxPrice: 250,
      limit: 24,
      strictBudget: true,
      tags: ["marathon"]
    });
  });
});
