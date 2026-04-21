import { useState } from "react";
import {
  ChevronRight,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { AIMessage, ToolMessage } from "@langchain/langgraph-sdk";
import { cn } from "@/lib/utils";
import { JsonViewer } from "./json-viewer";
import { formatToolName } from "./tool-labels";

type ToolCall = NonNullable<AIMessage["tool_calls"]>[number];

interface ToolCallGroupProps {
  toolCall: ToolCall;
  response?: ToolMessage;
}

function parseResponseContent(content: ToolMessage["content"]): {
  structured: unknown | null;
  text: string;
} {
  if (typeof content !== "string") {
    return { structured: null, text: JSON.stringify(content) };
  }
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) || (typeof parsed === "object" && parsed !== null)) {
      return { structured: parsed, text: content };
    }
  } catch {
    // fall through to plain string
  }
  return { structured: null, text: content };
}

function TextFallback({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = text.split("\n");
  const tooLong = lines.length > 4 || text.length > 500;
  const display =
    tooLong && !expanded
      ? text.length > 500
        ? text.slice(0, 500) + "…"
        : lines.slice(0, 4).join("\n") + "\n…"
      : text;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
      <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-sm text-gray-800">
        {display}
      </pre>
      {tooLong && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full cursor-pointer items-center justify-center border-t border-gray-200 py-2 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function StatusPill({ response }: { response?: ToolMessage }) {
  if (!response) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
        <Loader2 className="h-3 w-3 animate-spin" />
        Running
      </span>
    );
  }
  if (response.status === "error") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        <AlertCircle className="h-3 w-3" />
        Error
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
      <CheckCircle2 className="h-3 w-3" />
      Done
    </span>
  );
}

export function ToolCallGroup({ toolCall, response }: ToolCallGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const hasArgs = Object.keys(toolCall.args ?? {}).length > 0;

  const parsed = response ? parseResponseContent(response.content) : null;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 border-gray-200 bg-gray-50 px-3 py-2 text-left transition-colors hover:bg-gray-100"
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse tool call" : "Expand tool call"}
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 flex-shrink-0 text-gray-500 transition-transform",
            expanded && "rotate-90",
          )}
        />
        <span className="font-medium text-gray-900">
          {formatToolName(toolCall.name)}
        </span>
        <div className="ml-auto">
          <StatusPill response={response} />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-gray-200"
          >
            <div className="flex max-h-[45vh] flex-col gap-3 overflow-auto p-3">
              <section>
                <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                  Arguments
                </h4>
                {hasArgs ? (
                  <JsonViewer
                    value={toolCall.args}
                    defaultExpandDepth={2}
                    copyLabel="Copy args"
                  />
                ) : (
                  <code className="block rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-500">
                    {"{}"}
                  </code>
                )}
              </section>

              {response && parsed && (
                <section>
                  <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Response
                  </h4>
                  {parsed.structured !== null ? (
                    <JsonViewer
                      value={parsed.structured}
                      defaultExpandDepth={1}
                      copyLabel="Copy response"
                    />
                  ) : (
                    <TextFallback text={parsed.text} />
                  )}
                </section>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
