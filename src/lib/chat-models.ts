import { PlannerModels } from "@/configs/models";
import { getModelDisplayName } from "./model-display-name";

export const AUTO_MODEL = "auto";
export interface ChatModelOption {
  id: string;
  label: string;
  shortLabel: string;
  provider: string;
  available: boolean;
  supportsImages: boolean;
}
export interface ChatModelPrefs {
  last: string;
  threads: Record<string, string>;
  known: Record<string, ChatModelOption>;
}
export const legacyModels: ChatModelOption[] = Object.entries(
  PlannerModels,
).map(([key, id]) => ({
  id,
  label: getModelDisplayName(key),
  shortLabel: getModelDisplayName(key),
  provider: id.split(":")[0],
  available: true,
  supportsImages: true,
}));

// chat_models_api.dart: a successful catalog, including an empty one, is authoritative.
export function parseModelCatalog(raw: unknown): ChatModelOption[] | null {
  if (
    !raw ||
    typeof raw !== "object" ||
    !("models" in raw) ||
    !Array.isArray(raw.models)
  )
    return null;
  const seen = new Set<string>();
  return raw.models.flatMap((row: unknown) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    if (
      typeof r.id !== "string" ||
      !r.id.trim() ||
      r.id === AUTO_MODEL ||
      typeof r.label !== "string" ||
      !r.label.trim() ||
      seen.has(r.id)
    )
      return [];
    seen.add(r.id);
    return [
      {
        id: r.id,
        label: r.label,
        shortLabel:
          typeof r.shortLabel === "string" && r.shortLabel
            ? r.shortLabel
            : r.label,
        provider:
          typeof r.provider === "string" && r.provider ? r.provider : "Other",
        available: r.available !== false,
        supportsImages: r.supportsImages !== false,
      },
    ];
  });
}

export function parseModelPrefs(raw: unknown): ChatModelPrefs | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (
    typeof value.last !== "string" ||
    !value.last ||
    !value.threads ||
    typeof value.threads !== "object" ||
    Array.isArray(value.threads)
  )
    return null;
  const threads = value.threads as Record<string, unknown>;
  if (
    !Object.values(threads).every(
      (id) => typeof id === "string" && id.length > 0,
    )
  )
    return null;
  const known =
    value.known &&
    typeof value.known === "object" &&
    !Array.isArray(value.known)
      ? (parseModelCatalog({ models: Object.values(value.known) }) ?? [])
      : [];
  return {
    last: value.last,
    threads: threads as Record<string, string>,
    known: Object.fromEntries(known.map((row) => [row.id, row])),
  };
}

/** Keep readable names only for pins these preferences still reference. */
export function rememberModelOptions(
  prefs: ChatModelPrefs,
  models: ChatModelOption[],
): ChatModelPrefs {
  const pinned = new Set([prefs.last, ...Object.values(prefs.threads)]);
  const known = Object.fromEntries(
    Object.entries(prefs.known).filter(([id]) => pinned.has(id)),
  );
  for (const row of models) {
    if (pinned.has(row.id)) known[row.id] = { ...row, available: true };
  }
  return { ...prefs, known };
}

export function modelSubmissionOptions(
  model: string,
  catalogVerified: boolean,
) {
  if (model === AUTO_MODEL) return {};
  // Current FinSharpe runtime rejects a request carrying context AND configurable.
  if (catalogVerified)
    return { context: { model, model_switcher_enabled: false } };
  // Preserve the shared template's existing TradeKit integration for deployments
  // which don't expose the FinSharpe model catalog.
  return {
    config: { configurable: { tradekit_agent_model: model as PlannerModels } },
  };
}
