import { createHash } from "node:crypto";
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
function api(family: "pdf" | "browser" | "research"): ZeroComponentApplicationClient {
  const terminal = {
    jobId,
    state: "succeeded" as const,
    requestDigest: sha256,
    artifactId: "receipt",
    profile:
      family === "pdf"
        ? ("pdfplumber-0.11.10-born-digital-lines-v1" as const)
        : family === "research"
          ? ("zero-url-research-v1" as const)
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
    pdfCsvPage: vi.fn(),
  };
}
async function fixture(
  run: (
    client: Client,
    pdf: ZeroComponentApplicationClient,
    browser: ZeroComponentApplicationClient,
    research: ZeroComponentApplicationClient,
  ) => Promise<void>,
) {
  const server = createZeroMcpServer({
    componentStatus: {
      pdf: async () => "available",
      browser: async () => "blocked",
      research: async () => "unavailable",
    },
  });
  const pdf = api("pdf"),
    browser = api("browser"),
    research = api("research");
  registerZeroComponentMcpTools(server, pdf);
  registerZeroComponentMcpTools(server, browser);
  registerZeroComponentMcpTools(server, research);
  const client = new Client({ name: "fixture", version: "1" });
  const [host, backend] = InMemoryTransport.createLinkedPair();
  await server.connect(backend);
  await client.connect(host);
  try {
    await run(client, pdf, browser, research);
  } finally {
    await client.close();
    await server.close();
  }
}
describe("fixed extraction MCP boundary", () => {
  it("advertises the actual registered operations and separate profile states", async () =>
    fixture(async (client) => {
      const inventory = await client.listTools();
      expect(inventory.tools).toHaveLength(16);
      expect(inventory.tools.find((tool) => tool.name === "zero_research_extract")?.annotations?.openWorldHint).toBe(true);
      expect(inventory.tools.find((tool) => tool.name === "zero_pdf_extract")?.annotations?.openWorldHint).toBe(false);
      expect(inventory.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([...ZERO_MCP_COMPONENT_OPERATIONS]),
      );
      const result = await client.callTool({ name: "zero_status", arguments: { nonce: "fresh" } });
      expect(result.structuredContent).toMatchObject({
        profile: "scoped-component-jobs",
        backend: "available",
        components: { pdf: "available", browser: "blocked", research: "unavailable" },
        nonce: "fresh",
      });
      expect((result.structuredContent as { operations: string[] }).operations.sort()).toEqual(
        inventory.tools.map((tool) => tool.name).sort(),
      );
    }));
  it.each(["pdf", "browser", "research"] as const)(
    "keeps %s input scoped and output below the complete wire bound",
    async (family) =>
      fixture(async (client, pdf, browser, research) => {
        const backend = family === "pdf" ? pdf : family === "research" ? research : browser;
        const input = {
          ...(family === "research" ? { taskId: "approved" } : { fileId: "approved" }),
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
  it("reads bounded PDF CSV pages with provenance and rejects scope or page widening", async () =>
    fixture(async (client, pdf) => {
      const bytes = Buffer.alloc(8192, 65);
      vi.mocked(pdf.pdfCsvPage).mockResolvedValue({
        metadata: {
          profile: "pdfplumber-0.11.10-born-digital-lines-v1",
          sourceSha256: sha256,
          receipt: { artifactId: "receipt", revision: 2, sha256 },
          csv: {
            sha256: createHash("sha256").update(bytes).digest("hex"),
            bytes: bytes.length,
            encoding: "utf-8",
            delimiter: ",",
            lineTerminator: "\n",
          },
          table: {
            index: 0,
            count: 1,
            rows: 1,
            columns: 1,
            provenance: [
              { page_no: 1, bbox: { l: 1, t: 1, r: 10, b: 10, coord_origin: "TOPLEFT" } },
            ],
          },
        },
        totalBytes: bytes.length,
        offset: 0,
        nextOffset: null,
        encoding: "base64",
        contentBase64: bytes.toString("base64"),
      });
      const args = { jobId, tableIndex: 0 };
      const output = await client.callTool({ name: "zero_pdf_csv", arguments: args });
      expect(output.isError).not.toBe(true);
      expect(Buffer.byteLength(JSON.stringify(output))).toBeLessThanOrEqual(32768);
      expect(pdf.pdfCsvPage).toHaveBeenCalledWith(jobId, 0, { offset: 0, limit: 8192 });
      for (const extra of [
        { limit: 8193 },
        { tableIndex: 32 },
        { scopeId: "foreign" },
        { path: "/private" },
      ])
        expect(
          (await client.callTool({ name: "zero_pdf_csv", arguments: { ...args, ...extra } }))
            .isError,
        ).toBe(true);
      expect(pdf.pdfCsvPage).toHaveBeenCalledTimes(1);
      vi.mocked(pdf.pdfCsvPage).mockRejectedValueOnce(new Error("PRIVATE_PDF_BINDING"));
      const denied = await client.callTool({ name: "zero_pdf_csv", arguments: args });
      expect(denied.isError).toBe(true);
      expect(JSON.stringify(denied)).not.toContain("PRIVATE_PDF_BINDING");
    }));
});
