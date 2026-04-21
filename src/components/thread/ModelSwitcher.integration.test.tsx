import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import { PlannerModels } from "@/configs/models";
import { ModelSwitcher } from "./ModelSwitcher";

const STORAGE_KEY = "lg:chat:selectedModel";

/**
 * Exercises the full wiring Thread uses: a localStorage-backed state hook
 * feeding ModelSwitcher, plus a mock submitter that reads the selected model
 * off the stream.submit `config.configurable.tradekit_agent_model` payload.
 */
function Harness({
  submit,
}: {
  submit: (config: { tradekit_agent_model: PlannerModels }) => void;
}) {
  const [selectedModel, setSelectedModel] = useLocalStorageState<PlannerModels>(
    STORAGE_KEY,
    PlannerModels.GEMINI_FLASH,
    (value): value is PlannerModels =>
      typeof value === "string" &&
      (Object.values(PlannerModels) as string[]).includes(value),
  );

  return (
    <div>
      <ModelSwitcher
        value={selectedModel}
        onValueChange={setSelectedModel}
      />
      <button
        type="button"
        onClick={() => submit({ tradekit_agent_model: selectedModel })}
      >
        submit
      </button>
    </div>
  );
}

describe("ModelSwitcher integration", () => {
  it("persists the user's choice to localStorage under lg:chat:selectedModel", async () => {
    const user = userEvent.setup();
    render(<Harness submit={() => {}} />);

    await user.click(screen.getByRole("combobox", { name: /select model/i }));
    const listbox = await screen.findByRole("listbox");
    await user.click(within(listbox).getByRole("option", { name: "Gpt 5.2" }));

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify(PlannerModels.GPT_5_2),
    );
  });

  it("rehydrates the Select from localStorage on a fresh mount", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(PlannerModels.SONNET_4_5),
    );

    render(<Harness submit={() => {}} />);

    expect(
      screen.getByRole("combobox", { name: /select model/i }),
    ).toHaveTextContent("Sonnet 4.5");
  });

  it("feeds the selected model into submit payloads (the Thread submit contract)", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(<Harness submit={submit} />);

    // default first
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(submit).toHaveBeenLastCalledWith({
      tradekit_agent_model: PlannerModels.GEMINI_FLASH,
    });

    // switch model and submit again
    await user.click(screen.getByRole("combobox", { name: /select model/i }));
    const listbox = await screen.findByRole("listbox");
    await user.click(within(listbox).getByRole("option", { name: "Haiku 4.5" }));

    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(submit).toHaveBeenLastCalledWith({
      tradekit_agent_model: PlannerModels.HAIKU_4_5,
    });
  });

  it("ignores a corrupted localStorage value and falls back to the default", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify("not-a-real-model"));

    render(<Harness submit={() => {}} />);

    expect(
      screen.getByRole("combobox", { name: /select model/i }),
    ).toHaveTextContent("Gemini Flash");
  });
});
