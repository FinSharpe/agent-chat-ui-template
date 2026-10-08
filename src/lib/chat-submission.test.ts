import { describe, expect, it } from "vitest";
import type { Message } from "@langchain/langgraph-sdk";
import { hasImageContent, precedingHuman } from "./chat-submission";

describe("image compatibility for edited and rerun turns", () => {
  it.each([
    { content: [{ type: "image", data: "fixture" }] },
    { content: [{ type: "image_url", image_url: { url: "fixture" } }] },
    { content: [{ type: "file", mimeType: "image/png" }] },
  ])("recognizes an image attachment in $content", ({ content }) => {
    expect(hasImageContent(content)).toBe(true);
  });
  it("allows prose and PDF attachments", () => {
    expect(hasImageContent("plain prose")).toBe(false);
    expect(
      hasImageContent([{ type: "file", mimeType: "application/pdf" }]),
    ).toBe(false);
  });
  it("checks the originating human turn when regenerating older prose", () => {
    const image: Message = {
      id: "image",
      type: "human",
      content: [{ type: "image_url", image_url: { url: "fixture" } }],
    };
    const earlier: Message = { id: "a1", type: "ai", content: "Earlier reply" };
    const latest: Message = {
      id: "text",
      type: "human",
      content: "Text-only follow-up",
    };
    const messages: Message[] = [
      image,
      earlier,
      latest,
      { id: "a2", type: "ai", content: "Latest reply" },
    ];
    expect(precedingHuman(messages, { ...earlier })).toBe(image);
    expect(precedingHuman(messages)).toBe(latest);
    expect(
      precedingHuman(messages, { id: "unknown", type: "ai", content: "" }),
    ).toBeUndefined();
  });
});
