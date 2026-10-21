import { z } from "zod";

export const ZERO_CSV_APPLICATION_PROFILE = "zero-csv-expense-application-v1" as const;
export const ZERO_CSV_APPLICATION_RECIPE = "csv-expense-viewer-v1" as const;
export const ZERO_CSV_APPLICATION_LIMITS = Object.freeze({
  inputBytes: 16_384,
  rows: 512,
  columns: 64,
  cellChars: 4096,
  workspaceBytes: 262_144,
  capsuleBytes: 524_288,
  workspaceFiles: 12,
  runtimeMs: 30_000,
  browserMs: 15_000,
  artifactBytes: 2_097_152,
  screenshotBytes: 1_048_576,
  outstandingJobsPerScope: 4,
  memoryMiB: 512,
  cpus: 1,
  pids: 128,
  paidModelCalls: 0,
});
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/u);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
/** Transport metadata only. Artifact ownership, current grant and bytes are checked by the service. */
export const zeroCsvApplicationSubmitSchema = z
  .object({
    recipe: z.literal(ZERO_CSV_APPLICATION_RECIPE),
    inputArtifactId: id,
    expectedInputSha256: hash,
    idempotencyKey: z.string().min(1).max(128),
    deadline: z
      .string()
      .datetime({ offset: true })
      .refine((value) => Number.isFinite(Date.parse(value))),
  })
  .strict();
export type ZeroCsvApplicationSubmit = z.infer<typeof zeroCsvApplicationSubmitSchema>;
export const zeroCsvApplicationFileSchema = z
  .object({
    path: z.string().min(1).max(128),
    bytes: z.number().int().nonnegative().max(ZERO_CSV_APPLICATION_LIMITS.workspaceBytes),
    sha256: hash,
  })
  .strict();
export const zeroCsvApplicationManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    profile: z.literal(ZERO_CSV_APPLICATION_PROFILE),
    recipe: z.literal(ZERO_CSV_APPLICATION_RECIPE),
    inputSha256: hash,
    sourceLockSha256: hash,
    files: z
      .array(zeroCsvApplicationFileSchema)
      .min(1)
      .max(ZERO_CSV_APPLICATION_LIMITS.workspaceFiles),
    totalBytes: z.number().int().min(1).max(ZERO_CSV_APPLICATION_LIMITS.workspaceBytes),
  })
  .strict();
export type ZeroCsvApplicationManifest = z.infer<typeof zeroCsvApplicationManifestSchema>;
