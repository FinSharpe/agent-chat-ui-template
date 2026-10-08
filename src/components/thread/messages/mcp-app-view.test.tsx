import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { McpAppReport } from "./mcp-app";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));
const app = {
  html: "<html><head></head><body><p>Report</p></body></html>",
  title: "Stock report",
  structuredContent: { symbol: "ABC" },
};

describe("inline report host", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(
          async () => new Response(new Uint8Array([0, 1, 2])),
        ),
    );
  });

  it("isolates the report, injects actual report font weights, and accepts RPC only from its own frame", async () => {
    render(<McpAppReport app={app} />);
    const frame = (await screen.findByTitle(
      "Stock report",
    )) as HTMLIFrameElement;
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame.srcdoc).toContain("font-weight:400");
    expect(frame.srcdoc).toContain("font-weight:500");
    expect(frame.srcdoc).toContain("font-weight:600");
    const deliver = vi.spyOn(frame.contentWindow!, "postMessage");
    const initialized = {
      jsonrpc: "2.0",
      method: "ui/notifications/initialized",
    };
    act(() =>
      window.dispatchEvent(
        new MessageEvent("message", { source: window, data: initialized }),
      ),
    );
    expect(deliver).not.toHaveBeenCalled();
    act(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          source: frame.contentWindow,
          data: initialized,
        }),
      ),
    );
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "ui/notifications/tool-result",
        params: { structuredContent: app.structuredContent },
      }),
      "*",
    );
    act(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          source: frame.contentWindow,
          data: {
            jsonrpc: "2.0",
            method: "ui/notifications/size-changed",
            params: { height: 412 },
          },
        }),
      ),
    );
    await waitFor(() => expect(frame.style.height).toBe("412px"));
    expect(screen.queryByText("Opening report…")).not.toBeInTheDocument();
  });

  it("accepts silent loaded reports while timing out a later unresponsive document", async () => {
    const { rerender } = render(<McpAppReport app={app} />);
    await screen.findByTitle("Stock report");
    vi.useFakeTimers();
    rerender(<McpAppReport app={{ ...app, html: "<p>Static report</p>" }} />);
    fireEvent.load(screen.getByTitle("Stock report"));
    act(() => vi.advanceTimersByTime(16000));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Opening report…")).not.toBeInTheDocument();

    rerender(
      <McpAppReport app={{ ...app, html: "<p>Unresponsive report</p>" }} />,
    );
    act(() => vi.advanceTimersByTime(16000));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The report did not open",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload report" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.load(screen.getByTitle("Stock report"));
    act(() => vi.advanceTimersByTime(16000));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
