import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MarkdownText } from "./markdown-text";

describe("markdown tables", () => {
  it("keeps short metadata intact and longer headlines available in a scroll region", () => {
    render(
      <MarkdownText>{`| Date | Headline | Sentiment |
| --- | --- | --- |
| Oct 9 | Tata Motors announces plans to expand its electric vehicle production across India | Positive |
| Oct 8 | Sales update | Neutral |`}</MarkdownText>,
    );
    const region = screen.getByRole("region", { name: "Data table" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(within(region).getAllByRole("row")).toHaveLength(3);
    for (const text of ["Oct 9", "Oct 8", "Positive", "Neutral"]) {
      expect(within(region).getByText(text)).toHaveClass(
        "markdown-table-cell-compact",
      );
    }
    expect(within(region).getByText(/Tata Motors announces/)).not.toHaveClass(
      "markdown-table-cell-compact",
    );
  });

  it("preserves aligned columns, inline formatting, and custom citation links inside cells", () => {
    render(
      <MarkdownText
        components={{
          a: ({ children }) => (
            <button
              type="button"
              aria-label="Open source"
            >
              {children}
            </button>
          ),
        }}
      >{`| Symbol | Finding |
| ---: | :---: |
| **TATA** | \`BUY\` [Source](https://example.com/source) |`}</MarkdownText>,
    );
    expect(screen.getByRole("cell", { name: "TATA" })).toHaveStyle(
      "text-align: right",
    );
    const finding = screen.getByRole("cell", { name: /BUY Source/ });
    expect(finding).toHaveStyle("text-align: center");
    expect(screen.getByText("TATA").tagName).toBe("STRONG");
    expect(screen.getByText("BUY").tagName).toBe("CODE");
    expect(
      within(finding).getByRole("button", { name: "Open source" }),
    ).toBeInTheDocument();
    expect(finding).not.toHaveAttribute("node");
  });
});
