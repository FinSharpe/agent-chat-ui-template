import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { normalizeInterruptForClient } from "@langchain/langgraph-sdk/ui";
import type { Message } from "@langchain/langgraph-sdk";
import { ArtifactProvider } from "../artifact";
import { AssistantMessage } from "./ai";

const mocks = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/providers/Stream", () => ({
  useStreamContext: () => mocks.current,
}));
vi.mock("@langchain/langgraph-sdk/react-ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  LoadExternalComponent: ({ message }: { message: { id: string } }) => (
    <p>Custom view {message.id}</p>
  ),
}));

const answer: Message = {
  type: "ai",
  id: "answer",
  content: "Please review the action.",
};
function hitl(id: string, name: string) {
  // The installed SDK supplies both modern camelCase and snake_case aliases
  // while keeping the original interrupt envelope and its identity.
  return normalizeInterruptForClient({
    id,
    value: {
      actionRequests: [{ name, args: { symbol: "INFY" } }],
      reviewConfigs: [{ action_name: name, allowedDecisions: ["approve"] }],
    },
  });
}

function show({
  interrupt,
  interrupts,
  message = answer,
  messages = [message],
  ui,
}: {
  interrupt?: unknown;
  interrupts?: unknown[];
  message?: Message;
  messages?: Message[];
  ui?: unknown[];
} = {}) {
  mocks.current = {
    messages,
    values: { messages, ui },
    interrupt,
    interrupts,
    getMessagesMetadata: () => undefined,
    submit: vi.fn(),
    setBranch: vi.fn(),
    isLoading: false,
  };
  return render(
    <NuqsTestingAdapter>
      <ArtifactProvider>
        <AssistantMessage
          message={message}
          isLoading={false}
          handleRegenerate={() => {}}
        />
      </ArtifactProvider>
    </NuqsTestingAdapter>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(async () => new Response(new Uint8Array([0, 1, 2]))),
  );
});

describe("SDK interrupt routing in assistant messages", () => {
  it("keeps a modern HITL envelope and submits the existing approve decision contract", () => {
    const interrupt = hitl("approval-a", "Review trade");
    show({ interrupt });
    expect(screen.getByText("Review trade")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Human Interrupt" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(mocks.current.submit).toHaveBeenCalledWith(
      {},
      { command: { resume: { decisions: [{ type: "approve" }] } } },
    );
  });

  it("uses every pending SDK interrupt rather than only its singular first-item alias", () => {
    const first = hitl("approval-a", "Review trade");
    const second = hitl("approval-b", "Review allocation");
    show({ interrupt: first, interrupts: [first, second] });
    const secondTab = screen.getByRole("button", { name: "Review allocation" });
    fireEvent.click(secondTab);
    expect(secondTab).toBeInTheDocument();
    expect(
      screen.getByText("Review allocation", { selector: "p" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(mocks.current.submit).toHaveBeenCalledWith(
      {},
      {
        command: {
          resume: { "approval-b": { decisions: [{ type: "approve" }] } },
        },
      },
    );
  });

  it.each([false, true])(
    "keeps mixed HITL and generic values visible, generic-first=%s",
    (genericFirst) => {
      const approval = hitl("approval-a", "Review trade");
      const question = {
        id: "question-a",
        value: { question: "Confirm the settlement date?" },
      };
      const interrupts = genericFirst
        ? [question, approval]
        : [approval, question];
      show({ interrupt: interrupts[0], interrupts });
      expect(
        screen.getByRole("button", { name: "Approve" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Human Interrupt" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Confirm the settlement date?"),
      ).toBeInTheDocument();
      expect(screen.queryByText("question-a")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      expect(mocks.current.submit).toHaveBeenCalledWith(
        {},
        {
          command: {
            resume: { "approval-a": { decisions: [{ type: "approve" }] } },
          },
        },
      );
    },
  );

  it.each(["Approve All", "Submit all 2 decisions"])(
    "targets the selected interrupt for %s",
    (method) => {
      const first = hitl("approval-a", "Review trade");
      const selected = normalizeInterruptForClient({
        id: "approval-b",
        value: {
          actionRequests: [
            { name: "Trade one", args: {} },
            { name: "Trade two", args: {} },
          ],
          reviewConfigs: [
            { action_name: "Trade one", allowedDecisions: ["approve"] },
            { action_name: "Trade two", allowedDecisions: ["approve"] },
          ],
        },
      });
      show({ interrupt: first, interrupts: [first, selected] });
      fireEvent.click(screen.getByRole("button", { name: "Trade one" }));
      if (method.startsWith("Submit")) {
        fireEvent.click(screen.getByRole("button", { name: "Approve" }));
        fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      }
      fireEvent.click(screen.getByRole("button", { name: method }));
      expect(mocks.current.submit).toHaveBeenCalledWith(
        {},
        {
          command: {
            resume: {
              "approval-b": {
                decisions: [{ type: "approve" }, { type: "approve" }],
              },
            },
          },
        },
      );
    },
  );

  it("shows generic array values without their transport envelopes", () => {
    show({
      interrupt: [
        { id: "envelope-a", value: { question: "Date?" } },
        { id: "envelope-b", value: "Confirm?" },
      ],
    });
    expect(screen.getByText(/Date\?/)).toBeInTheDocument();
    expect(screen.getByText("Confirm?")).toBeInTheDocument();
    expect(screen.queryByText(/envelope-/)).not.toBeInTheDocument();
  });

  it.each([null, false, 0, "Confirm?"])(
    "preserves a generic scalar value %s",
    (value) => {
      show({ interrupt: { id: "generic", value } });
      expect(
        screen.getByRole("heading", { name: "Human Interrupt" }),
      ).toBeInTheDocument();
      expect(screen.getByText(String(value))).toBeInTheDocument();
    },
  );

  it("preserves the SDK breakpoint interruption", () => {
    show({ interrupt: { when: "breakpoint" } });
    expect(screen.getByText("breakpoint")).toBeInTheDocument();
  });

  it("keeps malformed HITL values in the generic fallback", () => {
    show({
      interrupt: {
        id: "bad",
        value: { action_requests: [], review_configs: [] },
      },
    });
    expect(
      screen.getByRole("heading", { name: "Human Interrupt" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve" }),
    ).not.toBeInTheDocument();
  });

  it("shows interruptions only beneath the last message", () => {
    const newer: Message = {
      type: "ai",
      id: "newer",
      content: "Latest message.",
    };
    show({
      interrupt: hitl("approval-a", "Review trade"),
      messages: [answer, newer],
    });
    expect(
      screen.queryByRole("button", { name: "Approve" }),
    ).not.toBeInTheDocument();
  });

  it("preserves inline reports and custom UI alongside a pending approval", async () => {
    const report: Message = {
      type: "tool",
      id: "report",
      tool_call_id: "call-report",
      content: "Report ready",
      additional_kwargs: {
        mcp_app: {
          html: "<html><head></head><body><p>Report</p></body></html>",
          structuredContent: { symbol: "INFY" },
          title: "Stock report",
        },
      },
    };
    show({
      interrupt: hitl("approval-a", "Review trade"),
      message: report,
      ui: [{ id: "report-ui", metadata: { message_id: "report" } }],
    });
    expect(await screen.findByTitle("Stock report")).toBeInTheDocument();
    expect(screen.getByText("Custom view report-ui")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });
});
