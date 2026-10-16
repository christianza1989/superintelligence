import { describe, expect, it, vi } from "vitest";
import type { ToolProfile, ToolSelectorDependencies } from "./zero-tool-selector.js";
import { selectToolWithJev } from "./zero-tool-selector.js";

const profile: ToolProfile = {
  id: "document.extract",
  description: "Extract a document",
  revision: "v1",
  enabled: true,
  authorized: true,
};
const config = { apiKey: "test-not-a-real-key", model: "typesafe/jev-1.13", timeoutMs: 1_000 };
const request = {
  invocationId: "example-1",
  goal: "Extract tables from a PDF",
  tools: [profile],
  generation: 3,
};
function setup(choice: string = profile.id) {
  const hold = vi.fn(async () => {});
  const dispatch = vi.fn<typeof fetch>(async () =>
    Response.json({ answers: { tool: { type: "choice", choice } } }),
  );
  const reserve = vi.fn(async (invocationId: string) => ({ invocationId, hold }));
  const stillEligible = vi.fn(async () => true);
  const dependencies: ToolSelectorDependencies = {
    fetch: dispatch,
    reserve,
    stillEligible,
    authorizeDispatch: async () => true,
  };
  return { hold, dispatch, reserve, stillEligible, dependencies };
}
describe("Jev selector boundary", () => {
  it("blocks stale recipient or tool grants before sending task data", async () => {
    const recipient = setup();
    recipient.dependencies.authorizeDispatch = async () => false;
    expect((await selectToolWithJev(config, recipient.dependencies, request)).status).toBe(
      "blocked",
    );
    expect(recipient.dispatch).not.toHaveBeenCalled();
    const tool = setup();
    tool.stillEligible.mockResolvedValue(false);
    expect((await selectToolWithJev(config, tool.dependencies, request)).status).toBe("blocked");
    expect(tool.dispatch).not.toHaveBeenCalled();
  });
  it("fails closed on reservation and receipt errors without repeating a dispatch", async () => {
    const reserve = setup();
    reserve.reserve.mockRejectedValue(new Error("database unavailable"));
    expect((await selectToolWithJev(config, reserve.dependencies, request)).status).toBe("blocked");
    expect(reserve.dispatch).not.toHaveBeenCalled();
    const receipt = setup();
    receipt.hold.mockRejectedValue(new Error("receipt unavailable"));
    expect((await selectToolWithJev(config, receipt.dependencies, request)).status).toBe("unknown");
    expect(receipt.dispatch).toHaveBeenCalledOnce();
  });
  it("never calls a paid provider without a connection, grant, or atomic budget reservation", async () => {
    const s = setup();
    expect(
      (await selectToolWithJev({ ...config, apiKey: undefined }, s.dependencies, request)).status,
    ).toBe("blocked");
    expect(
      (
        await selectToolWithJev(config, s.dependencies, {
          ...request,
          tools: [{ ...profile, authorized: false }],
        })
      ).status,
    ).toBe("missing");
    s.dependencies.reserve = async () => null;
    expect((await selectToolWithJev(config, s.dependencies, request)).status).toBe("blocked");
    expect(s.dispatch).not.toHaveBeenCalled();
  });
  it("uses the source-confirmed SystemOne endpoint and bounds the choice to the request snapshot", async () => {
    const s = setup();
    const selected = await selectToolWithJev(config, s.dependencies, request);
    expect(selected).toEqual({
      status: "selected",
      toolId: profile.id,
      revision: "v1",
      generation: 3,
      engine: "jev",
    });
    expect(s.dispatch).toHaveBeenCalledOnce();
    const call = s.dispatch.mock.calls[0];
    if (!call) throw new Error("Expected one provider dispatch");
    const [url, options] = call;
    expect(url).toBe("https://openrouter.ai/api/v1/systemone");
    expect(options?.redirect).toBe("error");
    expect(JSON.parse(String(options?.body)).questions.tool.criteria).toHaveProperty("abstain");
    expect(s.hold).toHaveBeenCalledOnce();
  });
  it("does not retry failed dispatches or expose the key in an error", async () => {
    const s = setup();
    s.dispatch.mockRejectedValue(new Error(config.apiKey));
    const result = await selectToolWithJev(config, s.dependencies, request);
    expect(result.status).toBe("unknown");
    expect(JSON.stringify(result)).not.toContain(config.apiKey);
    expect(s.dispatch).toHaveBeenCalledOnce();
    expect(s.hold).toHaveBeenCalledOnce();
  });
  it("rejects invented selections and revocation during inference", async () => {
    const bad = setup("shell.admin");
    expect((await selectToolWithJev(config, bad.dependencies, request)).status).toBe("blocked");
    const revoked = setup();
    revoked.stillEligible.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await selectToolWithJev(config, revoked.dependencies, request)).status).toBe("blocked");
    expect(revoked.dispatch).toHaveBeenCalledOnce();
  });
  it("bounds oversized and stalled response bodies while retaining the reservation", async () => {
    const oversized = setup();
    oversized.dispatch.mockResolvedValue(new Response(new Uint8Array(65_537)));
    expect((await selectToolWithJev(config, oversized.dependencies, request)).status).toBe(
      "unknown",
    );
    expect(oversized.hold).toHaveBeenCalledOnce();
    const stalled = setup();
    const abort = new AbortController();
    let startRead: (() => void) | undefined;
    const reading = new Promise<void>((resolve) => {
      startRead = resolve;
    });
    const cancel = vi.fn();
    stalled.dispatch.mockResolvedValue(
      new Response(
        new ReadableStream(
          {
            pull() {
              startRead?.();
              return new Promise<void>(() => {});
            },
            cancel,
          },
          { highWaterMark: 0 },
        ),
      ),
    );
    const selection = selectToolWithJev(config, stalled.dependencies, {
      ...request,
      signal: abort.signal,
    });
    await reading;
    abort.abort();
    expect((await selection).status).toBe("unknown");
    expect(stalled.dispatch).toHaveBeenCalledOnce();
    expect(stalled.hold).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("allows abstention and refuses oversized candidate fanout", async () => {
    const s = setup("abstain");
    expect((await selectToolWithJev(config, s.dependencies, request)).status).toBe("abstained");
    const oversized = setup();
    expect(
      (
        await selectToolWithJev(config, oversized.dependencies, {
          ...request,
          tools: Array(6).fill(profile),
        })
      ).status,
    ).toBe("blocked");
    expect(oversized.dispatch).not.toHaveBeenCalled();
  });

  it("does not select a tool canceled while its final eligibility check is pending", async () => {
    const s = setup();
    const abort = new AbortController();
    s.stillEligible.mockResolvedValueOnce(true).mockImplementationOnce(async () => {
      abort.abort();
      return true;
    });
    expect(
      await selectToolWithJev(config, s.dependencies, { ...request, signal: abort.signal }),
    ).toEqual({ status: "unknown", reason: "cancelled_after_dispatch" });
    expect(s.dispatch).toHaveBeenCalledOnce();
    expect(s.hold).toHaveBeenCalledOnce();
  });
});
