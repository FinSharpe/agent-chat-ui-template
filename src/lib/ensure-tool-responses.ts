import { v4 as uuidv4 } from "uuid";
import { Message, ToolMessage } from "@langchain/langgraph-sdk";

export const DO_NOT_RENDER_ID_PREFIX = "do-not-render-";

export function ensureToolCallsHaveResponses(messages: Message[]): Message[] {
  const newMessages: ToolMessage[] = [];

  const responded = new Set(
    messages
      .filter((m): m is ToolMessage => m.type === "tool")
      .map((m) => m.tool_call_id),
  );
  messages.forEach((message) => {
    if (message.type !== "ai" || message.tool_calls?.length === 0) {
      // If it's not an AI message, or it doesn't have tool calls, we can ignore.
      return;
    }
    // Pair by ID: parallel calls can settle out of order, or only partially.
    newMessages.push(
      ...(message.tool_calls
        ?.filter((tc) => tc.id && !responded.has(tc.id))
        .map((tc) => ({
          type: "tool" as const,
          tool_call_id: tc.id ?? "",
          id: `${DO_NOT_RENDER_ID_PREFIX}${uuidv4()}`,
          name: tc.name,
          content: "Tool call interrupted before a response was received.",
        })) ?? []),
    );
  });

  return newMessages;
}
