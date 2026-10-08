import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { Thread } from "@langchain/langgraph-sdk";
import ThreadHistory from "./index";

const mocks = vi.hoisted(() => ({
  largeScreen: true,
  threads: [] as Thread[],
  threadsLoading: false,
  threadsError: null as string | null,
  refreshThreads: vi.fn(),
}));

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => mocks.largeScreen,
}));
vi.mock("@/providers/Thread", () => ({
  useThreads: () => ({
    threads: mocks.threads,
    threadsLoading: mocks.threadsLoading,
    threadsError: mocks.threadsError,
    refreshThreads: mocks.refreshThreads,
  }),
}));

function row(index: number, overrides: Partial<Thread> = {}): Thread {
  return {
    thread_id: `thread-${index}`,
    created_at: "2026-10-08T00:00:00Z",
    updated_at: "2026-10-08T00:00:00Z",
    state_updated_at: "2026-10-08T00:00:00Z",
    metadata: { title: `Conversation ${index}` },
    status: "idle",
    values: {},
    interrupts: {},
    ...overrides,
  };
}

function renderHistory(props: React.ComponentProps<typeof ThreadHistory> = {}) {
  return render(
    <NuqsTestingAdapter
      searchParams={{ threadId: "thread-1", chatHistoryOpen: "true" }}
    >
      <ThreadHistory {...props} />
    </NuqsTestingAdapter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.largeScreen = true;
  mocks.threads = [row(1), row(2)];
  mocks.threadsLoading = false;
  mocks.threadsError = null;
  mocks.refreshThreads.mockResolvedValue(undefined);
});

describe("conversation history", () => {
  it("refreshes when opened and preserves cached rows during loading", () => {
    mocks.threadsLoading = true;
    renderHistory();
    expect(mocks.refreshThreads).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Conversation 1" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Refreshing conversations…")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Loading conversations"),
    ).not.toBeInTheDocument();
  });

  it("reveals 15 at a time, while search includes every matching conversation", async () => {
    const user = userEvent.setup();
    mocks.threads = Array.from({ length: 31 }, (_, index) => row(index + 1));
    renderHistory();
    expect(screen.getAllByRole("listitem")).toHaveLength(15);
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(30);
    await user.type(
      screen.getByRole("searchbox", { name: "Search chats" }),
      "Conversation",
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(31);
    expect(
      screen.queryByRole("button", { name: "Show more" }),
    ).not.toBeInTheDocument();
  });

  it("shows a no-match state and restores the list after clearing search", async () => {
    const user = userEvent.setup();
    renderHistory();
    const search = screen.getByRole("searchbox", { name: "Search chats" });
    await user.type(search, "no match");
    expect(screen.getByText("No chats match your search.")).toBeInTheDocument();
    await user.clear(search);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("marks the current conversation and keeps a same-thread selection inert", async () => {
    const user = userEvent.setup();
    const onThreadSelect = vi.fn();
    renderHistory({ onThreadSelect });
    const current = screen.getByRole("button", { name: "Conversation 1" });
    expect(current).toHaveAttribute("aria-current", "page");
    await user.click(current);
    expect(onThreadSelect).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Conversation 2" }));
    expect(onThreadSelect).toHaveBeenCalledWith("thread-2");
  });

  it("routes New chat through the shared page transition", async () => {
    const user = userEvent.setup();
    const onNewChat = vi.fn();
    renderHistory({ onNewChat });
    await user.click(screen.getByRole("button", { name: "New chat" }));
    expect(onNewChat).toHaveBeenCalledOnce();
  });

  it("keeps header and search available during the first load", () => {
    mocks.threads = [];
    mocks.threadsLoading = true;
    renderHistory();
    expect(screen.getByLabelText("Loading conversations")).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Search chats" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New chat" })).toBeEnabled();
  });

  it("offers retry for a failed first load", async () => {
    const user = userEvent.setup();
    mocks.threads = [];
    mocks.threadsError = "Network failure";
    renderHistory();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load your chats.",
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refreshThreads).toHaveBeenCalledTimes(2);
  });

  it("retains cached chats and exposes recovery after a failed refresh", async () => {
    const user = userEvent.setup();
    mocks.threadsError = "Network failure";
    renderHistory();
    expect(
      screen.getByText("Could not refresh your chats."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refreshThreads).toHaveBeenCalledTimes(2);
  });

  it("shows the server's busy status beside its originating conversation", () => {
    mocks.threads = [row(1, { status: "busy" }), row(2, { status: "error" })];
    renderHistory();
    expect(screen.getAllByText("Answer in progress")).toHaveLength(1);
  });

  it("provides a titled drawer on narrow screens and closes after selection", async () => {
    const user = userEvent.setup();
    const onThreadSelect = vi.fn();
    mocks.largeScreen = false;
    renderHistory({ onThreadSelect });
    expect(
      screen.getByRole("dialog", { name: "Conversations" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Conversation 2" }));
    expect(onThreadSelect).toHaveBeenCalledWith("thread-2");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
