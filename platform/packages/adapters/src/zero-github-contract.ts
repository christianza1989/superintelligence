/** Public-source research bounds. Safe to bundle in the MCP transport client. */
import { z } from "zod";
export const ZERO_GITHUB_LIMITS = Object.freeze({
  queries: 3,
  searchRequests: 6,
  searchTimeoutMs: 2500,
  moduleTreeReads: 3,
  moduleTreeTimeoutMs: 2500,
  resultsPerQuery: 10,
  inspectedRepositories: 5,
  inspectionConcurrency: 3,
  requests: 32,
  responseBytes: 1048576,
  totalBytes: 33554432,
  fileBytes: 524288,
  excerptChars: 1800,
  paths: 60,
  runtimeMs: 12000,
  receiptBytes: 65536,
});
export const githubQueriesSchema = z
  .array(
    z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[\p{L}\p{N}\s.,+#_"-]+$/u)
      .refine((value) =>
        (value.match(/[\p{L}\p{N}][\p{L}\p{N}+#_.-]*/gu) ?? []).some(
          (term) => !/^(?:AND|OR|NOT)$/i.test(term),
        ),
      )
      .describe(
        "A focused repository search phrase for one component need. Search starts with a recognizable project name or at most five keywords, then at most one alternative; full fit constraints belong in goal and module.",
      ),
  )
  .min(1)
  .max(ZERO_GITHUB_LIMITS.queries)
  .refine((queries) => new Set(queries).size === queries.length);
export const githubSourcePathSchema = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !/[\\:\u0000-\u001f\u007f]/u.test(value) &&
      value
        .split("/")
        .every((part) => part !== ".." && part !== "." && part.length > 0),
  );
export const ZERO_GITHUB_DISCOVERY_MARKER = "github-source-discovery-v1";
/** One independently callable capability; complementary needs require separate choices. */
export const githubModuleNeedSchema = z.strictObject({
  inputs: z.string().trim().min(1).max(500),
  outputs: z.string().trim().min(1).max(500),
  runtime: z.string().trim().min(1).max(200),
});
export type GithubModuleNeed = z.infer<typeof githubModuleNeedSchema>;
/** The only virtual path is the pinned repository root; never a host directory. */
export const githubInspectionPathSchema = z.union([
  z.literal("."),
  githubSourcePathSchema,
]);
