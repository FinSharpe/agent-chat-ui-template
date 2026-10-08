import { useStreamContext } from "@/providers/Stream";
import { Checkpoint, Message, ToolMessage } from "@langchain/langgraph-sdk";
import { useStream } from "@langchain/langgraph-sdk/react";
import { getContentString } from "../utils";
import { BranchSwitcher, CommandBar } from "./shared";
import { MarkdownText } from "../markdown-text";
import { LoadExternalComponent } from "@langchain/langgraph-sdk/react-ui";
import { cn } from "@/lib/utils";
import { ToolCalls, ToolResult } from "./tool-calls";
import { Fragment } from "react/jsx-runtime";
import { useMemo } from "react";
import {
  isAgentInboxInterruptSchema,
  pendingInterrupts,
} from "@/lib/agent-inbox-interrupt";
import { ThreadView } from "../agent-inbox";
import { useQueryState, parseAsBoolean } from "nuqs";
import { GenericInterruptView } from "./generic-interrupt";
import { useArtifact } from "../artifact";
import { getToolCalls } from "./tool-activity";
import { getMcpApp, McpAppReport } from "./mcp-app";
import { useCitationMarkdown } from "./citations-view";

function CustomComponent({
  message,
  thread,
}: {
  message: Message;
  thread: ReturnType<typeof useStreamContext>;
}) {
  const artifact = useArtifact();
  const { values } = useStreamContext();
  const customComponents = values.ui?.filter(
    (ui) => ui.metadata?.message_id === message.id,
  );

  if (!customComponents?.length) return null;
  return (
    <Fragment key={message.id}>
      {customComponents.map((customComponent) => (
        <LoadExternalComponent
          key={customComponent.id}
          stream={thread as unknown as ReturnType<typeof useStream>}
          message={customComponent}
          meta={{ ui: customComponent, artifact }}
        />
      ))}
    </Fragment>
  );
}

interface InterruptProps {
  interrupt?: unknown;
  isLastMessage: boolean;
  hasNoAIOrToolMessages: boolean;
}

function Interrupt({
  interrupt,
  isLastMessage,
  hasNoAIOrToolMessages,
}: InterruptProps) {
  if (!interrupt || !(isLastMessage || hasNoAIOrToolMessages)) return null;
  const pending = Array.isArray(interrupt) ? interrupt : [interrupt];
  // Modern HITL controls consume SDK envelopes, including their IDs. Generic
  // interruptions show values; a mixed fan-out must not hide either kind.
  const inbox = pending.flatMap((item) =>
    isAgentInboxInterruptSchema(item)
      ? Array.isArray(item)
        ? item
        : [item]
      : [],
  );
  const generic = pending
    .filter((item) => !isAgentInboxInterruptSchema(item))
    .map((item) =>
      item && typeof item === "object" && "value" in item ? item.value : item,
    );

  return (
    <>
      {inbox.length > 0 && <ThreadView interrupt={inbox} />}
      {generic.length > 0 && (
        <GenericInterruptView
          interrupt={generic.length === 1 ? generic[0] : generic}
        />
      )}
    </>
  );
}

export function AssistantMessage({
  message,
  isLoading,
  handleRegenerate,
  includeToolCalls = true,
}: {
  message: Message | undefined;
  isLoading: boolean;
  handleRegenerate: (
    parentCheckpoint: Checkpoint | null | undefined,
    message?: Message,
  ) => void;
  includeToolCalls?: boolean;
}) {
  const content = message?.content ?? [];
  // Tool payloads are opaque JSON values, including arrays, false and null.
  // Only assistant prose goes through text-block extraction.
  const contentString =
    message?.type === "tool" ? "" : getContentString(content);
  const markdown = useCitationMarkdown(contentString);
  const [hideToolCalls] = useQueryState(
    "hideToolCalls",
    parseAsBoolean.withDefault(false),
  );

  const thread = useStreamContext();
  const isLastMessage =
    thread.messages[thread.messages.length - 1]?.id === message?.id;
  const hasNoAIOrToolMessages = !thread.messages.find(
    (m) => m.type === "ai" || m.type === "tool",
  );
  const meta = message ? thread.getMessagesMetadata(message) : undefined;
  // The installed SDK's singular getter is only the first pending interrupt.
  const threadInterrupt = pendingInterrupts(thread);

  const parentCheckpoint = meta?.firstSeenState?.parent_checkpoint;
  const toolCalls = message ? getToolCalls(message) : [];

  const toolResponses = useMemo(() => {
    const map = new Map<string, ToolMessage>();
    for (const m of thread.messages) {
      if (m.type === "tool" && m.tool_call_id) {
        map.set(m.tool_call_id, m);
      }
    }
    return map;
  }, [thread.messages]);

  const isToolResult = message?.type === "tool";
  const mcpApp = message ? getMcpApp(message) : undefined;

  return (
    <div className="group mr-auto flex w-full items-start gap-2">
      <div className="flex w-full flex-col gap-2">
        {isToolResult ? (
          <>
            {mcpApp ? (
              <McpAppReport app={mcpApp} />
            ) : (
              !hideToolCalls &&
              (includeToolCalls ||
                !thread.messages.some((candidate) =>
                  getToolCalls(candidate).some(
                    (call) => call.id && call.id === message.tool_call_id,
                  ),
                )) && <ToolResult message={message} />
            )}
            <CustomComponent
              message={message}
              thread={thread}
            />
            <Interrupt
              interrupt={threadInterrupt}
              isLastMessage={isLastMessage}
              hasNoAIOrToolMessages={hasNoAIOrToolMessages}
            />
          </>
        ) : (
          <>
            {contentString.length > 0 && (
              <div className="chat-answer bg-background/75 rounded-xl border p-[14px] text-[13px] leading-[1.5]">
                <MarkdownText components={markdown.components}>
                  {markdown.text}
                </MarkdownText>
              </div>
            )}

            {!hideToolCalls && includeToolCalls && (
              <ToolCalls
                toolCalls={toolCalls}
                responses={toolResponses}
                phase={isLoading ? "running" : "settled"}
                activeCallKey={
                  isLoading
                    ? toolCalls.find(
                        (call) => call.id && !toolResponses.has(call.id),
                      )?.id
                    : undefined
                }
              />
            )}

            {message && (
              <CustomComponent
                message={message}
                thread={thread}
              />
            )}
            <Interrupt
              interrupt={threadInterrupt}
              isLastMessage={isLastMessage}
              hasNoAIOrToolMessages={hasNoAIOrToolMessages}
            />
            {(contentString.length > 0 ||
              (meta?.branchOptions?.length ?? 0) > 1) && (
              <div
                className={cn(
                  "message-actions mr-auto flex items-center gap-2 transition-opacity",
                  "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
                )}
              >
                <BranchSwitcher
                  branch={meta?.branch}
                  branchOptions={meta?.branchOptions}
                  onSelect={(branch) => thread.setBranch(branch)}
                  isLoading={isLoading}
                />
                <CommandBar
                  content={contentString}
                  isLoading={isLoading}
                  isAiMessage={true}
                  handleRegenerate={() =>
                    handleRegenerate(parentCheckpoint, message)
                  }
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function AssistantMessageLoading() {
  return (
    <div
      className="mr-auto flex items-start gap-2"
      role="status"
      aria-label="Thinking"
    >
      <div
        className="bg-muted flex h-8 items-center gap-1 rounded-2xl px-4 py-2"
        aria-hidden="true"
      >
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_infinite] rounded-full"></div>
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_0.5s_infinite] rounded-full"></div>
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_1s_infinite] rounded-full"></div>
      </div>
    </div>
  );
}
