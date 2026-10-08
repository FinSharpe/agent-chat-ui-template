import { useEffect, useState, type ReactNode } from "react";
import type { Thread } from "@langchain/langgraph-sdk";
import { parseAsBoolean, useQueryState } from "nuqs";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useThreads } from "@/providers/Thread";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  filterThreadHistory,
  getThreadHistoryGroup,
  getThreadTitle,
  THREAD_HISTORY_BATCH_SIZE,
  THREAD_HISTORY_GROUPS,
} from "@/lib/thread-history";
import { cn } from "@/lib/utils";

function ThreadList({
  threads,
  query,
  currentId,
  onSelect,
}: {
  threads: Thread[];
  query: string;
  currentId: string | null;
  onSelect: (threadId: string) => void;
}) {
  const [shown, setShown] = useState(THREAD_HISTORY_BATCH_SIZE);
  if (threads.length === 0) {
    return <HistoryNote>Your conversations will appear here.</HistoryNote>;
  }

  const filtered = filterThreadHistory(threads, query);
  if (filtered.length === 0) {
    return <HistoryNote>No chats match your search.</HistoryNote>;
  }
  const hasMore = !query.trim() && filtered.length > shown;
  const visible = hasMore ? filtered.slice(0, shown) : filtered;
  const now = new Date();

  return (
    <div className="px-3 pb-3">
      {THREAD_HISTORY_GROUPS.map((group) => {
        const rows = visible.filter(
          (thread) => getThreadHistoryGroup(thread.updated_at, now) === group,
        );
        if (!rows.length) return null;
        return (
          <section
            key={group}
            aria-label={group}
          >
            <h3 className="text-muted-foreground px-2.5 pt-3.5 pb-1.5 text-xs font-semibold tracking-[0.7px] uppercase">
              {group}
            </h3>
            <ul>
              {rows.map((thread) => {
                const title = getThreadTitle(thread);
                const current = thread.thread_id === currentId;
                return (
                  <li key={thread.thread_id}>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-current={current ? "page" : undefined}
                      title={title}
                      className={cn(
                        "h-auto min-h-12 w-full justify-start rounded-[10px] px-2.5 py-2.5 text-left text-sm font-medium",
                        current &&
                          "bg-secondary text-primary hover:bg-secondary hover:text-primary",
                      )}
                      onClick={() => onSelect(thread.thread_id)}
                    >
                      <span className="min-w-0 flex-1 truncate">{title}</span>
                      {thread.status === "busy" && (
                        <span
                          role="status"
                          className="bg-primary size-1.5 shrink-0 rounded-full motion-safe:animate-pulse"
                        >
                          <span className="sr-only">Answer in progress</span>
                        </span>
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="secondary"
            className="h-9 rounded-full px-4 text-xs font-medium"
            onClick={() =>
              setShown((count) => count + THREAD_HISTORY_BATCH_SIZE)
            }
          >
            Show more
          </Button>
        </div>
      )}
    </div>
  );
}

function HistoryNote({ children }: { children: ReactNode }) {
  return (
    <p
      className="text-muted-foreground p-5 text-xs leading-[1.45]"
      role="status"
    >
      {children}
    </p>
  );
}

function ThreadHistoryLoading() {
  return (
    <div
      className="space-y-2 px-3 py-4"
      role="status"
      aria-label="Loading conversations"
    >
      <span className="sr-only">Loading conversations…</span>
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton
          key={index}
          className="h-12 w-full rounded-[10px]"
        />
      ))}
    </div>
  );
}

export default function ThreadHistory({
  onNewChat,
  onThreadSelect,
}: {
  onNewChat?: () => void;
  onThreadSelect?: (threadId: string) => void;
}) {
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  const [threadId, setThreadId] = useQueryState("threadId");
  const [chatHistoryOpen, setChatHistoryOpen] = useQueryState(
    "chatHistoryOpen",
    parseAsBoolean.withDefault(false),
  );
  const [query, setQuery] = useState("");
  const { refreshThreads, threads, threadsLoading, threadsError } =
    useThreads();

  useEffect(() => {
    if (chatHistoryOpen) void refreshThreads();
  }, [chatHistoryOpen, refreshThreads]);

  const closeHistory = () => {
    setQuery("");
    void setChatHistoryOpen(false);
  };

  const header = (
    <div className="border-muted flex min-h-14 items-center justify-between border-b py-3 pr-3 pl-4">
      {isLargeScreen ? (
        <h2 className="text-base leading-[1.35] font-medium">Conversations</h2>
      ) : (
        <SheetTitle className="text-base leading-[1.35] font-medium">
          Conversations
        </SheetTitle>
      )}
      {isLargeScreen && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 rounded-full"
          aria-label="Close conversations"
          onClick={closeHistory}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );

  const body = (
    <>
      {header}
      <div className="space-y-2 px-3 pt-3">
        <Button
          type="button"
          className="h-11 w-full rounded-full text-sm font-medium text-white [background:var(--brand-gradient)] hover:opacity-90"
          onClick={() => {
            if (onNewChat) onNewChat();
            else void setThreadId(null);
            if (!isLargeScreen) closeHistory();
          }}
        >
          <Plus className="size-4" />
          New chat
        </Button>
        <div className="bg-accent border-border focus-within:border-primary focus-within:ring-primary/20 flex h-11 items-center gap-2 rounded-full border px-3 focus-within:ring-2">
          <Search
            className="text-muted-foreground size-4 shrink-0"
            aria-hidden="true"
          />
          <input
            aria-label="Search chats"
            type="search"
            placeholder="Search chats"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </div>
      <div
        className="mt-2 h-0.5 shrink-0 overflow-hidden"
        aria-hidden="true"
      >
        {threadsLoading && threads.length > 0 && (
          <div className="bg-primary/40 h-full w-full motion-safe:animate-pulse" />
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {threadsError && threads.length > 0 && (
          <div
            className="text-muted-foreground flex items-center gap-2 px-5 py-2 text-xs"
            role="status"
          >
            <span className="flex-1">Could not refresh your chats.</span>
            <Button
              variant="link"
              className="h-8 px-0 text-xs"
              disabled={threadsLoading}
              onClick={() => void refreshThreads()}
            >
              Retry
            </Button>
          </div>
        )}
        {threadsLoading && threads.length === 0 ? (
          <ThreadHistoryLoading />
        ) : threadsError && threads.length === 0 ? (
          <div
            className="p-5 text-xs leading-[1.45]"
            role="alert"
          >
            <p className="text-muted-foreground">Could not load your chats.</p>
            <Button
              variant="link"
              className="mt-1 h-9 px-0 text-xs"
              onClick={() => void refreshThreads()}
            >
              Retry
            </Button>
          </div>
        ) : (
          <ThreadList
            key={String(chatHistoryOpen)}
            threads={threads}
            query={query}
            currentId={threadId}
            onSelect={(id) => {
              if (id !== threadId) {
                if (onThreadSelect) onThreadSelect(id);
                else void setThreadId(id);
              }
              if (!isLargeScreen) closeHistory();
            }}
          />
        )}
      </div>
      {threadsLoading && threads.length > 0 && (
        <span
          className="sr-only"
          role="status"
        >
          Refreshing conversations…
        </span>
      )}
    </>
  );

  if (isLargeScreen) {
    return (
      <aside
        aria-label="Conversation history"
        className="bg-background border-border flex h-dvh w-[290px] shrink-0 flex-col border-r"
      >
        {body}
      </aside>
    );
  }

  return (
    <Sheet
      open={chatHistoryOpen}
      onOpenChange={(open) => {
        if (open) void setChatHistoryOpen(true);
        else closeHistory();
      }}
    >
      <SheetContent
        side="left"
        aria-describedby={undefined}
        className="w-[min(82vw,290px)] gap-0 sm:max-w-[290px] [&>button:last-child]:top-3 [&>button:last-child]:right-3 [&>button:last-child]:flex [&>button:last-child]:size-8 [&>button:last-child]:items-center [&>button:last-child]:justify-center [&>button:last-child]:rounded-full"
      >
        {body}
      </SheetContent>
    </Sheet>
  );
}
