import { describe, expect, it } from "vitest";
import type { Message } from "@langchain/langgraph-sdk";
import {
  ensureToolCallsHaveResponses,
  DO_NOT_RENDER_ID_PREFIX,
} from "./ensure-tool-responses";

const calls: Message = {
  type: "ai",
  content: "",
  tool_calls: [
    { id: "a", name: "prices", args: {} },
    { id: "b", name: "filings", args: {} },
  ],
};
describe("interrupted tool response repair", () => {
  it("repairs only missing parallel responses", () => {
    const result = ensureToolCallsHaveResponses([
      calls,
      { type: "tool", tool_call_id: "b", content: "ok" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "tool",
      tool_call_id: "a",
      content: "Tool call interrupted before a response was received.",
    });
    expect(result[0].id).toMatch(new RegExp(`^${DO_NOT_RENDER_ID_PREFIX}`));
  });
  it("recognizes out-of-order non-adjacent responses", () => {
    expect(
      ensureToolCallsHaveResponses([
        calls,
        { type: "ai", content: "Working" },
        { type: "tool", tool_call_id: "b", content: "ok" },
        { type: "tool", tool_call_id: "a", content: "ok" },
      ]),
    ).toEqual([]);
  });
  it("leaves ID-less calls alone", () => {
    expect(
      ensureToolCallsHaveResponses([
        { type: "ai", content: "", tool_calls: [{ name: "prices", args: {} }] },
      ]),
    ).toEqual([]);
  });
});
