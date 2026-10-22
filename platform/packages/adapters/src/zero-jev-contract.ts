/** Shared paid-job input contract; no worker, secrets or database imports. */
import { z } from "zod";
import { ZERO_JEV_LIMITS } from "./zero-jev-limits.js";

export const ZERO_SOURCE_SELECTION_MARKER = "source-selection-v1";
const fields = {
  goal: z.string().trim().min(1).max(ZERO_JEV_LIMITS.goalChars),
  data: z.string().min(1).max(ZERO_JEV_LIMITS.inputBytes),
  deadline: z
    .string()
    .datetime({ offset: true })
    .refine((value) => Number.isFinite(Date.parse(value))),
  mode: z
    .enum(["prepare-component", "verify-component", "select-source"])
    .optional(),
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
}) {
  return input.mode === "select-source"
    ? !!input.candidateIds?.length &&
        input.data === ZERO_SOURCE_SELECTION_MARKER
    : input.candidateIds === undefined;
}
export const zeroJevStoredInputSchema = z
  .strictObject(fields)
  .refine(
    validMode,
    "Source selection requires canonical IDs and the fixed source-only marker",
  );
export const zeroJevExecuteInputSchema = z
  .strictObject({
    ...fields,
    idempotencyKey: z.string().min(1).max(128),
  })
  .refine(
    validMode,
    "Source selection requires canonical IDs and the fixed source-only marker",
  );
