import { validate } from "uuid";
import { getApiKey } from "@/lib/api-key";
import { resolveApiUrl } from "@/lib/resolve-api-url";
import { Thread } from "@langchain/langgraph-sdk";
import { useQueryState } from "nuqs";
import {
  createContext,
  useContext,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useLayoutEffect,
  useState,
  Dispatch,
  SetStateAction,
} from "react";
import { createClient } from "./client";

interface ThreadContextType {
  getThreads: () => Promise<Thread[]>;
  refreshThreads: () => Promise<void>;
  threads: Thread[];
  setThreads: Dispatch<SetStateAction<Thread[]>>;
  threadsLoading: boolean;
  setThreadsLoading: Dispatch<SetStateAction<boolean>>;
  threadsError: string | null;
}

const ThreadContext = createContext<ThreadContextType | undefined>(undefined);

function getThreadSearchMetadata(
  assistantId: string,
): { graph_id: string } | { assistant_id: string } {
  if (validate(assistantId)) {
    return { assistant_id: assistantId };
  } else {
    return { graph_id: assistantId };
  }
}

export function ThreadProvider({ children }: { children: ReactNode }) {
  const envApiUrl: string | undefined = process.env.NEXT_PUBLIC_API_URL;
  const envAssistantId: string | undefined =
    process.env.NEXT_PUBLIC_ASSISTANT_ID;
  const envAuthScheme: string | undefined = process.env.NEXT_PUBLIC_AUTH_SCHEME;

  const [apiUrl] = useQueryState("apiUrl", {
    defaultValue: envApiUrl || "",
  });
  const [assistantId] = useQueryState("assistantId");
  const [authScheme] = useQueryState("authScheme", {
    defaultValue: envAuthScheme || "",
  });
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const refreshId = useRef(0);
  const finalApiUrl = resolveApiUrl(apiUrl, envApiUrl);
  const resolvedAssistantId = assistantId || envAssistantId;
  const apiKey = getApiKey(finalApiUrl) ?? undefined;
  const identity = JSON.stringify([
    finalApiUrl,
    resolvedAssistantId,
    authScheme,
    apiKey,
  ]);
  const currentIdentity = useRef(identity);
  useLayoutEffect(() => {
    currentIdentity.current = identity;
  }, [identity]);

  useEffect(() => {
    setThreads([]);
    setThreadsError(null);
  }, [finalApiUrl, resolvedAssistantId, authScheme, apiKey]);

  const getThreads = useCallback(async (): Promise<Thread[]> => {
    if (!finalApiUrl || !resolvedAssistantId) return [];
    const client = createClient(finalApiUrl, apiKey, authScheme || undefined);

    const threads = await client.threads.search({
      metadata: {
        ...getThreadSearchMetadata(resolvedAssistantId),
      },
      limit: 200,
      sortBy: "updated_at",
      sortOrder: "desc",
    });

    // A duplicate row must not appear twice in history, even if a runtime
    // returns it while the thread's updated_at is changing.
    const seen = new Set<string>();
    return threads.filter((thread) => {
      if (seen.has(thread.thread_id)) return false;
      seen.add(thread.thread_id);
      return true;
    });
  }, [finalApiUrl, resolvedAssistantId, authScheme, apiKey]);

  const refreshThreads = useCallback(async () => {
    const requestId = ++refreshId.current;
    setThreadsLoading(true);
    setThreadsError(null);
    try {
      const nextThreads = await getThreads();
      if (
        requestId === refreshId.current &&
        identity === currentIdentity.current
      )
        setThreads(nextThreads);
    } catch {
      if (
        requestId === refreshId.current &&
        identity === currentIdentity.current
      ) {
        setThreadsError("Could not load your conversations. Please try again.");
      }
    } finally {
      if (
        requestId === refreshId.current &&
        identity === currentIdentity.current
      )
        setThreadsLoading(false);
    }
  }, [getThreads, identity]);

  useEffect(
    () => () => {
      refreshId.current += 1;
    },
    [],
  );

  const value = {
    getThreads,
    refreshThreads,
    threads,
    setThreads,
    threadsLoading,
    setThreadsLoading,
    threadsError,
  };

  return (
    <ThreadContext.Provider value={value}>{children}</ThreadContext.Provider>
  );
}

export function useThreads() {
  const context = useContext(ThreadContext);
  if (context === undefined) {
    throw new Error("useThreads must be used within a ThreadProvider");
  }
  return context;
}
