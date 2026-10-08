import { describe, it, expect } from "vitest";
import { formatToolName } from "./tool-labels";

describe("formatToolName", () => {
  it("returns the curated label for known tool names", () => {
    expect(formatToolName("search_endpoints")).toBe(
      "Find relevant data sources",
    );
    expect(formatToolName("call_api")).toBe("Gather financial data");
    expect(formatToolName("get_endpoint_spec")).toBe("Review available data");
    expect(formatToolName("scan")).toBe("Scan the market");
    expect(formatToolName("scan", true)).toBe("Scanning the market");
  });

  it("falls back to Title Case for unknown tool names", () => {
    expect(formatToolName("get_foo_bar")).toBe("Get Foo Bar");
    expect(formatToolName("do_something_nice")).toBe("Do Something Nice");
  });

  it("uppercases known acronyms in the fallback", () => {
    expect(formatToolName("fetch_user_id")).toBe("Fetch User ID");
    expect(formatToolName("call_external_api")).toBe("Call External API");
  });

  it("lowercases connector words (but not when first)", () => {
    expect(formatToolName("sort_by_date")).toBe("Sort by Date");
    expect(formatToolName("by_example")).toBe("By Example");
  });

  it("provides readable unknown report and instrument names", () => {
    expect(formatToolName("render_etf_report")).toBe("Build the ETF report");
    expect(formatToolName("mf_portfolio_export")).toBe("MF Portfolio Export");
    expect(formatToolName("   ")).toBe("Retrieve data");
    expect(formatToolName("", true)).toBe("Retrieving data");
  });
});
