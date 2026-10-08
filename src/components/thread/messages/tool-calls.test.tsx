import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToolCalls } from "./tool-calls";
import { ToolDisclosureProvider } from "./disclosure-state";
import { ToolStep } from "./tool-activity";
import { ToolPhase, parseToolPayload } from "./tool-call-group";

const steps: ToolStep[] = ["scan", "call_api", "search_filings"].map(
  (name, index) => ({
    key: `c${index}`,
    call: {
      id: `c${index}`,
      name,
      args: { nested: { retained: "visible" } },
      type: "tool_call",
    },
  }),
);
function View({
  count,
  phase = "running",
  completed = false,
}: {
  count: number;
  phase?: ToolPhase;
  completed?: boolean;
}) {
  return (
    <ToolDisclosureProvider>
      <ToolCalls
        groupKey="local"
        steps={steps.slice(0, count).map((step) =>
          completed
            ? {
                ...step,
                response: {
                  type: "tool",
                  content: "false",
                  tool_call_id: step.key,
                },
              }
            : step,
        )}
        phase={phase}
        activeCallKey="c0"
      />
    </ToolDisclosureProvider>
  );
}

describe("local tool disclosures", () => {
  it("shows one and two calls individually, and three in a collapsed local group", () => {
    const { rerender } = render(<View count={1} />);
    expect(screen.getAllByRole("button", { name: /tool call:/ })).toHaveLength(
      1,
    );
    rerender(<View count={2} />);
    expect(screen.getAllByRole("button", { name: /tool call:/ })).toHaveLength(
      2,
    );
    rerender(<View count={3} />);
    expect(
      screen.getByRole("button", { name: /expand tool group/i }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: /tool call:/ }),
    ).not.toBeInTheDocument();
  });

  it("retains opened calls and JSON branches when a third call arrives and on completion", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<View count={2} />);
    await user.click(
      screen.getByRole("button", { name: /expand tool call: Scanning/i }),
    );
    await user.click(screen.getByRole("button", { name: /^Expand$/ }));
    expect(screen.getByText('"retained"')).toBeInTheDocument();
    rerender(<View count={3} />);
    expect(
      screen.getByRole("button", { name: /collapse tool group/i }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText('"retained"')).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /collapse tool group/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /expand tool group/i }),
    );
    expect(screen.getByText('"retained"')).toBeInTheDocument();
    rerender(
      <View
        count={3}
        phase="settled"
        completed
      />,
    );
    expect(screen.getByText('"retained"')).toBeInTheDocument();
    expect(screen.getByText("false")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /collapse tool call: Scan the market/i,
      }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("makes a stopped pending call static and explains the missing response", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <View
        count={1}
        phase="stopped"
      />,
    );
    expect(container.querySelector(".tool-crest")).toBeNull();
    await user.click(screen.getByRole("button", { name: /tool call:/ }));
    expect(
      screen.getByText("Stopped before a response arrived."),
    ).toBeInTheDocument();
  });

  it.each(["null", "false", "0", "[]", "{}", '"<b>literal</b>"'])(
    "preserves the JSON meaning of %s",
    (input) => {
      expect(parseToolPayload(input)).toEqual({
        json: true,
        value: JSON.parse(input),
      });
    },
  );
  it("preserves incomplete JSON and HTML-like text literally", () => {
    expect(parseToolPayload('{"half":')).toEqual({
      json: false,
      value: '{"half":',
    });
    expect(parseToolPayload("<script>test</script>")).toEqual({
      json: false,
      value: "<script>test</script>",
    });
  });
});
