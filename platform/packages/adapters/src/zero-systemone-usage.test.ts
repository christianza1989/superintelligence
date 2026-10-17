import { describe, expect, it, vi } from "vitest";
import type { SystemOneDependencies, SystemOneUsageEvent } from "./zero-systemone.js";
import { requestSystemOneDecision } from "./zero-systemone.js";
import { selectToolWithJev } from "./zero-tool-selector.js";

const config = { apiKey: "fixture-key", model: "fixture/jev", timeoutMs: 150 };
const request = {
  invocationId: "same-call",
  generation: 0,
  state: "fixture goal",
  questions: {
    tool: {
      type: "choice" as const,
      instructions: "Choose tool",
      criteria: { safe: "safe", abstain: "no fit" },
    },
  },
};
function fixture(
  body: unknown = {
    answers: { tool: { type: "choice", choice: "safe" } },
    id: "provider-fixture",
    usage: { input_tokens: 12, output_tokens: 0, cost: 0 },
  },
) {
  const hold = vi.fn(async () => {});
  const onUsage = vi.fn(async (_event: SystemOneUsageEvent) => {});
  const dispatch = vi.fn<typeof fetch>(async () => Response.json(body));
  const deps: SystemOneDependencies = {
    fetch: dispatch,
    onUsage,
    reserve: async (invocationId) => ({ invocationId, hold }),
    authorizeDispatch: async () => true,
  };
  return { deps, hold, onUsage, dispatch };
}

describe("SystemOne producer usage authority", () => {
  it("awaits exactly one usage event with reservation callId and preserves actual zero", async () => {
    const s = fixture();
    let finish!: () => void;
    s.onUsage.mockImplementation(
      async () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = requestSystemOneDecision(config, s.deps, request);
    await vi.waitFor(() => expect(s.onUsage).toHaveBeenCalledOnce());
    expect(s.hold).not.toHaveBeenCalled();
    expect(s.onUsage.mock.calls[0]![0]).toMatchObject({
      callId: request.invocationId,
      provider: "openrouter",
      model: config.model,
      inputTokens: 12,
      outputTokens: 0,
      costUsd: 0,
      requestId: "provider-fixture",
      operationKind: "retrieval",
    });
    finish();
    expect((await pending).status).toBe("answered");
    expect(s.hold).toHaveBeenCalledOnce();
    expect(s.dispatch).toHaveBeenCalledOnce();
  });
  it.each(["missing", "timeout", "malformed"])(
    "keeps %s usage null and retains debit",
    async (mode) => {
      const s = fixture({ answers: { tool: { type: "choice", choice: "safe" } } });
      if (mode === "timeout") s.dispatch.mockImplementation(async () => new Promise(() => {}));
      if (mode === "malformed") s.dispatch.mockResolvedValue(new Response("not json"));
      await requestSystemOneDecision(config, s.deps, request);
      expect(s.onUsage).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          callId: request.invocationId,
          inputTokens: null,
          outputTokens: null,
          costUsd: null,
          usageSource: "unknown",
        }),
      );
      expect(s.hold).toHaveBeenCalledOnce();
      expect(s.dispatch).toHaveBeenCalledOnce();
    },
  );
  it("does not discard known spend for an invalid answer schema", async () => {
    const s = fixture({
      answers: "invalid",
      usage: { input_tokens: 9, output_tokens: 2, cost: 0.001 },
    });
    expect((await requestSystemOneDecision(config, s.deps, request)).status).toBe("unknown");
    expect(s.onUsage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ inputTokens: 9, outputTokens: 2, costUsd: 0.001 }),
    );
  });
  it("blocks execution after accounting failure without retrying or refunding", async () => {
    const s = fixture();
    s.onUsage.mockRejectedValue(new Error("fixture secret detail"));
    expect(await requestSystemOneDecision(config, s.deps, request)).toEqual({
      status: "unknown",
      reason: "usage_receipt_requires_reconciliation",
    });
    expect(s.dispatch).toHaveBeenCalledOnce();
    expect(s.onUsage).toHaveBeenCalledOnce();
    expect(s.hold).toHaveBeenCalledOnce();
  });
  it.each(["cap", "revoked"])("has no provider usage or dispatch after %s denial", async (mode) => {
    const s = fixture();
    if (mode === "cap") s.deps.reserve = async () => null;
    else s.deps.authorizeDispatch = async () => false;
    expect((await requestSystemOneDecision(config, s.deps, request)).status).toBe("blocked");
    expect(s.dispatch).not.toHaveBeenCalled();
    expect(s.onUsage).not.toHaveBeenCalled();
  });
  it("the actual selector forwards the same sole accounting sink", async () => {
    const s = fixture();
    const result = await selectToolWithJev(
      config,
      { ...s.deps, stillEligible: async () => true },
      {
        invocationId: request.invocationId,
        generation: 0,
        goal: "safe task",
        tools: [
          { id: "safe", description: "Safe tool", revision: "1", enabled: true, authorized: true },
        ],
      },
    );
    expect(result.status).toBe("selected");
    expect(s.onUsage).toHaveBeenCalledOnce();
  });
});
