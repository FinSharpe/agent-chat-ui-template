import { describe, it, expect } from "vitest";
import { formatToolName } from "./tool-labels";

describe("formatToolName", () => {
  it("returns the curated label for known tool names", () => {
    expect(formatToolName("search_endpoints")).toBe(
      "Searching for relevant data points",
    );
    expect(formatToolName("call_api")).toBe("Gathering financial data");
    expect(formatToolName("get_endpoint_spec")).toBe(
      "Reviewing available data options",
    );
    expect(formatToolName("scan")).toBe("Scanning the market");
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

  it("returns the raw name when input is empty or whitespace", () => {
    expect(formatToolName("")).toBe("");
    expect(formatToolName("   ")).toBe("   ");
  });
});
