import type { Message } from "@langchain/langgraph-sdk";
import { additionalKwargs } from "./tool-activity";
import { getContentString } from "../utils";

export type Citation = {
  cite: string;
  chunk_id: string;
  document_id: string;
  symbol: string;
  compname: string;
  subcatname: string;
  news_dt_iso: string;
  attachment_name: string;
  quote: string;
  page?: number;
  bboxes: unknown[];
  coord_origin: string;
};
export type CitationRegistry = {
  byTag: Map<string, Citation>;
  documents: Citation[][];
  numbers: Map<string, number>;
};

export function parseCitation(raw: unknown): Citation | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.cite !== "string" || !entry.cite.trim()) return;
  const str = (key: string) =>
    typeof entry[key] === "string" ? (entry[key] as string) : "";
  return {
    cite: entry.cite,
    chunk_id: str("chunk_id"),
    document_id: str("document_id"),
    symbol: str("symbol"),
    compname: str("compname"),
    subcatname: str("subcatname"),
    news_dt_iso: str("news_dt_iso"),
    attachment_name: str("attachment_name"),
    quote: str("quote"),
    page:
      typeof entry.page === "number" && Number.isFinite(entry.page)
        ? Math.trunc(entry.page)
        : undefined,
    bboxes: Array.isArray(entry.bboxes) ? entry.bboxes : [],
    coord_origin: str("coord_origin"),
  };
}

const marker = /\[\[([^[\]\n]{0,80})\]{1,2}/g;
function codeRanges(text: string) {
  return [...text.matchAll(/```[\s\S]*?(?:```|$)|`[^`\n]*`/g)].map((match) => [
    match.index!,
    match.index! + match[0].length,
  ]);
}
const inCode = (ranges: number[][], index: number) =>
  ranges.some(([start, end]) => index >= start && index < end);

export function citationRegistry(messages: Message[]): CitationRegistry {
  const byTag = new Map<string, Citation>();
  const filings = new Map<string, Citation[]>();
  for (const message of messages) {
    const raw = additionalKwargs(message).citations;
    if (!Array.isArray(raw)) continue;
    for (const entry of raw) {
      const citation = parseCitation(entry);
      if (!citation || byTag.has(citation.cite)) continue;
      byTag.set(citation.cite, citation);
      const key =
        citation.document_id || citation.attachment_name || citation.cite;
      filings.set(key, [...(filings.get(key) ?? []), citation]);
    }
  }
  const documents: Citation[][] = [];
  const fingerprint = (passages: Citation[]) =>
    JSON.stringify({
      issuer: [
        passages[0].symbol,
        passages[0].compname,
        passages[0].subcatname,
        passages[0].news_dt_iso,
      ],
      passages: passages
        .map((citation) =>
          JSON.stringify([
            citation.page,
            citation.quote,
            citation.bboxes,
            citation.coord_origin,
          ]),
        )
        .sort(),
    });
  const seenDocuments = new Set<string>();
  for (const passages of filings.values()) {
    const key = fingerprint(passages);
    if (seenDocuments.has(key)) continue;
    seenDocuments.add(key);
    documents.push(
      passages
        .map((citation, index) => ({ citation, index }))
        .sort(
          (a, b) =>
            (a.citation.page ?? Infinity) - (b.citation.page ?? Infinity) ||
            a.index - b.index,
        )
        .map(({ citation }) => citation),
    );
  }
  const numbers = new Map<string, number>();
  for (const message of messages) {
    if (message.type !== "ai") continue;
    const text = getContentString(message.content);
    const ranges = codeRanges(text);
    for (const match of text.matchAll(marker)) {
      if (
        inCode(ranges, match.index!) ||
        !byTag.has(match[1]) ||
        numbers.has(match[1])
      )
        continue;
      numbers.set(match[1], numbers.size + 1);
    }
  }
  return { byTag, documents, numbers };
}

/** Keep code literal; unresolved, malformed and half-written prose tags never reach readers. */
export function resolveCitationMarkdown(
  text: string,
  registry: CitationRegistry,
) {
  const ranges = codeRanges(text);
  const lines = text.split("\n");
  const tableRanges: number[][] = [];
  let lineOffset = 0;
  let inTable = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? "") && line.includes("|"))
      inTable = true;
    if (inTable && !line.includes("|")) inTable = false;
    if (inTable) tableRanges.push([lineOffset, lineOffset + line.length]);
    lineOffset += line.length + 1;
  }
  let resolved = text.replace(
    marker,
    (full: string, tag: string, offset: number) => {
      if (inCode(ranges, offset)) return full;
      const number = registry.numbers.get(tag);
      if (!registry.byTag.has(tag) || !number || inCode(tableRanges, offset))
        return "";
      return `[${number}](#citation-${encodeURIComponent(tag)})`;
    },
  );
  const truncated = /\s*\[\[[^[\]\n]{0,80}$/.exec(resolved);
  if (truncated && !inCode(codeRanges(resolved), truncated.index))
    resolved = resolved.slice(0, truncated.index);
  return resolved;
}
