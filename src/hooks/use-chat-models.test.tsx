import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { PlannerModels } from "@/configs/models";
import { AUTO_MODEL } from "@/lib/chat-models";
import { ModelSwitcher } from "@/components/thread/ModelSwitcher";
import { useChatModels } from "./use-chat-models";

const API_A = "https://a.example/api";
const API_B = "https://b.example/api";
const prefsKey = (scope: string) => `lg:chat:models:${scope}`;
const catalogKey = (scope: string) => `lg:chat:modelCatalog:${scope}`;
const notFound = () => Promise.resolve({ ok: false } as Response);
const served = (models: unknown[]) =>
  ({ ok: true, json: async () => ({ models }) }) as Response;
const catalog = [
  { id: "served:vision", label: "Vision model", supportsImages: true },
  { id: "served:text", label: "Text model", supportsImages: false },
];

function save(
  scope: string,
  last: string,
  threads: Record<string, string> = {},
) {
  localStorage.setItem(prefsKey(scope), JSON.stringify({ last, threads }));
}

beforeEach(() => localStorage.clear());

describe("model preference hydration", () => {
  it("hydrates the server fallback without replacing a saved thread pin or cached transport", async () => {
    save(API_A, "served:vision", {
      saved: "served:text",
      explicitAuto: AUTO_MODEL,
    });
    const cached = JSON.stringify({ models: catalog });
    localStorage.setItem(catalogKey(API_A), cached);
    const request = vi.fn().mockRejectedValue(new Error("offline"));
    const write = vi.spyOn(Storage.prototype, "setItem");
    const recoverable = vi.fn();
    let current: ReturnType<typeof useChatModels> | undefined;
    function Picker() {
      current = useChatModels(API_A, "saved", request);
      return (
        <ModelSwitcher
          value={current.value}
          options={current.options}
          onValueChange={current.select}
        />
      );
    }
    const container = document.createElement("div");
    let root: Root | undefined;
    try {
      container.innerHTML = renderToString(<Picker />);
      expect(container.textContent).toBe("Auto");
      expect(write).not.toHaveBeenCalled();
      document.body.append(container);
      await act(async () => {
        root = hydrateRoot(container, <Picker />, {
          onRecoverableError: recoverable,
        });
      });
      await waitFor(() => expect(container.textContent).toBe("Text model"));
      expect(recoverable).not.toHaveBeenCalled();
      expect(current!.supportsImages).toBe(false);
      expect(current!.submissionOptions()).toEqual({
        context: { model: "served:text", model_switcher_enabled: false },
      });
      expect(JSON.parse(localStorage.getItem(prefsKey(API_A))!)).toMatchObject({
        last: "served:vision",
        threads: { saved: "served:text", explicitAuto: AUTO_MODEL },
      });
      expect(localStorage.getItem(catalogKey(API_A))).toBe(cached);
      const writes = write.mock.calls.filter(
        ([key]) => key === prefsKey(API_A),
      );
      expect(writes.length).toBeGreaterThan(0);
      expect(
        writes.every(([, value]) => JSON.parse(value).last === "served:vision"),
      ).toBe(true);
    } finally {
      if (root) await act(async () => root!.unmount());
      container.remove();
      write.mockRestore();
    }
  });

  it("migrates a legacy selection only after hydration persists its scoped choice", async () => {
    const legacy = JSON.stringify(PlannerModels.HAIKU_4_5);
    localStorage.setItem("lg:chat:selectedModel", legacy);
    const write = vi.spyOn(Storage.prototype, "setItem");
    const recoverable = vi.fn();
    function Picker() {
      const models = useChatModels(API_A, null, notFound);
      return <span>{models.value}</span>;
    }
    const container = document.createElement("div");
    let root: Root | undefined;
    try {
      container.innerHTML = renderToString(<Picker />);
      expect(container.textContent).toBe(AUTO_MODEL);
      expect(localStorage.getItem("lg:chat:selectedModel")).toBe(legacy);
      document.body.append(container);
      await act(async () => {
        root = hydrateRoot(container, <Picker />, {
          onRecoverableError: recoverable,
        });
      });
      expect(container.textContent).toBe(PlannerModels.HAIKU_4_5);
      expect(recoverable).not.toHaveBeenCalled();
      expect(localStorage.getItem("lg:chat:selectedModel")).toBeNull();
      const writes = write.mock.calls.filter(
        ([key]) => key === prefsKey(API_A),
      );
      expect(writes.length).toBeGreaterThan(0);
      expect(
        writes.every(
          ([, value]) => JSON.parse(value).last === PlannerModels.HAIKU_4_5,
        ),
      ).toBe(true);
    } finally {
      if (root) await act(async () => root!.unmount());
      container.remove();
      write.mockRestore();
    }
  });
});

describe("scoped model preferences", () => {
  it("reads each API's preferences during a scope switch and never overwrites the new scope with old values", () => {
    save(API_A, PlannerModels.GEMINI_FLASH, { one: PlannerModels.GPT_5_2 });
    save(API_B, PlannerModels.HAIKU_4_5, { one: AUTO_MODEL });
    const { result, rerender } = renderHook(
      ({ api, thread }) => useChatModels(api, thread, notFound),
      { initialProps: { api: API_A, thread: "one" as string | null } },
    );
    expect(result.current.value).toBe(PlannerModels.GPT_5_2);
    rerender({ api: API_B, thread: "one" });
    expect(result.current.value).toBe(AUTO_MODEL);
    expect(JSON.parse(localStorage.getItem(prefsKey(API_B))!).last).toBe(
      PlannerModels.HAIKU_4_5,
    );
    rerender({ api: API_B, thread: null });
    expect(result.current.value).toBe(PlannerModels.HAIKU_4_5);
    rerender({ api: API_A, thread: null });
    expect(result.current.value).toBe(PlannerModels.GEMINI_FLASH);
  });

  it("remembers each thread's choice and uses the last pick for a new chat", () => {
    const { result, rerender } = renderHook(
      ({ thread }) => useChatModels(API_A, thread, notFound),
      { initialProps: { thread: "one" as string | null } },
    );
    act(() => result.current.select(PlannerModels.GPT_5_2));
    rerender({ thread: "two" });
    expect(result.current.value).toBe(AUTO_MODEL);
    act(() => result.current.select(PlannerModels.GEMINI_FLASH));
    rerender({ thread: "one" });
    expect(result.current.value).toBe(PlannerModels.GPT_5_2);
    act(() => result.current.select(AUTO_MODEL));
    rerender({ thread: "two" });
    expect(result.current.value).toBe(PlannerModels.GEMINI_FLASH);
    rerender({ thread: null });
    expect(result.current.value).toBe(AUTO_MODEL);
  });

  it("adopts the submitted new-chat pin when the server creates its thread", () => {
    save(API_A, PlannerModels.GPT_5_2);
    const { result, rerender } = renderHook(
      ({ thread }) => useChatModels(API_A, thread, notFound),
      { initialProps: { thread: null as string | null } },
    );
    act(() => {
      result.current.submissionOptions();
    });
    rerender({ thread: "created" });
    expect(result.current.value).toBe(PlannerModels.GPT_5_2);
    expect(
      JSON.parse(localStorage.getItem(prefsKey(API_A))!).threads.created,
    ).toBe(PlannerModels.GPT_5_2);
  });

  it("cancels a pending pin on a conversation change or API scope change", () => {
    save(API_A, PlannerModels.GPT_5_2);
    const { result, rerender } = renderHook(
      ({ api, thread }) => useChatModels(api, thread, notFound),
      { initialProps: { api: API_A, thread: null as string | null } },
    );
    act(() => {
      result.current.submissionOptions();
      result.current.cancelPendingSelection();
    });
    rerender({ api: API_A, thread: "different" });
    expect(result.current.value).toBe(AUTO_MODEL);
    rerender({ api: API_A, thread: null });
    act(() => {
      result.current.submissionOptions();
    });
    rerender({ api: API_B, thread: null });
    rerender({ api: API_A, thread: "later" });
    expect(result.current.value).toBe(AUTO_MODEL);
  });

  it("keeps the destination thread's pin when browser back/forward interrupts a new-chat submission", () => {
    save(API_A, PlannerModels.GPT_5_2, { existing: PlannerModels.HAIKU_4_5 });
    const { result, rerender } = renderHook(
      ({ thread }) => useChatModels(API_A, thread, notFound),
      { initialProps: { thread: null as string | null } },
    );
    act(() => {
      result.current.submissionOptions();
    });
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    rerender({ thread: "existing" });
    expect(result.current.value).toBe(PlannerModels.HAIKU_4_5);
    expect(
      JSON.parse(localStorage.getItem(prefsKey(API_A))!).threads.existing,
    ).toBe(PlannerModels.HAIKU_4_5);
  });

  it("migrates a recognized legacy model once after safely persisting its scoped copy", () => {
    localStorage.setItem(
      "lg:chat:selectedModel",
      JSON.stringify(PlannerModels.HAIKU_4_5),
    );
    const { result, rerender } = renderHook(
      ({ api }) => useChatModels(api, null, notFound),
      { initialProps: { api: API_A } },
    );
    expect(result.current.value).toBe(PlannerModels.HAIKU_4_5);
    expect(JSON.parse(localStorage.getItem(prefsKey(API_A))!).last).toBe(
      PlannerModels.HAIKU_4_5,
    );
    expect(localStorage.getItem("lg:chat:selectedModel")).toBeNull();
    rerender({ api: API_B });
    expect(result.current.value).toBe(AUTO_MODEL);
  });

  it("never assigns an unscoped legacy pick to an existing conversation", () => {
    localStorage.setItem(
      "lg:chat:selectedModel",
      JSON.stringify(PlannerModels.HAIKU_4_5),
    );
    const { result } = renderHook(() =>
      useChatModels(API_A, "existing", notFound),
    );
    expect(result.current.value).toBe(AUTO_MODEL);
  });

  it("rejects corrupt preferences and unrecognized legacy strings", () => {
    localStorage.setItem(
      "lg:chat:selectedModel",
      JSON.stringify("unrecognized:unsafe"),
    );
    const { result } = renderHook(() => useChatModels(API_A, null, notFound));
    expect(result.current.value).toBe(AUTO_MODEL);
  });

  it("keeps an already scoped choice ahead of a legacy global value", () => {
    save(API_A, PlannerModels.GPT_5_2);
    localStorage.setItem(
      "lg:chat:selectedModel",
      JSON.stringify(PlannerModels.HAIKU_4_5),
    );
    const { result } = renderHook(() => useChatModels(API_A, null, notFound));
    expect(result.current.value).toBe(PlannerModels.GPT_5_2);
  });

  it("retains the legacy value if writing its scoped migration fails", () => {
    localStorage.setItem(
      "lg:chat:selectedModel",
      JSON.stringify(PlannerModels.HAIKU_4_5),
    );
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("Storage unavailable");
      });
    try {
      const { result } = renderHook(() => useChatModels(API_A, null, notFound));
      expect(result.current.value).toBe(PlannerModels.HAIKU_4_5);
      expect(localStorage.getItem("lg:chat:selectedModel")).toBe(
        JSON.stringify(PlannerModels.HAIKU_4_5),
      );
      act(() => result.current.select(AUTO_MODEL));
      expect(result.current.value).toBe(AUTO_MODEL);
    } finally {
      write.mockRestore();
    }
  });
});

describe("served model availability", () => {
  it("uses exact server model IDs, image capabilities and context-only submission", async () => {
    const request = vi.fn().mockResolvedValue(served(catalog));
    const { result } = renderHook(() => useChatModels(API_A, null, request));
    await waitFor(() =>
      expect(result.current.options.map((row) => row.id)).toEqual([
        "served:vision",
        "served:text",
      ]),
    );
    act(() => result.current.select("served:text"));
    expect(result.current.supportsImages).toBe(false);
    expect(result.current.submissionOptions()).toEqual({
      context: { model: "served:text", model_switcher_enabled: false },
    });
    act(() => result.current.select(AUTO_MODEL));
    expect(result.current.supportsImages).toBe(true);
    expect(result.current.submissionOptions()).toEqual({});
  });

  it("keeps an unavailable pin selected and ignores attempted unavailable or unknown picks", async () => {
    save(API_A, "served:text");
    const request = vi
      .fn()
      .mockResolvedValue(
        served([{ ...catalog[1], available: false }, catalog[0]]),
      );
    const { result } = renderHook(() => useChatModels(API_A, null, request));
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(result.current.value).toBe("served:text");
    act(() => result.current.select("unknown:new"));
    expect(result.current.value).toBe("served:text");
    act(() => result.current.select("served:vision"));
    expect(result.current.value).toBe("served:vision");
    act(() => result.current.select("served:text"));
    expect(result.current.value).toBe("served:vision");
  });

  it("a fresh empty catalog preserves the pin's last known name and blocks sends", async () => {
    localStorage.setItem(
      prefsKey(API_A),
      JSON.stringify({
        last: "served:text",
        threads: {},
        known: {
          "served:text": {
            ...catalog[1],
            shortLabel: "Text",
            provider: "Provider",
            available: true,
          },
        },
      }),
    );
    const request = vi.fn().mockResolvedValue(served([]));
    const { result } = renderHook(() => useChatModels(API_A, null, request));
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(result.current.value).toBe("served:text");
    expect(result.current.options).toEqual([
      {
        ...catalog[1],
        shortLabel: "Text",
        provider: "Provider",
        available: false,
      },
    ]);
  });

  it("a failed fetch retains cached FinSharpe transport and capabilities", async () => {
    save(API_A, "served:text");
    localStorage.setItem(
      catalogKey(API_A),
      JSON.stringify({ models: catalog }),
    );
    const request = vi.fn().mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useChatModels(API_A, null, request));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(result.current.value).toBe("served:text");
    expect(result.current.supportsImages).toBe(false);
    expect(result.current.unavailable).toBe(false);
    expect(result.current.submissionOptions()).toEqual({
      context: { model: "served:text", model_switcher_enabled: false },
    });
  });

  it("a cached catalog cannot declare an absent pin unavailable before a fresh read", () => {
    save(API_A, "served:older-pin");
    localStorage.setItem(
      catalogKey(API_A),
      JSON.stringify({ models: catalog }),
    );
    const { result } = renderHook(() => useChatModels(API_A, null, notFound));
    expect(result.current.value).toBe("served:older-pin");
    expect(result.current.unavailable).toBe(false);
    expect(result.current.submissionOptions()).toEqual({
      context: { model: "served:older-pin", model_switcher_enabled: false },
    });
  });

  it("ignores an obsolete catalog response after switching API scope", async () => {
    let resolveOld!: (response: Response) => void;
    const oldResponse = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    const request = vi
      .fn()
      .mockReturnValueOnce(oldResponse)
      .mockResolvedValueOnce(served([{ id: "b:model", label: "B model" }]));
    const { result, rerender } = renderHook(
      ({ api }) => useChatModels(api, null, request),
      { initialProps: { api: API_A } },
    );
    rerender({ api: API_B });
    await waitFor(() => expect(result.current.options[0].id).toBe("b:model"));
    await act(async () => resolveOld(served(catalog)));
    expect(result.current.options[0].id).toBe("b:model");
    expect(localStorage.getItem(catalogKey(API_A))).toBeNull();
  });
});
