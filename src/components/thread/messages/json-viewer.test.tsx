import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JsonViewer } from "./json-viewer";

function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
  return writeText;
}

describe("<JsonViewer />", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("renders all primitive types with distinct styling", () => {
    render(
      <JsonViewer
        value={{
          str: "hello",
          num: 42,
          bool: true,
          nothing: null,
        }}
        defaultExpandDepth={5}
      />,
    );
    // string rendered with surrounding quotes via JSON.stringify
    expect(screen.getByText('"hello"')).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("true")).toBeInTheDocument();
    expect(screen.getByText("null")).toBeInTheDocument();
    // keys rendered with quotes
    expect(screen.getByText('"str"')).toBeInTheDocument();
    expect(screen.getByText('"num"')).toBeInTheDocument();
  });

  it("starts with nested containers collapsed when defaultExpandDepth=1", () => {
    render(
      <JsonViewer
        value={{ outer: { inner: "deep" } }}
        defaultExpandDepth={1}
      />,
    );
    // outer key visible
    expect(screen.getByText('"outer"')).toBeInTheDocument();
    // inner value hidden because outer is folded
    expect(screen.queryByText('"deep"')).not.toBeInTheDocument();
    // fold summary shown
    expect(screen.getByText(/1 key/)).toBeInTheDocument();
  });

  it("expands both levels when defaultExpandDepth=2", () => {
    render(
      <JsonViewer
        value={{ outer: { inner: "deep" } }}
        defaultExpandDepth={2}
      />,
    );
    expect(screen.getByText('"deep"')).toBeInTheDocument();
  });

  it("toggles an individual node without affecting siblings", async () => {
    const user = userEvent.setup();
    render(
      <JsonViewer
        value={{ a: { inside_a: 1 }, b: { inside_b: 2 } }}
        defaultExpandDepth={1}
      />,
    );

    expect(screen.queryByText('"inside_a"')).not.toBeInTheDocument();
    expect(screen.queryByText('"inside_b"')).not.toBeInTheDocument();

    // Find all Expand buttons; first two are for a and b containers
    const expandButtons = screen.getAllByRole("button", { name: /expand/i });
    await user.click(expandButtons[0]);

    expect(screen.getByText('"inside_a"')).toBeInTheDocument();
    expect(screen.queryByText('"inside_b"')).not.toBeInTheDocument();
  });

  it("copies pretty-printed JSON to clipboard when Copy button clicked", async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();
    render(<JsonViewer value={{ foo: "bar" }} />);

    await user.click(screen.getByRole("button", { name: /copy json/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const written = writeText.mock.calls[0][0] as string;
    expect(JSON.parse(written)).toEqual({ foo: "bar" });
    expect(written).toContain("\n"); // pretty-printed
  });

  it("renders [Circular] marker without stack overflow", () => {
    const obj: Record<string, unknown> = { name: "root" };
    obj.self = obj;
    render(
      <JsonViewer
        value={obj}
        defaultExpandDepth={5}
      />,
    );
    expect(screen.getByText("[Circular]")).toBeInTheDocument();
    expect(screen.getByText('"root"')).toBeInTheDocument();
  });

  it("renders empty object and array without a chevron", () => {
    const { container } = render(
      <JsonViewer
        value={{ a: {}, b: [] }}
        defaultExpandDepth={5}
      />,
    );
    // Chevron buttons — only the outer container should have one (its children are empty)
    const chevrons = container.querySelectorAll(
      'button[aria-label="Expand"], button[aria-label="Collapse"]',
    );
    expect(chevrons).toHaveLength(1);
  });

  it("renders arrays with numeric indices and item count summary", () => {
    render(
      <JsonViewer
        value={[10, 20, 30]}
        defaultExpandDepth={0}
      />,
    );
    expect(screen.getByText(/3 items/)).toBeInTheDocument();
  });

  it("truncates long strings with a Show more toggle", async () => {
    const user = userEvent.setup();
    const longStr = "x".repeat(600);
    render(
      <JsonViewer
        value={{ s: longStr }}
        defaultExpandDepth={5}
      />,
    );

    expect(
      screen.getByRole("button", { name: /show more/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText((content) => content.includes("x".repeat(600))),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show more/i }));

    expect(
      screen.getByRole("button", { name: /show less/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.includes("x".repeat(600))),
    ).toBeInTheDocument();
  });
});
