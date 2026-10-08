import type { Thread } from "@langchain/langgraph-sdk";

export const THREAD_HISTORY_BATCH_SIZE = 15;
export const THREAD_HISTORY_GROUPS = [
  "Today",
  "Yesterday",
  "This week",
  "Older",
] as const;

export type ThreadHistoryGroup = (typeof THREAD_HISTORY_GROUPS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function messageText(value: unknown): string {
  if (!isRecord(value)) return "";
  if (typeof value.content === "string") return value.content;
  if (!Array.isArray(value.content)) return "";
  return value.content
    .filter(isRecord)
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join(" ");
}

/** Mobile's first-user-message title: one line, at most 48 graphemes. */
export function deriveThreadTitle(text: string): string {
  const oneLine = text.trim().replace(/\s+/g, " ");
  const segments = Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(oneLine),
    (segment) => segment.segment,
  );
  return segments.length > 48 ? `${segments.slice(0, 47).join("")}…` : oneLine;
}

/** Metadata renames take priority; full SDK values and narrow search work. */
export function getThreadTitle(thread: Thread): string {
  const custom = thread.metadata?.title;
  if (typeof custom === "string" && custom.trim()) return custom.trim();

  const extracted = "extracted" in thread ? thread.extracted : undefined;
  const first = isRecord(extracted) ? extracted.first_message : undefined;
  const messages =
    isRecord(thread.values) && Array.isArray(thread.values.messages)
      ? thread.values.messages
      : first
        ? [first]
        : [];
  for (const message of messages) {
    if (!isRecord(message)) continue;
    const role = message.type ?? message.role;
    if (role !== "human" && role !== "user") continue;
    const text = messageText(message).trim();
    if (text) return deriveThreadTitle(text);
  }
  return "New chat";
}

/** Day buckets are calendar-local, so daylight-saving changes cannot move a row. */
export function getThreadHistoryGroup(
  updatedAt: string | undefined,
  now = new Date(),
): ThreadHistoryGroup {
  const when = updatedAt ? new Date(updatedAt) : null;
  if (!when || Number.isNaN(when.getTime())) return "Older";
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const day = Date.UTC(when.getFullYear(), when.getMonth(), when.getDate());
  const days = (today - day) / 86_400_000;
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  return "Older";
}

export function filterThreadHistory(
  threads: Thread[],
  query: string,
): Thread[] {
  const needle = query.trim().toLocaleLowerCase();
  return needle
    ? threads.filter((thread) =>
        getThreadTitle(thread).toLocaleLowerCase().includes(needle),
      )
    : threads;
}
