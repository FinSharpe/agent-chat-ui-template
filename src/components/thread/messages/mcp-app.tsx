import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type { Message } from "@langchain/langgraph-sdk";
import { additionalKwargs } from "./tool-activity";
import { toolNoun } from "./tool-labels";

export interface McpApp {
  html: string;
  structuredContent?: unknown;
  toolName?: string;
  title?: string;
}

export function getMcpApp(message: Message): McpApp | undefined {
  const raw = additionalKwargs(message).mcp_app;
  if (!raw || typeof raw !== "object") return;
  const app = raw as Record<string, unknown>;
  if (typeof app.html !== "string" || !app.html.trim()) return;
  return {
    html: app.html,
    structuredContent: app.structuredContent,
    toolName: typeof app.toolName === "string" ? app.toolName : undefined,
    title: typeof app.title === "string" ? app.title : undefined,
  };
}

/** The same self-contained document policy as Mobile's production WebView. */
export function wrapGuestHtml(
  html: string,
  theme: "light" | "dark",
  fontCss = "",
) {
  const prefix = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; frame-src 'none'; base-uri 'none'"><meta name="color-scheme" content="${theme}"><script>document.documentElement.setAttribute('data-theme','${theme}');document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('a'))e.preventDefault()},true);</script>${fontCss}`;
  const head = /<head(?:\s[^>]*)?>/i.exec(html);
  if (head)
    return (
      html.slice(0, head.index + head[0].length) +
      prefix +
      html.slice(head.index + head[0].length)
    );
  const root = /<html(?:\s[^>]*)?>/i.exec(html);
  if (root)
    return (
      html.slice(0, root.index + root[0].length) +
      prefix +
      html.slice(root.index + root[0].length)
    );
  return prefix + html;
}

let fontPromise: Promise<string> | undefined;
function reportFontCss() {
  return (fontPromise ??= Promise.all(
    [400, 500, 600].map(async (weight) => {
      const response = await fetch(
        `/fonts/report/Inter-${weight}.subset.woff2`,
        { signal: AbortSignal.timeout(4000) },
      );
      if (!response.ok) throw new Error("Font unavailable");
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return `@font-face{font-family:Inter;font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${btoa(binary)}) format('woff2');}`;
    }),
  )
    .then((fonts) => `<style>${fonts.join("")}</style>`)
    .catch(() => {
      fontPromise = undefined;
      return "";
    }));
}

type BridgeState = {
  resultSent: boolean;
  document?: string;
  generation?: string;
};
export function handleMcpMessage(
  raw: unknown,
  app: McpApp,
  theme: "light" | "dark",
  state: BridgeState,
): { reply?: Record<string, unknown>; height?: number; ready?: boolean } {
  let decoded = raw;
  if (typeof decoded === "string") {
    try {
      decoded = JSON.parse(decoded);
    } catch {
      return {};
    }
  }
  if (!decoded || typeof decoded !== "object") return {};
  const message = decoded as Record<string, unknown>;
  if (message.jsonrpc !== "2.0") return {};
  if (message.method === "ui/initialize" && message.id != null) {
    return {
      reply: {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          appInfo: { name: "agent-chat", version: "1.0.0" },
          hostCapabilities: {},
          hostContext: { theme },
          protocolVersion: "2026-01-26",
        },
      },
    };
  }
  if (message.method === "ui/notifications/initialized" && !state.resultSent) {
    state.resultSent = true;
    return {
      ready: true,
      reply: {
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: { structuredContent: app.structuredContent },
      },
    };
  }
  if (message.method === "ui/notifications/size-changed") {
    const params = message.params as Record<string, unknown> | undefined;
    const height = params?.height;
    return state.resultSent &&
      typeof height === "number" &&
      Number.isFinite(height) &&
      height > 0
      ? { height: Math.min(100000, Math.ceil(height)) }
      : {};
  }
  if (typeof message.method === "string" && message.id != null) {
    return {
      reply: {
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: `Method not found: ${message.method}` },
      },
    };
  }
  return {};
}

export function McpAppReport({ app }: { app: McpApp }) {
  const { resolvedTheme } = useTheme();
  const theme: "light" | "dark" = resolvedTheme === "dark" ? "dark" : "light";
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridge = useRef<BridgeState>({ resultSent: false });
  const [height, setHeight] = useState(260);
  const loadedDocument = useRef<
    { document: string; generation: string } | undefined
  >(undefined);
  const [readyDocument, setReadyDocument] = useState<{
    document: string;
    generation: string;
  }>();
  const [failed, setFailed] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [fontCss, setFontCss] = useState<string>();
  const [initialTheme] = useState(theme);
  const html = useMemo(
    () =>
      fontCss === undefined
        ? undefined
        : wrapGuestHtml(app.html, initialTheme, fontCss),
    [app.html, initialTheme, fontCss],
  );
  useEffect(() => {
    let active = true;
    reportFontCss().then((css) => {
      if (active) setFontCss(css);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const document = iframeRef.current.srcdoc;
      const documentGeneration = iframeRef.current.dataset.generation;
      if (
        bridge.current.document !== document ||
        bridge.current.generation !== documentGeneration
      ) {
        bridge.current = {
          resultSent: false,
          document,
          generation: documentGeneration,
        };
      }
      const result = handleMcpMessage(event.data, app, theme, bridge.current);
      if (result.reply)
        iframeRef.current?.contentWindow?.postMessage(result.reply, "*");
      if (result.ready) {
        setReadyDocument({ document, generation: documentGeneration ?? "0" });
        setFailed(false);
      }
      if (result.height) setHeight(result.height);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [app, theme]);
  useEffect(() => {
    if (!bridge.current.resultSent) return;
    iframeRef.current?.contentWindow?.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/host-context-changed",
        params: { theme },
      },
      "*",
    );
  }, [theme]);
  useEffect(() => {
    if (html === undefined) return;
    const timer = setTimeout(() => {
      const loaded = loadedDocument.current;
      const bridgeReady =
        bridge.current.resultSent &&
        bridge.current.document === html &&
        bridge.current.generation === String(generation);
      if (
        !bridgeReady &&
        !(loaded?.document === html && loaded.generation === String(generation))
      )
        setFailed(true);
    }, 15000);
    return () => clearTimeout(timer);
  }, [generation, html]);
  const ready =
    readyDocument?.document === html &&
    readyDocument?.generation === String(generation);
  const title = app.title || toolNoun(app.toolName || "Report");
  return (
    <section
      aria-label={title}
      className="my-1 min-w-0"
    >
      {!ready && !failed && (
        <p
          role="status"
          className="text-muted-foreground py-2 text-xs"
        >
          Opening report…
        </p>
      )}
      {failed && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 py-2 text-xs">
          <p role="alert">
            The report did not open. You can reload it; the conversation is
            saved.
          </p>
          <button
            type="button"
            className="text-primary underline underline-offset-2"
            onClick={() => {
              setFailed(false);
              setReadyDocument(undefined);
              setGeneration((value) => value + 1);
            }}
          >
            Reload report
          </button>
        </div>
      )}
      {html !== undefined && (
        <iframe
          key={generation}
          data-generation={generation}
          ref={iframeRef}
          title={title}
          srcDoc={html}
          onLoad={(event) => {
            const document = event.currentTarget.srcdoc;
            if (document !== html) return;
            const loaded = { document, generation: String(generation) };
            loadedDocument.current = loaded;
            setReadyDocument(loaded);
            setFailed(false);
          }}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          className="block w-full border-0"
          style={{ height }}
        />
      )}
    </section>
  );
}
