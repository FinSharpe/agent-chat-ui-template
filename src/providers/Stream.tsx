import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useLayoutEffect,
} from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import {
  type Client,
  type Message,
  type ThreadState,
} from "@langchain/langgraph-sdk";
import {
  uiMessageReducer,
  isUIMessage,
  isRemoveUIMessage,
  type UIMessage,
  type RemoveUIMessage,
} from "@langchain/langgraph-sdk/react-ui";
import { useQueryState } from "nuqs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowRight } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { getApiKey, setApiKey as storeApiKey } from "@/lib/api-key";
import { resolveApiUrl } from "@/lib/resolve-api-url";
import { useThreads } from "./Thread";
import { toast } from "sonner";
import { PlannerModels } from "@/configs/models";
import { createClient } from "./client";
import {
  currentTurnId,
  dropsRenderedContent,
  retryTurnState,
  scopedRunStorage,
} from "@/lib/conversation-recovery";

export type StateType = {
  messages: Message[];
  ui?: UIMessage[];
  next_prompt_suggestions?: string[];
};

const useTypedStream = useStream<
  StateType,
  {
    UpdateType: {
      messages?: Message[] | Message | string;
      ui?: (UIMessage | RemoveUIMessage)[] | UIMessage | RemoveUIMessage;
      context?: Record<string, unknown>;
    };
    CustomEventType: UIMessage | RemoveUIMessage;
    ConfigurableType: {
      tradekit_agent_model?: PlannerModels;
      model?: string;
      model_switcher_enabled?: boolean;
    };
  }
>;

type StreamHandle = ReturnType<typeof useTypedStream>;
export type RunStatus =
  "idle" | "streaming" | "reconnecting" | "stopping" | "stopped" | "failed";
type StreamContextType = StreamHandle & {
  apiUrl: string;
  runStatus: RunStatus;
  runTerminations: Record<string, "stopped" | "failed">;
  retry: (options?: Parameters<StreamHandle["submit"]>[1]) => Promise<void>;
  reloadConversation: () => Promise<void>;
  requestApi: (path: string, init?: RequestInit) => Promise<Response>;
};
const StreamContext = createContext<StreamContextType | undefined>(undefined);

function useConversationHistory(
  client: Client,
  threadId: string | null,
  live: React.RefObject<StreamHandle | null>,
) {
  const [history, setHistory] = useState<{
    data: ThreadState<StateType>[] | null;
    isLoading: boolean;
    error: unknown;
  }>({ data: null, isLoading: Boolean(threadId), error: undefined });
  const requestId = useRef(0);
  const currentThread = useRef(threadId);
  useLayoutEffect(() => {
    currentThread.current = threadId;
  }, [threadId]);

  const mutate = useCallback(
    async (id = currentThread.current, preserveStream = true) => {
      if (!id) return null;
      const request = ++requestId.current;
      setHistory((previous) => ({
        ...previous,
        isLoading: true,
        error: undefined,
      }));
      try {
        const data = await client.threads.getHistory<StateType>(id, {
          limit: 300,
        });
        if (request !== requestId.current || id !== currentThread.current)
          return null;
        if (
          preserveStream &&
          dropsRenderedContent(
            data[0]?.values?.messages ?? [],
            live.current?.messages ?? [],
          )
        ) {
          // The SDK keeps its streamed values when mutate returns no head. Drop
          // stale fork metadata too: a fork from that checkpoint would lose the turn.
          setHistory({ data: [], isLoading: false, error: undefined });
          return null;
        }
        setHistory({ data, isLoading: false, error: undefined });
        return data;
      } catch (error) {
        if (request !== requestId.current || id !== currentThread.current)
          return null;
        setHistory((previous) => ({
          ...previous,
          data: preserveStream ? [] : previous.data,
          isLoading: false,
          error,
        }));
        throw error;
      }
    },
    [client, live],
  );

  useEffect(() => {
    requestId.current += 1;
    setHistory({ data: null, isLoading: Boolean(threadId), error: undefined });
    if (threadId) void mutate(threadId, false).catch(() => {});
    return () => {
      requestId.current += 1;
    };
  }, [threadId, mutate]);

  return { ...history, mutate };
}

async function checkGraphStatus(
  apiUrl: string,
  apiKey: string | null,
  authScheme?: string,
): Promise<boolean> {
  try {
    const headers = new Headers();
    if (apiKey) headers.set("X-Api-Key", apiKey);
    if (authScheme) headers.set("X-Auth-Scheme", authScheme);

    const res = await fetch(`${apiUrl}/info`, {
      headers,
    });

    return res.ok;
  } catch (e) {
    console.error(e);
    return false;
  }
}

const StreamSession = ({
  children,
  apiKey,
  apiUrl,
  assistantId,
  authScheme,
}: {
  children: ReactNode;
  apiKey: string | null;
  apiUrl: string;
  assistantId: string;
  authScheme?: string;
}) => {
  const [threadId, setThreadId] = useQueryState("threadId");
  const { refreshThreads } = useThreads();
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runTerminations, setRunTerminations] = useState<
    Record<string, "stopped" | "failed">
  >({});
  const [recoveryError, setRecoveryError] = useState<unknown>();
  const [ignoreSdkError, setIgnoreSdkError] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const recoveryAttempt = useRef(0);
  const recoveryPending = useRef(false);
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && !navigator.onLine,
  );
  const [frozenValues, setFrozenValues] = useState<StateType | null>(null);
  const client = useMemo(
    () => createClient(apiUrl, apiKey ?? undefined, authScheme),
    [apiUrl, apiKey, authScheme],
  );
  const storage = useMemo(
    () =>
      scopedRunStorage(
        JSON.stringify([apiUrl, assistantId, authScheme, apiKey]),
        typeof window === "undefined" ? undefined : window.sessionStorage,
      ),
    [apiUrl, assistantId, authScheme, apiKey],
  );
  const streamRef = useRef<StreamHandle | null>(null);
  const selectedThread = useRef(threadId);
  const sessionEpoch = useRef(0);
  const activeRun = useRef<{ thread_id: string; run_id: string } | null>(null);
  const lastSubmit = useRef<{
    values: Parameters<StreamHandle["submit"]>[0];
    options: Parameters<StreamHandle["submit"]>[1];
    humanId?: string;
  } | null>(null);
  const retryKind = useRef<"submit" | "turn" | "reload" | "resume">("reload");
  const stopping = useRef(false);
  const pendingStop = useRef<
    ((run: { thread_id: string; run_id: string } | null) => void) | null
  >(null);
  const stoppedValues = useRef<StateType | null>(null);
  const history = useConversationHistory(client, threadId, streamRef);

  const markTermination = (
    outcome: "stopped" | "failed",
    messages = streamRef.current?.messages ?? [],
  ) => {
    const turnId = currentTurnId(messages);
    if (turnId)
      setRunTerminations((previous) => ({ ...previous, [turnId]: outcome }));
  };

  const streamValue = useTypedStream({
    apiUrl,
    apiKey: apiKey ?? undefined,
    client,
    assistantId,
    ...(authScheme && {
      defaultHeaders: {
        "X-Auth-Scheme": authScheme,
      },
    }),
    threadId: threadId ?? null,
    fetchStateHistory: { limit: 300 },
    thread: history,
    reconnectOnMount: () => storage,
    throttle: 40,
    onCreated: (run) => {
      if (run.thread_id !== selectedThread.current) return;
      activeRun.current = run;
      pendingStop.current?.(run);
      pendingStop.current = null;
      if (!stopping.current) setRunStatus("streaming");
      void refreshThreads();
    },
    onMetadataEvent: (data) => {
      if (typeof data.run_id === "string" && selectedThread.current) {
        const run = {
          thread_id: selectedThread.current,
          run_id: data.run_id,
        };
        activeRun.current = run;
        storage.setItem(`lg:stream:${run.thread_id}`, run.run_id);
        pendingStop.current?.(run);
        pendingStop.current = null;
      }
      if (!stopping.current) setRunStatus("streaming");
    },
    onFinish: (_state, run) => {
      if (run && run.thread_id !== selectedThread.current) return;
      pendingStop.current?.(null);
      pendingStop.current = null;
      activeRun.current = null;
      if (!stopping.current) setRunStatus("idle");
      setRecoveryError(undefined);
      void refreshThreads();
    },
    onError: (error, run) => {
      if (run && run.thread_id !== selectedThread.current) return;
      pendingStop.current?.(null);
      pendingStop.current = null;
      setRecoveryError(error);
      setIgnoreSdkError(false);
      if (!stopping.current) setRunStatus("failed");
      markTermination("failed");
      // A persisted run may still be alive when transport recovery exhausts;
      // Try again checks its actual status before deciding to fork a new run.
      retryKind.current = run
        ? "resume"
        : lastSubmit.current
          ? "submit"
          : "reload";
      if (run) activeRun.current = run;
    },
    onStop: ({ mutate }) => {
      if (stoppedValues.current) {
        mutate(stoppedValues.current);
        stoppedValues.current = null;
      } else {
        mutate({ next_prompt_suggestions: [] });
      }
    },
    onCustomEvent: (event, options) => {
      if (isUIMessage(event) || isRemoveUIMessage(event)) {
        options.mutate((prev) => {
          const ui = uiMessageReducer(prev.ui ?? [], event);
          return { ...prev, ui };
        });
      }
    },
    onThreadId: (id) => {
      selectedThread.current = id;
      void setThreadId(id);
      void refreshThreads();
    },
  });
  useLayoutEffect(() => {
    streamRef.current = streamValue;
  });

  useEffect(() => {
    if (selectedThread.current === threadId) return;
    selectedThread.current = threadId;
    sessionEpoch.current += 1;
    recoveryAttempt.current += 1;
    recoveryPending.current = false;
    setRecovering(false);
    pendingStop.current?.(null);
    pendingStop.current = null;
    activeRun.current = null;
    lastSubmit.current = null;
    setRunStatus("idle");
    setRunTerminations({});
    setRecoveryError(undefined);
    setIgnoreSdkError(false);
    setFrozenValues(null);
  }, [threadId]);

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // sessionStorage handles runs left by this tab. The runtime also discovers
  // runs started elsewhere, or left before this tab could store their id.
  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    void client.runs
      .list(threadId, { limit: 10, select: ["run_id", "status"] })
      .then((runs) => {
        if (
          cancelled ||
          selectedThread.current !== threadId ||
          streamRef.current?.isLoading
        )
          return;
        const run = runs.find(
          (candidate) =>
            candidate.status === "pending" || candidate.status === "running",
        );
        if (!run) return;
        activeRun.current = { thread_id: threadId, run_id: run.run_id };
        storage.setItem(`lg:stream:${threadId}`, run.run_id);
        setRunStatus("reconnecting");
        void streamRef.current?.joinStream(run.run_id);
      })
      .catch(() => {
        /* An unavailable run list must not hide readable history. */
      });
    return () => {
      cancelled = true;
    };
  }, [threadId, client, storage]);

  const requestApi = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!path.startsWith("/") || path.startsWith("//"))
        throw new Error("API requests require a deployment-relative path.");
      const headers = new Headers(init?.headers);
      if (apiKey) headers.set("X-Api-Key", apiKey);
      if (authScheme) headers.set("X-Auth-Scheme", authScheme);
      const response = await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, {
        ...init,
        headers,
      });
      if (!response.ok)
        throw new Error(
          `Request failed (${response.status}). Please try again.`,
        );
      return response;
    },
    [apiUrl, apiKey, authScheme],
  );

  const submit: StreamHandle["submit"] = async (values, options) => {
    const epoch = sessionEpoch.current;
    setRecoveryError(undefined);
    setIgnoreSdkError(false);
    setRunStatus("streaming");
    setFrozenValues(null);
    activeRun.current = null;
    const update =
      values && typeof values === "object" ? values.messages : undefined;
    const suppliedMessages = Array.isArray(update) ? update : [];
    const humanId = suppliedMessages.findLast(
      (message) => message.type === "human",
    )?.id;
    const finalOptions = {
      onDisconnect: "continue" as const,
      multitaskStrategy: "reject" as const,
      streamResumable: true,
      ...options,
    };
    lastSubmit.current = { values, options: finalOptions, humanId };
    retryKind.current = "submit";
    await streamValue.submit(values, finalOptions);
    pendingStop.current?.(null);
    pendingStop.current = null;
    if (epoch !== sessionEpoch.current) return;
    if (!streamRef.current?.error && selectedThread.current) {
      activeRun.current = null;
      storage.removeItem(`lg:stream:${selectedThread.current}`);
      setRunStatus((status) => (status === "stopped" ? status : "idle"));
      void refreshThreads();
    }
  };

  const stop = async () => {
    if (stopping.current) return;
    recoveryAttempt.current += 1;
    recoveryPending.current = false;
    setRecovering(false);
    stopping.current = true;
    setRunStatus("stopping");
    const frozen = streamValue.values;
    setFrozenValues({ ...frozen, next_prompt_suggestions: [] });
    const epoch = sessionEpoch.current;
    const selected = selectedThread.current;
    const storedId = selected ? storage.getItem(`lg:stream:${selected}`) : null;
    let run =
      activeRun.current ??
      (selected && storedId ? { thread_id: selected, run_id: storedId } : null);
    try {
      if (!run && selected && streamValue.isLoading) {
        // The POST is still identifying its run. Keep the socket long enough
        // to learn the id and cancel it instead of orphaning a continuing run.
        run = await new Promise((resolve) => {
          pendingStop.current = resolve;
        });
      }
      if (run) {
        // The SDK's own stop fires cancel without awaiting it. Await the
        // server first so a refused cancel cannot falsely unlock the composer.
        await client.runs.cancel(run.thread_id, run.run_id, true);
        storage.removeItem(`lg:stream:${run.thread_id}`);
      }
      if (epoch !== sessionEpoch.current) return;
      stoppedValues.current = { ...frozen, next_prompt_suggestions: [] };
      await streamValue.stop();
      markTermination("stopped", frozen.messages);
      activeRun.current = null;
      retryKind.current = run ? "turn" : "submit";
      setRunStatus("stopped");
      setRecoveryError(undefined);
      setIgnoreSdkError(true);
      void refreshThreads();
      if (selectedThread.current)
        void history.mutate(selectedThread.current).catch(() => {});
    } catch {
      if (epoch !== sessionEpoch.current) return;
      setFrozenValues(null);
      setRunStatus("streaming");
      toast.error("Could not stop the answer. It is still running.");
    } finally {
      stopping.current = false;
    }
  };

  const reloadConversation = async () => {
    const selected = selectedThread.current;
    const attempt = recoveryAttempt.current;
    if (!selected) return;
    try {
      const states = await history.mutate(selected, false);
      if (
        !states ||
        selected !== selectedThread.current ||
        attempt !== recoveryAttempt.current
      )
        return;
      stoppedValues.current = states[0]?.values ?? { messages: [] };
      storage.removeItem(`lg:stream:${selected}`);
      await streamValue.stop();
      activeRun.current = null;
      lastSubmit.current = null;
      setRecoveryError(undefined);
      setIgnoreSdkError(true);
      setRunStatus("idle");
      setFrozenValues(null);
    } catch (error) {
      if (
        selected !== selectedThread.current ||
        attempt !== recoveryAttempt.current
      )
        return;
      setRecoveryError(error);
      setIgnoreSdkError(false);
      setRunStatus("failed");
      retryKind.current = "reload";
    }
  };

  const retry = async (
    retryOptions?: Parameters<StreamHandle["submit"]>[1],
  ) => {
    if (recoveryPending.current) return;
    recoveryPending.current = true;
    const attempt = ++recoveryAttempt.current;
    setRecovering(true);
    const selected = selectedThread.current;
    setRecoveryError(undefined);
    setIgnoreSdkError(true);
    const turnId = currentTurnId(streamValue.messages);
    const human = streamValue.messages.findLast(
      (message) => message.type === "human",
    );
    if (turnId)
      setRunTerminations((previous) => {
        const next = { ...previous };
        delete next[turnId];
        if (human?.id) delete next[human.id];
        return next;
      });
    try {
      if (retryKind.current === "reload") {
        const persistedFailure = history.data?.[0]?.tasks?.some(
          (task) => task.error,
        );
        if (!history.error && persistedFailure) retryKind.current = "turn";
        else {
          await reloadConversation();
          return;
        }
      }
      const run = activeRun.current;
      if (retryKind.current === "resume" && run) {
        const liveRun = await client.runs.get(run.thread_id, run.run_id);
        if (
          selected !== selectedThread.current ||
          attempt !== recoveryAttempt.current
        )
          return;
        if (liveRun.status === "pending" || liveRun.status === "running") {
          setRunStatus("reconnecting");
          await streamValue.joinStream(run.run_id);
          return;
        }
        if (liveRun.status === "success" || liveRun.status === "interrupted") {
          await reloadConversation();
          return;
        }
        retryKind.current = "turn";
      }
      const previous = lastSubmit.current;
      // An explicit picker choice (including Auto's empty options) replaces
      // the previous model carriers. Never send context plus configurable.
      const options =
        retryOptions === undefined
          ? previous?.options
          : {
              ...previous?.options,
              config: retryOptions.config,
              context: retryOptions.context,
              ...retryOptions,
            };
      const humanId = previous?.humanId ?? human?.id;
      if (retryKind.current === "turn" && selected && humanId) {
        const states = await client.threads.getHistory<StateType>(selected, {
          limit: 300,
        });
        if (
          selected !== selectedThread.current ||
          attempt !== recoveryAttempt.current
        )
          return;
        const state = retryTurnState(states, humanId);
        if (!state?.checkpoint) {
          await reloadConversation();
          return;
        }
        await submit(undefined, {
          ...options,
          checkpoint: state.checkpoint,
          optimisticValues: { ...state.values, next_prompt_suggestions: [] },
        });
        return;
      }
      if (!previous) {
        await reloadConversation();
        return;
      }
      // Keep the exact optimistic transcript on an unaccepted submit's retry;
      // calling its append callback twice would duplicate the human message.
      await submit(previous.values, {
        ...options,
        optimisticValues: {
          ...streamValue.values,
          next_prompt_suggestions: [],
        },
      });
    } catch (error) {
      if (
        selected !== selectedThread.current ||
        attempt !== recoveryAttempt.current
      )
        return;
      setRecoveryError(error);
      setRunStatus("failed");
      markTermination("failed");
    } finally {
      if (attempt === recoveryAttempt.current) {
        recoveryPending.current = false;
        setRecovering(false);
      }
    }
  };

  useEffect(() => {
    checkGraphStatus(apiUrl, apiKey, authScheme).then((ok) => {
      if (!ok) {
        toast.error("Failed to connect to LangGraph server", {
          description: () => (
            <p>
              Please ensure your graph is running at <code>{apiUrl}</code> and
              your API key is correctly set (if connecting to a deployed graph).
            </p>
          ),
          duration: 10000,
          richColors: true,
          closeButton: true,
        });
      }
    });
  }, [apiKey, apiUrl, authScheme]);

  return (
    <StreamContext.Provider
      value={{
        ...streamValue,
        apiUrl,
        submit,
        stop,
        retry,
        reloadConversation,
        requestApi,
        ...(frozenValues && {
          values: frozenValues,
          messages: frozenValues.messages,
        }),
        isLoading:
          streamValue.isLoading || runStatus === "stopping" || recovering,
        error:
          recoveryError ?? (ignoreSdkError ? undefined : streamValue.error),
        runStatus:
          runStatus === "stopping" ||
          runStatus === "stopped" ||
          runStatus === "failed"
            ? runStatus
            : streamValue.isLoading
              ? offline || runStatus === "reconnecting"
                ? "reconnecting"
                : "streaming"
              : recoveryError || (!ignoreSdkError && streamValue.error)
                ? "failed"
                : "idle",
        runTerminations,
      }}
    >
      {children}
    </StreamContext.Provider>
  );
};

// Default values for the form
const DEFAULT_API_URL = "http://localhost:2024";
const DEFAULT_ASSISTANT_ID = "agent";
const AGENT_BUILDER_AUTH_SCHEME = "langsmith-api-key";

export const StreamProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  // Get environment variables
  const envApiUrl: string | undefined = process.env.NEXT_PUBLIC_API_URL;
  const envAssistantId: string | undefined =
    process.env.NEXT_PUBLIC_ASSISTANT_ID;
  const envAuthScheme: string | undefined = process.env.NEXT_PUBLIC_AUTH_SCHEME;

  // Use URL params with env var fallbacks
  const [apiUrl, setApiUrl] = useQueryState("apiUrl", {
    defaultValue: envApiUrl || "",
  });
  const [assistantId, setAssistantId] = useQueryState("assistantId", {
    defaultValue: envAssistantId || "",
  });
  const [authScheme, setAuthScheme] = useQueryState("authScheme", {
    defaultValue: envAuthScheme || "",
  });
  const [isAgentBuilder, setIsAgentBuilder] = useState(
    () =>
      (authScheme || envAuthScheme || "").toLowerCase() ===
      AGENT_BUILDER_AUTH_SCHEME,
  );

  const finalApiUrl = resolveApiUrl(apiUrl, envApiUrl);
  const finalAssistantId = assistantId || envAssistantId;
  const finalAuthScheme = authScheme || envAuthScheme || "";

  // Read on each render so saving a key for the same URL takes effect immediately.
  const apiKey = getApiKey(finalApiUrl) || "";

  // Show the form if we: don't have an API URL, or don't have an assistant ID
  if (!finalApiUrl || !finalAssistantId) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-4">
        <div className="animate-in fade-in-0 zoom-in-95 bg-background flex max-w-3xl flex-col rounded-lg border shadow-lg">
          <div className="mt-14 flex flex-col gap-2 border-b p-6">
            <div className="flex flex-col items-start gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                Agent Chat
              </h1>
            </div>
            <p className="text-muted-foreground">
              Welcome to Agent Chat! Before you get started, you need to enter
              the URL of the deployment and the assistant / graph ID.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();

              const form = e.target as HTMLFormElement;
              const formData = new FormData(form);
              const apiUrl = formData.get("apiUrl") as string;
              const assistantId = formData.get("assistantId") as string;
              const apiKey = formData.get("apiKey") as string;

              setApiUrl(apiUrl);
              storeApiKey(resolveApiUrl(apiUrl, envApiUrl), apiKey);
              setAssistantId(assistantId);
              setAuthScheme(isAgentBuilder ? AGENT_BUILDER_AUTH_SCHEME : "");

              form.reset();
            }}
            className="bg-muted/50 flex flex-col gap-6 p-6"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="apiUrl">
                Deployment URL<span className="text-rose-500">*</span>
              </Label>
              <p className="text-muted-foreground text-sm">
                This is the URL of your LangGraph deployment. Can be a local, or
                production deployment.
              </p>
              <Input
                id="apiUrl"
                name="apiUrl"
                className="bg-background"
                defaultValue={finalApiUrl || DEFAULT_API_URL}
                readOnly={Boolean(envApiUrl)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="assistantId">
                Assistant / Graph ID<span className="text-rose-500">*</span>
              </Label>
              <p className="text-muted-foreground text-sm">
                This is the ID of the graph (can be the graph name), or
                assistant to fetch threads from, and invoke when actions are
                taken.
              </p>
              <Input
                id="assistantId"
                name="assistantId"
                className="bg-background"
                defaultValue={assistantId || DEFAULT_ASSISTANT_ID}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="apiKey">LangSmith API Key</Label>
              <p className="text-muted-foreground text-sm">
                This is <strong>NOT</strong> required if using a local LangGraph
                server. This value is stored in your browser's local storage and
                is only used to authenticate requests sent to your LangGraph
                server.
              </p>
              <PasswordInput
                id="apiKey"
                name="apiKey"
                defaultValue={apiKey ?? ""}
                className="bg-background"
                placeholder="lsv2_pt_..."
              />
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="agentBuilderEnabled">
                    Built with Agent Builder
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    Enable this for Agent Builder deployments.
                  </p>
                </div>
                <Switch
                  id="agentBuilderEnabled"
                  checked={isAgentBuilder}
                  onCheckedChange={setIsAgentBuilder}
                />
              </div>
            </div>

            <div className="mt-2 flex justify-end">
              <Button
                type="submit"
                size="lg"
              >
                Continue
                <ArrowRight className="size-5" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <StreamSession
      key={JSON.stringify([
        finalApiUrl,
        finalAssistantId,
        finalAuthScheme,
        apiKey,
      ])}
      apiKey={apiKey}
      apiUrl={finalApiUrl}
      assistantId={finalAssistantId}
      authScheme={finalAuthScheme || undefined}
    >
      {children}
    </StreamSession>
  );
};

// Create a custom hook to use the context
export const useStreamContext = (): StreamContextType => {
  const context = useContext(StreamContext);
  if (context === undefined) {
    throw new Error("useStreamContext must be used within a StreamProvider");
  }
  return context;
};

export default StreamContext;
