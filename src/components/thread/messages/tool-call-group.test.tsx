import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToolCallGroup } from "./tool-call-group";
import { ToolMessage } from "@langchain/langgraph-sdk";

const baseCall = {
  name: "scan",
  id: "call_abc123",
  args: { symbol: "RELIANCE", lookback_period: 5 },
  type: "tool_call" as const,
};

function makeResponse(
  content: string,
  status: ToolMessage["status"] = "success",
): ToolMessage {
  return {
    type: "tool",
    id: "resp_1",
    tool_call_id: "call_abc123",
    content,
    status,
  };
}

describe("<ToolCallGroup />", () => {
  it("renders the formatted tool label and a Running status when no response", () => {
    render(<ToolCallGroup toolCall={baseCall} />);

    expect(screen.getByText("Scanning the market")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("uses the resting friendly label and accessible completion without a status pill", () => {
    render(
      <ToolCallGroup
        toolCall={baseCall}
        response={makeResponse('{"ok": true}')}
      />,
    );
    expect(screen.getByText("Scan the market")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toHaveClass("sr-only");
  });

  it("renders an Error status when response.status is error", () => {
    render(
      <ToolCallGroup
        toolCall={baseCall}
        response={makeResponse("boom", "error")}
      />,
    );
    expect(screen.getByText("Scan the market · failed")).toBeInTheDocument();
  });

  it("body is collapsed by default and reveals arguments + response on click", async () => {
    const user = userEvent.setup();
    render(
      <ToolCallGroup
        toolCall={baseCall}
        response={makeResponse('{"hits": 3}')}
      />,
    );

    expect(screen.queryByText("Request parameters")).not.toBeInTheDocument();
    expect(screen.queryByText("Response")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /expand tool call/i }));

    expect(screen.getByText("Request parameters")).toBeInTheDocument();
    expect(screen.getByText("Response")).toBeInTheDocument();
    // Parsed response key visible (JsonViewer default-expands root)
    expect(screen.getByText('"hits"')).toBeInTheDocument();
  });

  it("parses stringified JSON responses into the tree view", async () => {
    const user = userEvent.setup();
    render(
      <ToolCallGroup
        toolCall={baseCall}
        response={makeResponse(JSON.stringify({ total: 42, items: [1, 2] }))}
      />,
    );
    await user.click(screen.getByRole("button", { name: /expand/i }));

    expect(screen.getByText('"total"')).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("falls back to plain text display when response is not JSON", async () => {
    const user = userEvent.setup();
    render(
      <ToolCallGroup
        toolCall={baseCall}
        response={makeResponse("just a plain error message")}
      />,
    );
    await user.click(screen.getByRole("button", { name: /expand/i }));

    expect(screen.getByText(/just a plain error message/)).toBeInTheDocument();
  });

  it("shows an explicit pending response while the tool is still running", async () => {
    const user = userEvent.setup();
    render(<ToolCallGroup toolCall={baseCall} />);
    await user.click(screen.getByRole("button", { name: /expand/i }));

    expect(screen.getByText("Request parameters")).toBeInTheDocument();
    expect(screen.getByText("No response yet.")).toBeInTheDocument();
  });

  it("renders an empty-args placeholder when there are no arguments", async () => {
    const user = userEvent.setup();
    render(
      <ToolCallGroup
        toolCall={{ ...baseCall, args: {} }}
        response={makeResponse('{"ok": 1}')}
      />,
    );
    await user.click(screen.getByRole("button", { name: /expand/i }));

    expect(screen.getByText("{}")).toBeInTheDocument();
  });
});
