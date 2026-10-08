import { useState } from "react";
import { ChevronRight, Copy, CopyCheck } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useDisclosureState } from "./disclosure-state";

interface JsonViewerProps {
  value: unknown;
  defaultExpandDepth?: number;
  maxHeight?: string;
  copyLabel?: string;
  className?: string;
  persistKey?: string;
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
  persistKey,
}: JsonViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard
      .writeText(safeStringify(value))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  };

  return (
    <div
      className={cn(
        "bg-background overflow-hidden rounded-md border",
        className,
      )}
    >
      <div className="bg-muted/40 flex items-center justify-end border-b px-2 py-1">
        <button
          onClick={handleCopy}
          className="text-muted-foreground hover:text-foreground hover:bg-muted flex min-h-7 items-center gap-1.5 rounded px-2 py-1 text-[10px] transition-colors"
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
        className="text-foreground overflow-auto p-2 font-mono text-[11px] leading-[1.5]"
        style={{ maxHeight }}
      >
        <JsonNode
          value={value}
          depth={0}
          defaultExpandDepth={defaultExpandDepth}
          isLast
          ancestors={[]}
          persistKey={persistKey}
          path="root"
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
  persistKey?: string;
  path: string;
}

function JsonNode({
  keyLabel,
  value,
  depth,
  defaultExpandDepth,
  isLast,
  ancestors,
  persistKey,
  path,
}: JsonNodeProps) {
  const [expanded, setExpanded] = useDisclosureState(
    persistKey ? `json:${persistKey}:${path}` : undefined,
    depth < defaultExpandDepth,
  );
  const [visibleCount, setVisibleCount] = useState(100);

  const isContainerValue = isContainer(value);
  const isCircular = isContainerValue && ancestors.includes(value as object);

  if (isCircular) {
    return (
      <LeafLine
        keyLabel={keyLabel}
        valueNode={<span className="text-gray-400 italic">[Circular]</span>}
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
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground focus-visible:outline-primary flex h-7 w-6 flex-shrink-0 items-center justify-center rounded-sm focus-visible:outline-2"
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
              <span className="text-primary">
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
          <div className="ml-[7px] border-l pl-3">
            {entries.slice(0, visibleCount).map(([k, v], idx) => (
              <JsonNode
                key={String(k)}
                keyLabel={k}
                value={v}
                depth={depth + 1}
                defaultExpandDepth={defaultExpandDepth}
                isLast={idx === entries.length - 1}
                ancestors={childAncestors}
                persistKey={persistKey}
                path={`${path}/${JSON.stringify(k)}`}
              />
            ))}
            {entries.length > visibleCount && (
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + 100)}
                className="text-primary min-h-8 px-1 text-[11px]"
              >
                Show next {Math.min(100, entries.length - visibleCount)} items
              </button>
            )}
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
            <span className="text-primary">
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
    return <span className="text-primary">{String(value)}</span>;
  }
  if (typeof value === "number") {
    return <span className="text-foreground">{value}</span>;
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
    <span className="break-all whitespace-pre-wrap text-[var(--positive)]">
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
