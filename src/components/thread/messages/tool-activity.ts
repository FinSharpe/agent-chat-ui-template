import { parsePartialJson } from "@langchain/core/output_parsers";
import type { AIMessage, Message, ToolMessage } from "@langchain/langgraph-sdk";
import { getContentString } from "../utils";

export type ToolCall = NonNullable<AIMessage["tool_calls"]>[number];
export type ToolStep = { key: string; call: ToolCall; response?: ToolMessage };
export type ConversationPart =
  | { kind: "message"; key: string; message: Message }
  | { kind: "tools"; key: string; steps: ToolStep[] };

export function getToolCalls(message: Message): ToolCall[] {
  if (message.type !== "ai") return [];
  if (message.tool_calls?.length) return message.tool_calls;
  if (!Array.isArray(message.content)) return [];
  return (message.content as unknown[]).flatMap((block) => {
    if (!block || typeof block !== "object") return [];
    const raw = block as Record<string, unknown>;
    if (raw.type !== "tool_use") return [];
    if (typeof raw.name !== "string") return [];
    let args = raw.input;
    if (typeof args === "string") {
      try {
        args = parsePartialJson(args);
      } catch {
        args = {};
      }
    }
    return [
      {
        id: typeof raw.id === "string" ? raw.id : undefined,
        name: raw.name,
        args:
          args && typeof args === "object" && !Array.isArray(args)
            ? (args as Record<string, unknown>)
            : {},
        type: "tool_call" as const,
      },
    ];
  });
}

export function additionalKwargs(message: Message): Record<string, unknown> {
  const kwargs = (message as Message & { additional_kwargs?: unknown })
    .additional_kwargs;
  return kwargs && typeof kwargs === "object" && !Array.isArray(kwargs)
    ? (kwargs as Record<string, unknown>)
    : {};
}

export function hasRichOutput(message: Message) {
  const kwargs = additionalKwargs(message);
  const app = kwargs.mcp_app as Record<string, unknown> | undefined;
  return typeof app?.html === "string" && app.html.length > 0;
}

/** Call order is authoritative. Results can arrive in any order and pair by call ID. */
export function projectConversation(
  messages: Message[],
  hasCustomUI: (message: Message) => boolean = () => false,
): ConversationPart[] {
  const results = new Map<string, ToolMessage>();
  for (const message of messages) {
    if (message.type === "tool" && message.tool_call_id) {
      results.set(message.tool_call_id, message);
    }
  }
  const parts: ConversationPart[] = [];
  const pairedCalls = new Set<string>();
  const renderedResults = new Set<Message>();
  let pending: ToolStep[] = [];
  const messagePart = (message: Message, index: number) => {
    parts.push({
      kind: "message",
      key: `message:${message.id ?? index}`,
      message,
    });
  };
  const flush = () => {
    if (!pending.length) return;
    parts.push({
      kind: "tools",
      key: `tools:${pending[0].key}`,
      steps: pending,
    });
    for (const step of pending) {
      if (
        step.response &&
        (hasRichOutput(step.response) || hasCustomUI(step.response))
      ) {
        messagePart(step.response, messages.indexOf(step.response));
        renderedResults.add(step.response);
      }
    }
    pending = [];
  };
  messages.forEach((message, index) => {
    if (message.type === "human") {
      flush();
      messagePart(message, index);
    } else if (message.type === "ai") {
      if (getContentString(message.content).trim() || hasCustomUI(message)) {
        flush();
        messagePart(message, index);
      }
      for (const [callIndex, call] of getToolCalls(message).entries()) {
        if (!call.name.trim()) continue;
        if (call.id && pairedCalls.has(call.id)) continue;
        if (call.id) pairedCalls.add(call.id);
        pending.push({
          key: call.id || `${message.id ?? index}:${callIndex}`,
          call,
          response: call.id ? results.get(call.id) : undefined,
        });
        const response = call.id ? results.get(call.id) : undefined;
        // A visible report closes its local batch at the originating call,
        // including when later sibling calls finish before that report.
        if (response && (hasRichOutput(response) || hasCustomUI(response)))
          flush();
      }
    } else if (message.type === "tool") {
      if (hasRichOutput(message) || hasCustomUI(message)) {
        flush();
        if (!renderedResults.has(message)) {
          messagePart(message, index);
          renderedResults.add(message);
        }
      } else if (
        !message.tool_call_id ||
        !pairedCalls.has(message.tool_call_id)
      ) {
        // Keep an unpaired result from older history inspectable.
        flush();
        messagePart(message, index);
      }
    }
  });
  flush();
  return parts;
}
