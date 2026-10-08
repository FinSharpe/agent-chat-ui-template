import { useEffect, useRef } from "react";
import { AIMessage, ToolMessage } from "@langchain/langgraph-sdk";
import { cn } from "@/lib/utils";
import { JsonViewer } from "./json-viewer";
import { formatToolName } from "./tool-labels";
import { useDisclosureOffsets, useDisclosureState } from "./disclosure-state";

export type ToolPhase =
  "running" | "reconnecting" | "stopped" | "failed" | "settled";
type ToolCall = NonNullable<AIMessage["tool_calls"]>[number];

export function parseToolPayload(content: unknown): {
  json: boolean;
  value: unknown;
} {
  if (typeof content !== "string") return { json: true, value: content };
  try {
    return { json: true, value: JSON.parse(content) };
  } catch {
    return { json: false, value: content };
  }
}

export function ToolPayload({
  value,
  persistKey,
  label,
}: {
  value: unknown;
  persistKey?: string;
  label: string;
}) {
  const parsed = parseToolPayload(value);
  return parsed.json ? (
    <JsonViewer
      value={parsed.value}
      persistKey={persistKey}
      defaultExpandDepth={1}
      maxHeight="none"
      copyLabel={`Copy ${label.toLowerCase()}`}
    />
  ) : (
    <pre className="bg-muted/40 text-foreground rounded-md border p-2.5 font-mono text-[11px] leading-[1.5] break-words whitespace-pre-wrap">
      {String(parsed.value)}
    </pre>
  );
}

export function ToolCallGroup({
  toolCall,
  response,
  callKey = toolCall.id,
  phase = response ? "settled" : "running",
  active = phase === "running" && !response,
}: {
  toolCall: ToolCall;
  response?: ToolMessage;
  callKey?: string;
  phase?: ToolPhase;
  active?: boolean;
}) {
  const [expanded, setExpanded] = useDisclosureState(
    callKey ? `call:${callKey}` : undefined,
  );
  const offsets = useDisclosureOffsets();
  const payloadRef = useRef<HTMLDivElement>(null);
  const scrollKey = `payload:${callKey}`;
  useEffect(() => {
    if (expanded && payloadRef.current)
      payloadRef.current.scrollTop = offsets?.get(scrollKey) ?? 0;
  }, [expanded, offsets, scrollKey]);
  const failed = response?.status === "error";
  const unfinished =
    !response &&
    (phase === "stopped" || phase === "failed" || phase === "settled");
  const label =
    formatToolName(toolCall.name, active) +
    (failed ? " · failed" : unfinished ? " · unfinished" : "");
  const missing =
    phase === "reconnecting"
      ? "Waiting to reconnect. No response yet."
      : phase === "stopped"
        ? "Stopped before a response arrived."
        : phase === "failed"
          ? "Run failed before a response arrived."
          : phase === "settled"
            ? "No response was recorded."
            : "No response yet.";
  return (
    <div
      className="min-w-0"
      data-tool-call={callKey}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "tool-disclosure text-muted-foreground hover:text-foreground focus-visible:outline-primary flex min-h-[26px] w-full cursor-pointer items-center py-[3px] text-left text-[11.5px] leading-[1.45] font-normal focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2",
          failed && "text-destructive",
        )}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} tool call: ${label}`}
      >
        <span className={cn(active && "tool-crest")}>{label}</span>
        <span className="sr-only">
          {failed
            ? "Failed"
            : response
              ? "Completed"
              : unfinished
                ? "Unfinished"
                : active
                  ? "Running"
                  : "Pending"}
        </span>
      </button>
      {expanded && (
        <div
          ref={payloadRef}
          onScroll={(event) =>
            offsets?.set(scrollKey, event.currentTarget.scrollTop)
          }
          className="bg-background/70 my-1 flex max-h-[184px] flex-col gap-3 overflow-auto overscroll-contain rounded-lg border p-3"
        >
          <section>
            <h4 className="text-muted-foreground mb-1.5 text-[11px] font-medium">
              Request parameters
            </h4>
            <ToolPayload
              value={toolCall.args ?? {}}
              persistKey={`${callKey}:request`}
              label="Request"
            />
          </section>
          <section>
            <h4 className="text-muted-foreground mb-1.5 text-[11px] font-medium">
              Response
            </h4>
            {response ? (
              <ToolPayload
                value={response.content}
                persistKey={`${callKey}:response`}
                label="Response"
              />
            ) : (
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                {missing}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
