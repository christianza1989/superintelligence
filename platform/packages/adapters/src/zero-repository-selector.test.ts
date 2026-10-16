import { describe, expect, it, vi } from "vitest";
import type { RepositoryOption } from "./zero-repository-selector.js";
import { selectRepositoryWithJev } from "./zero-repository-selector.js";

const config = {
  apiKey: "fixture-only",
  model: "typesafe/jev-1.13",
  timeoutMs: 1_000,
};
const candidate: RepositoryOption = {
  repository: "example/base",
  sourceRevision: "a".repeat(40),
  sourceAvailable: true,
  archived: false,
  capability: "Task API framework",
  licenseSource: "MIT source text, not license approval",
};
const input = () => ({
  invocationId: "repo-fixture",
  generation: 1,
  goal: "Build a task API",
  candidates: [candidate, { ...candidate, repository: "example/other" }],
});
function setup(choice = "repo0") {
  const hold = vi.fn(async () => {});
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({
      answers: { repository: { type: "choice", choice } },
      model: config.model,
      usage: { input_tokens: 20, output_tokens: 1 },
    }),
  );
  const reserve = vi.fn(async (invocationId: string) => ({
    invocationId,
    hold,
  }));
  const authorizeDispatch = vi.fn(async () => true);
  const stillEligible = vi.fn(async () => true);
  return { fetch, reserve, authorizeDispatch, stillEligible, hold };
}
describe("bounded source-only repository advice (offline)", () => {
  it("uses the existing transport, preserves source pin and actual receipt without promoting quality", async () => {
    const s = setup();
    const result = await selectRepositoryWithJev(config, s, input());
    expect(result).toMatchObject({
      status: "recommended",
      repository: candidate.repository,
      sourceRevision: candidate.sourceRevision,
      evidence: "source_only",
      engine: "jev",
      receipt: { usage: { inputTokens: 20, outputTokens: 1 } },
    });
    expect(s.fetch).toHaveBeenCalledOnce();
    expect(s.hold).toHaveBeenCalledOnce();
    expect(result).not.toHaveProperty("verified");
  });
  it("filters archived, unavailable and unpinned sources before dispatch, with no model for one remaining candidate", async () => {
    const s = setup();
    const result = await selectRepositoryWithJev({ ...config, apiKey: undefined }, s, {
      ...input(),
      candidates: [
        candidate,
        { ...candidate, repository: "x/archived", archived: true },
        { ...candidate, repository: "x/missing", sourceAvailable: false },
        { ...candidate, repository: "x/unpinned", sourceRevision: null },
      ],
    });
    expect(result).toMatchObject({
      status: "recommended",
      engine: "single_eligible",
    });
    expect(s.fetch).not.toHaveBeenCalled();
    expect(s.reserve).not.toHaveBeenCalled();
    expect(s.stillEligible).toHaveBeenCalledOnce();
  });
  it("keeps missing and abstained distinct without silently recommending a source", async () => {
    const s = setup("abstain");
    expect((await selectRepositoryWithJev(config, s, { ...input(), candidates: [] })).status).toBe(
      "missing",
    );
    expect(await selectRepositoryWithJev(config, s, input())).toMatchObject({
      status: "abstained",
      receipt: { usage: { inputTokens: 20, outputTokens: 1 } },
    });
  });
  it("denies an invented provider choice and holds its reservation", async () => {
    const s = setup("repo99");
    expect(await selectRepositoryWithJev(config, s, input())).toMatchObject({
      status: "blocked",
    });
    expect(s.hold).toHaveBeenCalledOnce();
  });
  it("does not dispatch a denied budget or revoked source scope", async () => {
    const s = setup();
    s.stillEligible.mockResolvedValue(false);
    expect((await selectRepositoryWithJev(config, s, input())).status).toBe("blocked");
    expect(s.fetch).not.toHaveBeenCalled();
    const denied = setup();
    expect(
      (await selectRepositoryWithJev(config, { ...denied, reserve: async () => null }, input()))
        .status,
    ).toBe("blocked");
    expect(denied.fetch).not.toHaveBeenCalled();
  });
  it("rechecks the selected pin after a provider response", async () => {
    const s = setup();
    s.stillEligible
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    expect((await selectRepositoryWithJev(config, s, input())).status).toBe("blocked");
  });
  it("rejects oversized or ambiguous identity collections before reservation", async () => {
    const s = setup();
    for (const candidates of [
      [candidate, { ...candidate, repository: "EXAMPLE/BASE" }],
      Array.from({ length: 6 }, (_, i) => ({
        ...candidate,
        repository: `x/repo${i}`,
      })),
    ])
      expect((await selectRepositoryWithJev(config, s, { ...input(), candidates })).status).toBe(
        "blocked",
      );
    expect(s.reserve).not.toHaveBeenCalled();
  });
  it("snapshots source data before asynchronous policy checks and respects cancellation", async () => {
    const s = setup();
    const request = input();
    s.authorizeDispatch.mockImplementationOnce(async () => {
      request.candidates[0] = { ...candidate, sourceRevision: "b".repeat(40) };
      return true;
    });
    expect(await selectRepositoryWithJev(config, s, request)).toMatchObject({
      sourceRevision: "a".repeat(40),
    });
    const abort = new AbortController();
    abort.abort();
    expect(
      (
        await selectRepositoryWithJev(config, setup(), {
          ...input(),
          signal: abort.signal,
        })
      ).status,
    ).toBe("blocked");
  });
  it("rejects coerced invocation IDs and source pins even for the single-source path", async () => {
    const s = setup();
    for (const invocationId of [undefined, 123, { toString: () => "plausible" }])
      expect(
        (
          await selectRepositoryWithJev(config, s, {
            ...input(),
            candidates: [candidate],
            invocationId,
          } as unknown as ReturnType<typeof input>)
        ).status,
      ).toBe("blocked");
    const sourceRevision = { toString: () => "a".repeat(40) };
    expect(
      (
        await selectRepositoryWithJev(config, s, {
          ...input(),
          candidates: [{ ...candidate, sourceRevision }],
        } as unknown as ReturnType<typeof input>)
      ).status,
    ).toBe("blocked");
    expect(s.fetch).not.toHaveBeenCalled();
    expect(s.stillEligible).not.toHaveBeenCalled();
  });
  it("cancels a hanging single-source policy check without dispatching or reserving", async () => {
    const s = setup();
    s.stillEligible.mockImplementation(async () => new Promise<boolean>(() => {}));
    const result = await selectRepositoryWithJev(config, s, {
      ...input(),
      candidates: [candidate],
      signal: AbortSignal.timeout(20),
    });
    expect(result.status).toBe("blocked");
    expect(s.reserve).not.toHaveBeenCalled();
    expect(s.fetch).not.toHaveBeenCalled();
  });
});
