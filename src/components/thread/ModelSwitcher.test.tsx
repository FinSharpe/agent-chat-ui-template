import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelSwitcher } from "./ModelSwitcher";
import { PlannerModels } from "@/configs/models";

describe("<ModelSwitcher />", () => {
  it("renders the currently-selected model's display name", () => {
    render(
      <ModelSwitcher
        value={PlannerModels.GEMINI_FLASH}
        onValueChange={() => {}}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: /select model/i }),
    ).toHaveTextContent("Gemini Flash");
  });

  it("exposes every PlannerModels entry in the dropdown", async () => {
    const user = userEvent.setup();
    render(
      <ModelSwitcher
        value={PlannerModels.GEMINI_FLASH}
        onValueChange={() => {}}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: /select model/i }));

    const listbox = await screen.findByRole("listbox");
    const optionLabels = within(listbox)
      .getAllByRole("option")
      .map((o) => o.textContent?.trim());

    expect(optionLabels).toEqual(
      expect.arrayContaining([
        "Gpt 5.4",
        "Gpt 5.4 Mini",
        "Gpt 5.4 Nano",
        "Gpt 5.2",
        "Gpt 5.1",
        "Gpt 5",
        "Gemini 3",
        "Gemini Flash",
        "Gemini 2.5 Pro",
        "Gemini 2.5 Flash",
        "Sonnet 4.5",
        "Sonnet 4.6",
        "Haiku 4.5",
      ]),
    );
    expect(optionLabels).toHaveLength(Object.keys(PlannerModels).length);
  });

  it("fires onValueChange with the provider:model enum string when a user picks an option", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <ModelSwitcher
        value={PlannerModels.GEMINI_FLASH}
        onValueChange={onValueChange}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: /select model/i }));
    const listbox = await screen.findByRole("listbox");
    await user.click(within(listbox).getByRole("option", { name: "Sonnet 4.6" }));

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(PlannerModels.SONNET_4_6);
    expect(onValueChange).toHaveBeenCalledWith("anthropic:claude-sonnet-4-6");
  });

  it("updates the displayed label when the controlled value changes", () => {
    const { rerender } = render(
      <ModelSwitcher
        value={PlannerModels.GEMINI_FLASH}
        onValueChange={() => {}}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: /select model/i }),
    ).toHaveTextContent("Gemini Flash");

    rerender(
      <ModelSwitcher
        value={PlannerModels.HAIKU_4_5}
        onValueChange={() => {}}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: /select model/i }),
    ).toHaveTextContent("Haiku 4.5");
  });
});
