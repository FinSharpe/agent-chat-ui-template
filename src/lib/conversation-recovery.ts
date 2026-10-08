import type { Message, ThreadState } from "@langchain/langgraph-sdk";

export interface RunStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/** Only run identifiers are persisted; deployment credentials never are. */
export function scopedRunStorage(
  scope: string,
  storage?: RunStorage,
): RunStorage {
  let hash = 5381;
  let secondHash = 52711;
  for (let index = 0; index < scope.length; index++) {
    hash = Math.imul(hash, 33) ^ scope.charCodeAt(index);
    secondHash = Math.imul(secondHash, 65599) ^ scope.charCodeAt(index);
  }
  const prefix = `lg:session:${(hash >>> 0).toString(36)}:${(secondHash >>> 0).toString(36)}:`;
  const memory = new Map<string, string>();
  return {
    getItem(key) {
      try {
        return storage?.getItem(prefix + key) ?? memory.get(key) ?? null;
      } catch {
        return memory.get(key) ?? null;
      }
    },
    setItem(key, value) {
      memory.set(key, value);
      try {
        storage?.setItem(prefix + key, value);
      } catch {
        /* Private browsing may deny storage. */
      }
    },
    removeItem(key) {
      memory.delete(key);
      try {
        storage?.removeItem(prefix + key);
      } catch {
        /* The memory fallback still works. */
      }
    },
  };
}

function text(message?: Message): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  return message.content
    .map((block) =>
      block.type === "text" && typeof block.text === "string" ? block.text : "",
    )
    .join("");
}

/** A replica behind the live stream must not erase the answer just rendered. */
export function dropsRenderedContent(
  snapshot: Message[],
  current: Message[],
): boolean {
  if (snapshot.length < current.length) return true;
  const human = current.findLast((message) => message.type === "human");
  if (human?.id && !snapshot.some((message) => message.id === human.id))
    return true;
  if (snapshot.length > current.length) return false;
  const latest = current.at(-1);
  const incoming = snapshot.at(-1);
  return (
    latest?.id === incoming?.id && text(incoming).length < text(latest).length
  );
}

/** The first checkpoint containing the human turn re-runs that whole turn. */
export function retryTurnState<State extends { messages: Message[] }>(
  history: ThreadState<State>[],
  humanId: string,
): ThreadState<State> | undefined {
  return history.findLast((state) =>
    state.values?.messages?.some(
      (message) => message.id === humanId && message.type === "human",
    ),
  );
}

export function currentTurnId(messages: Message[]): string | undefined {
  let humanId: string | undefined;
  let turnId: string | undefined;
  for (const message of messages) {
    if (message.type === "human") {
      humanId = message.id;
      turnId = undefined;
    } else if (message.type === "ai" || message.type === "tool") {
      turnId ??= message.id;
    }
  }
  return turnId ?? humanId;
}
