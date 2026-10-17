import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZeroCsvApplicationClient } from "./zero-csv-application-client.js";
import { ZERO_CSV_LIMITS, ZERO_CSV_PROFILE } from "./zero-csv-profile.js";
import { registerZeroCsvMcpTools } from "./zero-mcp-csv-tools.js";
import { createZeroMcpServer } from "./zero-mcp-server.js";

const jobId = "504cb805-f5c4-42b4-832d-02f5a1cb4ca9";
const hash = "a".repeat(64);
const terminal = {
  jobId,
  state: "succeeded" as const,
  profile: ZERO_CSV_PROFILE,
  requestDigest: hash,
  artifactId: "fixture-artifact",
} as const;
const input = () => ({
  profile: ZERO_CSV_PROFILE,
  csv: "name,value\na,2\n",
  idempotencyKey: "fixture-key",
  deadline: new Date(Date.now() + 60_000).toISOString(),
});
describe("optional CSV MCP application boundary", () => {
  let api: ZeroCsvApplicationClient;
  let client: Client;
  let server: ReturnType<typeof createZeroMcpServer>;
  const call = async (name: string, args: Record<string, unknown>) =>
    (await client.callTool({ name, arguments: args })) as CallToolResult;
  beforeEach(async () => {
    api = {
      status: vi.fn<ZeroCsvApplicationClient["status"]>(async () => ({
        profile: ZERO_CSV_PROFILE,
        backend: "available",
        paidModelCalls: 0,
        execution: "csv-preparation-only",
        limits: ZERO_CSV_LIMITS,
      })),
      prepare: vi.fn<ZeroCsvApplicationClient["prepare"]>(async () => ({
        jobId,
        requestDigest: hash,
      })),
      get: vi.fn<ZeroCsvApplicationClient["get"]>(async () => ({
        ...terminal,
        revision: 2,
        sha256: hash,
      })),
      cancel: vi.fn<ZeroCsvApplicationClient["cancel"]>(async () => terminal),
      artifactPage: vi.fn<ZeroCsvApplicationClient["artifactPage"]>(async (_id, page) => {
        const bytes = Buffer.alloc(page?.limit ?? 8192, 65);
        return {
          artifactId: "fixture-artifact",
          revision: 2,
          sha256: hash,
          totalBytes: bytes.length,
          offset: 0,
          nextOffset: null,
          encoding: "base64",
          contentBase64: bytes.toString("base64"),
        };
      }),
    };
    server = createZeroMcpServer({
      executionStatus: async () => {
        await api.status();
        return "available";
      },
    });
    registerZeroCsvMcpTools(server, api);
    client = new Client({ name: "csv-boundary-proof", version: "1" });
    const [left, right] = InMemoryTransport.createLinkedPair();
    await server.connect(right);
    await client.connect(left);
  });
  afterEach(async () => {
    await client.close();
    await server.close();
  });
  it("exposes exactly scoped operations with object output schemas and truthful effects", async () => {
    const { tools } = await client.listTools();
    expect(tools.map(({ name }) => name)).toEqual([
      "zero_search",
      "zero_inspect",
      "zero_status",
      "zero_prepare",
      "zero_job",
      "zero_artifact",
      "zero_cancel",
    ]);
    for (const tool of tools) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.outputSchema?.type).toBe("object");
      expect(tool.outputSchema?.additionalProperties).toBe(false);
      expect(tool.annotations?.readOnlyHint).toBe(
        !["zero_prepare", "zero_cancel"].includes(tool.name),
      );
    }
    const status = await call("zero_status", { nonce: "bound-probe" });
    expect(status.structuredContent).toMatchObject({
      profile: "csv-preparation-only",
      backend: "available",
      nonce: "bound-probe",
    });
    expect(api.status).toHaveBeenCalledTimes(1);
  });
  it("forwards only validated preparation fields to the operator-bound client", async () => {
    const args = input();
    expect((await call("zero_prepare", args)).structuredContent).toEqual({
      jobId,
      requestDigest: hash,
    });
    const { profile: _profile, ...expected } = args;
    expect(api.prepare).toHaveBeenCalledWith(expected);
  });
  it.each(["userId", "spaceId", "scopeId", "root", "apiUrl", "sessionToken"])(
    "rejects caller authority field %s before dispatch",
    async (field) => {
      expect(
        (await call("zero_prepare", { ...input(), [field]: "caller-controlled" })).isError,
      ).toBe(true);
      expect(api.prepare).not.toHaveBeenCalled();
    },
  );
  it("rejects oversized UTF8 input before any application call", async () => {
    expect((await call("zero_prepare", { ...input(), csv: "😀".repeat(5000) })).isError).toBe(true);
    expect(api.prepare).not.toHaveBeenCalled();
  });
  it("preserves unknown and failed states and never turns completed cancellation into success claims", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      jobId,
      state: "unknown",
      attempts: null,
      reason: "queue_and_receipt_absent",
    });
    expect((await call("zero_job", { jobId })).structuredContent).toEqual({
      job: { jobId, state: "unknown", attempts: null, reason: "queue_and_receipt_absent" },
    });
    vi.mocked(api.get).mockResolvedValueOnce({
      ...terminal,
      state: "failed",
      revision: 2,
      sha256: hash,
    });
    expect((await call("zero_job", { jobId })).structuredContent).toMatchObject({
      job: { state: "failed" },
    });
    expect((await call("zero_cancel", { jobId })).structuredContent).toMatchObject({
      state: "succeeded",
    });
  });
  it("bounds the entire artifact result including the duplicated compatibility text", async () => {
    const result = await call("zero_artifact", { jobId });
    expect(result.isError).not.toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(32 * 1024);
    expect(api.artifactPage).toHaveBeenCalledWith(jobId, { offset: 0, limit: 8192 });
    expect((await call("zero_artifact", { jobId, limit: 8193 })).isError).toBe(true);
    expect(api.artifactPage).toHaveBeenCalledTimes(1);
  });
  it("redacts application failures and preserves SDK output validation", async () => {
    vi.mocked(api.prepare).mockRejectedValueOnce(
      new Error("PRIVATE_SESSION_TOKEN file://private/operator/path"),
    );
    const failed = await call("zero_prepare", input());
    expect(failed.isError).toBe(true);
    expect(JSON.stringify(failed)).not.toMatch(/PRIVATE_SESSION_TOKEN|operator\/path/);
    vi.mocked(api.get).mockResolvedValueOnce({
      ...terminal,
      revision: 2,
      sha256: "not-a-hash",
    } as never);
    expect((await call("zero_job", { jobId })).isError).toBe(true);
  });
});
