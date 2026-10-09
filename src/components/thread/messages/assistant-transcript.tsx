import type { Checkpoint, Message } from "@langchain/langgraph-sdk";
import { useQueryState, parseAsBoolean } from "nuqs";
import { useStreamContext } from "@/providers/Stream";
import { DO_NOT_RENDER_ID_PREFIX } from "@/lib/ensure-tool-responses";
import { modelSubmissionOptions } from "@/lib/chat-models";
import { AssistantMessage } from "./ai";
import { HumanMessage } from "./human";
import { ToolCalls } from "./tool-calls";
import { ToolDisclosureProvider } from "./disclosure-state";
import { projectConversation } from "./tool-activity";
import { CitationTurn } from "./citations-view";
import type { ToolPhase } from "./tool-call-group";
import { getContentString } from "../utils";

export function conversationTurns(messages: Message[]): Message[][] {
  const turns: Message[][] = [];
  for (const message of messages) {
    if (message.type === "human" || !turns.length) turns.push([]);
    turns[turns.length - 1].push(message);
  }
  return turns;
}

export function AssistantTranscript({
  messages,
  isLoading,
  handleRegenerate,
  getSubmitOptions,
  canSubmitMessage,
}: {
  messages: Message[];
  isLoading: boolean;
  handleRegenerate: (
    checkpoint: Checkpoint | null | undefined,
    message?: Message,
  ) => void;
  getSubmitOptions?: () => ReturnType<typeof modelSubmissionOptions>;
  canSubmitMessage?: (message: Message) => boolean;
}) {
  const stream = useStreamContext();
  const [hideToolCalls] = useQueryState(
    "hideToolCalls",
    parseAsBoolean.withDefault(false),
  );
  const visible = messages.filter(
    (message) => !message.id?.startsWith(DO_NOT_RENDER_ID_PREFIX),
  );
  const turns = conversationTurns(visible);
  const customMessageIds = new Set(
    stream.values.ui?.map((ui) => ui.metadata?.message_id),
  );
  return (
    <ToolDisclosureProvider>
      {turns.map((turn, index) => {
        const current = index === turns.length - 1;
        const firstAssistant = turn.find(
          (message) => message.type === "ai" || message.type === "tool",
        );
        const key = firstAssistant?.id || turn[0]?.id || String(index);
        const termination = Object.prototype.hasOwnProperty.call(
          stream.runTerminations ?? {},
          key,
        )
          ? stream.runTerminations[key]
          : undefined;
        const phase: ToolPhase =
          termination ??
          (current && isLoading
            ? stream.runStatus === "reconnecting"
              ? "reconnecting"
              : stream.runStatus === "stopping"
                ? "stopped"
                : "running"
            : current && stream.runStatus === "failed"
              ? "failed"
              : current && stream.runStatus === "stopped"
                ? "stopped"
                : "settled");
        const parts = projectConversation(
          turn,
          (message) =>
            customMessageIds.has(message.id) ||
            (!!stream.interrupt && message === visible[visible.length - 1]),
        );
        // A report or tool-only message can follow the final prose. Actions
        // belong to that answer once the turn settles, without empty rows
        // beneath its intermediate messages.
        const lastAnswer = turn.findLast(
          (message) =>
            message.type === "ai" &&
            getContentString(message.content).trim().length > 0,
        );
        const activeCall =
          phase === "running"
            ? parts
                .flatMap((part) => (part.kind === "tools" ? part.steps : []))
                .find((step) => !step.response)?.key
            : undefined;
        return (
          <div
            key={turn[0]?.id || key}
            className="tool-motion-clock flex w-full min-w-0 flex-col gap-1"
          >
            <CitationTurn
              messages={turn}
              settled={!current || !isLoading}
            >
              {parts.map((part) =>
                part.kind === "tools" ? (
                  !hideToolCalls && (
                    <ToolCalls
                      key={part.key}
                      steps={part.steps}
                      groupKey={part.key}
                      phase={phase}
                      activeCallKey={activeCall}
                    />
                  )
                ) : part.message.type === "human" ? (
                  <div
                    className="my-3"
                    key={part.key}
                  >
                    <HumanMessage
                      message={part.message}
                      isLoading={isLoading}
                      getSubmitOptions={getSubmitOptions}
                      canSubmitMessage={canSubmitMessage}
                    />
                  </div>
                ) : (
                  <AssistantMessage
                    key={part.key}
                    message={part.message}
                    isLoading={isLoading}
                    handleRegenerate={handleRegenerate}
                    includeToolCalls={false}
                    showActions={
                      part.message === lastAnswer && (!current || !isLoading)
                    }
                  />
                ),
              )}
            </CitationTurn>
          </div>
        );
      })}
    </ToolDisclosureProvider>
  );
}
