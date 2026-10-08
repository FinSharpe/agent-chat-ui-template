import { describe, expect, it } from "vitest";
import type { Message } from "@langchain/langgraph-sdk";
import {
  citationRegistry,
  parseCitation,
  resolveCitationMarkdown,
} from "./citations";

const citation = {
  cite: "a",
  document_id: "doc",
  symbol: "ABC",
  compname: "ABC Limited",
  subcatname: "annual-report",
  news_dt_iso: "2026-04-01",
  attachment_name: "original.pdf",
  page: 6,
  quote: "Source quotation",
  bboxes: [{ l: 0.1, t: 0.1, r: 0.8, b: 0.5 }],
};
const tool = (citations: unknown[]): Message =>
  ({
    type: "tool",
    content: "{}",
    additional_kwargs: { citations },
  }) as unknown as Message;
const ai = (content: string): Message => ({ type: "ai", content });

describe("filings provenance", () => {
  it("merges multiple searches, numbers in turn order, and preserves all consulted sources", () => {
    const registry = citationRegistry([
      tool([citation]),
      ai("First [[a]]"),
      tool([
        {
          ...citation,
          cite: "b",
          document_id: "another",
          page: 12,
          quote: "Other passage",
        },
      ]),
      ai("Second [[b]], repeats [[a]]"),
    ]);
    expect(registry.numbers.get("a")).toBe(1);
    expect(registry.numbers.get("b")).toBe(2);
    expect(registry.documents).toHaveLength(2);
    expect(
      resolveCitationMarkdown("Second [[b]], repeats [[a]]", registry),
    ).toBe("Second [2](#citation-b), repeats [1](#citation-a)");
    expect(
      citationRegistry([tool([citation]), ai("No inline citation")]).documents,
    ).toHaveLength(1);
  });

  it("strips unresolved/mangled/streaming tags while preserving fenced and inline code", () => {
    const registry = citationRegistry([tool([citation]), ai("Known [[a]]")]);
    expect(
      resolveCitationMarkdown("Known [[a] unknown [[nope]] half [[a", registry),
    ).toBe("Known [1](#citation-a) unknown  half");
    expect(
      resolveCitationMarkdown(
        "`[[nope]]`\n```python\n[[1, 2], [3, 4]]\n```",
        registry,
      ),
    ).toBe("`[[nope]]`\n```python\n[[1, 2], [3, 4]]\n```");
  });

  it("removes table-cell markers, with provenance still available from sources", () => {
    const registry = citationRegistry([tool([citation]), ai("Text [[a]]")]);
    expect(
      resolveCitationMarkdown(
        "| Growth | Source |\n| --- | --- |\n| 12% | [[a]] |\n\nText [[a]]",
        registry,
      ),
    ).toBe(
      "| Growth | Source |\n| --- | --- |\n| 12% |  |\n\nText [1](#citation-a)",
    );
  });

  it("deduplicates identical twin filings and orders their pages, while retaining distinct passages", () => {
    const registry = citationRegistry([
      tool([
        citation,
        { ...citation, cite: "b", page: 3, quote: "Earlier" },
        {
          ...citation,
          cite: "twin-a",
          document_id: "twin",
          attachment_name: "copy.pdf",
        },
        {
          ...citation,
          cite: "twin-b",
          document_id: "twin",
          page: 3,
          quote: "Earlier",
        },
      ]),
    ]);
    expect(registry.documents).toHaveLength(1);
    expect(registry.documents[0].map((entry) => entry.page)).toEqual([3, 6]);
    expect(registry.byTag.has("twin-a")).toBe(true);
  });

  it("ignores malformed sidecars and keeps optional document fields optional", () => {
    expect(parseCitation(null)).toBeUndefined();
    expect(parseCitation({ quote: "No tag" })).toBeUndefined();
    expect(parseCitation({ cite: "valid" })?.page).toBeUndefined();
  });
});
