import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ZeroJevApplicationClient } from "./zero-jev-application-client.js";
import { waitForZeroReuseDecision } from "./zero-reuse-wait.js";

const id = "504cb805-f5c4-42b4-832d-02f5a1cb4ca9";
function fixture() {
  const body = {
    kind: "zero.jev.receipt.v1",
    jobId: id,
    callId: id,
    requestDigest: "a".repeat(64),
    state: "succeeded",
    phase: "module-proposed",
    selection: { status: "recommended" },
    moduleProposal: null,
    prepared: false,
    verified: false,
    usage: { inputTokens: 123 },
  };
  const bytes = Buffer.from(JSON.stringify(body));
  const job = {
    jobId: id,
    callId: id,
    requestDigest: body.requestDigest,
    state: "succeeded" as const,
    artifactId: "fixture",
    revision: 2 as const,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const api = {
    get: vi.fn(async () => job),
    artifactPage: vi.fn(async () => ({
      artifactId: "fixture",
      revision: 2 as const,
      sha256: job.sha256,
      totalBytes: bytes.length,
      offset: 0,
      nextOffset: null,
      encoding: "base64" as const,
      contentBase64: bytes.toString("base64"),
    })),
  } as unknown as ZeroJevApplicationClient;
  return { api, bytes };
}
describe("bounded wait with a verified decision", () => {
  it("returns the completed decision in the same request without another paid dispatch or model cycle", async () => {
    const { api } = fixture();
    const result = await waitForZeroReuseDecision(api, id, 20000);
    expect(result).toMatchObject({
      job: { state: "succeeded" },
      decision: {
        view: "decision",
        integrityVerified: true,
        receipt: { phase: "module-proposed", prepared: false },
      },
    });
    expect(result.decision?.receipt).not.toHaveProperty("usage");
    expect(api.artifactPage).toHaveBeenCalledOnce();
  });
  it("returns a pending job at the wait boundary without resubmitting or busy polling", async () => {
    const { api } = fixture();
    api.get = vi.fn<ZeroJevApplicationClient["get"]>(async () => ({
      jobId: id,
      callId: null,
      state: "unknown",
      reason: "no_terminal_receipt",
    }));
    const result = await waitForZeroReuseDecision(api, id, 0);
    expect(result).toMatchObject({
      job: { state: "unknown" },
      retryAfterMs: 4000,
    });
    expect(api.get).toHaveBeenCalledOnce();
    expect(api.artifactPage).not.toHaveBeenCalled();
  });
  it("cancellation stops the bounded request before any read", async () => {
    const { api } = fixture();
    const abort = new AbortController();
    abort.abort(new Error("cancelled"));
    await expect(
      waitForZeroReuseDecision(api, id, 20000, abort.signal),
    ).rejects.toThrow("cancelled");
    expect(api.get).not.toHaveBeenCalled();
  });
  it("waits inside the same request for a pending job to finish instead of returning an empty status to the model", async () => {
    const { api } = fixture();
    const original = api.get;
    let reads = 0;
    api.get = vi.fn<ZeroJevApplicationClient["get"]>(async (id) =>
      ++reads === 1
        ? {
            jobId: id,
            callId: null,
            state: "unknown",
            reason: "no_terminal_receipt",
          }
        : original(id),
    );
    const result = await waitForZeroReuseDecision(api, id, 1500);
    expect(result.decision?.integrityVerified).toBe(true);
    expect(api.get).toHaveBeenCalledTimes(3);
  });
  it("never returns a decision from tampered immutable receipt bytes", async () => {
    const { api, bytes } = fixture();
    bytes[bytes.length - 2] = 48;
    await expect(waitForZeroReuseDecision(api, id, 20000)).rejects.toThrow(
      "receipt_integrity_failed",
    );
  });
});
