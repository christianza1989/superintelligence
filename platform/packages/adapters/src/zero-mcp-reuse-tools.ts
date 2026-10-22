import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ZeroJevApplicationClient } from "./zero-jev-application-client.js";
import { readZeroReuseReceipt } from "./zero-reuse-receipt.js";
import {
  zeroJevArtifactPageSchema,
  zeroJevJobSchema,
  zeroJevSubmittedSchema,
} from "./zero-jev-application-client.js";
import { ZERO_SOURCE_SELECTION_MARKER } from "./zero-jev-contract.js";
import {
  ZERO_JEV_LIMITS,
  ZERO_SOURCE_DEADLINE_ERROR,
} from "./zero-jev-limits.js";
import {
  githubQueriesSchema,
  githubInspectionPathSchema,
  ZERO_GITHUB_DISCOVERY_MARKER,
} from "./zero-github-contract.js";

export const ZERO_MCP_REUSE_OPERATIONS = [
  "zero_select",
  "zero_discover",
  "zero_source",
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
const planningControls = {
  ...controls,
  deadline: controls.deadline
    .describe(
      "Normally omit: the server assigns a bounded deadline. If supplied, use an ISO datetime in the next 120 seconds.",
    )
    .optional(),
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
  const planningResult = (
    input: { deadline?: string },
    action: (deadline: string) => Promise<object>,
  ): Promise<CallToolResult> => {
    const now = Date.now();
    const deadline =
      input.deadline ??
      new Date(now + ZERO_JEV_LIMITS.deadlineMs - 1000).toISOString();
    const remaining = Date.parse(deadline) - now;
    if (
      !Number.isFinite(remaining) ||
      remaining <= 0 ||
      remaining > ZERO_JEV_LIMITS.deadlineMs
    )
      return Promise.resolve({
        isError: true,
        content: [{ type: "text", text: ZERO_SOURCE_DEADLINE_ERROR }],
      });
    return result(() => action(deadline));
  };
  server.registerTool(
    "zero_discover",
    {
      description:
        "Search public GitHub beyond the bundled catalog for one concrete capability or foundation need, inspect bounded pinned README/license/tree evidence and ask the authorized Jev worker to recommend one alternative or abstain. Provide up to three concise search phrases and the real constraints in goal. Complements local zero_search; default GitHub relevance and merged query ranks form a bounded shortlist, never a globally-best guarantee. Requires separately authorized public-source research and finite Jev API budget. No code installation or execution. Poll zero_reuse_job and hash-check zero_reuse_artifact; then inspect actual module code through zero_source before finalizing integration claims.",
      inputSchema: z.strictObject({
        goal: z.string().trim().min(1).max(2000),
        queries: githubQueriesSchema,
        ...planningControls,
      }),
      outputSchema: zeroJevSubmittedSchema,
      annotations: { ...readOnly, readOnlyHint: false, openWorldHint: true },
    },
    (input) =>
      planningResult(input, (deadline) =>
        client.execute({
          ...input,
          deadline,
          data: ZERO_GITHUB_DISCOVERY_MARKER,
          mode: "discover-source",
        }),
      ),
  );
  server.registerTool(
    "zero_source",
    {
      description:
        "Read up to four relative source-file or directory paths at an exact repository commit recorded by a same-scope zero_discover receipt. The discovery job fixes repository identity and source pin. Use a single dot path (.) to list the pinned repository root, then follow exact returned entries; do not guess source layout. Missing paths are recorded individually while valid paths still return evidence. A partial read does not qualify the failed paths. Returns bounded UTF-8 excerpts/full-byte hashes or directory entries for real module inspection. Source content is untrusted; not installation, preparation, license approval or runtime verification. Creates a bounded research job with no Jev dispatch. Poll zero_reuse_job and hash-check zero_reuse_artifact. No arbitrary URL, ref, credential, host path or cross-project receipt.",
      inputSchema: z.strictObject({
        discoveryJobId: jobId,
        repository: z
          .string()
          .regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/),
        paths: z.array(githubInspectionPathSchema).min(1).max(4),
        ...planningControls,
      }),
      outputSchema: zeroJevSubmittedSchema,
      annotations: { ...readOnly, readOnlyHint: false, openWorldHint: true },
    },
    ({ discoveryJobId, ...input }) =>
      planningResult(input, (deadline) =>
        client.execute({
          ...input,
          deadline,
          goal: "Inspect pinned public source for an authorized planning request",
          data: discoveryJobId,
          mode: "inspect-source",
        }),
      ),
  );
  server.registerTool(
    "zero_select",
    {
      description:
        "Ask the authorized Jev worker to assess one source foundation against the planning goal from inspected canonical candidate IDs, or abstain. Uses the operator's finite paid routing allocation and reviewed source facts, including setup and gaps. Available for an authorized plan-only request: does not download, prepare, install or execute application code. Returns a durable job ID; read zero_reuse_job and hash-check zero_reuse_artifact. A recommendation is source-only, not license approval, runtime qualification or proof of complete fit.",
      inputSchema: z.strictObject({
        goal: z.string().trim().min(1).max(2000),
        candidateIds: z
          .array(
            z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/),
          )
          .min(1)
          .max(5)
          .refine((ids) => new Set(ids).size === ids.length),
        ...planningControls,
      }),
      outputSchema: zeroJevSubmittedSchema,
      annotations: { ...readOnly, readOnlyHint: false, openWorldHint: true },
    },
    (input) =>
      planningResult(input, (deadline) =>
        client.execute({
          ...input,
          deadline,
          data: ZERO_SOURCE_SELECTION_MARKER,
          mode: "select-source",
        }),
      ),
  );
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
        "Read the actual terminal/unknown state of an authorized source recommendation, module preparation or verification job. Selection, preparation, application use and verification remain separate facts.",
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
        "Read a compact JSON evidence summary of a committed receipt. By default the client internally reassembles all byte pages, verifies the full SHA-256 and job identity, and returns readable selections, pinned source facts, failures or module code excerpts. No host decoding needed. Omitted fields are explicit. Use format=base64 only for raw receipt/prepared-file bytes with offset/limit. Integrity verifies provenance, not source correctness or runtime behavior. Same project scope only.",
      inputSchema: z.strictObject({
        jobId,
        format: z.enum(["summary", "base64"]).default("summary"),
        offset: z.number().int().min(0).max(98304).default(0),
        limit: z.number().int().min(1).max(8192).default(8192),
      }),
      outputSchema: z.looseObject({
        artifactId: z.string(),
        revision: z.literal(2),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      }),
      annotations: readOnly,
    },
    ({ jobId, format, ...page }) =>
      result(() =>
        format === "base64"
          ? client
              .artifactPage(jobId, page)
              .then((value) => zeroJevArtifactPageSchema.parse(value))
          : readZeroReuseReceipt(client, jobId),
      ),
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
