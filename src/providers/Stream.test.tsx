import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { getApiKey, setApiKey } from "@/lib/api-key";
import { StreamProvider, useStreamContext } from "./Stream";
import { ThreadProvider, useThreads } from "./Thread";

const mocks = vi.hoisted(() => ({
  useStream: vi.fn(),
  createClient: vi.fn(),
  searchThreads: vi.fn(),
  getHistory: vi.fn(),
  listRuns: vi.fn(),
  getRun: vi.fn(),
  cancelRun: vi.fn(),
  submit: vi.fn(),
  stop: vi.fn(),
  joinStream: vi.fn(),
  mutate: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@langchain/langgraph-sdk/react", () => ({
  useStream: mocks.useStream,
}));

vi.mock("./client", () => ({
  createClient: mocks.createClient,
}));

const TRUSTED_URL = "https://trusted.example/api";
const OTHER_URL = "https://other.example/api";
const TEST_KEY = "test-api-key";
const humanMessage = {
  id: "human-1",
  type: "human" as const,
  content: "Compare these companies",
};
const aiMessage = {
  id: "answer-1",
  type: "ai" as const,
  content: "The completed answer",
};

function ConnectedSession() {
  const stream = useStreamContext();
  const { apiUrl } = stream;
  const { getThreads } = useThreads();

  return (
    <div>
      <p>Connected to {apiUrl}</p>
      <button onClick={() => void getThreads()}>Load history</button>
      <button
        onClick={() =>
          void stream.submit(
            { messages: [humanMessage] },
            {
              context: {
                model: "openai:gpt-5.4",
                model_switcher_enabled: false,
              },
              optimisticValues: (previous) => ({
                messages: [...previous.messages, humanMessage],
              }),
            },
          )
        }
      >
        Send
      </button>
      <button onClick={() => void stream.stop()}>Stop</button>
      <button onClick={() => void stream.retry()}>Retry</button>
      <button onClick={() => void stream.retry({})}>Retry Auto</button>
      <button
        onClick={() =>
          void stream.retry({
            context: {
              model: "anthropic:claude-sonnet-5",
              model_switcher_enabled: false,
            },
          })
        }
      >
        Retry Sonnet
      </button>
      <button onClick={() => void stream.requestApi("/api/models")}>
        Models
      </button>
      <p data-testid="run-status">{stream.runStatus}</p>
      <p data-testid="busy">{String(stream.isLoading)}</p>
      <p data-testid="error">
        {stream.error instanceof Error
          ? stream.error.message
          : String(stream.error ?? "")}
      </p>
      <p data-testid="outcomes">{JSON.stringify(stream.runTerminations)}</p>
    </div>
  );
}

function renderSession(searchParams: Record<string, string>) {
  return render(
    <NuqsTestingAdapter searchParams={searchParams}>
      <ThreadProvider>
        <StreamProvider>
          <ConnectedSession />
        </StreamProvider>
      </ThreadProvider>
    </NuqsTestingAdapter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_API_URL", "");
  vi.stubEnv("NEXT_PUBLIC_ASSISTANT_ID", "");
  vi.stubEnv("NEXT_PUBLIC_AUTH_SCHEME", "");
  mocks.useStream.mockReturnValue({
    messages: [],
    values: { messages: [] },
    isLoading: false,
    submit: mocks.submit,
    stop: mocks.stop,
    joinStream: mocks.joinStream,
  });
  mocks.submit.mockResolvedValue(undefined);
  mocks.stop.mockImplementation(async () => {
    mocks.useStream.mock.lastCall?.[0].onStop({ mutate: mocks.mutate });
  });
  mocks.joinStream.mockResolvedValue(undefined);
  mocks.searchThreads.mockResolvedValue([]);
  mocks.getHistory.mockResolvedValue([]);
  mocks.listRuns.mockResolvedValue([]);
  mocks.getRun.mockResolvedValue({ status: "success" });
  mocks.cancelRun.mockResolvedValue(undefined);
  mocks.createClient.mockReturnValue({
    threads: { search: mocks.searchThreads, getHistory: mocks.getHistory },
    runs: { list: mocks.listRuns, get: mocks.getRun, cancel: mocks.cancelRun },
  });
  mocks.fetch.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("deployment and credential selection", () => {
  it("binds a newly entered key to the configured deployment despite a hostile URL parameter", async () => {
    const user = userEvent.setup();
    vi.stubEnv("NEXT_PUBLIC_API_URL", TRUSTED_URL);

    renderSession({ apiUrl: OTHER_URL });

    const deploymentInput = screen.getByLabelText(/deployment url/i);
    expect(deploymentInput).toHaveValue(TRUSTED_URL);
    expect(deploymentInput).toHaveAttribute("readonly");
    await user.type(screen.getByLabelText("LangSmith API Key"), TEST_KEY);
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(mocks.useStream).toHaveBeenLastCalledWith(
        expect.objectContaining({ apiUrl: TRUSTED_URL, apiKey: TEST_KEY }),
      );
    });
    expect(getApiKey(TRUSTED_URL)).toBe(TEST_KEY);
    expect(getApiKey(OTHER_URL)).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledWith(
      `${TRUSTED_URL}/info`,
      expect.any(Object),
    );
    const healthHeaders = mocks.fetch.mock.calls.at(-1)?.[1].headers as Headers;
    expect(healthHeaders.get("X-Api-Key")).toBe(TEST_KEY);

    await user.click(screen.getByRole("button", { name: "Load history" }));

    expect(mocks.createClient).toHaveBeenLastCalledWith(
      TRUSTED_URL,
      TEST_KEY,
      undefined,
    );
  });

  it("uses the configured URL and its key for streaming, health checks, and history", async () => {
    const user = userEvent.setup();
    vi.stubEnv("NEXT_PUBLIC_API_URL", TRUSTED_URL);
    vi.stubEnv("NEXT_PUBLIC_ASSISTANT_ID", "agent");
    vi.stubEnv("NEXT_PUBLIC_AUTH_SCHEME", "langsmith-api-key");
    setApiKey(TRUSTED_URL, TEST_KEY);

    renderSession({ apiUrl: OTHER_URL });

    expect(screen.getByText(`Connected to ${TRUSTED_URL}`)).toBeInTheDocument();
    expect(mocks.useStream).toHaveBeenLastCalledWith(
      expect.objectContaining({
        apiUrl: TRUSTED_URL,
        apiKey: TEST_KEY,
        defaultHeaders: { "X-Auth-Scheme": "langsmith-api-key" },
      }),
    );
    expect(mocks.fetch).toHaveBeenCalledWith(
      `${TRUSTED_URL}/info`,
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const healthHeaders = mocks.fetch.mock.calls.at(-1)?.[1].headers as Headers;
    expect(healthHeaders.get("X-Api-Key")).toBe(TEST_KEY);
    expect(healthHeaders.get("X-Auth-Scheme")).toBe("langsmith-api-key");

    await user.click(screen.getByRole("button", { name: "Load history" }));

    expect(mocks.createClient).toHaveBeenLastCalledWith(
      TRUSTED_URL,
      TEST_KEY,
      "langsmith-api-key",
    );
    expect(mocks.searchThreads).toHaveBeenLastCalledWith({
      metadata: { graph_id: "agent" },
      limit: 200,
      sortBy: "updated_at",
      sortOrder: "desc",
    });
  });

  it("withholds a saved key from another query-selected deployment in every request path", async () => {
    const user = userEvent.setup();
    setApiKey(TRUSTED_URL, TEST_KEY);

    renderSession({ apiUrl: OTHER_URL, assistantId: "agent" });

    expect(mocks.useStream).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiUrl: OTHER_URL, apiKey: "" }),
    );
    expect(mocks.fetch).toHaveBeenCalledWith(
      `${OTHER_URL}/info`,
      expect.any(Object),
    );
    const healthHeaders = mocks.fetch.mock.calls.at(-1)?.[1].headers as Headers;
    expect(healthHeaders.has("X-Api-Key")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Load history" }));

    expect(mocks.createClient).toHaveBeenLastCalledWith(
      OTHER_URL,
      undefined,
      undefined,
    );
  });

  it.each(["", "previous-key"])(
    "uses a newly submitted key immediately when the API URL stays the same (previous key: %s)",
    async (previousKey: string) => {
      const user = userEvent.setup();
      if (previousKey) setApiKey(TRUSTED_URL, previousKey);

      renderSession({ apiUrl: TRUSTED_URL });

      const keyInput = screen.getByLabelText("LangSmith API Key");
      await user.clear(keyInput);
      await user.type(keyInput, TEST_KEY);
      await user.click(screen.getByRole("button", { name: /continue/i }));

      await waitFor(() => {
        expect(mocks.useStream).toHaveBeenLastCalledWith(
          expect.objectContaining({ apiUrl: TRUSTED_URL, apiKey: TEST_KEY }),
        );
      });
      const healthHeaders = mocks.fetch.mock.calls.at(-1)?.[1]
        .headers as Headers;
      expect(healthHeaders.get("X-Api-Key")).toBe(TEST_KEY);

      await user.click(screen.getByRole("button", { name: "Load history" }));

      expect(mocks.createClient).toHaveBeenLastCalledWith(
        TRUSTED_URL,
        TEST_KEY,
        undefined,
      );
    },
  );
});

describe("conversation lifecycle", () => {
  it("keeps resumable runs alive on disconnect and refuses silently queued submissions", async () => {
    const user = userEvent.setup();
    renderSession({ apiUrl: TRUSTED_URL, assistantId: "agent" });
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(mocks.submit).toHaveBeenCalledWith(
      { messages: [humanMessage] },
      expect.objectContaining({
        onDisconnect: "continue",
        multitaskStrategy: "reject",
        streamResumable: true,
        context: { model: "openai:gpt-5.4", model_switcher_enabled: false },
      }),
    );
    expect(mocks.useStream.mock.lastCall?.[0].reconnectOnMount()).toEqual(
      expect.objectContaining({
        getItem: expect.any(Function),
        setItem: expect.any(Function),
        removeItem: expect.any(Function),
      }),
    );
  });

  it("discovers a run left on the server when opening its conversation", async () => {
    mocks.listRuns.mockResolvedValue([
      { run_id: "run-existing", status: "running" },
    ]);
    renderSession({
      apiUrl: TRUSTED_URL,
      assistantId: "agent",
      threadId: "thread-1",
    });
    await waitFor(() =>
      expect(mocks.joinStream).toHaveBeenCalledWith("run-existing"),
    );
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("waits for server cancellation before stopping and clears stale follow-ups", async () => {
    const user = userEvent.setup();
    let finishCancel!: () => void;
    mocks.cancelRun.mockReturnValue(
      new Promise<void>((resolve) => {
        finishCancel = resolve;
      }),
    );
    mocks.useStream.mockReturnValue({
      messages: [humanMessage, aiMessage],
      values: {
        messages: [humanMessage, aiMessage],
        next_prompt_suggestions: ["Old suggestion"],
      },
      isLoading: true,
      submit: mocks.submit,
      stop: mocks.stop,
      joinStream: mocks.joinStream,
    });
    renderSession({
      apiUrl: TRUSTED_URL,
      assistantId: "agent",
      threadId: "thread-1",
    });
    act(() =>
      mocks.useStream.mock.lastCall?.[0].onCreated({
        thread_id: "thread-1",
        run_id: "run-1",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(mocks.cancelRun).toHaveBeenCalledWith("thread-1", "run-1", true);
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(screen.getByTestId("run-status")).toHaveTextContent("stopping");
    expect(screen.getByTestId("busy")).toHaveTextContent("true");
    await act(async () => finishCancel());
    await waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce());
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ next_prompt_suggestions: [] }),
    );
    expect(screen.getByTestId("outcomes")).toHaveTextContent(
      '"answer-1":"stopped"',
    );
  });

  it("keeps the live stream running when server cancellation fails", async () => {
    const user = userEvent.setup();
    mocks.cancelRun.mockRejectedValue(new Error("offline"));
    mocks.useStream.mockReturnValue({
      messages: [humanMessage, aiMessage],
      values: { messages: [humanMessage, aiMessage] },
      isLoading: true,
      submit: mocks.submit,
      stop: mocks.stop,
      joinStream: mocks.joinStream,
    });
    renderSession({
      apiUrl: TRUSTED_URL,
      assistantId: "agent",
      threadId: "thread-1",
    });
    act(() =>
      mocks.useStream.mock.lastCall?.[0].onCreated({
        thread_id: "thread-1",
        run_id: "run-1",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(mocks.cancelRun).toHaveBeenCalledOnce());
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(screen.getByTestId("run-status")).toHaveTextContent("streaming");
    expect(screen.getByTestId("outcomes")).toHaveTextContent("{}");
  });

  it("cancels an early stopped run once its response identifies the run", async () => {
    const user = userEvent.setup();
    mocks.useStream.mockReturnValue({
      messages: [humanMessage],
      values: { messages: [humanMessage] },
      isLoading: true,
      submit: mocks.submit,
      stop: mocks.stop,
      joinStream: mocks.joinStream,
    });
    renderSession({
      apiUrl: TRUSTED_URL,
      assistantId: "agent",
      threadId: "thread-1",
    });
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(mocks.cancelRun).not.toHaveBeenCalled();
    act(() =>
      mocks.useStream.mock.lastCall?.[0].onCreated({
        thread_id: "thread-1",
        run_id: "identified-later",
      }),
    );
    await waitFor(() =>
      expect(mocks.cancelRun).toHaveBeenCalledWith(
        "thread-1",
        "identified-later",
        true,
      ),
    );
    await waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce());
  });

  it("can stop using SSE metadata when a deployment omits the run response header", async () => {
    const user = userEvent.setup();
    mocks.useStream.mockReturnValue({
      messages: [humanMessage],
      values: { messages: [humanMessage] },
      isLoading: true,
      submit: mocks.submit,
      stop: mocks.stop,
      joinStream: mocks.joinStream,
    });
    renderSession({
      apiUrl: TRUSTED_URL,
      assistantId: "agent",
      threadId: "thread-1",
    });
    await user.click(screen.getByRole("button", { name: "Stop" }));
    act(() =>
      mocks.useStream.mock.lastCall?.[0].onMetadataEvent({
        run_id: "metadata-run",
      }),
    );
    await waitFor(() =>
      expect(mocks.cancelRun).toHaveBeenCalledWith(
        "thread-1",
        "metadata-run",
        true,
      ),
    );
    await waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce());
  });

  it("retries a submit that never started without appending the optimistic user message twice", async () => {
    const user = userEvent.setup();
    const handle = {
      messages: [humanMessage],
      values: { messages: [humanMessage] },
      error: undefined as unknown,
      isLoading: false,
      submit: mocks.submit,
      stop: mocks.stop,
      joinStream: mocks.joinStream,
    };
    mocks.useStream.mockReturnValue(handle);
    mocks.submit.mockImplementation(async () => {
      handle.error = new Error("Not accepted");
      mocks.useStream.mock.lastCall?.[0].onError(handle.error, undefined);
    });
    renderSession({
      apiUrl: TRUSTED_URL,
      assistantId: "agent",
      threadId: "thread-1",
    });
    await user.click(screen.getByRole("button", { name: "Send" }));
    mocks.submit.mockImplementation(async () => {
      handle.error = undefined;
    });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.submit).toHaveBeenLastCalledWith(
      { messages: [humanMessage] },
      expect.objectContaining({
        optimisticValues: {
          messages: [humanMessage],
          next_prompt_suggestions: [],
        },
      }),
    );
  });

  it("rejects a lagging completion history that would erase streamed text", async () => {
    mocks.useStream.mockReturnValue({
      messages: [humanMessage, aiMessage],
      values: { messages: [humanMessage, aiMessage] },
      isLoading: false,
      submit: mocks.submit,
      stop: mocks.stop,
      joinStream: mocks.joinStream,
    });
    renderSession({
      apiUrl: TRUSTED_URL,
      assistantId: "agent",
      threadId: "thread-1",
    });
    await waitFor(() => expect(mocks.getHistory).toHaveBeenCalledOnce());
    mocks.getHistory.mockResolvedValue([
      {
        values: { messages: [humanMessage, { ...aiMessage, content: "The" }] },
      },
    ]);
    await act(async () => {
      expect(
        await mocks.useStream.mock.lastCall?.[0].thread.mutate("thread-1"),
      ).toBeNull();
    });
    expect(mocks.useStream.mock.lastCall?.[0].thread.data).toEqual([]);
  });

  it("retries a failed persisted run from the user's checkpoint with its original model pin", async () => {
    const user = userEvent.setup();
    const handle = {
      messages: [humanMessage, aiMessage],
      values: { messages: [humanMessage, aiMessage] },
      error: undefined as unknown,
      isLoading: false,
      submit: mocks.submit,
      stop: mocks.stop,
      joinStream: mocks.joinStream,
    };
    mocks.useStream.mockReturnValue(handle);
    mocks.submit.mockImplementation(async () => {
      mocks.useStream.mock.lastCall?.[0].onCreated({
        thread_id: "thread-1",
        run_id: "failed-run",
      });
      handle.error = new Error("Run failed");
      mocks.useStream.mock.lastCall?.[0].onError(handle.error, {
        thread_id: "thread-1",
        run_id: "failed-run",
      });
    });
    renderSession({
      apiUrl: TRUSTED_URL,
      assistantId: "agent",
      threadId: "thread-1",
    });
    await user.click(screen.getByRole("button", { name: "Send" }));
    mocks.getRun.mockResolvedValue({ status: "error" });
    mocks.getHistory.mockResolvedValue([
      {
        checkpoint: { checkpoint_id: "answer-checkpoint" },
        values: { messages: [humanMessage, aiMessage] },
      },
      {
        checkpoint: { checkpoint_id: "human-checkpoint" },
        values: { messages: [humanMessage] },
      },
    ]);
    mocks.submit.mockImplementation(async () => {
      handle.error = undefined;
    });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.submit).toHaveBeenLastCalledWith(
      undefined,
      expect.objectContaining({
        checkpoint: { checkpoint_id: "human-checkpoint" },
        context: { model: "openai:gpt-5.4", model_switcher_enabled: false },
        optimisticValues: {
          messages: [humanMessage],
          next_prompt_suggestions: [],
        },
      }),
    );
  });

  it("re-runs a reopened persisted failure with the model currently selected by the reader", async () => {
    const user = userEvent.setup();
    mocks.getHistory.mockResolvedValue([
      {
        checkpoint: { checkpoint_id: "failed-answer" },
        values: { messages: [humanMessage, aiMessage] },
        tasks: [{ error: "Run failed" }],
      },
      {
        checkpoint: { checkpoint_id: "human-checkpoint" },
        values: { messages: [humanMessage] },
        tasks: [],
      },
    ]);
    mocks.useStream.mockReturnValue({
      messages: [humanMessage, aiMessage],
      values: { messages: [humanMessage, aiMessage] },
      error: new Error("Run failed"),
      isLoading: false,
      submit: mocks.submit,
      stop: mocks.stop,
      joinStream: mocks.joinStream,
    });
    renderSession({
      apiUrl: TRUSTED_URL,
      assistantId: "agent",
      threadId: "thread-1",
    });
    await waitFor(() =>
      expect(mocks.useStream.mock.lastCall?.[0].thread.data).toHaveLength(2),
    );
    await user.click(screen.getByRole("button", { name: "Retry Sonnet" }));
    expect(mocks.submit).toHaveBeenLastCalledWith(
      undefined,
      expect.objectContaining({
        checkpoint: { checkpoint_id: "human-checkpoint" },
        context: {
          model: "anthropic:claude-sonnet-5",
          model_switcher_enabled: false,
        },
      }),
    );
  });

  it("re-runs a stopped answerless turn from the human checkpoint and honors an explicit Auto choice", async () => {
    const user = userEvent.setup();
    const handle = {
      messages: [humanMessage],
      values: { messages: [humanMessage] },
      isLoading: false,
      submit: mocks.submit,
      stop: mocks.stop,
      joinStream: mocks.joinStream,
    };
    mocks.useStream.mockReturnValue(handle);
    mocks.submit.mockImplementation(() => {
      handle.isLoading = true;
      mocks.useStream.mock.lastCall?.[0].onCreated({
        thread_id: "thread-1",
        run_id: "stopped-early",
      });
      return new Promise<void>(() => {});
    });
    mocks.stop.mockImplementation(async () => {
      handle.isLoading = false;
      mocks.useStream.mock.lastCall?.[0].onStop({ mutate: mocks.mutate });
    });
    renderSession({
      apiUrl: TRUSTED_URL,
      assistantId: "agent",
      threadId: "thread-1",
    });
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() =>
      expect(screen.getByTestId("outcomes")).toHaveTextContent(
        '"human-1":"stopped"',
      ),
    );
    mocks.getHistory.mockResolvedValue([
      {
        checkpoint: { checkpoint_id: "human-checkpoint" },
        values: { messages: [humanMessage] },
        tasks: [],
      },
    ]);
    mocks.submit.mockResolvedValue(undefined);
    await user.click(screen.getByRole("button", { name: "Retry Auto" }));
    expect(mocks.submit).toHaveBeenLastCalledWith(
      undefined,
      expect.objectContaining({
        checkpoint: { checkpoint_id: "human-checkpoint" },
        context: undefined,
        config: undefined,
        optimisticValues: {
          messages: [humanMessage],
          next_prompt_suggestions: [],
        },
      }),
    );
  });

  it("reloads a run already completed successfully instead of submitting it again", async () => {
    const user = userEvent.setup();
    const handle = {
      messages: [humanMessage, aiMessage],
      values: { messages: [humanMessage, aiMessage] },
      error: undefined as unknown,
      isLoading: false,
      submit: mocks.submit,
      stop: mocks.stop,
      joinStream: mocks.joinStream,
    };
    mocks.useStream.mockReturnValue(handle);
    mocks.submit.mockImplementation(async () => {
      handle.error = new Error("Stream transport stopped responding");
      mocks.useStream.mock.lastCall?.[0].onError(handle.error, {
        thread_id: "thread-1",
        run_id: "already-complete",
      });
    });
    renderSession({
      apiUrl: TRUSTED_URL,
      assistantId: "agent",
      threadId: "thread-1",
    });
    await user.click(screen.getByRole("button", { name: "Send" }));
    mocks.getRun.mockResolvedValue({ status: "success" });
    mocks.getHistory.mockResolvedValue([
      { values: { messages: [humanMessage, aiMessage] } },
    ]);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.submit).toHaveBeenCalledOnce();
    expect(mocks.getRun).toHaveBeenCalledWith("thread-1", "already-complete");
    expect(mocks.mutate).toHaveBeenCalledWith({
      messages: [humanMessage, aiMessage],
    });
  });

  it("keeps a failed history reload visible and lets the same recovery load it later", async () => {
    const user = userEvent.setup();
    mocks.getHistory.mockRejectedValue(new Error("History is offline"));
    renderSession({
      apiUrl: TRUSTED_URL,
      assistantId: "agent",
      threadId: "thread-1",
    });
    await waitFor(() => expect(mocks.getHistory).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent(
        "History is offline",
      ),
    );
    expect(screen.getByTestId("run-status")).toHaveTextContent("failed");
    mocks.getHistory.mockResolvedValue([
      { values: { messages: [humanMessage, aiMessage] } },
    ]);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getByTestId("error")).toBeEmptyDOMElement(),
    );
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.mutate).toHaveBeenCalledWith({
      messages: [humanMessage, aiMessage],
    });
  });

  it("locks the composer during recovery, ignores double retries, and lets Stop supersede the pending recovery", async () => {
    const user = userEvent.setup();
    const handle = {
      messages: [humanMessage, aiMessage],
      values: { messages: [humanMessage, aiMessage] },
      error: undefined as unknown,
      isLoading: false,
      submit: mocks.submit,
      stop: mocks.stop,
      joinStream: mocks.joinStream,
    };
    mocks.useStream.mockReturnValue(handle);
    mocks.submit.mockImplementation(async () => {
      handle.error = new Error("Run transport failed");
      mocks.useStream.mock.lastCall?.[0].onError(handle.error, {
        thread_id: "thread-1",
        run_id: "pending-recovery",
      });
    });
    let resolveStatus!: (run: { status: string }) => void;
    mocks.getRun.mockReturnValue(
      new Promise<{ status: string }>((resolve) => {
        resolveStatus = resolve;
      }),
    );
    renderSession({
      apiUrl: TRUSTED_URL,
      assistantId: "agent",
      threadId: "thread-1",
    });
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByTestId("busy")).toHaveTextContent("true");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.getRun).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce());
    await act(async () => resolveStatus({ status: "error" }));
    expect(mocks.submit).toHaveBeenCalledOnce();
    expect(screen.getByTestId("run-status")).toHaveTextContent("stopped");
    expect(screen.getByTestId("error")).toBeEmptyDOMElement();
  });

  it("uses deployment-bound authentication for rich-output API requests", async () => {
    const user = userEvent.setup();
    setApiKey(TRUSTED_URL, TEST_KEY);
    renderSession({
      apiUrl: TRUSTED_URL,
      assistantId: "agent",
      authScheme: "langsmith-api-key",
    });
    await user.click(screen.getByRole("button", { name: "Models" }));
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      `${TRUSTED_URL}/api/models`,
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const headers = mocks.fetch.mock.lastCall?.[1].headers as Headers;
    expect(headers.get("X-Api-Key")).toBe(TEST_KEY);
    expect(headers.get("X-Auth-Scheme")).toBe("langsmith-api-key");
  });
});
