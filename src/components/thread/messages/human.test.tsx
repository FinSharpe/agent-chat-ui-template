import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Message } from "@langchain/langgraph-sdk";
import { modelSubmissionOptions } from "@/lib/chat-models";
import { HumanMessage } from "./human";

const { stream } = vi.hoisted(() => ({
  stream: { submit: vi.fn(), getMessagesMetadata: vi.fn(), setBranch: vi.fn() },
}));
vi.mock("@/providers/Stream", () => ({ useStreamContext: () => stream }));

const checkpoint = {
  thread_id: "thread-1",
  checkpoint_ns: "",
  checkpoint_id: "before-human",
};
const branchValues = {
  messages: [{ type: "human", id: "earlier", content: "Earlier turn" }],
  next_prompt_suggestions: ["Previous suggestion"],
};
const attachments = [
  {
    type: "image",
    mimeType: "image/png",
    data: "aW1hZ2U=",
    metadata: { name: "chart.png" },
  },
  {
    type: "file",
    mimeType: "application/pdf",
    data: "cGRm",
    metadata: { filename: "annual-report.pdf" },
  },
  { type: "image_url", image_url: { url: "https://example.com/chart.png" } },
  {
    type: "audio",
    source_type: "base64",
    data: "YXVkaW8=",
    mimeType: "audio/wav",
  },
];
const originalContent = [
  { type: "text", text: "Original question" },
  attachments[0],
  { type: "text", text: "Additional context" },
  ...attachments.slice(1),
];
const multimodalMessage: Message = {
  type: "human",
  id: "human-1",
  content: originalContent as unknown as Message["content"],
};

describe("HumanMessage edited submissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    stream.getMessagesMetadata.mockReturnValue({
      branch: "current",
      branchOptions: ["current", "other"],
      firstSeenState: { parent_checkpoint: checkpoint, values: branchValues },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("replaces prose while preserving existing attachments, model options, and branch ancestry", async () => {
    const user = userEvent.setup();
    const guard = vi.fn().mockReturnValue(true);
    const submissionOptions = modelSubmissionOptions("openai:gpt-5", true);
    const getSubmitOptions = vi.fn(() => submissionOptions);
    render(
      <HumanMessage
        message={multimodalMessage}
        isLoading={false}
        canSubmitMessage={guard}
        getSubmitOptions={getSubmitOptions}
      />,
    );
    expect(screen.getByText("annual-report.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const editor = screen.getByRole("textbox");
    expect(editor).toHaveValue("Original question Additional context");
    await user.clear(editor);
    await user.type(editor, "Revised question");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(guard).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "human",
        content: [{ type: "text", text: "Revised question" }, ...attachments],
      }),
    );
    expect(stream.submit).toHaveBeenCalledTimes(1);
    const [input, options] = stream.submit.mock.calls[0];
    expect(input.messages[0].content).toEqual([
      { type: "text", text: "Revised question" },
      ...attachments,
    ]);
    expect(options).toMatchObject({
      ...submissionOptions,
      checkpoint,
      streamMode: ["values"],
      streamSubgraphs: true,
      streamResumable: true,
    });
    expect(options.optimisticValues({ messages: [] })).toMatchObject({
      ...branchValues,
      messages: [...branchValues.messages, input.messages[0]],
    });
    expect(getSubmitOptions).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(multimodalMessage.content).toEqual(originalContent);
  });

  it("keeps an edited draft open when the guard rejects it and allows retrying that same draft", async () => {
    const user = userEvent.setup();
    const guard = vi.fn().mockReturnValue(false);
    const getSubmitOptions = vi.fn(() => modelSubmissionOptions("auto", true));
    render(
      <HumanMessage
        message={multimodalMessage}
        isLoading={false}
        canSubmitMessage={guard}
        getSubmitOptions={getSubmitOptions}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Keep this draft");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(stream.submit).not.toHaveBeenCalled();
    expect(getSubmitOptions).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("Keep this draft");
    expect(guard).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: [{ type: "text", text: "Keep this draft" }, ...attachments],
      }),
    );

    guard.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(stream.submit.mock.calls[0][0].messages[0].content).toEqual([
      { type: "text", text: "Keep this draft" },
      ...attachments,
    ]);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does not submit or discard a draft when a run starts while editing", async () => {
    const user = userEvent.setup();
    const guard = vi.fn().mockReturnValue(true);
    const { rerender } = render(
      <HumanMessage
        message={multimodalMessage}
        isLoading={false}
        canSubmitMessage={guard}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Draft during a run");
    rerender(
      <HumanMessage
        message={multimodalMessage}
        isLoading
        canSubmitMessage={guard}
      />,
    );
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    expect(screen.getByRole("textbox")).toHaveValue("Draft during a run");
    expect(stream.submit).not.toHaveBeenCalled();
    expect(guard).not.toHaveBeenCalled();
  });

  it("rejects an empty text-only edit without closing the editor", async () => {
    const user = userEvent.setup();
    const guard = vi.fn().mockReturnValue(true);
    render(
      <HumanMessage
        message={{ type: "human", id: "text-only", content: "Original" }}
        isLoading={false}
        canSubmitMessage={guard}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "   ");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(stream.submit).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("   ");
  });

  it("allows clearing the prose of a multimodal message while retaining all attachments", async () => {
    const user = userEvent.setup();
    const guard = vi.fn().mockReturnValue(true);
    render(
      <HumanMessage
        message={multimodalMessage}
        isLoading={false}
        canSubmitMessage={guard}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByRole("textbox"));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(guard).toHaveBeenCalledWith(
      expect.objectContaining({ content: attachments }),
    );
    expect(stream.submit.mock.calls[0][0].messages[0].content).toEqual(
      attachments,
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("keeps a string message's content shape when editing with Command+Enter", async () => {
    const user = userEvent.setup();
    render(
      <HumanMessage
        message={{ type: "human", id: "plain", content: "Original" }}
        isLoading={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Edited text");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    expect(stream.submit.mock.calls[0][0].messages[0].content).toBe(
      "Edited text",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("ignores the submit shortcut while an IME composition is active", async () => {
    const user = userEvent.setup();
    const guard = vi.fn().mockReturnValue(true);
    render(
      <HumanMessage
        message={{ type: "human", id: "ime", content: "Original" }}
        isLoading={false}
        canSubmitMessage={guard}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const editor = screen.getByRole("textbox");
    fireEvent.keyDown(editor, {
      key: "Enter",
      ctrlKey: true,
      isComposing: true,
    });
    expect(stream.submit).not.toHaveBeenCalled();
    expect(guard).not.toHaveBeenCalled();
    expect(editor).toHaveValue("Original");
    fireEvent.keyDown(editor, {
      key: "Enter",
      ctrlKey: true,
      isComposing: false,
    });
    expect(stream.submit.mock.calls[0][0].messages[0].content).toBe("Original");
  });
});
