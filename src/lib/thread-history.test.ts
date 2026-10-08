import { describe, expect, it } from "vitest";
import type { Thread } from "@langchain/langgraph-sdk";
import {
  deriveThreadTitle,
  filterThreadHistory,
  getThreadHistoryGroup,
  getThreadTitle,
} from "./thread-history";

function thread(overrides: Partial<Thread> = {}): Thread {
  return {
    thread_id: "thread-1",
    created_at: "2026-10-08T00:00:00Z",
    updated_at: "2026-10-08T00:00:00Z",
    state_updated_at: "2026-10-08T00:00:00Z",
    metadata: {},
    status: "idle",
    values: {},
    interrupts: {},
    ...overrides,
  };
}

describe("conversation titles", () => {
  it("uses the mobile metadata rename before the first user message", () => {
    expect(
      getThreadTitle(
        thread({
          metadata: { title: "  My watchlist  " },
          values: { messages: [{ type: "human", content: "Compare banks" }] },
        }),
      ),
    ).toBe("My watchlist");
  });

  it("skips non-user and empty messages, collapsing the first user's whitespace", () => {
    expect(
      getThreadTitle(
        thread({
          metadata: { title: " " },
          values: {
            messages: [
              { type: "system", content: "Internal instructions" },
              { type: "human", content: " " },
              { type: "human", content: " Compare\n  banks and  insurers " },
              { type: "human", content: "A later question" },
            ],
          },
        }),
      ),
    ).toBe("Compare banks and insurers");
  });

  it("supports the mobile narrow extracted search response and multimodal text", () => {
    expect(
      getThreadTitle(
        thread({
          extracted: {
            first_message: {
              type: "human",
              content: [
                {
                  type: "image_url",
                  image_url: "https://example.com/image.png",
                },
                { type: "text", text: "Review my" },
                { type: "text", text: "portfolio" },
              ],
            },
          },
        }),
      ),
    ).toBe("Review my portfolio");
  });

  it("uses New chat for empty and image-only conversations", () => {
    expect(getThreadTitle(thread())).toBe("New chat");
    expect(
      getThreadTitle(
        thread({
          values: {
            messages: [
              {
                type: "human",
                content: [{ type: "image_url", image_url: "image" }],
              },
            ],
          },
        }),
      ),
    ).toBe("New chat");
  });

  it("cuts at 48 graphemes without splitting a family emoji or combining mark", () => {
    const prefix = "a".repeat(46);
    expect(deriveThreadTitle(`${prefix}👨‍👩‍👧‍👦bc`)).toBe(`${prefix}👨‍👩‍👧‍👦…`);
    expect(deriveThreadTitle(`${prefix}e\u0301bc`)).toBe(`${prefix}e\u0301…`);
    expect(deriveThreadTitle("a".repeat(48))).toBe("a".repeat(48));
  });

  it("searches the visible title case-insensitively, preserving recency order", () => {
    const rows = [
      thread({ thread_id: "one", metadata: { title: "Bank review" } }),
      thread({ thread_id: "two", metadata: { title: "Technology" } }),
      thread({
        thread_id: "three",
        values: { messages: [{ type: "human", content: "BANK earnings" }] },
      }),
    ];
    expect(
      filterThreadHistory(rows, " bank ").map((row) => row.thread_id),
    ).toEqual(["one", "three"]);
    expect(filterThreadHistory(rows, "  ")).toBe(rows);
  });
});

describe("calendar-local conversation groups", () => {
  const now = new Date(2026, 9, 8, 0, 5);

  it.each([
    [new Date(2026, 9, 8, 0, 1).toISOString(), "Today"],
    [new Date(2026, 9, 9).toISOString(), "Today"],
    [new Date(2026, 9, 7, 23, 59).toISOString(), "Yesterday"],
    [new Date(2026, 9, 2).toISOString(), "This week"],
    [new Date(2026, 9, 1).toISOString(), "Older"],
    ["invalid-date", "Older"],
    [undefined, "Older"],
  ])(
    "groups %s as %s without using elapsed hours",
    (date: string | undefined, group: string) => {
      expect(getThreadHistoryGroup(date, now)).toBe(group);
    },
  );
});
