import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { getApiKey, setApiKey } from "@/lib/api-key";
import { StreamProvider, useStreamContext } from "./Stream";
import { ThreadProvider, useThreads } from "./Thread";

const mocks = vi.hoisted(() => ({
  useStream: vi.fn(),
  createClient: vi.fn(),
  searchThreads: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@langchain/langgraph-sdk/react", () => ({
  useStream: mocks.useStream,
}));

vi.mock("./client", () => ({
  createClient: mocks.createClient,
}));

const TRUSTED_URL = "https://trusted.example/api";
const OTHER_URL = "https://other.example/api";
const TEST_KEY = "test-api-key";

function ConnectedSession() {
  const { apiUrl } = useStreamContext();
  const { getThreads } = useThreads();

  return (
    <div>
      <p>Connected to {apiUrl}</p>
      <button onClick={() => void getThreads()}>Load history</button>
    </div>
  );
}

function renderSession(searchParams: Record<string, string>) {
  return render(
    <NuqsTestingAdapter searchParams={searchParams}>
      <ThreadProvider>
        <StreamProvider>
          <ConnectedSession />
        </StreamProvider>
      </ThreadProvider>
    </NuqsTestingAdapter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_API_URL", "");
  vi.stubEnv("NEXT_PUBLIC_ASSISTANT_ID", "");
  vi.stubEnv("NEXT_PUBLIC_AUTH_SCHEME", "");
  mocks.useStream.mockReturnValue({});
  mocks.searchThreads.mockResolvedValue([]);
  mocks.createClient.mockReturnValue({
    threads: { search: mocks.searchThreads },
  });
  mocks.fetch.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("deployment and credential selection", () => {
  it("binds a newly entered key to the configured deployment despite a hostile URL parameter", async () => {
    const user = userEvent.setup();
    vi.stubEnv("NEXT_PUBLIC_API_URL", TRUSTED_URL);

    renderSession({ apiUrl: OTHER_URL });

    const deploymentInput = screen.getByLabelText(/deployment url/i);
    expect(deploymentInput).toHaveValue(TRUSTED_URL);
    expect(deploymentInput).toHaveAttribute("readonly");
    await user.type(screen.getByLabelText("LangSmith API Key"), TEST_KEY);
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(mocks.useStream).toHaveBeenLastCalledWith(
        expect.objectContaining({ apiUrl: TRUSTED_URL, apiKey: TEST_KEY }),
      );
    });
    expect(getApiKey(TRUSTED_URL)).toBe(TEST_KEY);
    expect(getApiKey(OTHER_URL)).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledWith(
      `${TRUSTED_URL}/info`,
      expect.any(Object),
    );
    const healthHeaders = mocks.fetch.mock.calls.at(-1)?.[1].headers as Headers;
    expect(healthHeaders.get("X-Api-Key")).toBe(TEST_KEY);

    await user.click(screen.getByRole("button", { name: "Load history" }));

    expect(mocks.createClient).toHaveBeenLastCalledWith(
      TRUSTED_URL,
      TEST_KEY,
      undefined,
    );
  });

  it("uses the configured URL and its key for streaming, health checks, and history", async () => {
    const user = userEvent.setup();
    vi.stubEnv("NEXT_PUBLIC_API_URL", TRUSTED_URL);
    vi.stubEnv("NEXT_PUBLIC_ASSISTANT_ID", "agent");
    vi.stubEnv("NEXT_PUBLIC_AUTH_SCHEME", "langsmith-api-key");
    setApiKey(TRUSTED_URL, TEST_KEY);

    renderSession({ apiUrl: OTHER_URL });

    expect(screen.getByText(`Connected to ${TRUSTED_URL}`)).toBeInTheDocument();
    expect(mocks.useStream).toHaveBeenLastCalledWith(
      expect.objectContaining({
        apiUrl: TRUSTED_URL,
        apiKey: TEST_KEY,
        defaultHeaders: { "X-Auth-Scheme": "langsmith-api-key" },
      }),
    );
    expect(mocks.fetch).toHaveBeenCalledWith(
      `${TRUSTED_URL}/info`,
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const healthHeaders = mocks.fetch.mock.calls.at(-1)?.[1].headers as Headers;
    expect(healthHeaders.get("X-Api-Key")).toBe(TEST_KEY);
    expect(healthHeaders.get("X-Auth-Scheme")).toBe("langsmith-api-key");

    await user.click(screen.getByRole("button", { name: "Load history" }));

    expect(mocks.createClient).toHaveBeenLastCalledWith(
      TRUSTED_URL,
      TEST_KEY,
      "langsmith-api-key",
    );
    expect(mocks.searchThreads).toHaveBeenLastCalledWith({
      metadata: { graph_id: "agent" },
      limit: 100,
    });
  });

  it("withholds a saved key from another query-selected deployment in every request path", async () => {
    const user = userEvent.setup();
    setApiKey(TRUSTED_URL, TEST_KEY);

    renderSession({ apiUrl: OTHER_URL, assistantId: "agent" });

    expect(mocks.useStream).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiUrl: OTHER_URL, apiKey: "" }),
    );
    expect(mocks.fetch).toHaveBeenCalledWith(
      `${OTHER_URL}/info`,
      expect.any(Object),
    );
    const healthHeaders = mocks.fetch.mock.calls.at(-1)?.[1].headers as Headers;
    expect(healthHeaders.has("X-Api-Key")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Load history" }));

    expect(mocks.createClient).toHaveBeenLastCalledWith(
      OTHER_URL,
      undefined,
      undefined,
    );
  });

  it.each(["", "previous-key"])(
    "uses a newly submitted key immediately when the API URL stays the same (previous key: %s)",
    async (previousKey) => {
      const user = userEvent.setup();
      if (previousKey) setApiKey(TRUSTED_URL, previousKey);

      renderSession({ apiUrl: TRUSTED_URL });

      const keyInput = screen.getByLabelText("LangSmith API Key");
      await user.clear(keyInput);
      await user.type(keyInput, TEST_KEY);
      await user.click(screen.getByRole("button", { name: /continue/i }));

      await waitFor(() => {
        expect(mocks.useStream).toHaveBeenLastCalledWith(
          expect.objectContaining({ apiUrl: TRUSTED_URL, apiKey: TEST_KEY }),
        );
      });
      const healthHeaders = mocks.fetch.mock.calls.at(-1)?.[1]
        .headers as Headers;
      expect(healthHeaders.get("X-Api-Key")).toBe(TEST_KEY);

      await user.click(screen.getByRole("button", { name: "Load history" }));

      expect(mocks.createClient).toHaveBeenLastCalledWith(
        TRUSTED_URL,
        TEST_KEY,
        undefined,
      );
    },
  );
});
