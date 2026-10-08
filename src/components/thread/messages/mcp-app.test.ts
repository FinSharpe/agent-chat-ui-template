import { describe, expect, it } from "vitest";
import { handleMcpMessage, wrapGuestHtml } from "./mcp-app";

const app = {
  html: "<p>Report</p>",
  structuredContent: { header: { name: "ABC" }, rows: [1, 2] },
};

describe("production MCP App protocol", () => {
  it("advertises the implemented protocol, replies to initialize, then delivers structured content", () => {
    const state = { resultSent: false };
    const initial = handleMcpMessage(
      { jsonrpc: "2.0", id: 1, method: "ui/initialize" },
      app,
      "dark",
      state,
    );
    expect(initial.reply).toMatchObject({
      id: 1,
      result: {
        protocolVersion: "2026-01-26",
        hostCapabilities: {},
        hostContext: { theme: "dark" },
      },
    });
    expect(
      handleMcpMessage(
        {
          jsonrpc: "2.0",
          method: "ui/notifications/size-changed",
          params: { height: 90 },
        },
        app,
        "dark",
        state,
      ),
    ).toEqual({});
    const ready = handleMcpMessage(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "ui/notifications/initialized",
      }),
      app,
      "dark",
      state,
    );
    expect(ready.reply).toMatchObject({
      method: "ui/notifications/tool-result",
      params: { structuredContent: app.structuredContent },
    });
    expect(ready.ready).toBe(true);
    expect(
      handleMcpMessage(
        {
          jsonrpc: "2.0",
          method: "ui/notifications/size-changed",
          params: { height: 243.1 },
        },
        app,
        "dark",
        state,
      ),
    ).toEqual({ height: 244 });
  });

  it("settles unsupported RPC requests without replying to notifications or responses", () => {
    expect(
      handleMcpMessage(
        { jsonrpc: "2.0", id: 9, method: "tools/call" },
        app,
        "light",
        { resultSent: true },
      ).reply,
    ).toMatchObject({ id: 9, error: { code: -32601 } });
    expect(
      handleMcpMessage({ jsonrpc: "2.0", id: 9, result: {} }, app, "light", {
        resultSent: true,
      }),
    ).toEqual({});
    expect(
      handleMcpMessage("incomplete", app, "light", { resultSent: true }),
    ).toEqual({});
  });

  it("applies document restrictions before any report script while preserving standards mode", () => {
    const html = wrapGuestHtml(
      "<!doctype html><html><head><script>start()</script></head><body></body></html>",
      "dark",
    );
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(
      html.indexOf("start()"),
    );
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("form-action 'none'");
    expect(
      wrapGuestHtml("<header>Report</header>", "light").startsWith("<meta"),
    ).toBe(true);
  });
});
