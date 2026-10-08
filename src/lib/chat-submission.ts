import type { Message } from "@langchain/langgraph-sdk";

/** Recognize both SDK-standard image blocks and the template's uploaded files. */
export function hasImageContent(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  return content.some((block) => {
    if (!block || typeof block !== "object") return false;
    const mime = block.mimeType ?? block.mime_type;
    return (
      ["image", "image_url", "input_image"].includes(block.type) ||
      (typeof mime === "string" && mime.startsWith("image/"))
    );
  });
}

/** The human turn rerun by this assistant's checkpoint, or the latest retry. */
export function precedingHuman(
  messages: Message[],
  assistant?: Message,
): Message | undefined {
  const index = assistant
    ? messages.findIndex(
        (message) =>
          message === assistant ||
          (!!assistant.id && message.id === assistant.id),
      )
    : messages.length;
  if (index < 0) return undefined;
  return messages
    .slice(0, index)
    .findLast((message) => message.type === "human");
}
