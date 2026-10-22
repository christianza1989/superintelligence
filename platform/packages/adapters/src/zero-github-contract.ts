/** Public-source research bounds. Safe to bundle in the MCP transport client. */
import { z } from "zod";
export const ZERO_GITHUB_LIMITS = Object.freeze({
  queries: 3,
  resultsPerQuery: 10,
  inspectedRepositories: 5,
  requests: 32,
  responseBytes: 1048576,
  totalBytes: 33554432,
  fileBytes: 65536,
  excerptChars: 1800,
  paths: 60,
  runtimeMs: 20000,
  receiptBytes: 65536,
});
export const githubQueriesSchema = z
  .array(
    z
      .string()
      .trim()
      .min(2)
      .max(180)
      .regex(/^[\p{L}\p{N}\s.,+#_"-]+$/u),
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
