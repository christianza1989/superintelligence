import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ZeroCsvApplicationClient } from "./zero-csv-application-client.js";
import {
  zeroCsvArtifactPageSchema,
  zeroCsvCancelledSchema,
  zeroCsvJobSchema,
  zeroCsvPreparedSchema,
} from "./zero-csv-application-client.js";

export const ZERO_MCP_CSV_OPERATIONS = [
  "zero_prepare",
  "zero_job",
  "zero_artifact",
  "zero_cancel",
  "zero_verify",
] as const;
const jobId = z.uuid();
const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const failure = (): CallToolResult => ({
  isError: true,
  content: [
    {
      type: "text",
      text: "Zero application request rejected or unavailable. Check the authenticated project binding and backend status.",
    },
  ],
});

/** The client is operator-bound; tool arguments cannot choose identities, roots or API URLs. */
export function registerZeroCsvMcpTools(server: McpServer, client: ZeroCsvApplicationClient) {
  const result = async (action: () => Promise<unknown>): Promise<CallToolResult> => {
    try {
      const value = await action();
      if (!value || typeof value !== "object" || Array.isArray(value)) return failure();
      const output: CallToolResult = {
        content: [{ type: "text", text: JSON.stringify(value) }],
        structuredContent: value as Record<string, unknown>,
      };
      return Buffer.byteLength(JSON.stringify(output)) <= 32 * 1024 ? output : failure();
    } catch {
      return failure();
    }
  };
  server.registerTool(
    "zero_prepare",
    {
      description:
        "Prepare the fixed d3-dsv 3.0.1 strict CSV component in the existing authenticated Zero worker. Returns a durable job ID. Does not modify the host project or verify its integration. Identity, scope, limits and API connection come from the operator binding.",
      inputSchema: z.strictObject({
        profile: z.literal("d3-dsv-3.0.1/strict-table-v1"),
        csv: z
          .string()
          .min(1)
          .max(16_384)
          .refine((value) => Buffer.byteLength(value) <= 16_384),
        idempotencyKey: z.string().min(1).max(128),
        deadline: z.iso
          .datetime({ offset: true })
          .refine((value) => Number.isFinite(Date.parse(value))),
      }),
      outputSchema: zeroCsvPreparedSchema,
      annotations: { ...annotations, readOnlyHint: false },
    },
    ({ profile: _profile, ...input }) => result(() => client.prepare(input)),
  );
  server.registerTool(
    "zero_job",
    {
      description:
        "Read one job in the currently authenticated Zero project scope. Unknown, queued and failed are distinct from success. No host conversation or filesystem access.",
      inputSchema: z.strictObject({ jobId }),
      outputSchema: z.strictObject({ job: zeroCsvJobSchema }),
      annotations,
    },
    ({ jobId }) => result(async () => ({ job: await client.get(jobId) })),
  );
  server.registerTool(
    "zero_artifact",
    {
      description:
        "Read a bounded base64 page of a committed preparation or verification receipt. Reassemble pages and verify the advertised SHA-256 before using it. A prepared component is not a verified host project. No arbitrary file paths.",
      inputSchema: z.strictObject({
        jobId,
        offset: z.number().int().nonnegative().max(98_304).default(0),
        limit: z.number().int().min(1).max(8192).default(8192),
      }),
      outputSchema: zeroCsvArtifactPageSchema,
      annotations,
    },
    ({ jobId, offset, limit }) => result(() => client.artifactPage(jobId, { offset, limit })),
  );
  server.registerTool(
    "zero_cancel",
    {
      description:
        "Request cancellation of one authenticated scoped job. Returns the actual winning terminal state; an already succeeded job does not become cancelled. Does not stop the host or other worker jobs.",
      inputSchema: z.strictObject({ jobId }),
      outputSchema: zeroCsvCancelledSchema,
      annotations: { ...annotations, readOnlyHint: false },
    },
    ({ jobId }) => result(() => client.cancel(jobId)),
  );
  server.registerTool(
    "zero_verify",
    {
      description:
        "Verify the fixed five-file CSV host project snapshot in the existing worker using the operator-approved root, finite snapshot limits and pinned local Docker image. Requires a succeeded preparation job in this scope. Returns a durable verification job ID; poll zero_job and read its artifact. Only this fixed suite is checked, with freshness and actual parser-use evidence; no general application quality or independent holdout claim.",
      inputSchema: z.strictObject({
        preparationJobId: jobId,
        idempotencyKey: z.string().min(1).max(128),
        deadline: z.iso
          .datetime({ offset: true })
          .refine((value) => Number.isFinite(Date.parse(value))),
      }),
      outputSchema: zeroCsvPreparedSchema,
      annotations: { ...annotations, readOnlyHint: false },
    },
    (input) => result(() => client.verify(input)),
  );
}
