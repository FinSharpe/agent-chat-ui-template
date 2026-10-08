import { describe, expect, it } from "vitest";
import { normalizeInterruptForClient } from "@langchain/langgraph-sdk/ui";
import {
  Annotation,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
} from "@langchain/langgraph";
import {
  createInterruptResume,
  isAgentInboxInterruptSchema,
  pendingInterrupts,
} from "./agent-inbox-interrupt";

const approval = normalizeInterruptForClient({
  id: "approval",
  value: {
    actionRequests: [{ name: "trade", args: { symbol: "INFY" } }],
    reviewConfigs: [{ action_name: "trade", allowedDecisions: ["approve"] }],
  },
});

describe("approval resume targeting", () => {
  it("retains the scalar contract for a single interrupt, including one without an ID", () => {
    expect(
      createInterruptResume({}, [{ type: "approve" }], [approval]),
    ).toEqual({ decisions: [{ type: "approve" }] });
  });

  it("targets the selected interrupt in a fan-out and rejects an unidentifiable target", () => {
    expect(
      createInterruptResume(
        { id: "second" },
        [{ type: "reject", message: "No" }],
        [approval, {}],
      ),
    ).toEqual({ second: { decisions: [{ type: "reject", message: "No" }] } });
    expect(() =>
      createInterruptResume({}, [{ type: "approve" }], [approval, {}]),
    ).toThrow("interrupt ID");
  });

  it("reads the full SDK list with compatibility for singular and array-shaped getters", () => {
    expect(
      pendingInterrupts({
        interrupt: approval,
        interrupts: [approval, approval],
      }),
    ).toEqual([approval, approval]);
    expect(pendingInterrupts({ interrupt: [approval, approval] })).toEqual([
      approval,
      approval,
    ]);
    expect(pendingInterrupts({ interrupt: approval })).toEqual([approval]);
    expect(pendingInterrupts({})).toEqual([]);
  });

  it("resumes only the selected parallel interrupt in the installed LangGraph runtime", async () => {
    const state = Annotation.Root({
      approved: Annotation<Record<string, unknown>>({
        reducer: (left, right) => ({ ...left, ...right }),
        default: () => ({}),
      }),
    });
    const graph = new StateGraph(state)
      .addNode("first", () => ({ approved: { first: interrupt("first") } }))
      .addNode("second", () => ({ approved: { second: interrupt("second") } }))
      .addEdge(START, "first")
      .addEdge(START, "second")
      .addEdge("first", END)
      .addEdge("second", END)
      .compile({ checkpointer: new MemorySaver() });
    const config = { configurable: { thread_id: "approval-targeting" } };
    await graph.invoke({}, config);
    const checkpoint = await graph.getState(config);
    const pending = checkpoint.tasks.flatMap((task) => task.interrupts ?? []);
    expect(pending).toHaveLength(2);
    const selected = pending.find((item) => item.value === "second");
    if (!selected) throw new Error("Expected the second parallel interrupt");
    const result = await graph.invoke(
      new Command({
        resume: createInterruptResume(selected, [{ type: "approve" }], pending),
      }),
      config,
    );
    expect(result.approved).toEqual({
      second: { decisions: [{ type: "approve" }] },
    });
    const first = pending.find((item) => item.value === "first");
    if (!first) throw new Error("Expected the first parallel interrupt");
    const completed = await graph.invoke(
      new Command({
        resume: createInterruptResume(
          first,
          [{ type: "reject", message: "Declined" }],
          pending,
        ),
      }),
      config,
    );
    expect(completed.approved).toEqual({
      first: { decisions: [{ type: "reject", message: "Declined" }] },
      second: { decisions: [{ type: "approve" }] },
    });
  });
});

describe("modern HITL envelope schema", () => {
  it("recognizes the installed SDK envelope and aliases", () => {
    expect(isAgentInboxInterruptSchema(approval)).toBe(true);
    expect(
      isAgentInboxInterruptSchema([approval, { ...approval, id: "second" }]),
    ).toBe(true);
    expect(isAgentInboxInterruptSchema(approval.value)).toBe(false);
  });
  it("requires every array entry to be a valid modern HITL envelope", () => {
    expect(
      isAgentInboxInterruptSchema([
        approval,
        { value: { question: "Confirm?" } },
      ]),
    ).toBe(false);
    expect(
      isAgentInboxInterruptSchema([
        { value: { question: "Confirm?" } },
        approval,
      ]),
    ).toBe(false);
    expect(isAgentInboxInterruptSchema([])).toBe(false);
  });
});
