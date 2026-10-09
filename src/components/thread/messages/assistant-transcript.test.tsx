import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { Checkpoint, Message } from "@langchain/langgraph-sdk";
import { DO_NOT_RENDER_ID_PREFIX } from "@/lib/ensure-tool-responses";
import { ArtifactProvider } from "../artifact";
import { AssistantTranscript } from "./assistant-transcript";

const mocks = vi.hoisted(() => ({
  stream: {} as Record<string, unknown>,
  regenerate: vi.fn(),
  setBranch: vi.fn(),
}));
vi.mock("@/providers/Stream", () => ({
  useStreamContext: () => mocks.stream,
}));
vi.mock("./human", () => ({
  HumanMessage: ({ message }: { message: Message }) => (
    <p>{String(message.content)}</p>
  ),
}));
vi.mock("./mcp-app", () => ({
  getMcpApp: (
    message: Message & { additional_kwargs?: { mcp_app?: unknown } },
  ) => message.additional_kwargs?.mcp_app,
  McpAppReport: () => <section aria-label="Report">Inline report</section>,
}));

const human = (id: string): Message => ({ type: "human", id, content: id });
const ai = (id: string, content: string): Message => ({
  type: "ai",
  id,
  content,
});
const checkpoint = (id: string): Checkpoint => ({
  thread_id: "thread",
  checkpoint_ns: "",
  checkpoint_id: id,
  checkpoint_map: {},
});
function view(messages: Message[], isLoading = false) {
  mocks.stream.messages = messages;
  mocks.stream.values = { messages };
  return (
    <NuqsTestingAdapter>
      <ArtifactProvider>
        <AssistantTranscript
          messages={messages}
          isLoading={isLoading}
          handleRegenerate={mocks.regenerate}
        />
      </ArtifactProvider>
    </NuqsTestingAdapter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stream = {
    getMessagesMetadata: (message: Message) => ({
      firstSeenState: { parent_checkpoint: checkpoint(message.id ?? "idless") },
    }),
    setBranch: mocks.setBranch,
  };
});

describe("assistant turn actions", () => {
  it("mounts copy and retry only beneath the final answer, preserving its checkpoint", () => {
    const intro: Message = {
      ...ai("intro", "Let me retrieve the data."),
      type: "ai",
      tool_calls: [{ id: "lookup", name: "get_financials", args: {} }],
    };
    const result: Message = {
      type: "tool",
      id: "result",
      tool_call_id: "lookup",
      content: "Retrieved",
    };
    const answer = ai("answer", "Here is the analysis.");
    const { container } = render(
      view([human("question"), intro, result, answer]),
    );
    expect(
      screen.getAllByRole("button", { name: "Copy content" }),
    ).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Run again" })).toHaveLength(
      1,
    );
    expect(container.querySelectorAll(".message-actions")).toHaveLength(1);
    expect(
      screen
        .getByText("Let me retrieve the data.")
        .closest(".group")
        ?.querySelector(".message-actions"),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Run again" }));
    expect(mocks.regenerate).toHaveBeenCalledWith(checkpoint("answer"), answer);
  });

  it("keeps one action row per historical turn while the current turn streams", () => {
    const messages = [
      human("first"),
      ai("a", "First interim"),
      ai("b", "First answer"),
      human("second"),
      ai("c", "Second interim"),
      ai("d", "Second answer"),
    ];
    const { rerender } = render(view(messages, true));
    expect(screen.getAllByRole("button", { name: "Run again" })).toHaveLength(
      1,
    );
    expect(
      screen
        .getByText("First answer")
        .closest(".group")
        ?.querySelector(".message-actions"),
    ).not.toBeNull();
    expect(
      screen
        .getByText("Second answer")
        .closest(".group")
        ?.querySelector(".message-actions"),
    ).toBeNull();
    rerender(view(messages));
    expect(screen.getAllByRole("button", { name: "Run again" })).toHaveLength(
      2,
    );
  });

  it("adds the final row on completion and moves it when a new answer arrives", () => {
    const question = human("question");
    const first = ai("a", "Working on it.");
    const { container, rerender } = render(view([question, first], true));
    expect(container.querySelector(".message-actions")).toBeNull();
    rerender(view([question, { ...first }]));
    expect(screen.getAllByRole("button", { name: "Run again" })).toHaveLength(
      1,
    );
    const final = ai("b", "Finished.");
    rerender(view([question, { ...first }, final]));
    expect(screen.getAllByRole("button", { name: "Run again" })).toHaveLength(
      1,
    );
    expect(
      screen
        .getByText("Working on it.")
        .closest(".group")
        ?.querySelector(".message-actions"),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Run again" }));
    expect(mocks.regenerate).toHaveBeenCalledWith(checkpoint("b"), final);
  });

  it("ignores hidden helpers and empty tool messages, even when a report follows the answer", () => {
    const report: Message = {
      type: "tool",
      id: "report",
      tool_call_id: "report-call",
      content: "Report",
      additional_kwargs: { mcp_app: { html: "<p>Report</p>" } },
    };
    render(
      view([
        human("question"),
        ai("answer", "The report is ready."),
        ai("empty", "   "),
        report,
        ai(`${DO_NOT_RENDER_ID_PREFIX}hidden`, "Synthetic text"),
      ]),
    );
    expect(screen.getByRole("region", { name: "Report" })).toBeInTheDocument();
    expect(screen.queryByText("Synthetic text")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Run again" })).toHaveLength(
      1,
    );
  });

  it("handles leading ID-less answers and leaves tool-only turns without empty action rows", () => {
    const first: Message = { type: "ai", content: "First" };
    const last: Message = { type: "ai", content: "Last" };
    const { container, rerender } = render(view([first, last]));
    expect(
      screen.getAllByRole("button", { name: "Copy content" }),
    ).toHaveLength(1);
    expect(
      screen
        .getByText("First")
        .closest(".group")
        ?.querySelector(".message-actions"),
    ).toBeNull();
    rerender(
      view([
        human("question"),
        {
          type: "ai",
          id: "tool-only",
          content: "",
          tool_calls: [{ id: "lookup", name: "get_financials", args: {} }],
        },
      ]),
    );
    expect(container.querySelector(".message-actions")).toBeNull();
  });

  it("keeps an intermediate message's branch navigation without repeating copy or retry", () => {
    mocks.stream.getMessagesMetadata = (message: Message) =>
      message.id === "a"
        ? { branch: "branch-1", branchOptions: ["branch-1", "branch-2"] }
        : undefined;
    render(view([human("question"), ai("a", "Interim"), ai("b", "Final")]));
    expect(
      screen.getAllByRole("button", { name: "Copy content" }),
    ).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Run again" })).toHaveLength(
      1,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next branch" }));
    expect(mocks.setBranch).toHaveBeenCalledWith("branch-2");
  });

  it.each(["stopped", "failed"])(
    "keeps retry available after a %s turn",
    (runStatus) => {
      mocks.stream.runStatus = runStatus;
      render(
        view([
          human("question"),
          ai("a", "Interim"),
          ai("b", "Partial answer"),
        ]),
      );
      expect(screen.getByRole("button", { name: "Run again" })).toBeEnabled();
      expect(
        screen.getAllByRole("button", { name: "Copy content" }),
      ).toHaveLength(1);
    },
  );
});
