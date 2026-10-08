import { describe, expect, it } from "vitest";
import type { Message, ThreadState } from "@langchain/langgraph-sdk";
import {
  currentTurnId,
  dropsRenderedContent,
  retryTurnState,
  scopedRunStorage,
} from "./conversation-recovery";

const human: Message = { type: "human", id: "human", content: "Question" };
const answer: Message = {
  type: "ai",
  id: "answer",
  content: "A complete answer",
};

describe("completion snapshots", () => {
  it("rejects empty, missing-turn, and shorter final-message snapshots", () => {
    expect(dropsRenderedContent([], [human, answer])).toBe(true);
    expect(
      dropsRenderedContent(
        [{ ...human, id: "other" }, answer],
        [human, answer],
      ),
    ).toBe(true);
    expect(
      dropsRenderedContent(
        [human, { ...answer, content: "A" }],
        [human, answer],
      ),
    ).toBe(true);
  });

  it("accepts canonical content and genuinely more recent history", () => {
    expect(dropsRenderedContent([human, answer], [human, answer])).toBe(false);
    expect(
      dropsRenderedContent(
        [human, answer, { type: "human", id: "next", content: "Next" }],
        [human, answer],
      ),
    ).toBe(false);
  });

  it("handles structured text chunks when deciding whether content regressed", () => {
    const structured: Message = {
      ...answer,
      content: [{ type: "text", text: "A complete answer" }],
    };
    expect(
      dropsRenderedContent(
        [human, { ...answer, content: "A" }],
        [human, structured],
      ),
    ).toBe(true);
  });
});

describe("turn recovery", () => {
  it("selects the first checkpoint where the user's turn persisted, rather than a late tool checkpoint", () => {
    const first = {
      checkpoint: { checkpoint_id: "human-checkpoint" },
      values: { messages: [human] },
    } as ThreadState<{ messages: Message[] }>;
    const later = {
      checkpoint: { checkpoint_id: "tool-checkpoint" },
      values: { messages: [human, answer] },
    } as ThreadState<{ messages: Message[] }>;
    expect(retryTurnState([later, first], "human")).toBe(first);
    expect(retryTurnState([later, first], "missing")).toBeUndefined();
  });

  it("anchors a terminal outcome to the current turn's first assistant or tool message", () => {
    expect(currentTurnId([human])).toBe("human");
    expect(currentTurnId([human, answer, { ...answer, id: "last" }])).toBe(
      "answer",
    );
    expect(
      currentTurnId([
        human,
        answer,
        { ...human, id: "next" },
        { type: "tool", id: "tool", tool_call_id: "call", content: "Result" },
      ]),
    ).toBe("tool");
  });
});

describe("run metadata storage", () => {
  it("isolates deployments and identities and never serializes the credential", () => {
    const first = scopedRunStorage(
      "deployment-one:secret-key",
      window.sessionStorage,
    );
    const second = scopedRunStorage(
      "deployment-two:secret-key",
      window.sessionStorage,
    );
    first.setItem("lg:stream:thread", "run");
    expect(first.getItem("lg:stream:thread")).toBe("run");
    expect(second.getItem("lg:stream:thread")).toBeNull();
    expect(
      Object.keys(window.sessionStorage).some((key) =>
        key.includes("secret-key"),
      ),
    ).toBe(false);
    first.removeItem("lg:stream:thread");
    expect(first.getItem("lg:stream:thread")).toBeNull();
  });

  it("keeps recovery and stop available when private browsing denies storage", () => {
    const denied = {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
      removeItem() {
        throw new Error("denied");
      },
    };
    const storage = scopedRunStorage("deployment", denied);
    storage.setItem("thread", "run");
    expect(storage.getItem("thread")).toBe("run");
    storage.removeItem("thread");
    expect(storage.getItem("thread")).toBeNull();
  });
});
