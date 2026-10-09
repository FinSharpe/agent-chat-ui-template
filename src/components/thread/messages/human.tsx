import { useStreamContext } from "@/providers/Stream";
import { Message } from "@langchain/langgraph-sdk";
import { useState, useRef, useEffect } from "react";
import { getContentString } from "../utils";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { BranchSwitcher, CommandBar } from "./shared";
import { MultimodalPreview } from "@/components/thread/MultimodalPreview";
import { isBase64ContentBlock } from "@/lib/multimodal-utils";
import { modelSubmissionOptions } from "@/lib/chat-models";

function CollapsibleText({ children }: { children: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [long, setLong] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setLong(node.scrollHeight > 240);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [children]);
  return (
    <>
      <p
        ref={ref}
        className={cn(
          "[overflow-wrap:anywhere] whitespace-pre-wrap",
          long && !expanded && "max-h-40 overflow-hidden",
        )}
      >
        {children}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={expanded}
          className="mt-1 min-h-11 cursor-pointer text-xs underline underline-offset-4"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </>
  );
}

function EditableContent({
  value,
  setValue,
  onSubmit,
}: {
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
  onSubmit: () => void;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (
      (e.metaKey || e.ctrlKey) &&
      e.key === "Enter" &&
      !e.nativeEvent.isComposing
    ) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <Textarea
      aria-label="Edit your message"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      className="focus-visible:ring-0"
    />
  );
}

export function HumanMessage({
  message,
  isLoading,
  getSubmitOptions,
  canSubmitMessage,
}: {
  message: Message;
  isLoading: boolean;
  getSubmitOptions?: () => ReturnType<typeof modelSubmissionOptions>;
  canSubmitMessage?: (message: Message) => boolean;
}) {
  const thread = useStreamContext();
  const meta = thread.getMessagesMetadata(message);
  const parentCheckpoint = meta?.firstSeenState?.parent_checkpoint;

  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState("");
  const contentString = getContentString(message.content);

  const handleSubmitEdit = () => {
    if (isLoading) return;
    const attachments = Array.isArray(message.content)
      ? message.content.filter((block) => block.type !== "text")
      : [];
    if (!value.trim() && !attachments.length) return;
    const newMessage: Message = {
      type: "human",
      content: attachments.length
        ? [
            ...(value.trim() ? [{ type: "text" as const, text: value }] : []),
            ...attachments,
          ]
        : value,
    };
    if (canSubmitMessage && !canSubmitMessage(newMessage)) return;
    setIsEditing(false);
    thread.submit(
      { messages: [newMessage] },
      {
        ...getSubmitOptions?.(),
        checkpoint: parentCheckpoint,
        streamMode: ["values"],
        streamSubgraphs: true,
        streamResumable: true,
        optimisticValues: (prev) => {
          const values = meta?.firstSeenState?.values;
          if (!values) return prev;

          return {
            ...values,
            messages: [...(values.messages ?? []), newMessage],
          };
        },
      },
    );
  };

  return (
    <div
      className={cn(
        "group ml-auto flex w-fit max-w-[78%] min-w-0 flex-col items-end gap-2",
        isEditing && "w-full max-w-xl",
      )}
    >
      <div
        className={cn(
          "flex max-w-full min-w-0 flex-col items-end gap-2",
          isEditing && "w-full",
        )}
      >
        {isEditing ? (
          <EditableContent
            value={value}
            setValue={setValue}
            onSubmit={handleSubmitEdit}
          />
        ) : (
          <div className="flex max-w-full min-w-0 flex-col items-end gap-2">
            {/* Render images and files if no text */}
            {Array.isArray(message.content) && message.content.length > 0 && (
              <div className="flex max-w-full flex-wrap items-end justify-end gap-2">
                {message.content.reduce<React.ReactNode[]>(
                  (acc, block, idx) => {
                    if (isBase64ContentBlock(block)) {
                      acc.push(
                        <MultimodalPreview
                          key={idx}
                          block={block}
                          size="md"
                          className="max-w-full"
                        />,
                      );
                    }
                    return acc;
                  },
                  [],
                )}
              </div>
            )}
            {/* Render text if present, otherwise fallback to file/image name */}
            {contentString ? (
              <div className="bg-secondary text-secondary-foreground ml-auto w-fit max-w-full min-w-12 rounded-[14px] rounded-tr-[2px] p-3.5 text-left text-[13px] leading-normal font-medium">
                <CollapsibleText>{contentString}</CollapsibleText>
              </div>
            ) : null}
          </div>
        )}

        <div
          className={cn(
            "message-actions ml-auto flex max-w-full flex-wrap items-center justify-end gap-2 transition-opacity",
            "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
            isEditing && "opacity-100",
          )}
        >
          <BranchSwitcher
            branch={meta?.branch}
            branchOptions={meta?.branchOptions}
            onSelect={(branch) => thread.setBranch(branch)}
            isLoading={isLoading}
          />
          <CommandBar
            isLoading={isLoading}
            content={contentString}
            isEditing={isEditing}
            setIsEditing={(c) => {
              if (c) {
                setValue(contentString);
              }
              setIsEditing(c);
            }}
            handleSubmitEdit={handleSubmitEdit}
            isHumanMessage={true}
          />
        </div>
      </div>
    </div>
  );
}
