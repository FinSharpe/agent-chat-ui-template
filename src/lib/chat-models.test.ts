import { describe, expect, it } from "vitest";
import { PlannerModels } from "@/configs/models";
import {
  AUTO_MODEL,
  modelSubmissionOptions,
  parseModelCatalog,
  parseModelPrefs,
  rememberModelOptions,
} from "./chat-models";

describe("model catalog contract", () => {
  it("accepts an empty served catalog as authoritative, rejects malformed envelopes", () => {
    expect(parseModelCatalog({ models: [] })).toEqual([]);
    expect(parseModelCatalog(null)).toBeNull();
    expect(parseModelCatalog({ models: "models" })).toBeNull();
  });

  it("uses mobile defaults for omitted image support, availability and labels", () => {
    expect(
      parseModelCatalog({
        models: [{ id: "provider:model", label: "A model" }],
      }),
    ).toEqual([
      {
        id: "provider:model",
        label: "A model",
        shortLabel: "A model",
        provider: "Other",
        available: true,
        supportsImages: true,
      },
    ]);
  });

  it("keeps served ids and order, explicit availability and image flags", () => {
    const models = parseModelCatalog({
      models: [
        {
          id: "provider:one",
          label: "One",
          shortLabel: "1",
          provider: "Provider",
          available: false,
          supportsImages: false,
        },
        { id: "provider:two", label: "Two" },
      ],
    });
    expect(models?.map((row) => row.id)).toEqual([
      "provider:one",
      "provider:two",
    ]);
    expect(models?.[0]).toEqual({
      id: "provider:one",
      label: "One",
      shortLabel: "1",
      provider: "Provider",
      available: false,
      supportsImages: false,
    });
  });

  it("drops unlabelled, duplicate and reserved Auto rows", () => {
    expect(
      parseModelCatalog({
        models: [
          null,
          { id: "", label: "Blank" },
          { id: "x", label: " " },
          { id: AUTO_MODEL, label: "Auto" },
          { id: "one", label: "First" },
          { id: "one", label: "Duplicate" },
        ],
      }),
    ).toEqual([
      {
        id: "one",
        label: "First",
        shortLabel: "First",
        provider: "Other",
        available: true,
        supportsImages: true,
      },
    ]);
  });
});

describe("model preferences and submissions", () => {
  it("accepts previous scoped preferences and preserves an explicit per-thread Auto", () => {
    expect(
      parseModelPrefs({
        last: PlannerModels.GEMINI_FLASH,
        threads: { one: AUTO_MODEL },
      }),
    ).toEqual({
      last: PlannerModels.GEMINI_FLASH,
      threads: { one: AUTO_MODEL },
      known: {},
    });
    expect(parseModelPrefs({ last: AUTO_MODEL, threads: [] })).toBeNull();
    expect(
      parseModelPrefs({ last: AUTO_MODEL, threads: { bad: 12 } }),
    ).toBeNull();
  });

  it("remembers labels for referenced pins without treating stored names as availability evidence", () => {
    const row = parseModelCatalog({
      models: [{ id: "one", label: "Friendly one", available: false }],
    })![0];
    const unused = { ...row, id: "unused", label: "Unused" };
    expect(
      rememberModelOptions({ last: "one", threads: {}, known: { unused } }, [
        row,
        unused,
      ]),
    ).toEqual({
      last: "one",
      threads: {},
      known: { one: { ...row, available: true } },
    });
  });

  it("Auto sends no pin, and a verified FinSharpe pin never carries configurable", () => {
    expect(modelSubmissionOptions(AUTO_MODEL, true)).toEqual({});
    expect(modelSubmissionOptions("served:exact-id", true)).toEqual({
      context: { model: "served:exact-id", model_switcher_enabled: false },
    });
  });

  it("retains the existing TradeKit contract for a deployment without the catalog", () => {
    expect(modelSubmissionOptions(PlannerModels.GEMINI_FLASH, false)).toEqual({
      config: {
        configurable: { tradekit_agent_model: PlannerModels.GEMINI_FLASH },
      },
    });
  });
});
