import { useState } from "react";
import { ChevronRight, Copy, CopyCheck } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface JsonViewerProps {
  value: unknown;
  defaultExpandDepth?: number;
  maxHeight?: string;
  copyLabel?: string;
  className?: string;
}

type JsonPrimitive = string | number | boolean | null;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isContainer(v: unknown): v is Record<string, unknown> | unknown[] {
  return Array.isArray(v) || isObject(v);
}

function safeStringify(v: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    v,
    (_, val) => {
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return "[Circular]";
        seen.add(val);
      }
      return val;
    },
    2,
  );
}

export function JsonViewer({
  value,
  defaultExpandDepth = 1,
  maxHeight = "40vh",
  copyLabel = "Copy JSON",
  className,
}: JsonViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(safeStringify(value));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-gray-200 bg-white",
        className,
      )}
    >
      <div className="flex items-center justify-end border-b border-gray-200 bg-gray-50 px-2 py-1">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          aria-label={copyLabel}
        >
          <AnimatePresence
            mode="wait"
            initial={false}
          >
            {copied ? (
              <motion.span
                key="check"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1.5"
              >
                <CopyCheck className="h-3.5 w-3.5 text-green-600" />
                Copied
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" />
                {copyLabel}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
      <div
        className="overflow-auto p-3 font-mono text-sm leading-relaxed"
        style={{ maxHeight }}
      >
        <JsonNode
          value={value}
          depth={0}
          defaultExpandDepth={defaultExpandDepth}
          isLast
          ancestors={[]}
        />
      </div>
    </div>
  );
}

interface JsonNodeProps {
  keyLabel?: string | number;
  value: unknown;
  depth: number;
  defaultExpandDepth: number;
  isLast: boolean;
  ancestors: readonly object[];
}

function JsonNode({
  keyLabel,
  value,
  depth,
  defaultExpandDepth,
  isLast,
  ancestors,
}: JsonNodeProps) {
  const [expanded, setExpanded] = useState(depth < defaultExpandDepth);

  const isContainerValue = isContainer(value);
  const isCircular =
    isContainerValue && ancestors.includes(value as object);

  if (isCircular) {
    return (
      <LeafLine
        keyLabel={keyLabel}
        valueNode={
          <span className="text-gray-400 italic">[Circular]</span>
        }
        isLast={isLast}
      />
    );
  }

  if (!isContainerValue) {
    return (
      <LeafLine
        keyLabel={keyLabel}
        valueNode={<PrimitiveValue value={value as JsonPrimitive} />}
        isLast={isLast}
      />
    );
  }

  const entries: ReadonlyArray<readonly [string | number, unknown]> =
    Array.isArray(value)
      ? value.map((v, i) => [i, v] as const)
      : Object.entries(value);

  const isEmpty = entries.length === 0;
  const openBracket = Array.isArray(value) ? "[" : "{";
  const closeBracket = Array.isArray(value) ? "]" : "}";
  const summary = Array.isArray(value)
    ? `${entries.length} item${entries.length === 1 ? "" : "s"}`
    : `${entries.length} key${entries.length === 1 ? "" : "s"}`;

  const childAncestors = [...ancestors, value as object];

  return (
    <div>
      <div className="flex items-start">
        {isEmpty ? (
          <span className="inline-block h-5 w-4 flex-shrink-0" />
        ) : (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="flex h-5 w-4 flex-shrink-0 items-center justify-center text-gray-500 hover:text-gray-900"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <ChevronRight
              className={cn(
                "h-3 w-3 transition-transform",
                expanded && "rotate-90",
              )}
            />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {keyLabel !== undefined && (
            <>
              <span className="text-purple-700">
                {typeof keyLabel === "number"
                  ? keyLabel
                  : JSON.stringify(keyLabel)}
              </span>
              <span className="text-gray-500">: </span>
            </>
          )}
          {isEmpty ? (
            <span className="text-gray-500">
              {openBracket}
              {closeBracket}
              {!isLast && ","}
            </span>
          ) : expanded ? (
            <span className="text-gray-500">{openBracket}</span>
          ) : (
            <>
              <span className="text-gray-500">{openBracket}</span>
              <span className="px-1 text-gray-400">{summary}</span>
              <span className="text-gray-500">
                {closeBracket}
                {!isLast && ","}
              </span>
            </>
          )}
        </div>
      </div>
      {expanded && !isEmpty && (
        <>
          <div className="ml-[7px] border-l border-gray-100 pl-3">
            {entries.map(([k, v], idx) => (
              <JsonNode
                key={String(k)}
                keyLabel={k}
                value={v}
                depth={depth + 1}
                defaultExpandDepth={defaultExpandDepth}
                isLast={idx === entries.length - 1}
                ancestors={childAncestors}
              />
            ))}
          </div>
          <div className="flex items-start">
            <span className="inline-block h-5 w-4 flex-shrink-0" />
            <span className="text-gray-500">
              {closeBracket}
              {!isLast && ","}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function LeafLine({
  keyLabel,
  valueNode,
  isLast,
}: {
  keyLabel?: string | number;
  valueNode: React.ReactNode;
  isLast: boolean;
}) {
  return (
    <div className="flex items-start">
      <span className="inline-block h-5 w-4 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        {keyLabel !== undefined && (
          <>
            <span className="text-purple-700">
              {typeof keyLabel === "number"
                ? keyLabel
                : JSON.stringify(keyLabel)}
            </span>
            <span className="text-gray-500">: </span>
          </>
        )}
        {valueNode}
        {!isLast && <span className="text-gray-500">,</span>}
      </div>
    </div>
  );
}

function PrimitiveValue({ value }: { value: JsonPrimitive }) {
  if (value === null) {
    return <span className="text-gray-400 italic">null</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-blue-700">{String(value)}</span>;
  }
  if (typeof value === "number") {
    return <span className="text-amber-700">{value}</span>;
  }
  if (typeof value === "string") {
    return <StringValue value={value} />;
  }
  return <span className="text-gray-500">{String(value)}</span>;
}

function StringValue({ value }: { value: string }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 500;
  const tooLong = value.length > LIMIT;
  const display = tooLong && !expanded ? value.slice(0, LIMIT) + "…" : value;

  return (
    <span className="break-all whitespace-pre-wrap text-green-700">
      {JSON.stringify(display)}
      {tooLong && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="ml-2 rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </span>
  );
}
