import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AUTO_MODEL,
  type ChatModelOption,
  type ChatModelPrefs,
  legacyModels,
  modelSubmissionOptions,
  parseModelCatalog,
  parseModelPrefs,
  rememberModelOptions,
} from "@/lib/chat-models";

const LEGACY_MODEL_KEY = "lg:chat:selectedModel";
const prefsKey = (scope: string) => `lg:chat:models:${scope}`;
const catalogKey = (scope: string) => `lg:chat:modelCatalog:${scope}`;
const emptyPrefs = (): ChatModelPrefs => ({
  last: AUTO_MODEL,
  threads: {},
  known: {},
});
type StoredPrefs = { prefs: ChatModelPrefs; migrateLegacy?: string };
type Catalog = { options: ChatModelOption[]; fresh: boolean };
const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function readPrefs(scope: string): StoredPrefs {
  if (!scope || typeof window === "undefined") return { prefs: emptyPrefs() };
  try {
    const scoped = window.localStorage.getItem(prefsKey(scope));
    if (scoped !== null)
      return { prefs: parseModelPrefs(JSON.parse(scoped)) ?? emptyPrefs() };
    const legacy = window.localStorage.getItem(LEGACY_MODEL_KEY);
    if (legacy !== null) {
      const model: unknown = JSON.parse(legacy);
      if (
        typeof model === "string" &&
        legacyModels.some((row) => row.id === model)
      ) {
        return {
          prefs: { ...emptyPrefs(), last: model },
          migrateLegacy: legacy,
        };
      }
    }
  } catch {
    /* A restricted or corrupt store must not block chatting. */
  }
  return { prefs: emptyPrefs() };
}

function readCatalog(scope: string): Catalog | undefined {
  if (!scope || typeof window === "undefined") return undefined;
  try {
    const stored = window.localStorage.getItem(catalogKey(scope));
    const options = stored ? parseModelCatalog(JSON.parse(stored)) : null;
    if (options) return { options, fresh: false };
  } catch {
    /* No cache is a normal first launch. */
  }
  return undefined;
}

export function useChatModels(
  apiUrl: string,
  threadId: string | null,
  requestApi: (path: string, init?: RequestInit) => Promise<Response>,
) {
  // The prerender and first hydration pass must use the same fallback. A
  // client-only mount can still read saved choices immediately.
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    clientSnapshot,
    serverSnapshot,
  );
  // A dynamic localStorage key cannot reuse another deployment's state.
  const [scopedPrefs, setScopedPrefs] = useState<Record<string, StoredPrefs>>(
    {},
  );
  const stored = useMemo(
    () =>
      scopedPrefs[apiUrl] ??
      (hydrated ? readPrefs(apiUrl) : { prefs: emptyPrefs() }),
    [apiUrl, scopedPrefs, hydrated],
  );
  const prefs = stored.prefs;
  const [catalogs, setCatalogs] = useState<Record<string, Catalog>>({});
  const cachedCatalog = useMemo(
    () => (hydrated ? readCatalog(apiUrl) : undefined),
    [apiUrl, hydrated],
  );
  const catalog = catalogs[apiUrl] ?? cachedCatalog;
  const offered = catalog?.options ?? legacyModels;
  const pendingNewChat = useRef<{ scope: string; model: string } | null>(null);
  const value = threadId ? (prefs.threads[threadId] ?? AUTO_MODEL) : prefs.last;
  const selected = offered.find((row) => row.id === value);
  const unavailable =
    value !== AUTO_MODEL &&
    (selected ? !selected.available : catalog?.fresh === true);
  const remembered = prefs.known[value];
  const options = useMemo(
    () =>
      value === AUTO_MODEL || selected
        ? offered
        : [
            ...offered,
            {
              ...(remembered ?? {
                id: value,
                label: value.split(":").pop() || value,
                shortLabel: value.split(":").pop() || value,
                provider: "Other",
                supportsImages: true,
              }),
              available: !unavailable,
            },
          ],
    [value, selected, offered, remembered, unavailable],
  );

  const updatePrefs = useCallback(
    (update: (previous: ChatModelPrefs) => ChatModelPrefs) => {
      setScopedPrefs((previous) => ({
        ...previous,
        [apiUrl]: {
          prefs: update((previous[apiUrl] ?? readPrefs(apiUrl)).prefs),
        },
      }));
    },
    [apiUrl],
  );

  useEffect(() => {
    if (!apiUrl || !hydrated) return;
    try {
      window.localStorage.setItem(prefsKey(apiUrl), JSON.stringify(prefs));
      // Consume the unscoped preference only after its scoped copy is safe.
      if (
        stored.migrateLegacy &&
        window.localStorage.getItem(LEGACY_MODEL_KEY) === stored.migrateLegacy
      )
        window.localStorage.removeItem(LEGACY_MODEL_KEY);
    } catch {
      /* Selection still works when persistence is unavailable. */
    }
  }, [apiUrl, prefs, stored.migrateLegacy, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    requestApi("/api/models", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const options = parseModelCatalog(await response.json());
        if (!options || controller.signal.aborted) return;
        setCatalogs((previous) => ({
          ...previous,
          [apiUrl]: { options, fresh: true },
        }));
        updatePrefs((previous) => rememberModelOptions(previous, options));
        try {
          window.localStorage.setItem(
            catalogKey(apiUrl),
            JSON.stringify({ models: options }),
          );
        } catch {
          /* The fresh list still works without a cache. */
        }
      })
      .catch(() => {
        /* Generic LangGraph deployments keep their existing catalog. */
      });
    return () => controller.abort();
  }, [apiUrl, requestApi, updatePrefs, hydrated]);

  useEffect(() => {
    // Browser navigation is a choice of an existing conversation, rather than
    // the SDK assigning an id to the new conversation whose pin is pending.
    const cancelOnNavigation = () => {
      pendingNewChat.current = null;
    };
    window.addEventListener("popstate", cancelOnNavigation);
    return () => window.removeEventListener("popstate", cancelOnNavigation);
  }, []);

  useEffect(() => {
    const pending = pendingNewChat.current;
    if (!pending) return;
    if (pending.scope !== apiUrl) {
      pendingNewChat.current = null;
      return;
    }
    if (!threadId) return;
    pendingNewChat.current = null;
    updatePrefs((previous) => ({
      ...previous,
      threads: { ...previous.threads, [threadId]: pending.model },
    }));
  }, [apiUrl, threadId, updatePrefs]);

  const select = useCallback(
    (model: string) => {
      if (
        model !== AUTO_MODEL &&
        !options.some((row) => row.id === model && row.available)
      )
        return;
      updatePrefs((previous) =>
        rememberModelOptions(
          {
            ...previous,
            last: model,
            threads: threadId
              ? { ...previous.threads, [threadId]: model }
              : previous.threads,
          },
          offered,
        ),
      );
    },
    [updatePrefs, threadId, offered, options],
  );

  return {
    value,
    select,
    options,
    unavailable,
    supportsImages:
      value === AUTO_MODEL ||
      (selected ?? remembered)?.supportsImages !== false,
    submissionOptions: () => {
      if (!threadId) pendingNewChat.current = { scope: apiUrl, model: value };
      return modelSubmissionOptions(value, catalog !== undefined);
    },
    cancelPendingSelection: () => {
      pendingNewChat.current = null;
    },
  };
}
