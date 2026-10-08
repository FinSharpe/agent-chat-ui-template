import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FollowUpPrompts, SuggestedPrompts } from "./suggested-prompts";

describe("SuggestedPrompts", () => {
  it("starts with Stocks selected and the three production mobile prompts", () => {
    render(<SuggestedPrompts onSelect={() => {}} />);
    expect(
      screen.getByRole("heading", { name: "Consult your agent" }),
    ).toBeInTheDocument();
    const categories = within(
      screen.getByRole("group", { name: "Suggested prompt categories" }),
    );
    expect(categories.getAllByRole("button")).toHaveLength(3);
    expect(categories.getByRole("button", { name: "Stocks" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      categories.getByRole("button", { name: "Mutual Funds" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      categories.getByRole("button", { name: "Personal Finance" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: "Analyse Tata Motors" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Compare TCS & INFY" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "What's the outlook for Reliance?" }),
    ).toBeInTheDocument();
  });

  it("switches categories locally without sending a message", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<SuggestedPrompts onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: "Mutual Funds" }));
    expect(
      screen.getByRole("button", { name: "Mutual Funds" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Stocks" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.getByRole("button", { name: "Analyse Quant Smallcap Fund" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Top 5 flexi-cap funds" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Best ELSS funds for tax saving" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Analyse Tata Motors" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Personal Finance" }));
    expect(
      screen.getByRole("button", { name: "How does financial planning work?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "How is a savings rate worked out?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "How is a retirement corpus estimated?",
      }),
    ).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("sends the exact selected prompt once", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<SuggestedPrompts onSelect={onSelect} />);
    await user.click(
      screen.getByRole("button", { name: "Compare TCS & INFY" }),
    );
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("Compare TCS & INFY");
  });

  it("prevents sending when disabled, including after changing categories", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <SuggestedPrompts
        onSelect={onSelect}
        disabled
      />,
    );
    const prompt = screen.getByRole("button", { name: "Analyse Tata Motors" });
    expect(prompt).toBeDisabled();
    await user.click(prompt);
    await user.click(screen.getByRole("button", { name: "Mutual Funds" }));
    expect(
      screen.getByRole("button", { name: "Analyse Quant Smallcap Fund" }),
    ).toBeDisabled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("FollowUpPrompts", () => {
  it("omits empty, blank and malformed suggestions while preserving valid order", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <FollowUpPrompts
        suggestions={
          [
            "",
            "  ",
            "Compare returns",
            null,
            7,
            "What are the risks?",
          ] as string[]
        }
        onSelect={onSelect}
      />,
    );
    const section = screen.getByRole("region", { name: "Follow-ups" });
    expect(
      within(section)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Compare returns", "What are the risks?"]);
    await user.click(
      within(section).getByRole("button", { name: "What are the risks?" }),
    );
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("What are the risks?");
  });

  it("renders no empty follow-up section", () => {
    render(
      <FollowUpPrompts
        suggestions={["", "   "]}
        onSelect={() => {}}
      />,
    );
    expect(
      screen.queryByRole("region", { name: "Follow-ups" }),
    ).not.toBeInTheDocument();
  });
});
