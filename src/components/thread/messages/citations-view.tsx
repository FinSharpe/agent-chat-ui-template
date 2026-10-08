import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Components } from "react-markdown";
import type { Message } from "@langchain/langgraph-sdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useStreamContext } from "@/providers/Stream";
import {
  Citation,
  citationRegistry,
  CitationRegistry,
  resolveCitationMarkdown,
} from "./citations";

const CitationContext = createContext<{
  registry: CitationRegistry;
  open: (citation: Citation) => void;
} | null>(null);
const Dialog = DialogPrimitive.Root;
const DialogTitle = DialogPrimitive.Title;
function DialogContent({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={`bg-background fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-xl border shadow-lg ${className}`}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close source"
          className="text-muted-foreground hover:text-foreground hover:bg-muted absolute top-2 right-2 flex size-8 items-center justify-center rounded-full"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function filingLabel(citation: Citation) {
  return (
    citation.subcatname
      .replace(/[-_]+/g, " ")
      .replace(/^\w/, (letter) => letter.toUpperCase()) || "Company filing"
  );
}

export function useCitationMarkdown(text: string) {
  const context = useContext(CitationContext);
  const components: Components | undefined = context
    ? {
        a: ({ href, children }) => {
          if (!href?.startsWith("#citation-"))
            return (
              <a
                href={href}
                target={href?.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
                className="text-primary underline underline-offset-4"
              >
                {children}
              </a>
            );
          let tag: string;
          try {
            tag = decodeURIComponent(href.slice("#citation-".length));
          } catch {
            return null;
          }
          const citation = context.registry.byTag.get(tag);
          if (!citation) return null;
          return (
            <button
              type="button"
              onClick={() => context.open(citation)}
              aria-label={`Source ${context.registry.numbers.get(tag)}: ${citation.compname || citation.symbol}, ${filingLabel(citation)}`}
              className="bg-primary/10 text-primary focus-visible:outline-primary mx-0.5 inline-flex min-h-6 min-w-6 cursor-pointer items-center justify-center rounded-full px-1 align-baseline text-[10px] font-medium no-underline focus-visible:outline-2"
            >
              {children}
            </button>
          );
        },
      }
    : undefined;
  return {
    text: resolveCitationMarkdown(
      text,
      context?.registry ?? {
        byTag: new Map(),
        documents: [],
        numbers: new Map(),
      },
    ),
    components,
  };
}

export function CitationTurn({
  messages,
  settled,
  children,
}: {
  messages: Message[];
  settled: boolean;
  children: ReactNode;
}) {
  const registry = useMemo(() => citationRegistry(messages), [messages]);
  const [selected, setSelected] = useState<Citation | null>(null);
  return (
    <CitationContext.Provider value={{ registry, open: setSelected }}>
      {children}
      {settled && registry.documents.length > 0 && (
        <div className="mt-2 border-t pt-3">
          <p className="text-muted-foreground mb-1 text-[11px] font-medium">
            Sources
          </p>
          <div className="flex flex-col">
            {registry.documents.map((passages) => {
              const first = passages[0];
              const pages = [
                ...new Set(
                  passages
                    .map((passage) => passage.page)
                    .filter((page) => page != null),
                ),
              ];
              return (
                <button
                  key={first.document_id || first.cite}
                  type="button"
                  onClick={() => setSelected(first)}
                  className="hover:bg-muted/50 flex min-h-14 cursor-pointer flex-col justify-center rounded-lg px-2 py-2 text-left"
                >
                  <span className="text-foreground text-xs font-medium">
                    {first.compname || first.symbol || "Company filing"}
                  </span>
                  <span className="text-muted-foreground text-[11px]">
                    {filingLabel(first)}
                    {first.news_dt_iso
                      ? ` · ${first.news_dt_iso.slice(0, 10)}`
                      : ""}
                    {pages.length
                      ? ` · ${pages.length === 1 ? "Page" : "Pages"} ${pages.join(", ")}`
                      : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {selected && (
        <CitationDialog
          key={`${selected.document_id}:${selected.attachment_name}`}
          citation={selected}
          registry={registry}
          close={() => setSelected(null)}
        />
      )}
    </CitationContext.Provider>
  );
}

function CitationDialog({
  citation,
  registry,
  close,
}: {
  citation: Citation;
  registry: CitationRegistry;
  close: () => void;
}) {
  const { requestApi } = useStreamContext();
  const [pdfUrl, setPdfUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(
    Boolean(citation.attachment_name && citation.subcatname),
  );
  const [retry, setRetry] = useState(0);
  const passages = useMemo(
    () =>
      [...registry.byTag.values()]
        .filter((entry) =>
          citation.document_id
            ? entry.document_id === citation.document_id
            : entry.attachment_name === citation.attachment_name,
        )
        .sort((a, b) => (a.page ?? Infinity) - (b.page ?? Infinity)),
    [registry, citation.document_id, citation.attachment_name],
  );
  const [passageIndex, setPassageIndex] = useState(
    Math.max(
      0,
      passages.findIndex((entry) => entry.cite === citation.cite),
    ),
  );
  const passage = passages[passageIndex] ?? citation;
  useEffect(() => {
    if (!citation?.attachment_name || !citation.subcatname) return;
    let active = true;
    let objectUrl: string | undefined;
    const abort = new AbortController();
    const params = new URLSearchParams({
      subcatname: citation.subcatname,
      attachment_name: citation.attachment_name,
    });
    requestApi(`/api/filings/pdf?${params}`, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("The source document could not be opened.");
        const blob = await response.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(
          new Blob([blob], { type: "application/pdf" }),
        );
        setPdfUrl(objectUrl);
      })
      .catch(() => {
        if (active)
          setError(
            "The source document could not be opened. The quoted passage is available below.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [citation?.attachment_name, citation?.subcatname, retry, requestApi]);
  return (
    <Dialog
      open={!!citation}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-24px)] max-w-3xl flex-col gap-3 overflow-y-auto p-4 sm:p-6">
        <div className="pr-8">
          <DialogTitle className="text-sm font-semibold">
            {citation?.compname || citation?.symbol || "Source passage"}
          </DialogTitle>
        </div>
        {citation && (
          <>
            <p className="text-muted-foreground text-xs">
              {filingLabel(citation)}
              {passage.page != null ? ` · Page ${passage.page}` : ""}
            </p>
            {passages.length > 1 && (
              <div className="text-muted-foreground flex items-center justify-between gap-3 text-[11px]">
                <button
                  type="button"
                  disabled={passageIndex === 0}
                  aria-label="Previous source passage"
                  className="text-primary min-h-8 px-2 disabled:opacity-40"
                  onClick={() => setPassageIndex((index) => index - 1)}
                >
                  Previous
                </button>
                <span>
                  Passage {passageIndex + 1} of {passages.length}
                </span>
                <button
                  type="button"
                  disabled={passageIndex === passages.length - 1}
                  aria-label="Next source passage"
                  className="text-primary min-h-8 px-2 disabled:opacity-40"
                  onClick={() => setPassageIndex((index) => index + 1)}
                >
                  Next
                </button>
              </div>
            )}
            <blockquote className="text-foreground border-primary/25 max-h-52 overflow-y-auto border-l-2 pl-3 text-[13px] leading-[1.5] whitespace-pre-wrap">
              {passage.quote || "No quotation was included with this source."}
            </blockquote>
            {loading && (
              <p
                role="status"
                className="text-muted-foreground text-xs"
              >
                Opening source document…
              </p>
            )}
            {error && (
              <div
                role="alert"
                className="text-muted-foreground text-xs"
              >
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => {
                    setError(undefined);
                    setLoading(true);
                    setRetry((value) => value + 1);
                  }}
                  className="text-primary mt-2 min-h-8 underline"
                >
                  Try again
                </button>
              </div>
            )}
            {pdfUrl && (
              <iframe
                title="Source document"
                src={`${pdfUrl}#page=${passage.page ?? 1}`}
                className="h-[50dvh] min-h-64 w-full rounded-lg border"
              />
            )}
            {registry.byTag.size > 1 && (
              <p className="text-muted-foreground text-[11px]">
                Quotes and page references come from the filings retrieved for
                this answer.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
