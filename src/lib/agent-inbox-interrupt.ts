import type { Interrupt } from "@langchain/langgraph-sdk";
import type {
  Decision,
  HITLRequest,
} from "@/components/thread/agent-inbox/types";

export function pendingInterrupts(stream: {
  interrupt?: unknown;
  interrupts?: readonly unknown[];
}): readonly unknown[] {
  if (stream.interrupts?.length) return stream.interrupts;
  if (Array.isArray(stream.interrupt)) return stream.interrupt;
  return stream.interrupt == null ? [] : [stream.interrupt];
}

/** Scalar resumes the next interrupt; a pending fan-out must target its ID. */
export function createInterruptResume(
  interrupt: Pick<Interrupt, "id">,
  decisions: Decision[],
  pending: readonly unknown[],
): { decisions: Decision[] } | Record<string, { decisions: Decision[] }> {
  const response = { decisions };
  if (pending.length <= 1) return response;
  if (!interrupt.id)
    throw new Error(
      "An interrupt ID is required when more than one approval is pending.",
    );
  return { [interrupt.id]: response };
}

export function isAgentInboxInterruptSchema(
  value: unknown,
): value is Interrupt<HITLRequest> | Interrupt<HITLRequest>[] {
  const interrupts = Array.isArray(value) ? value : [value];
  return interrupts.length > 0 && interrupts.every(isHitlInterrupt);
}

function isHitlInterrupt(valueAsObject: unknown): boolean {
  if (!valueAsObject || typeof valueAsObject !== "object") {
    return false;
  }

  const interrupt = valueAsObject as Interrupt<HITLRequest>;
  if (!interrupt.value || typeof interrupt.value !== "object") {
    return false;
  }

  const hitlValue = interrupt.value as Partial<HITLRequest>;
  const { action_requests: actionRequests, review_configs: reviewConfigs } =
    hitlValue;

  if (!Array.isArray(actionRequests) || actionRequests.length === 0) {
    return false;
  }
  if (!Array.isArray(reviewConfigs) || reviewConfigs.length === 0) {
    return false;
  }

  const hasValidActionRequests = actionRequests.every((request) => {
    return (
      request &&
      typeof request === "object" &&
      "name" in request &&
      typeof request.name === "string" &&
      "args" in request &&
      request.args !== null &&
      typeof request.args === "object"
    );
  });

  const hasValidConfigs = reviewConfigs.every((config) => {
    return (
      config &&
      typeof config === "object" &&
      "action_name" in config &&
      typeof config.action_name === "string" &&
      "allowed_decisions" in config &&
      Array.isArray(config.allowed_decisions)
    );
  });

  return hasValidActionRequests && hasValidConfigs;
}
