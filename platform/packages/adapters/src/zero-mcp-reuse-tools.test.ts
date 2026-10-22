import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZeroJevApplicationClient } from "./zero-jev-application-client.js";
import { ZERO_JEV_LIMITS } from "./zero-jev-limits.js";
import { registerZeroReuseMcpTools } from "./zero-mcp-reuse-tools.js";
import { createZeroMcpServer } from "./zero-mcp-server.js";

const id = "504cb805-f5c4-42b4-832d-02f5a1cb4ca9",
  hash = "a".repeat(64);
const controls = () => ({
  deadline: new Date(Date.now() + 60000).toISOString(),
  idempotencyKey: "fixture-reuse",
});
describe("operator-bound module reuse MCP", () => {
  let api: ZeroJevApplicationClient,
    client: Client,
    server: ReturnType<typeof createZeroMcpServer>;
  beforeEach(async () => {
    api = {
      status: vi.fn<ZeroJevApplicationClient["status"]>(async () => ({
        profile: "jev-tool-selector-v1",
        backend: "available",
        execution: "jev-tool-selection",
        paidModelCalls: 0,
        profileRevision: "fixture",
        model: "fixture-model",
        tools: ["module.csv.d3"],
        limits: ZERO_JEV_LIMITS,
      })),
      execute: vi.fn(async () => ({
        jobId: id,
        callId: id,
        requestDigest: hash,
      })),
      get: vi.fn<ZeroJevApplicationClient["get"]>(async () => ({
        jobId: id,
        callId: id,
        state: "unknown",
        reason: "no_terminal_receipt",
      })),
      artifactPage: vi.fn<ZeroJevApplicationClient["artifactPage"]>(
        async () => ({
          artifactId: "fixture-artifact",
          revision: 2,
          sha256: hash,
          totalBytes: 2,
          offset: 0,
          nextOffset: null,
          encoding: "base64",
          contentBase64: "e30=",
        }),
      ),
    };
    server = createZeroMcpServer({
      componentStatus: { reuse: async () => "available" },
    });
    registerZeroReuseMcpTools(server, api);
    client = new Client({ name: "fixture-reuse-client", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b);
    await client.connect(a);
  });
  afterEach(async () => {
    await client.close();
    await server.close();
  });
  it("discovers modules without dispatch and exposes a separately available reuse component", async () => {
    const search = await client.callTool({
      name: "zero_search",
      arguments: {
        query:
          "Build inventory import with CSV validation and ZIP archive exports",
      },
    });
    expect(
      (search.structuredContent as { moduleCandidates: unknown[] })
        .moduleCandidates,
    ).toHaveLength(3);
    expect(api.execute).not.toHaveBeenCalled();
    const status = await client.callTool({
      name: "zero_status",
      arguments: { nonce: "reuse-fixture" },
    });
    expect(status.structuredContent).toMatchObject({
      backend: "available",
      components: { reuse: "available" },
    });
    expect((await client.listTools()).tools.map((x) => x.name)).toContain(
      "zero_reuse_verify",
    );
  });
  it("submits focused source selection without accepting credentials, roots or model IDs", async () => {
    const input = { goal: "Strict CSV parsing", ...controls() };
    const result = await client.callTool({
      name: "zero_reuse",
      arguments: input,
    });
    expect(result.isError).not.toBe(true);
    expect(api.execute).toHaveBeenCalledWith({
      ...input,
      data: "source-module-request-v1",
      mode: "prepare-component",
    });
    vi.mocked(api.execute).mockClear();
    const denied = await client.callTool({
      name: "zero_reuse",
      arguments: {
        ...input,
        projectRoot: "/foreign",
        apiKey: "fixture-secret",
      },
    });
    expect(denied.isError).toBe(true);
    expect(api.execute).not.toHaveBeenCalled();
    expect(JSON.stringify(denied)).not.toContain("fixture-secret");
  });
  it("submits advisory planning without preparing code or accepting arbitrary source URLs", async () => {
    const input = {
      goal: "Offline inventory foundation with local roles",
      candidateIds: ["inventree/InvenTree"],
      ...controls(),
    };
    const result = await client.callTool({
      name: "zero_select",
      arguments: input,
    });
    expect(result.isError).not.toBe(true);
    expect(api.execute).toHaveBeenCalledExactlyOnceWith({
      ...input,
      data: "source-selection-v1",
      mode: "select-source",
    });
    vi.mocked(api.execute).mockClear();
    for (const candidateIds of [
      ["https://example.invalid/repo"],
      ["inventree/InvenTree", "inventree/InvenTree"],
    ]) {
      const rejected = await client.callTool({
        name: "zero_select",
        arguments: { ...input, candidateIds },
      });
      expect(rejected.isError).toBe(true);
    }
    expect(api.execute).not.toHaveBeenCalled();
    expect(
      (await client.listTools()).tools.find(
        (tool) => tool.name === "zero_select",
      )?.annotations,
    ).toMatchObject({ readOnlyHint: false, openWorldHint: true });
  });
  it("preserves job states and page hashes instead of manufacturing PASS", async () => {
    const result = await client.callTool({
      name: "zero_reuse_job",
      arguments: { jobId: id },
    });
    expect(result.structuredContent).toMatchObject({
      job: { state: "unknown", reason: "no_terminal_receipt" },
    });
    const page = await client.callTool({
      name: "zero_reuse_artifact",
      arguments: { jobId: id },
    });
    expect(page.structuredContent).toMatchObject({
      sha256: hash,
      contentBase64: "e30=",
    });
  });
  it("binds verification to a preparation ID, with no paid selection or root in its input", async () => {
    const input = { preparationJobId: id, ...controls() };
    await client.callTool({ name: "zero_reuse_verify", arguments: input });
    expect(api.execute).toHaveBeenCalledWith({
      deadline: input.deadline,
      idempotencyKey: input.idempotencyKey,
      goal: "Verify the approved prepared component integration",
      data: id,
      mode: "verify-component",
    });
  });
  it("redacts backend errors", async () => {
    vi.mocked(api.execute).mockRejectedValueOnce(
      new Error("fixture-secret-private-root"),
    );
    const result = await client.callTool({
      name: "zero_reuse",
      arguments: { goal: "CSV parser", ...controls() },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain("fixture-secret");
  });
});
