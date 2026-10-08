import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import type { Thread } from "@langchain/langgraph-sdk";
import { ThreadProvider, useThreads } from "./Thread";

const mocks = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("./client", () => ({
  createClient: () => ({ threads: { search: mocks.search } }),
}));

const row = (id: string) =>
  ({ thread_id: id, values: {}, metadata: {} }) as Thread;

function HistoryProbe({ autoRefresh = false }: { autoRefresh?: boolean }) {
  const history = useThreads();
  const { refreshThreads } = history;
  useEffect(() => {
    if (autoRefresh) void refreshThreads();
  }, [autoRefresh, refreshThreads]);
  return (
    <div>
      <button onClick={() => void history.refreshThreads()}>Refresh</button>
      <p data-testid="rows">
        {history.threads.map((thread) => thread.thread_id).join(",")}
      </p>
      <p data-testid="loading">{String(history.threadsLoading)}</p>
      <p role="status">{history.threadsError}</p>
    </div>
  );
}

function renderHistory(autoRefresh = false) {
  return render(
    <NuqsTestingAdapter
      searchParams={{ apiUrl: "https://example.com", assistantId: "agent" }}
    >
      <ThreadProvider>
        <HistoryProbe autoRefresh={autoRefresh} />
      </ThreadProvider>
    </NuqsTestingAdapter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_API_URL", "");
  vi.stubEnv("NEXT_PUBLIC_ASSISTANT_ID", "");
  vi.stubEnv("NEXT_PUBLIC_AUTH_SCHEME", "");
  mocks.search.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

describe("cached conversation history", () => {
  it("accepts the history surface's initial automatic refresh", async () => {
    mocks.search.mockResolvedValueOnce([row("initial")]);
    renderHistory(true);
    await waitFor(() =>
      expect(screen.getByTestId("rows")).toHaveTextContent("initial"),
    );
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });
  it("keeps cached rows visible through refresh failures and exposes a working retry", async () => {
    const user = userEvent.setup();
    mocks.search.mockResolvedValueOnce([row("one"), row("one"), row("two")]);
    renderHistory();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(screen.getByTestId("rows")).toHaveTextContent("one,two"),
    );
    mocks.search.mockRejectedValueOnce(new Error("offline"));
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Could not load"),
    );
    expect(screen.getByTestId("rows")).toHaveTextContent("one,two");
    mocks.search.mockResolvedValueOnce([row("latest")]);
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(screen.getByTestId("rows")).toHaveTextContent("latest"),
    );
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(mocks.search).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sortBy: "updated_at",
        sortOrder: "desc",
        limit: 200,
      }),
    );
  });

  it("discards an older refresh arriving after a newer snapshot", async () => {
    const user = userEvent.setup();
    let firstResolve!: (value: Thread[]) => void;
    mocks.search.mockReturnValueOnce(
      new Promise<Thread[]>((resolve) => {
        firstResolve = resolve;
      }),
    );
    mocks.search.mockResolvedValueOnce([row("new")]);
    renderHistory();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(screen.getByTestId("rows")).toHaveTextContent("new"),
    );
    await act(async () => firstResolve([row("old")]));
    expect(screen.getByTestId("rows")).toHaveTextContent("new");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });
});
