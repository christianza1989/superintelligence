import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ZeroJevApplicationClient } from "./zero-jev-application-client.js";
import { readZeroReuseReceipt } from "./zero-reuse-receipt.js";

const jobId = "504cb805-f5c4-42b4-832d-02f5a1cb4ca9";
function fixture() {
  const receipt = {
    kind: "zero.jev.receipt.v1",
    jobId,
    callId: jobId,
    requestDigest: "b".repeat(64),
    state: "succeeded",
    phase: "inspected",
    inspection: {
      entries: [
        {
          path: "src/module.ts",
          excerpt: "ž".repeat(4200),
          sha256: "c".repeat(64),
        },
      ],
    },
    usage: { inputTokens: 234 },
  };
  const bytes = Buffer.from(JSON.stringify(receipt));
  const job = {
    jobId,
    callId: jobId,
    requestDigest: receipt.requestDigest,
    state: "succeeded" as const,
    artifactId: "receipt",
    revision: 2 as const,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const client = {
    get: vi.fn(async () => job),
    artifactPage: vi.fn(async (_id, { offset = 0, limit = 8192 } = {}) => {
      const end = Math.min(offset + limit, bytes.length);
      return {
        artifactId: job.artifactId,
        revision: job.revision,
        sha256: job.sha256,
        totalBytes: bytes.length,
        offset,
        nextOffset: end < bytes.length ? end : null,
        encoding: "base64" as const,
        contentBase64: bytes.subarray(offset, end).toString("base64"),
      };
    }),
  } satisfies Pick<ZeroJevApplicationClient, "get" | "artifactPage">;
  return {
    client: client as unknown as ZeroJevApplicationClient,
    bytes,
    job,
    receipt,
  };
}
describe("readable immutable reuse receipt", () => {
  it("decodes byte-split UTF-8 internally and binds the full digest before returning readable evidence", async () => {
    const { client, receipt, job } = fixture();
    const view = await readZeroReuseReceipt(client, jobId);
    expect(view).toMatchObject({
      sha256: job.sha256,
      integrityVerified: true,
      untrustedSource: true,
      receipt: { inspection: receipt.inspection },
    });
    expect(view.omittedFields).toContain("usage");
    expect(client.artifactPage).toHaveBeenCalledTimes(2);
  });
  it("rejects tampered bytes even with unchanged page metadata", async () => {
    const { client, bytes } = fixture();
    bytes[bytes.length - 2] = 48;
    await expect(readZeroReuseReceipt(client, jobId)).rejects.toThrow(
      "receipt_integrity_failed",
    );
  });
  it("rejects a cross-job page or drifting receipt metadata", async () => {
    const { client } = fixture();
    const original = client.artifactPage;
    client.artifactPage = async (id, page) => ({
      ...(await original(id, page)),
      artifactId: "foreign",
    });
    await expect(readZeroReuseReceipt(client, jobId)).rejects.toThrow(
      "receipt_page_integrity_failed",
    );
  });
  it("does not read an unfinished job", async () => {
    const { client } = fixture();
    client.get = async () => ({
      jobId,
      callId: null,
      state: "unknown",
      reason: "no_terminal_receipt",
    });
    await expect(readZeroReuseReceipt(client, jobId)).rejects.toThrow(
      "receipt_not_terminal",
    );
    expect(client.artifactPage).not.toHaveBeenCalled();
  });
});
