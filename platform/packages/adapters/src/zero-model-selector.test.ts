import { describe, expect, it, vi } from "vitest";
import type {
  ModelProfile,
  ModelSelectionRequest,
  ModelSelectorDependencies,
} from "./zero-model-selector.js";
import { selectModelWithJev } from "./zero-model-selector.js";

const economy: ModelProfile = {
  id: "economy-code",
  revision: "profile-v1",
  connectionId: "fixture-router-connection",
  description: "Lower estimated cost; routine edits and small code changes.",
  enabled: true,
  authorized: true,
  capabilities: ["text", "coding"],
  contextWindowTokens: 16_000,
  estimatedCostMicros: 10n,
};
const advanced: ModelProfile = {
  ...economy,
  id: "advanced-code",
  description: "Complex reasoning and cross-file architecture changes.",
  contextWindowTokens: 64_000,
  estimatedCostMicros: 100n,
};
const config = { apiKey: "test-not-a-real-key", model: "typesafe/jev-1.13", timeoutMs: 1_000 };
function request(overrides: Partial<ModelSelectionRequest> = {}): ModelSelectionRequest {
  return {
    mode: "auto",
    invocationId: "offline-model-selection-1",
    generation: 3,
    goal: "Choose a capable model for this plan step",
    stepComplexity: "simple",
    profiles: [economy, advanced],
    allowedConnectionIds: [economy.connectionId],
    requiredCapabilities: ["coding"],
    requiredContextTokens: 4_000,
    ...overrides,
  } as ModelSelectionRequest;
}
function setup(choice = economy.id) {
  const hold = vi.fn(async () => {});
  const dispatch = vi.fn<typeof fetch>(async () =>
    Response.json({ answers: { model: { type: "choice", choice } } }),
  );
  const reserve = vi.fn(async (invocationId: string) => ({ invocationId, hold }));
  const authorize = vi.fn(async () => true);
  const eligible = vi.fn(
    async (_id: string, _revision: string, _connection: string, _generation: number) => true,
  );
  const dependencies: ModelSelectorDependencies = {
    fetch: dispatch,
    reserve,
    authorizeDispatch: authorize,
    stillEligible: eligible,
  };
  return { hold, dispatch, reserve, authorize, eligible, dependencies };
}

describe("policy-bounded Jev model selection (offline)", () => {
  it("passes plan complexity and trusted estimates to the existing transport and returns only a pinned advisory ref", async () => {
    const s = setup();
    const result = await selectModelWithJev(config, s.dependencies, request());
    expect(result).toEqual({
      status: "selected",
      profileId: economy.id,
      revision: economy.revision,
      connectionId: economy.connectionId,
      generation: 3,
      engine: "jev",
    });
    expect(s.dispatch).toHaveBeenCalledOnce();
    const [url, options] = s.dispatch.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/systemone");
    const payload = JSON.parse(String(options?.body));
    expect(payload.state.stepComplexity).toBe("simple");
    expect(payload.state.candidates[0].estimatedStepCostMicros).toBe("10");
    expect(Object.keys(payload.questions.model.criteria)).toEqual([
      economy.id,
      advanced.id,
      "abstain",
    ]);
    expect(payload.questions.model.instructions).toContain("least costly adequate");
    expect(String(options?.body)).not.toContain(economy.connectionId);
    expect(s.hold).toHaveBeenCalledOnce();
    expect(s.eligible).toHaveBeenLastCalledWith(
      economy.id,
      economy.revision,
      economy.connectionId,
      3,
    );
  });

  it("keeps own-provider OAuth scope even when a foreign profile declares itself authorized", async () => {
    const ownA = { ...economy, connectionId: "fixture-own-oauth" };
    const ownB = { ...advanced, connectionId: ownA.connectionId };
    const foreign = { ...advanced, id: "foreign-model", connectionId: "fixture-other-provider" };
    const s = setup(advanced.id);
    const result = await selectModelWithJev(
      config,
      s.dependencies,
      request({
        profiles: [ownA, ownB, foreign],
        allowedConnectionIds: [ownA.connectionId],
        stepComplexity: "complex",
      }),
    );
    expect(result).toMatchObject({
      status: "selected",
      profileId: ownB.id,
      connectionId: ownA.connectionId,
    });
    const payload = JSON.parse(String(s.dispatch.mock.calls[0]![1]?.body));
    expect(Object.keys(payload.questions.model.criteria)).not.toContain(foreign.id);
    expect(JSON.stringify(payload)).not.toContain("fixture-own-oauth");
    expect(s.eligible.mock.calls.every((call) => call[2] === ownA.connectionId)).toBe(true);
  });

  it("filters capability, context, enabled, authorization, cost and unknown estimates before a one-model deterministic choice", async () => {
    const s = setup();
    const input = request({
      maxEstimatedCostMicros: 10n,
      profiles: [
        economy,
        { ...economy, id: "disabled", enabled: false },
        { ...economy, id: "not-authorized", authorized: false },
        { ...economy, id: "no-coding", capabilities: ["text"] },
        { ...economy, id: "small-context", contextWindowTokens: 3_999 },
        { ...advanced },
        { ...economy, id: "unknown-cost", estimatedCostMicros: undefined },
      ],
    });
    expect(
      await selectModelWithJev({ ...config, apiKey: undefined }, s.dependencies, input),
    ).toMatchObject({
      status: "selected",
      profileId: economy.id,
      engine: "single_eligible",
    });
    expect(s.dispatch).not.toHaveBeenCalled();
    expect(s.reserve).not.toHaveBeenCalled();
    expect(s.authorize).not.toHaveBeenCalled();
    expect(s.eligible).toHaveBeenCalledExactlyOnceWith(
      economy.id,
      economy.revision,
      economy.connectionId,
      3,
    );
  });

  it("returns missing when no capability, context or estimated cost meets the required scope", async () => {
    const s = setup();
    for (const overrides of [
      { requiredCapabilities: ["image"] },
      { requiredContextTokens: 64_001 },
      { maxEstimatedCostMicros: 0n },
    ]) {
      expect((await selectModelWithJev(config, s.dependencies, request(overrides))).status).toBe(
        "missing",
      );
    }
    expect(s.reserve).not.toHaveBeenCalled();
    expect(s.dispatch).not.toHaveBeenCalled();
  });

  it("never overrides an eligible fixed model with a more capable alternative or uses Jev for that choice", async () => {
    const s = setup(advanced.id);
    expect(
      await selectModelWithJev(
        { ...config, apiKey: undefined },
        s.dependencies,
        request({ mode: "fixed", fixedProfileId: economy.id, stepComplexity: "complex" }),
      ),
    ).toMatchObject({
      status: "selected",
      profileId: economy.id,
      engine: "fixed",
    });
    expect(s.dispatch).not.toHaveBeenCalled();
    expect(s.reserve).not.toHaveBeenCalled();
    expect(s.eligible).toHaveBeenCalledExactlyOnceWith(
      economy.id,
      economy.revision,
      economy.connectionId,
      3,
    );
  });

  it("blocks a disallowed or revoked fixed choice instead of silently selecting another", async () => {
    const scoped = setup();
    const foreign = { ...advanced, connectionId: "fixture-disallowed" };
    expect(
      await selectModelWithJev(
        config,
        scoped.dependencies,
        request({ mode: "fixed", fixedProfileId: foreign.id, profiles: [economy, foreign] }),
      ),
    ).toEqual({ status: "blocked", reason: "fixed_model_not_eligible" });
    const revoked = setup();
    revoked.eligible.mockResolvedValue(false);
    expect(
      (
        await selectModelWithJev(
          config,
          revoked.dependencies,
          request({ mode: "fixed", fixedProfileId: economy.id }),
        )
      ).status,
    ).toBe("blocked");
    expect(scoped.dispatch).not.toHaveBeenCalled();
    expect(revoked.dispatch).not.toHaveBeenCalled();
  });

  it("requires a Jev connection and a routing budget permit for an ambiguous auto choice", async () => {
    const noKey = setup();
    expect(
      (await selectModelWithJev({ ...config, apiKey: undefined }, noKey.dependencies, request()))
        .status,
    ).toBe("blocked");
    expect(noKey.reserve).not.toHaveBeenCalled();
    expect(noKey.dispatch).not.toHaveBeenCalled();
    const noCap = setup();
    noCap.dependencies.reserve = async () => null;
    expect((await selectModelWithJev(config, noCap.dependencies, request())).status).toBe(
      "blocked",
    );
    expect(noCap.dispatch).not.toHaveBeenCalled();
  });

  it("rechecks Jev's data recipient and every model grant before sharing the task", async () => {
    const recipient = setup();
    recipient.authorize.mockResolvedValue(false);
    expect((await selectModelWithJev(config, recipient.dependencies, request())).status).toBe(
      "blocked",
    );
    expect(recipient.dispatch).not.toHaveBeenCalled();
    expect(recipient.hold).toHaveBeenCalledOnce();
    const revoked = setup();
    revoked.eligible.mockResolvedValue(false);
    expect(await selectModelWithJev(config, revoked.dependencies, request())).toEqual({
      status: "blocked",
      reason: "model_profile_or_grant_changed",
    });
    expect(revoked.dispatch).not.toHaveBeenCalled();
    expect(revoked.hold).toHaveBeenCalledOnce();
  });

  it("rejects invented profiles and observes revocation after inference", async () => {
    const invented = setup("unconfigured-model");
    expect((await selectModelWithJev(config, invented.dependencies, request())).status).toBe(
      "blocked",
    );
    const revoked = setup(advanced.id);
    revoked.eligible
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    expect(await selectModelWithJev(config, revoked.dependencies, request())).toEqual({
      status: "blocked",
      reason: "model_profile_or_grant_changed",
    });
    expect(revoked.dispatch).toHaveBeenCalledOnce();
    expect(revoked.hold).toHaveBeenCalledOnce();
  });

  it("supports explicit abstention without fabricating or invoking another model", async () => {
    const s = setup("abstain");
    expect(await selectModelWithJev(config, s.dependencies, request())).toEqual({
      status: "abstained",
      reason: "no_adequate_model",
    });
    expect(s.dispatch).toHaveBeenCalledOnce();
    expect(s.hold).toHaveBeenCalledOnce();
  });

  it("blocks excessive eligible fanout and invalid profile IDs or request bounds before dispatch", async () => {
    const s = setup();
    expect(
      (
        await selectModelWithJev(
          config,
          s.dependencies,
          request({ profiles: Array.from({ length: 6 }, (_, i) => ({ ...economy, id: "p" + i })) }),
        )
      ).status,
    ).toBe("blocked");
    expect(
      (
        await selectModelWithJev(
          config,
          s.dependencies,
          request({ profiles: [{ ...economy, id: "provider/arbitrary-model" }] }),
        )
      ).status,
    ).toBe("blocked");
    expect(
      (await selectModelWithJev(config, s.dependencies, request({ profiles: [economy, economy] })))
        .status,
    ).toBe("blocked");
    expect(
      (await selectModelWithJev(config, s.dependencies, request({ requiredContextTokens: -1 })))
        .status,
    ).toBe("blocked");
    expect(
      (await selectModelWithJev(config, s.dependencies, request({ maxEstimatedCostMicros: -1n })))
        .status,
    ).toBe("blocked");
    expect(
      (await selectModelWithJev(config, s.dependencies, request({ allowedConnectionIds: [] })))
        .status,
    ).toBe("blocked");
    expect(s.reserve).not.toHaveBeenCalled();
    expect(s.dispatch).not.toHaveBeenCalled();
  });

  it("blocks cancellation before dispatch, during deterministic eligibility, and after an already-billed decision", async () => {
    const early = setup();
    const already = AbortSignal.abort();
    expect(
      (await selectModelWithJev(config, early.dependencies, request({ signal: already }))).status,
    ).toBe("blocked");
    expect(early.reserve).not.toHaveBeenCalled();
    const local = setup();
    const localAbort = new AbortController();
    local.eligible.mockImplementation(async () => {
      localAbort.abort();
      return true;
    });
    expect(
      await selectModelWithJev(
        config,
        local.dependencies,
        request({ profiles: [economy], signal: localAbort.signal }),
      ),
    ).toEqual({ status: "blocked", reason: "cancelled" });
    expect(local.dispatch).not.toHaveBeenCalled();
    const late = setup();
    const abort = new AbortController();
    late.hold.mockImplementation(async () => {
      abort.abort();
    });
    expect(
      await selectModelWithJev(config, late.dependencies, request({ signal: abort.signal })),
    ).toEqual({ status: "blocked", reason: "cancelled" });
    expect(late.dispatch).toHaveBeenCalledOnce();
    expect(late.hold).toHaveBeenCalledOnce();
  });

  it("cancels a stalled deterministic policy check without invoking a model", async () => {
    const s = setup();
    const abort = new AbortController();
    let started: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    s.eligible.mockImplementation(async () => {
      started?.();
      return new Promise<boolean>(() => {});
    });
    const decision = selectModelWithJev(
      config,
      s.dependencies,
      request({ profiles: [economy], signal: abort.signal }),
    );
    await waiting;
    abort.abort();
    expect(await decision).toEqual({ status: "blocked", reason: "cancelled" });
    expect(s.dispatch).not.toHaveBeenCalled();
  });

  it("snapshots profiles and trusted connection scope while the reservation is pending", async () => {
    const s = setup();
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    s.reserve.mockImplementation(async (invocationId) => {
      started?.();
      await gate;
      return { invocationId, hold: s.hold };
    });
    const profile = { ...economy, capabilities: [...economy.capabilities] };
    const connections = [economy.connectionId];
    const required = ["coding"];
    const input = request({
      profiles: [profile, advanced],
      allowedConnectionIds: connections,
      requiredCapabilities: required,
    });
    const decision = selectModelWithJev(config, s.dependencies, input);
    await waiting;
    profile.id = "mutated-profile";
    profile.connectionId = "mutated-connection";
    profile.revision = "mutated-revision";
    profile.capabilities.length = 0;
    connections.length = 0;
    required.push("not-granted");
    s.dependencies.stillEligible = async () => false;
    release?.();
    expect(await decision).toMatchObject({
      status: "selected",
      profileId: economy.id,
      revision: economy.revision,
      connectionId: economy.connectionId,
    });
    expect(s.eligible).toHaveBeenLastCalledWith(
      economy.id,
      economy.revision,
      economy.connectionId,
      3,
    );
  });
});
