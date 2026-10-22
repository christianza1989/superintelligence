import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ZeroJevApplicationClient } from "./zero-jev-application-client.js";
import {
  zeroJevArtifactPageSchema,
  zeroJevJobSchema,
  zeroJevSubmittedSchema,
} from "./zero-jev-application-client.js";

export const ZERO_MCP_REUSE_OPERATIONS = [
  "zero_reuse",
  "zero_reuse_job",
  "zero_reuse_artifact",
  "zero_reuse_verify",
] as const;
const jobId = z.uuid();
const controls = {
  idempotencyKey: z.string().min(1).max(128),
  deadline: z.iso.datetime({ offset: true }),
};
const readOnly = {
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
      text: "Zero reuse request unavailable. Check the authorized reuse profile, project binding and finite routing budget.",
    },
  ],
});

/** The model never supplies a credential, payer, executable, source path or project root. */
export function registerZeroReuseMcpTools(
  server: McpServer,
  client: ZeroJevApplicationClient,
) {
  const result = async (
    action: () => Promise<object>,
  ): Promise<CallToolResult> => {
    try {
      const value = await action();
      const output = {
        content: [{ type: "text" as const, text: JSON.stringify(value) }],
        structuredContent: value as Record<string, unknown>,
      };
      return Buffer.byteLength(JSON.stringify(output)) <= 48 * 1024
        ? output
        : failure();
    } catch {
      return failure();
    }
  };
  server.registerTool(
    "zero_reuse",
    {
      description:
        "Select and prepare one focused reusable source module through the authorized existing Zero/Jev worker. Describe the module's concrete purpose and constraints, not the entire application. The operator allowlist, exact source pins and finite paid API cap are enforced by the backend. Returns a durable job ID; poll and hash-check its artifact. Preparation does not edit or verify the host application. An abstention is valid.",
      inputSchema: z.strictObject({
        goal: z.string().trim().min(1).max(2000),
        ...controls,
      }),
      outputSchema: zeroJevSubmittedSchema,
      annotations: { ...readOnly, readOnlyHint: false, openWorldHint: true },
    },
    ({ goal, ...input }) =>
      result(() =>
        client.execute({
          ...input,
          goal,
          data: "source-module-request-v1",
          mode: "prepare-component",
        }),
      ),
  );
  server.registerTool(
    "zero_reuse_job",
    {
      description:
        "Read the actual terminal/unknown state of an authorized source-module selection or verification job. Selection, preparation, application use and verification remain separate facts.",
      inputSchema: z.strictObject({ jobId }),
      outputSchema: z.strictObject({ job: zeroJevJobSchema }),
      annotations: readOnly,
    },
    ({ jobId }) => result(async () => ({ job: await client.get(jobId) })),
  );
  server.registerTool(
    "zero_reuse_artifact",
    {
      description:
        "Read bounded base64 pages of a committed reuse receipt and prepared source files. Verify the full receipt hash and each source-file hash before host integration. No arbitrary filesystem paths or other project scopes.",
      inputSchema: z.strictObject({
        jobId,
        offset: z.number().int().min(0).max(98304).default(0),
        limit: z.number().int().min(1).max(8192).default(8192),
      }),
      outputSchema: zeroJevArtifactPageSchema,
      annotations: readOnly,
    },
    ({ jobId, ...page }) => result(() => client.artifactPage(jobId, page)),
  );
  server.registerTool(
    "zero_reuse_verify",
    {
      description:
        "Verify the integration of one prepared module into the operator-approved component entrypoint. Runs finite independent conformance and actual vendor-call checks in the existing isolated worker using pinned source and image. Requires the succeeded preparation job in the same scope. This checks the component snapshot, not the whole application's business logic or an independent holdout.",
      inputSchema: z.strictObject({ preparationJobId: jobId, ...controls }),
      outputSchema: zeroJevSubmittedSchema,
      annotations: { ...readOnly, readOnlyHint: false },
    },
    ({ preparationJobId, ...input }) =>
      result(() =>
        client.execute({
          ...input,
          goal: "Verify the approved prepared component integration",
          data: preparationJobId,
          mode: "verify-component",
        }),
      ),
  );
}
