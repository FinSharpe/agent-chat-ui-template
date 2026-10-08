import { describe, expect, it } from "vitest";
import type { AIMessage, Message, ToolMessage } from "@langchain/langgraph-sdk";
import { getToolCalls, projectConversation } from "./tool-activity";

function ai(id: string, names: string[], content = ""): AIMessage {
  return {
    type: "ai",
    id,
    content,
    tool_calls: names.map((name) => ({
      id: name,
      name,
      args: {},
      type: "tool_call",
    })),
  };
}
function result(id: string, extra = {}): ToolMessage {
  return { type: "tool", tool_call_id: id, content: "{}", ...extra };
}

describe("inline conversation projection", () => {
  it("keeps calls between their assistant prose and pairs parallel results in call order", () => {
    const messages = [
      ai("a", ["first", "second"], "Before"),
      result("second"),
      result("first"),
      ai("b", [], "After"),
    ];
    const parts = projectConversation(messages);
    expect(parts.map((part) => part.kind)).toEqual([
      "message",
      "tools",
      "message",
    ]);
    expect(
      parts[1].kind === "tools" &&
        parts[1].steps.map((step) => [step.key, step.response?.tool_call_id]),
    ).toEqual([
      ["first", "first"],
      ["second", "second"],
    ]);
    expect(
      parts.filter(
        (part) => part.kind === "message" && part.message.type === "tool",
      ),
    ).toHaveLength(0);
  });

  it("joins consecutive rounds locally, with prose a hard boundary", () => {
    const parts = projectConversation([
      ai("a", ["one"]),
      result("one"),
      ai("b", ["two", "three"]),
      ai("c", ["four"], "A finding"),
      result("four"),
    ]);
    expect(
      parts.map((part) =>
        part.kind === "tools"
          ? part.steps.map((step) => step.key)
          : part.message.content,
      ),
    ).toEqual([["one", "two", "three"], "A finding", ["four"]]);
  });

  it("keeps a report beside its originating batch even when it has no message ID", () => {
    const report = result("report", {
      additional_kwargs: { mcp_app: { html: "<h1>Report</h1>" } },
    });
    const parts = projectConversation([
      ai("a", ["lookup", "report"]),
      report,
      ai("b", ["later"]),
      result("lookup"),
    ]);
    expect(
      parts.map((part) =>
        part.kind === "tools"
          ? part.steps.map((step) => step.key)
          : part.message,
      ),
    ).toEqual([["lookup", "report"], report, ["later"]]);
  });

  it("preserves unpaired historic output and custom UI boundaries", () => {
    const orphan = result("old", { id: "old-result" });
    const custom = ai("custom", [], "");
    const parts = projectConversation(
      [orphan, ai("a", ["one"]), custom, ai("b", ["two"])],
      (message) => message.id === "custom",
    );
    expect(parts.map((part) => part.kind)).toEqual([
      "message",
      "tools",
      "message",
      "tools",
    ]);
  });

  it("places a report after its originating call before later siblings in the same message", () => {
    const report = result("report", {
      id: "report-output",
      additional_kwargs: { mcp_app: { html: "<h1>Report</h1>" } },
    });
    const parts = projectConversation([
      ai("a", ["report", "two", "three"]),
      result("two"),
      result("three"),
      report,
    ]);
    expect(
      parts.map((part) =>
        part.kind === "tools"
          ? part.steps.map((step) => step.key)
          : part.message,
      ),
    ).toEqual([["report"], report, ["two", "three"]]);
  });

  it("recognizes Anthropic object and partial JSON inputs without duplicating top-level calls", () => {
    const message = {
      type: "ai",
      content: [
        {
          type: "tool_use",
          id: "call",
          name: "scan",
          input: { symbol: "ABC" },
        },
      ],
    } as unknown as Message;
    expect(getToolCalls(message)[0].args).toEqual({ symbol: "ABC" });
    message.content = [
      { type: "tool_use", id: "call", name: "scan", input: '{"symbol":"ABC"' },
    ] as unknown as Message["content"];
    expect(getToolCalls(message)[0].args).toEqual({ symbol: "ABC" });
  });
});
