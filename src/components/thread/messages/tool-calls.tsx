import { AIMessage, ToolMessage } from "@langchain/langgraph-sdk";
import { useEffect, useRef } from "react";
import { ToolCallGroup, ToolPayload, ToolPhase } from "./tool-call-group";
import { ToolStep } from "./tool-activity";
import { useDisclosureOffsets, useDisclosureState } from "./disclosure-state";
import { formatToolName } from "./tool-labels";
import { cn } from "@/lib/utils";
import "./tool-activity.css";

export function ToolCalls({
  toolCalls,
  responses,
  steps: suppliedSteps,
  groupKey,
  phase = "running",
  activeCallKey,
}: {
  toolCalls?: AIMessage["tool_calls"];
  responses?: Map<string, ToolMessage>;
  steps?: ToolStep[];
  groupKey?: string;
  phase?: ToolPhase;
  activeCallKey?: string;
}) {
  const steps =
    suppliedSteps ??
    (toolCalls ?? []).map((call, index) => ({
      key: call.id || `call:${index}`,
      call,
      response: call.id ? responses?.get(call.id) : undefined,
    }));
  const key = groupKey ?? `tools:${steps[0]?.key}`;
  const [groupExpanded, setGroupExpanded] = useDisclosureState(key);
  const [firstExpanded] = useDisclosureState(
    steps[0] ? `call:${steps[0].key}` : undefined,
  );
  const [secondExpanded] = useDisclosureState(
    steps[1] ? `call:${steps[1].key}` : undefined,
  );
  const previousCount = useRef(steps.length);
  const offsets = useDisclosureOffsets();
  const groupRef = useRef<HTMLDivElement>(null);
  const grouped = steps.length >= 3;
  // A third streamed call cannot hide a payload the reader already opened.
  useEffect(() => {
    if (
      previousCount.current < 3 &&
      grouped &&
      (firstExpanded || secondExpanded)
    )
      setGroupExpanded(true);
    previousCount.current = steps.length;
  }, [grouped, steps.length, firstExpanded, secondExpanded, setGroupExpanded]);
  useEffect(() => {
    if (groupExpanded && groupRef.current)
      groupRef.current.scrollTop = offsets?.get(key) ?? 0;
  }, [groupExpanded, offsets, key]);
  if (!steps.length) return null;
  const open = !grouped || groupExpanded;
  const active =
    phase === "running" && steps.some((step) => step.key === activeCallKey);
  return (
    <div
      className="tool-motion-clock w-full min-w-0"
      data-tool-group={key}
    >
      {grouped && (
        <button
          type="button"
          onClick={() => setGroupExpanded(!groupExpanded)}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} tool group: Retrieving data`}
          className="text-muted-foreground hover:text-foreground focus-visible:outline-primary min-h-[26px] w-full cursor-pointer py-[3px] text-left text-[11.5px] leading-[1.45] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span className={cn(active && !open && "tool-crest")}>
            Retrieving data
          </span>
        </button>
      )}
      {open && (
        <div
          ref={groupRef}
          onScroll={(event) => offsets?.set(key, event.currentTarget.scrollTop)}
          className={cn(
            grouped &&
              "max-h-[240px] overflow-auto overscroll-contain border-l pl-2",
          )}
        >
          {steps.map((step) => (
            <ToolCallGroup
              key={step.key}
              callKey={step.key}
              toolCall={step.call}
              response={step.response}
              phase={phase}
              active={phase === "running" && step.key === activeCallKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ToolResult({ message }: { message: ToolMessage }) {
  const [expanded, setExpanded] = useDisclosureState(
    `orphan:${message.id ?? message.tool_call_id}`,
  );
  return (
    <div className="w-full min-w-0">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="text-muted-foreground min-h-[26px] cursor-pointer py-[3px] text-left text-[11.5px] leading-[1.45]"
      >
        {formatToolName(message.name || "Tool response")}
        {message.status === "error" ? " · failed" : ""}
      </button>
      {expanded && (
        <div className="max-h-[184px] overflow-auto overscroll-contain">
          <ToolPayload
            value={message.content}
            persistKey={`orphan:${message.id}`}
            label="Response"
          />
        </div>
      )}
    </div>
  );
}
