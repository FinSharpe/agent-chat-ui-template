/**
 * Local UI verification fixture. These are synthetic conversations, never a
 * source for production API contracts. Wire shapes were checked against the
 * installed SDK and FinSharpe-Mobile's actual transport before implementation.
 *
 * node tests/support/mock-langgraph-server.mjs
 * POST /__scenario { mode: 'normal'|'slow'|'error'|'reconnect'|'submit-error',
 *   historyError?: boolean, searchError?: boolean, cancelError?: boolean }
 * GET /__state exposes the fixture's received request bodies for validation.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const port = Number(process.env.MOCK_LANGGRAPH_PORT || 3200);
let scenario = {
  mode: "normal",
  historyError: false,
  searchError: false,
  cancelError: false,
};
const threads = new Map();
const runs = new Map();
const requests = [];
const clone = (value) => structuredClone(value);

const report = `<!doctype html><html><head><style>body{font:14px system-ui;margin:0;padding:22px;color:#18242c;background:#fff}h3{font-size:18px;margin:0 0 10px}.bars{display:grid;gap:12px;margin-top:18px}.bar{background:#e7edf5;border-radius:6px;height:20px}.bar i{display:block;height:100%;background:#3265a8;border-radius:6px}small{color:#5e6872}</style></head><body><h3>Company overview</h3><small>Sample report · local interface verification</small><div class="bars"><div>Revenue growth<div class="bar"><i style="width:72%"></i></div></div><div>Operating margin<div class="bar"><i style="width:55%"></i></div></div><div>Cash generation<div class="bar"><i style="width:86%"></i></div></div></div><script>window.parent.postMessage({jsonrpc:'2.0',id:1,method:'ui/initialize',params:{}},'*');window.addEventListener('message',function(e){if(e.data.id===1){window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized'},'*');window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/size-changed',params:{height:265}},'*')}})</script></body></html>`;
const citation = {
  cite: "sample-filing",
  chunk_id: "chunk-1",
  document_id: "document-1",
  symbol: "EXAMPLE",
  compname: "Example Company",
  subcatname: "Annual Report",
  news_dt_iso: "2026-09-15",
  attachment_name: "sample-report.pdf",
  quote:
    "The company increased operating cash flow while maintaining its investment programme.",
  page: 1,
  bboxes: [[0.1, 0.2, 0.9, 0.35]],
  coord_origin: "top-left",
};

function checkpoint(thread, parent = thread.history[0]?.checkpoint ?? null) {
  const state = {
    values: clone(thread.values),
    next: [],
    tasks: [],
    checkpoint: {
      thread_id: thread.thread_id,
      checkpoint_ns: "",
      checkpoint_id: randomUUID(),
    },
    parent_checkpoint: parent,
    created_at: new Date().toISOString(),
    metadata: {
      source: "loop",
      step: thread.history.length,
      writes: {},
      parents: {},
    },
  };
  thread.history.unshift(state);
  thread.updated_at = state.created_at;
  return state;
}

function makeThread(id = randomUUID(), title = "", ageDays = 0) {
  const date = new Date(Date.now() - ageDays * 86400000).toISOString();
  const thread = {
    thread_id: id,
    created_at: date,
    updated_at: date,
    status: "idle",
    metadata: { graph_id: "orchestrator", ...(title && { title }) },
    values: { messages: [], ui: [], next_prompt_suggestions: [] },
    history: [],
  };
  threads.set(id, thread);
  return thread;
}

function toolMessage(id, name, extras = {}) {
  return {
    id: `result-${id}`,
    type: "tool",
    name,
    tool_call_id: id,
    content: JSON.stringify({
      status: "success",
      rows: [{ company: "Example Company", growth: "12.4%", margin: "24.8%" }],
    }),
    additional_kwargs: extras,
  };
}

function researchMessages(prefix) {
  const calls = (names, group) =>
    names.map((name, index) => ({
      id: `${prefix}-${group}-${index}`,
      name,
      type: "tool_call",
      args: {
        symbol: "EXAMPLE",
        period: "FY2026",
        ...(name === "search_filings" && { query: "cash flow and growth" }),
      },
    }));
  const first = calls(["resolve_symbols", "call_api"], "first");
  const second = calls(
    ["search_filings", "get_filing_text", "render_stock_report"],
    "second",
  );
  return [
    {
      id: `${prefix}-intro`,
      type: "ai",
      content:
        "I’ll check the financials first, then compare them with the latest company filing.",
    },
    { id: `${prefix}-calls-a`, type: "ai", content: "", tool_calls: first },
    ...first.map((call) => toolMessage(call.id, call.name)),
    {
      id: `${prefix}-middle`,
      type: "ai",
      content:
        "The financial data is ready. Next, I’ll review the filing and build a report.",
    },
    { id: `${prefix}-calls-b`, type: "ai", content: "", tool_calls: second },
    toolMessage(second[0].id, second[0].name, { citations: [citation] }),
    toolMessage(second[1].id, second[1].name, {
      citations: [
        {
          ...citation,
          cite: "sample-second",
          chunk_id: "chunk-2",
          quote: "Liquidity remained adequate through the reporting period.",
        },
      ],
    }),
    toolMessage(second[2].id, second[2].name, {
      mcp_app: {
        html: report,
        structuredContent: { company: "Example Company", growth: 12.4 },
        toolName: "render_stock_report",
        title: "Company overview",
      },
    }),
  ];
}

const finalText =
  "## A balanced view\n\nExample Company’s latest filing points to stronger cash generation while maintaining investment.[[sample-filing]] The sample figures below help compare growth with operating discipline.\n\n| Measure | Sample result | What to watch |\n| --- | --- | --- |\n| Revenue growth | 12.4% | Repeatability |\n| Operating margin | 24.8% | Cost pressure |\n| Cash conversion | 86% | Working capital |\n\n### What this means\n\nGrowth looks encouraging in this demonstration, though margins and cash conversion need to be read together. **These figures are synthetic test data for checking the chat interface.**\n\nA useful next step is to compare the company with peers over several quarters.";

const seeded = makeThread(
  "11111111-1111-4111-8111-111111111111",
  "Company research and financials",
);
seeded.values.messages = [
  {
    id: "seed-human",
    type: "human",
    content: "Help me understand this company's financial position.",
  },
];
checkpoint(seeded);
seeded.values.messages.push(...researchMessages("seed"), {
  id: "seed-answer",
  type: "ai",
  content: finalText,
});
seeded.values.next_prompt_suggestions = [
  "Compare it with peers",
  "What are the main risks?",
  "Explain the cash flow",
];
checkpoint(seeded);
const bookmarked = makeThread(
  "22222222-2222-4222-8222-222222222222",
  "Portfolio risk review",
  2,
);
bookmarked.metadata.bookmarked = true;
bookmarked.metadata.bookmarked_at = bookmarked.updated_at;
bookmarked.values.messages = [
  {
    id: "portfolio-human",
    type: "human",
    content: "How can I understand my portfolio risk?",
  },
  {
    id: "portfolio-ai",
    type: "ai",
    content:
      "Start with concentration, how holdings move together, and the amount you might need soon. We can review these one at a time.",
  },
];
checkpoint(bookmarked);
bookmarked.updated_at = new Date(Date.now() - 2 * 86400000).toISOString();
const older = makeThread("33333333-3333-4333-8333-333333333333", "", 12);
older.values.messages = [
  {
    id: "older-human",
    type: "human",
    content: "Explain the difference between a stock and a mutual fund.",
  },
  {
    id: "older-ai",
    type: "ai",
    content:
      "A stock is ownership in one company. A mutual fund pools money into a collection of investments managed to a stated objective.",
  },
];
checkpoint(older);
older.updated_at = new Date(Date.now() - 12 * 86400000).toISOString();

function json(response, value, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

function emit(run, event, data) {
  const frame = { id: String(run.events.length), event, data: clone(data) };
  run.events.push(frame);
  const encoded = `id: ${frame.id}\nevent: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`;
  for (const subscriber of run.subscribers) subscriber.write(encoded);
  if (run.mode === "reconnect" && run.events.length === 2 && !run.dropped) {
    run.dropped = true;
    for (const subscriber of run.subscribers) subscriber.destroy();
    run.subscribers.clear();
  }
}

function attach(response, request, run) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    Location: `/threads/${run.thread_id}/runs/${run.run_id}/stream`,
    "Content-Location": `/threads/${run.thread_id}/runs/${run.run_id}`,
  });
  response.flushHeaders();
  const cursor = Number(request.headers["last-event-id"] ?? -1);
  for (const frame of run.events)
    if (Number(frame.id) > cursor)
      response.write(
        `id: ${frame.id}\nevent: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`,
      );
  if (run.status !== "running" && run.status !== "pending") {
    response.end();
    return;
  }
  run.subscribers.add(response);
  response.on("close", () => run.subscribers.delete(response));
}

function finish(run, status) {
  run.status = status;
  const thread = threads.get(run.thread_id);
  thread.status = status === "error" ? "error" : "idle";
  checkpoint(thread);
  for (const timer of run.timers) clearTimeout(timer);
  for (const response of run.subscribers) response.end();
  run.subscribers.clear();
}

function startRun(thread, payload, response, request) {
  const running = [...runs.values()].find(
    (run) => run.thread_id === thread.thread_id && run.status === "running",
  );
  if (running) {
    json(response, { detail: "An earlier run is still in progress." }, 409);
    return;
  }
  if (scenario.mode === "submit-error") {
    json(
      response,
      { detail: "This test submit was not accepted. Try again." },
      400,
    );
    return;
  }
  if (
    payload.context &&
    payload.config?.configurable &&
    Object.keys(payload.config.configurable).length
  ) {
    json(
      response,
      { detail: "context and config.configurable cannot be supplied together" },
      400,
    );
    return;
  }
  const parent =
    payload.checkpoint &&
    thread.history.find(
      (state) =>
        state.checkpoint.checkpoint_id === payload.checkpoint.checkpoint_id,
    );
  if (parent) thread.values = clone(parent.values);
  const incoming = payload.input?.messages ?? [];
  const seen = new Set(thread.values.messages.map((message) => message.id));
  for (const message of incoming)
    if (!message.id || !seen.has(message.id))
      thread.values.messages.push({
        ...message,
        type:
          message.type ?? (message.role === "user" ? "human" : message.role),
        id: message.id || randomUUID(),
      });
  thread.metadata.graph_id = payload.assistant_id;
  thread.values.next_prompt_suggestions = [];
  checkpoint(thread, parent?.checkpoint);
  thread.status = "busy";
  const run = {
    run_id: randomUUID(),
    thread_id: thread.thread_id,
    status: "running",
    mode: scenario.mode,
    events: [],
    subscribers: new Set(),
    timers: [],
    dropped: false,
  };
  runs.set(run.run_id, run);
  attach(response, request, run);
  const delay = run.mode === "slow" ? 1100 : 200;
  const later = (time, callback) =>
    run.timers.push(
      setTimeout(() => {
        if (run.status === "running") callback();
      }, time),
    );
  later(20, () =>
    emit(run, "metadata", { run_id: run.run_id, thread_id: thread.thread_id }),
  );
  later(60, () => emit(run, "values", thread.values));
  const messages = researchMessages(run.run_id);
  let index = 0;
  for (const message of messages) {
    later(delay * ++index, () => {
      thread.values.messages.push(message);
      checkpoint(thread);
      emit(run, "values", thread.values);
    });
  }
  if (run.mode === "error") {
    later(delay * ++index, () => {
      emit(run, "error", {
        error: "FixtureFailure",
        message: "The research run could not finish. Try again.",
      });
      finish(run, "error");
    });
    return;
  }
  const answerId = `${run.run_id}-answer`;
  const chunks = finalText.match(/.{1,55}(?:\s|$)|.{1,55}/gs) ?? [finalText];
  let text = "";
  chunks.forEach((chunk, chunkIndex) =>
    later(
      delay * index + (chunkIndex + 1) * (run.mode === "slow" ? 400 : 100),
      () => {
        text += chunk;
        emit(run, "messages", [
          { id: answerId, type: "AIMessageChunk", content: chunk },
          { langgraph_node: "orchestrator" },
        ]);
        const answer = thread.values.messages.find(
          (message) => message.id === answerId,
        );
        if (answer) answer.content = text;
        else
          thread.values.messages.push({
            id: answerId,
            type: "ai",
            content: text,
          });
      },
    ),
  );
  later(
    delay * index + (chunks.length + 1) * (run.mode === "slow" ? 400 : 100),
    () => {
      thread.values.next_prompt_suggestions = [
        "Compare it with peers",
        "What are the main risks?",
        "Explain the cash flow",
      ];
      emit(run, "values", thread.values);
      finish(run, "success");
    },
  );
}

function samplePdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream =
    "BT /F1 20 Tf 50 720 Td (Example Company - Sample filing) Tj 0 -40 Td /F1 12 Tf (Synthetic data for chat-interface verification.) Tj 0 -30 Td (Operating cash flow increased while investment continued.) Tj ET";
  objects.push(
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  );
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

const server = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,DELETE,OPTIONS",
  );
  response.setHeader(
    "Access-Control-Allow-Headers",
    "content-type,x-api-key,x-auth-scheme,last-event-id",
  );
  response.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Location,Location",
  );
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  const url = new URL(request.url, `http://localhost:${port}`);
  let body = "";
  for await (const chunk of request) body += chunk;
  let payload = {};
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    json(response, { detail: "Malformed JSON" }, 400);
    return;
  }
  requests.push({ method: request.method, path: url.pathname, body: payload });
  if (url.pathname === "/__scenario") {
    scenario = {
      ...scenario,
      ...payload,
      ...(url.searchParams.has("mode") && {
        mode: url.searchParams.get("mode"),
      }),
    };
    json(response, scenario);
    return;
  }
  if (url.pathname === "/__state") {
    json(response, {
      scenario,
      requests,
      threads: [...threads.values()].map(({ history, ...thread }) => thread),
      runs: [...runs.values()].map(
        ({ timers, subscribers, events, ...run }) => run,
      ),
    });
    return;
  }
  if (url.pathname === "/info") {
    json(response, { version: "fixture", graphs: { orchestrator: {} } });
    return;
  }
  if (url.pathname === "/api/models") {
    json(response, {
      models: [
        {
          id: "openai:gpt-5.4",
          label: "GPT-5.4",
          shortLabel: "GPT-5.4",
          provider: "OpenAI",
          supportsImages: true,
          available: true,
        },
        {
          id: "anthropic:claude-sonnet-5",
          label: "Claude Sonnet 5",
          shortLabel: "Sonnet 5",
          provider: "Anthropic",
          supportsImages: true,
          available: true,
        },
        {
          id: "google_genai:gemini-3.8-flash",
          label: "Gemini 3.8 Flash",
          shortLabel: "Gemini Flash",
          provider: "Google",
          supportsImages: true,
          available: false,
        },
      ],
    });
    return;
  }
  if (url.pathname === "/api/filings/pdf") {
    response.writeHead(200, { "Content-Type": "application/pdf" });
    response.end(samplePdf());
    return;
  }
  if (url.pathname === "/threads/search") {
    if (scenario.searchError) {
      json(response, { detail: "Test history search failed" }, 400);
      return;
    }
    const rows = [...threads.values()]
      .sort((first, second) =>
        second.updated_at.localeCompare(first.updated_at),
      )
      .slice(0, payload.limit ?? 200)
      .map(({ history, ...thread }) => thread);
    json(response, rows);
    return;
  }
  if (url.pathname === "/threads" && request.method === "POST") {
    const { history, ...thread } = makeThread(payload.thread_id);
    json(response, thread);
    return;
  }
  const match =
    /^\/threads\/([^/]+)(?:\/(history|state|runs)(?:\/([^/]+)(?:\/(stream|cancel))?)?)?$/.exec(
      url.pathname,
    );
  if (!match) {
    json(response, { detail: "Fixture route not found" }, 404);
    return;
  }
  const [, threadId, action, runId, runAction] = match;
  const thread = threads.get(threadId);
  if (!thread) {
    json(response, { detail: "Thread not found" }, 404);
    return;
  }
  if (action === "history") {
    if (scenario.historyError) {
      json(response, { detail: "Test conversation load failed" }, 400);
      return;
    }
    json(response, thread.history.slice(0, payload.limit ?? 300));
    return;
  }
  if (action === "state") {
    json(
      response,
      thread.history[0] ?? {
        values: thread.values,
        next: [],
        tasks: [],
        checkpoint: {
          thread_id: threadId,
          checkpoint_id: randomUUID(),
          checkpoint_ns: "",
        },
        parent_checkpoint: null,
      },
    );
    return;
  }
  if (action === "runs" && runId === "stream" && request.method === "POST") {
    startRun(thread, payload, response, request);
    return;
  }
  if (action === "runs" && !runId) {
    json(
      response,
      [...runs.values()]
        .filter((run) => run.thread_id === threadId)
        .reverse()
        .map((run) => ({
          run_id: run.run_id,
          thread_id: threadId,
          status: run.status,
        })),
    );
    return;
  }
  if (action === "runs" && runId) {
    const run = runs.get(runId);
    if (!run || run.thread_id !== threadId) {
      json(response, { detail: "Run not found" }, 404);
      return;
    }
    if (runAction === "stream") {
      attach(response, request, run);
      return;
    }
    if (runAction === "cancel") {
      if (scenario.cancelError) {
        json(response, { detail: "Test cancel refused" }, 400);
        return;
      }
      finish(run, "interrupted");
      json(response, { status: "interrupted" });
      return;
    }
    json(response, { run_id: runId, thread_id: threadId, status: run.status });
    return;
  }
  if (request.method === "PATCH") {
    thread.metadata = { ...thread.metadata, ...payload.metadata };
    json(response, thread);
    return;
  }
  const { history, ...row } = thread;
  json(response, row);
});

server.listen(port, "127.0.0.1", () =>
  process.stdout.write(
    `Synthetic LangGraph verification server: http://localhost:${port}\n`,
  ),
);
