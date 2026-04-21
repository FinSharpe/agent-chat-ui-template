import { describe, it, expect } from "vitest";
import { getModelDisplayName } from "./model-display-name";

describe("getModelDisplayName", () => {
  it("title-cases enum keys", () => {
    expect(getModelDisplayName("GEMINI_FLASH")).toBe("Gemini Flash");
  });

  it("merges adjacent digit tokens with a dot", () => {
    expect(getModelDisplayName("SONNET_4_5")).toBe("Sonnet 4.5");
    expect(getModelDisplayName("GPT_5_2")).toBe("Gpt 5.2");
    expect(getModelDisplayName("HAIKU_4_5")).toBe("Haiku 4.5");
  });

  it("leaves single-digit keys unchanged (no adjacent digits to merge)", () => {
    expect(getModelDisplayName("GPT_5")).toBe("Gpt 5");
  });

  it("handles empty strings", () => {
    expect(getModelDisplayName("")).toBe("");
  });
});
