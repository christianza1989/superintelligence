/** Shared paid-job input contract; no worker, secrets or database imports. */
import { z } from "zod";
import { ZERO_JEV_LIMITS } from "./zero-jev-limits.js";
import {
  githubQueriesSchema,
  githubModuleNeedSchema,
  githubInspectionPathSchema,
  ZERO_GITHUB_DISCOVERY_MARKER,
} from "./zero-github-contract.js";

export const ZERO_SOURCE_SELECTION_MARKER = "source-selection-v1";
const fields = {
  goal: z.string().trim().min(1).max(ZERO_JEV_LIMITS.goalChars),
  data: z.string().min(1).max(ZERO_JEV_LIMITS.inputBytes),
  deadline: z
    .string()
    .datetime({ offset: true })
    .refine((value) => Number.isFinite(Date.parse(value))),
  mode: z
    .enum([
      "prepare-component",
      "verify-component",
      "select-source",
      "discover-source",
      "inspect-source",
    ])
    .optional(),
  queries: githubQueriesSchema.optional(),
  module: githubModuleNeedSchema.optional(),
  repository: z
    .string()
    .regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/)
    .optional(),
  paths: z.array(githubInspectionPathSchema).min(1).max(4).optional(),
  candidateIds: z
    .array(z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/))
    .min(1)
    .max(5)
    .refine((ids) => new Set(ids).size === ids.length)
    .optional(),
};
function validMode(input: {
  mode?: string;
  candidateIds?: string[];
  data: string;
  queries?: string[];
  module?: unknown;
  repository?: string;
  paths?: string[];
}) {
  if (input.mode === "discover-source")
    return (
      !!input.queries?.length &&
      input.data === ZERO_GITHUB_DISCOVERY_MARKER &&
      input.candidateIds === undefined &&
      input.repository === undefined &&
      input.paths === undefined
    );
  if (input.mode === "inspect-source")
    return (
      !!input.repository &&
      !!input.paths?.length &&
      z.uuid().safeParse(input.data).success &&
      input.candidateIds === undefined &&
      input.queries === undefined &&
      input.module === undefined
    );
  if (
    input.queries !== undefined ||
    input.module !== undefined ||
    input.repository !== undefined ||
    input.paths !== undefined
  )
    return false;
  return input.mode === "select-source"
    ? !!input.candidateIds?.length &&
        input.data === ZERO_SOURCE_SELECTION_MARKER
    : input.candidateIds === undefined;
}
export const zeroJevStoredInputSchema = z
  .strictObject(fields)
  .refine(validMode, "Source research fields must match the selected mode");
export const zeroJevExecuteInputSchema = z
  .strictObject({
    ...fields,
    idempotencyKey: z.string().min(1).max(128),
  })
  .refine(validMode, "Source research fields must match the selected mode");
