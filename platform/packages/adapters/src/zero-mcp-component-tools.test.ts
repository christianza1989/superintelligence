import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import type { ZeroComponentApplicationClient } from "./zero-component-application-client.js";
import {
  registerZeroComponentMcpTools,
  ZERO_MCP_COMPONENT_OPERATIONS,
} from "./zero-mcp-component-tools.js";
import { createZeroMcpServer } from "./zero-mcp-server.js";

const jobId = "11111111-1111-4111-8111-111111111111";
const sha256 = "a".repeat(64);
function api(family: "pdf" | "browser"): ZeroComponentApplicationClient {
  const terminal = {
    jobId,
    state: "succeeded" as const,
    requestDigest: sha256,
    artifactId: "receipt",
    profile:
      family === "pdf"
        ? ("pdfplumber-0.11.10-born-digital-lines-v1" as const)
        : ("zero-browser-static-v1" as const),
  };
  return {
    family,
    status: vi.fn(),
    extract: vi.fn(async () => ({ jobId, requestDigest: sha256 })),
    get: vi.fn(async () => ({ ...terminal, revision: 2 as const, sha256 })),
    cancel: vi.fn(async () => terminal),
    artifactPage: vi.fn(async (_id, page) => {
      const bytes = Buffer.alloc(page?.limit ?? 8192, 65);
      return {
        artifactId: "receipt",
        revision: 2 as const,
        sha256,
        totalBytes: bytes.length,
        offset: 0,
        nextOffset: null,
        encoding: "base64" as const,
        contentBase64: bytes.toString("base64"),
      };
    }),
  };
}
async function fixture(
  run: (
    client: Client,
    pdf: ZeroComponentApplicationClient,
    browser: ZeroComponentApplicationClient,
  ) => Promise<void>,
) {
  const server = createZeroMcpServer({
    componentStatus: { pdf: async () => "available", browser: async () => "blocked" },
  });
  const pdf = api("pdf"),
    browser = api("browser");
  registerZeroComponentMcpTools(server, pdf);
  registerZeroComponentMcpTools(server, browser);
  const client = new Client({ name: "fixture", version: "1" });
  const [host, backend] = InMemoryTransport.createLinkedPair();
  await server.connect(backend);
  await client.connect(host);
  try {
    await run(client, pdf, browser);
  } finally {
    await client.close();
    await server.close();
  }
}
describe("fixed extraction MCP boundary", () => {
  it("advertises the actual registered operations and separate profile states", async () =>
    fixture(async (client) => {
      const inventory = await client.listTools();
      expect(inventory.tools).toHaveLength(11);
      expect(inventory.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([...ZERO_MCP_COMPONENT_OPERATIONS]),
      );
      const result = await client.callTool({ name: "zero_status", arguments: { nonce: "fresh" } });
      expect(result.structuredContent).toMatchObject({
        profile: "scoped-component-jobs",
        backend: "available",
        components: { pdf: "available", browser: "blocked" },
        nonce: "fresh",
      });
      expect((result.structuredContent as { operations: string[] }).operations.sort()).toEqual(
        inventory.tools.map((tool) => tool.name).sort(),
      );
    }));
  it.each(["pdf", "browser"] as const)(
    "keeps %s input scoped and output below the complete wire bound",
    async (family) =>
      fixture(async (client, pdf, browser) => {
        const backend = family === "pdf" ? pdf : browser;
        const input = {
          fileId: "approved",
          idempotencyKey: "key",
          deadline: new Date(Date.now() + 60_000).toISOString(),
        };
        expect(
          (await client.callTool({ name: `zero_${family}_extract`, arguments: input })).isError,
        ).not.toBe(true);
        expect(backend.extract).toHaveBeenCalledWith(input);
        const page = await client.callTool({
          name: `zero_${family}_artifact`,
          arguments: { jobId },
        });
        expect(page.isError).not.toBe(true);
        expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(32768);
        expect(backend.artifactPage).toHaveBeenCalledWith(jobId, { offset: 0, limit: 8192 });
        for (const bad of [
          { ...input, path: "/private" },
          { ...input, url: "https://external.invalid" },
          { ...input, scopeId: "foreign" },
        ])
          expect(
            (await client.callTool({ name: `zero_${family}_extract`, arguments: bad })).isError,
          ).toBe(true);
        expect(backend.extract).toHaveBeenCalledTimes(1);
      }),
  );
  it("redacts errors and refuses oversized untrusted client output", async () =>
    fixture(async (client, pdf) => {
      vi.mocked(pdf.extract).mockRejectedValueOnce(new Error("PRIVATE_BINDING_TOKEN"));
      const args = {
        fileId: "approved",
        idempotencyKey: "key",
        deadline: new Date(Date.now() + 60_000).toISOString(),
      };
      const error = (await client.callTool({
        name: "zero_pdf_extract",
        arguments: args,
      })) as CallToolResult;
      expect(error.isError).toBe(true);
      expect(JSON.stringify(error)).not.toContain("PRIVATE_BINDING_TOKEN");
      vi.mocked(pdf.artifactPage).mockResolvedValueOnce({
        contentBase64: "A".repeat(32768),
      } as never);
      expect(
        (await client.callTool({ name: "zero_pdf_artifact", arguments: { jobId } })).isError,
      ).toBe(true);
    }));
});
