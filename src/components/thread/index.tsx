import { v4 as uuidv4 } from "uuid";
import {
  type ReactNode,
  useState,
  useRef,
  useEffect,
  type FormEvent,
} from "react";
import { cn } from "@/lib/utils";
import { useStreamContext } from "@/providers/Stream";
import { useThreads } from "@/providers/Thread";
import { Button } from "../ui/button";
import { type Checkpoint, type Message } from "@langchain/langgraph-sdk";
import { AssistantMessage, AssistantMessageLoading } from "./messages/ai";
import { AssistantTranscript } from "./messages/assistant-transcript";
import { ensureToolCallsHaveResponses } from "@/lib/ensure-tool-responses";
import { TooltipIconButton } from "./tooltip-icon-button";
import {
  ArrowDown,
  ArrowUp,
  PanelLeft,
  SquarePen,
  XIcon,
  Plus,
  Square,
  LoaderCircle,
  AlertCircle,
} from "lucide-react";
import { useQueryState, parseAsBoolean } from "nuqs";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import ThreadHistory from "./history";
import { GitHubSVG } from "../icons/github";
import { useFileUpload } from "@/hooks/use-file-upload";
import { ContentBlocksPreview } from "./ContentBlocksPreview";
import {
  useArtifactOpen,
  ArtifactContent,
  ArtifactTitle,
  useArtifactContext,
} from "./artifact";
import { ModelSwitcher } from "./ModelSwitcher";
import { SuggestedPrompts, FollowUpPrompts } from "./suggested-prompts";
import { useChatModels } from "@/hooks/use-chat-models";
import { getThreadTitle } from "@/lib/thread-history";
import { hasImageContent, precedingHuman } from "@/lib/chat-submission";
import { toast } from "sonner";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

function StickyToBottomContent({ children }: { children: ReactNode }) {
  const { scrollRef, contentRef } = useStickToBottomContext();
  return (
    <div
      ref={scrollRef}
      className="chat-scroll absolute inset-0 overflow-y-auto overscroll-contain"
    >
      <div
        ref={contentRef}
        className="mx-auto flex min-h-full w-full max-w-[760px] flex-col gap-4 px-5 pt-6 pb-8 sm:px-8"
      >
        {children}
      </div>
    </div>
  );
}

function ScrollToBottom() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <Button
      type="button"
      variant="outline"
      className="bg-card absolute bottom-3 left-1/2 z-10 min-h-11 -translate-x-1/2 rounded-full text-xs shadow-sm"
      onClick={() => scrollToBottom()}
    >
      <ArrowDown className="size-4" />
      Jump to latest
    </Button>
  );
}

export function Thread() {
  const [artifactContext, setArtifactContext] = useArtifactContext();
  const [artifactOpen, closeArtifact] = useArtifactOpen();
  const [threadId, setThreadId] = useQueryState("threadId");
  const [chatHistoryOpen, setChatHistoryOpen] = useQueryState(
    "chatHistoryOpen",
    parseAsBoolean.withDefault(false),
  );
  const [input, setInput] = useState("");
  const {
    contentBlocks,
    setContentBlocks,
    handleFileUpload,
    dropRef,
    removeBlock,
    dragOver,
    handlePaste,
  } = useFileUpload();
  const fileInputId = "chat-file-input";
  const stream = useStreamContext();
  const { threads } = useThreads();
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  const models = useChatModels(stream.apiUrl, threadId, stream.requestApi);
  const messages = stream.messages;
  const isLoading = stream.isLoading;
  const canSend = !isLoading && !stream.isThreadLoading && !models.unavailable;
  const chatStarted = !!threadId || !!messages.length;
  const currentThread = threads.find((t) => t.thread_id === threadId);
  const title = currentThread ? getThreadTitle(currentThread) : "Agent Chat";
  const hasNoAIOrToolMessages = !messages.some(
    (m) => m.type === "ai" || m.type === "tool",
  );
  const waitingForAnswer =
    isLoading && (messages.at(-1)?.type === "human" || !messages.length);
  const suggestions = Array.isArray(stream.values?.next_prompt_suggestions)
    ? stream.values.next_prompt_suggestions
    : [];
  const previousThreadId = useRef(threadId);
  useEffect(() => {
    if (previousThreadId.current === threadId) return;
    // Browser back/forward is also a conversation switch. A newly allocated
    // thread may retain the artifact context used to start its first turn.
    if (previousThreadId.current !== null || !stream.isLoading) {
      setInput("");
      setContentBlocks([]);
      closeArtifact();
      setArtifactContext({});
    }
    previousThreadId.current = threadId;
  }, [
    threadId,
    stream.isLoading,
    closeArtifact,
    setArtifactContext,
    setContentBlocks,
  ]);

  const openConversation = (id: string | null) => {
    if (id === threadId && id !== null) return;
    models.cancelPendingSelection();
    setInput("");
    setContentBlocks([]);
    closeArtifact();
    setArtifactContext({});
    void setThreadId(id);
    if (!isLargeScreen) void setChatHistoryOpen(false);
  };

  const validateSubmission = (message?: Message) => {
    if (isLoading || stream.isThreadLoading) return false;
    if (models.unavailable) {
      toast.error("This model is unavailable. Choose another model or Auto.");
      return false;
    }
    if (!models.supportsImages && hasImageContent(message?.content)) {
      toast.error("Choose a model that supports images to send this turn.");
      return false;
    }
    return true;
  };
  const send = (text: string, attachments = contentBlocks) => {
    if (!canSend || (!text.trim() && !attachments.length)) return;
    if (!models.supportsImages && hasImageContent(attachments)) {
      toast.error("Choose a model that supports images or remove the image.");
      return;
    }
    const human: Message = {
      id: uuidv4(),
      type: "human",
      content: [
        ...(text.trim() ? [{ type: "text", text: text.trim() }] : []),
        ...attachments,
      ] as Message["content"],
    };
    const toolMessages = ensureToolCallsHaveResponses(messages);
    const context = Object.keys(artifactContext).length
      ? artifactContext
      : undefined;
    void stream.submit(
      { messages: [...toolMessages, human], context },
      {
        ...models.submissionOptions(),
        streamMode: ["values"],
        streamSubgraphs: true,
        streamResumable: true,
        optimisticValues: (prev) => ({
          ...prev,
          context,
          next_prompt_suggestions: [],
          messages: [...(prev.messages ?? []), ...toolMessages, human],
        }),
      },
    );
    setInput("");
    setContentBlocks([]);
  };
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    send(input);
  };
  const handleRegenerate = (
    checkpoint: Checkpoint | null | undefined,
    message?: Message,
  ) => {
    if (!validateSubmission(precedingHuman(messages, message))) return;
    void stream.submit(undefined, {
      ...models.submissionOptions(),
      checkpoint,
      streamMode: ["values"],
      streamSubgraphs: true,
      streamResumable: true,
    });
  };
  const handleRetry = () => {
    // Loading a conversation with no readable state does not start a model run.
    if (!messages.length) {
      if (!isLoading && !stream.isThreadLoading)
        void stream.reloadConversation();
      return;
    }
    if (!validateSubmission(precedingHuman(messages))) return;
    void stream.retry(models.submissionOptions());
  };

  return (
    <div className="bg-background relative flex h-dvh w-full overflow-hidden">
      <div
        className={cn(
          "shrink-0 overflow-hidden transition-[width] duration-200 motion-reduce:transition-none",
          chatHistoryOpen ? "w-0 lg:w-[290px]" : "w-0",
        )}
        inert={!chatHistoryOpen}
      >
        {/* Always mount: the narrow drawer portals outside this desktop wrapper. */}
        <ThreadHistory
          onNewChat={() => openConversation(null)}
          onThreadSelect={openConversation}
        />
      </div>
      <main
        className="relative flex min-w-0 flex-1 flex-col"
        aria-label="Chat"
      >
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-1.5">
            <TooltipIconButton
              tooltip={chatHistoryOpen ? "Close history" : "Open history"}
              variant="ghost"
              className="size-11 rounded-full"
              onClick={() => setChatHistoryOpen(!chatHistoryOpen)}
              aria-expanded={chatHistoryOpen}
            >
              <PanelLeft className="size-5" />
            </TooltipIconButton>
            <h2 className="truncate text-sm font-medium">{title}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {process.env.NEXT_PUBLIC_GITHUB_REPO_URL && (
              <a
                href={process.env.NEXT_PUBLIC_GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open GitHub repository"
                className="text-muted-foreground hover:bg-accent hidden size-11 items-center justify-center rounded-full sm:flex"
              >
                <GitHubSVG
                  width="18"
                  height="18"
                />
              </a>
            )}
            <TooltipIconButton
              tooltip="New chat"
              variant="ghost"
              className="size-11 rounded-full"
              onClick={() => openConversation(null)}
            >
              <SquarePen className="size-5" />
            </TooltipIconButton>
          </div>
        </header>
        <StickToBottom
          key={threadId ?? "new"}
          className="relative min-h-0 flex-1 overflow-hidden"
          initial="instant"
          resize="smooth"
        >
          <StickyToBottomContent>
            {stream.isThreadLoading && !messages.length ? (
              <div
                className="space-y-5 py-3"
                role="status"
                aria-label="Loading conversation"
              >
                <div className="bg-muted ml-auto h-14 w-2/3 animate-pulse rounded-[14px]" />
                <div className="bg-muted h-28 w-full animate-pulse rounded-[14px]" />
                <span className="sr-only">Loading conversation…</span>
              </div>
            ) : !chatStarted ? (
              <div className="my-auto">
                <SuggestedPrompts
                  onSelect={(text) => send(text, [])}
                  disabled={!canSend}
                />
              </div>
            ) : (
              <AssistantTranscript
                messages={messages}
                isLoading={isLoading || stream.isThreadLoading}
                handleRegenerate={handleRegenerate}
                getSubmitOptions={models.submissionOptions}
                canSubmitMessage={validateSubmission}
              />
            )}
            {hasNoAIOrToolMessages && !!stream.interrupt && (
              <AssistantMessage
                message={undefined}
                isLoading={isLoading}
                handleRegenerate={handleRegenerate}
              />
            )}
            {waitingForAnswer && <AssistantMessageLoading />}
            {!isLoading && !stream.error && messages.length > 0 && (
              <FollowUpPrompts
                suggestions={suggestions}
                onSelect={(text) => send(text, [])}
              />
            )}
          </StickyToBottomContent>
          <ScrollToBottom />
        </StickToBottom>
        <div className="mx-auto w-full max-w-[760px] shrink-0 px-4 pt-1 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-8 sm:pb-6">
          {!!stream.error && (
            <div
              className="bg-muted text-foreground border-destructive/20 mb-3 flex items-center gap-3 rounded-[14px] border px-3.5 py-2.5 text-xs"
              role="alert"
            >
              <AlertCircle className="text-destructive size-4 shrink-0" />
              <span className="flex-1">
                {messages.length
                  ? "The conversation was interrupted."
                  : "Couldn't load this conversation."}{" "}
                Your messages are still here.
              </span>
              <Button
                type="button"
                variant="ghost"
                className="text-primary min-h-11 shrink-0 rounded-full text-xs"
                disabled={
                  isLoading ||
                  stream.isThreadLoading ||
                  (!!messages.length && models.unavailable)
                }
                onClick={handleRetry}
              >
                Try again
              </Button>
            </div>
          )}
          {!stream.error && stream.runStatus === "stopped" && (
            <div
              className="text-muted-foreground mb-2 flex items-center justify-between px-3 text-xs"
              role="status"
            >
              <span>Response stopped</span>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 rounded-full text-xs"
                disabled={!canSend}
                onClick={handleRetry}
              >
                Run again
              </Button>
            </div>
          )}
          {stream.runStatus === "reconnecting" && (
            <p
              className="text-muted-foreground mb-2 px-3 text-xs"
              role="status"
            >
              Reconnecting… Your answer will continue here.
            </p>
          )}
          {models.unavailable && (
            <p
              className="text-destructive mb-2 px-3 text-xs"
              role="status"
            >
              This model is unavailable. Choose another model or Auto to send.
            </p>
          )}
          <div
            ref={dropRef}
            className={cn(
              "chat-composer relative",
              dragOver && "border-primary bg-accent border-dashed",
            )}
          >
            <form
              onSubmit={handleSubmit}
              aria-label="Message composer"
            >
              <ContentBlocksPreview
                blocks={contentBlocks}
                onRemove={removeBlock}
              />
              <div className="flex min-h-12 items-center gap-1 pr-1 pl-2">
                <TooltipIconButton
                  type="button"
                  tooltip="Upload PDF or image"
                  variant="ghost"
                  className="text-muted-foreground size-11 shrink-0 rounded-full"
                  onClick={() => document.getElementById(fileInputId)?.click()}
                >
                  <Plus className="size-5" />
                </TooltipIconButton>
                <input
                  id={fileInputId}
                  type="file"
                  onChange={handleFileUpload}
                  multiple
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                  className="hidden"
                  aria-label="Upload PDF or image"
                />
                <textarea
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.metaKey &&
                      !e.ctrlKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Ask the analyst…"
                  aria-label="Your message"
                  className="text-foreground placeholder:text-muted-foreground field-sizing-content max-h-36 min-h-12 min-w-0 flex-1 resize-none border-0 bg-transparent py-[13px] text-sm leading-[1.55] outline-none focus-visible:outline-none"
                />
                <Button
                  type={isLoading ? "button" : "submit"}
                  aria-label={isLoading ? "Stop response" : "Send message"}
                  title={isLoading ? "Stop" : "Send"}
                  className={cn(
                    "disabled:bg-secondary disabled:text-muted-foreground size-11 shrink-0 rounded-full p-0 shadow-none disabled:opacity-100",
                    isLoading
                      ? "text-destructive bg-[var(--negative-container)] hover:bg-[var(--negative-container)]"
                      : "text-white [background:var(--brand-gradient)]",
                  )}
                  disabled={
                    isLoading
                      ? stream.runStatus === "stopping"
                      : !canSend || (!input.trim() && !contentBlocks.length)
                  }
                  onClick={isLoading ? () => void stream.stop() : undefined}
                >
                  {stream.runStatus === "stopping" ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : isLoading ? (
                    <Square className="size-4 fill-current" />
                  ) : (
                    <ArrowUp className="size-5" />
                  )}
                </Button>
              </div>
            </form>
          </div>
          <div className="mt-2 flex min-h-9 items-center justify-between gap-2 px-1">
            <ModelSwitcher
              value={models.value}
              onValueChange={models.select}
              options={models.options}
              disabled={isLoading || stream.isThreadLoading}
              className="max-w-[200px] border-transparent bg-transparent"
            />
            <span className="text-muted-foreground hidden text-[10px] sm:block">
              Enter to send · Shift + Enter for a new line
            </span>
          </div>
        </div>
      </main>
      {artifactOpen && isLargeScreen && (
        <aside
          className="bg-card flex w-[40%] max-w-[700px] min-w-0 flex-col border-l"
          aria-label="Artifact"
        >
          <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
            <ArtifactTitle className="min-w-0 truncate text-sm font-medium" />
            <TooltipIconButton
              tooltip="Close artifact"
              variant="ghost"
              className="size-11 rounded-full"
              onClick={closeArtifact}
            >
              <XIcon className="size-5" />
            </TooltipIconButton>
          </div>
          <ArtifactContent className="relative min-h-0 flex-1 overflow-auto" />
        </aside>
      )}
      <Sheet
        open={artifactOpen && !isLargeScreen}
        onOpenChange={(open) => {
          if (!open) closeArtifact();
        }}
      >
        <SheetContent
          side="right"
          className="w-full max-w-none gap-0 sm:max-w-none"
          aria-describedby={undefined}
        >
          <SheetHeader className="h-14 border-b pr-14">
            <SheetTitle className="truncate text-sm font-medium">
              <ArtifactTitle />
            </SheetTitle>
          </SheetHeader>
          <ArtifactContent className="relative min-h-0 flex-1 overflow-auto" />
        </SheetContent>
      </Sheet>
    </div>
  );
}
