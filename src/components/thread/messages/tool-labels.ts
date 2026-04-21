const TOOL_LABELS: Record<string, string> = {
  search_endpoints: "Searching for relevant data points",
  search_scanner_ratios: "Looking up scanner ratios",
  get_market_overview: "Checking the market overview",
  get_stock_detail: "Pulling up stock details",
  find_predefined_groups: "Finding matching stock groups",
  get_scheme_details: "Fetching mutual fund scheme details",
  get_indicator_conditions: "Reviewing technical indicator conditions",
  get_pattern_catalog: "Browsing chart pattern catalog",
  search_specialized_scanners: "Searching specialized scanners",
  get_system_builders: "Listing trading system builders",
  get_system_builder_by_id: "Fetching trading system details",
  scan_by_fundamentals: "Scanning stocks by fundamentals",
  scan: "Scanning the market",
  call_api: "Gathering financial data",
  get_endpoint_spec: "Reviewing available data options",
};

const ACRONYMS = new Set(["api", "id", "url", "sdk"]);
const LOWERCASE_CONNECTORS = new Set([
  "by",
  "of",
  "to",
  "for",
  "and",
  "in",
  "on",
  "at",
  "the",
  "a",
  "an",
]);

function titleCaseWord(word: string, isFirst: boolean): string {
  const lower = word.toLowerCase();
  if (ACRONYMS.has(lower)) return lower.toUpperCase();
  if (!isFirst && LOWERCASE_CONNECTORS.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function formatToolName(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  const cleaned = name.trim();
  if (!cleaned) return name;
  return cleaned
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w, i) => titleCaseWord(w, i === 0))
    .join(" ");
}
