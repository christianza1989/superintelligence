import { z } from "zod";
import { zeroComponentPrincipalSchema } from "./zero-component-jobs.js";
import {
  ZERO_CSV_APPLICATION_PROFILE,
  ZERO_CSV_APPLICATION_RECIPE,
} from "./zero-csv-application-contract.js";
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/u);
export const zeroCsvApplicationBindingSchema = z
  .object({
    profile: z.literal(ZERO_CSV_APPLICATION_PROFILE),
    recipe: z.literal(ZERO_CSV_APPLICATION_RECIPE),
    runtime: z
      .object({
        dockerExecutable: z.string().startsWith("/").max(4096),
        dockerConfigDirectory: z.string().startsWith("/").max(4096),
        imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
        buildInputLockSha256: hash,
        attribution: z
          .object({
            license: z.string().startsWith("Apache License\nVersion 2.0").max(28_672),
            notice: z.string().min(1).max(4096),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();
export type ZeroCsvApplicationBinding = z.infer<typeof zeroCsvApplicationBindingSchema>;
export const zeroCsvApplicationRequestSchema = z
  .object({
    kind: z.literal("zero.application.request.v1"),
    profile: z.literal(ZERO_CSV_APPLICATION_PROFILE),
    recipe: z.literal(ZERO_CSV_APPLICATION_RECIPE),
    principal: zeroComponentPrincipalSchema,
    fileId: id,
    source: z
      .object({ artifactId: id, sha256: hash, bytes: z.number().int().min(1).max(16_384) })
      .strict(),
    bindingSha256: hash,
    imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    buildInputLockSha256: hash,
    deadline: z.string().datetime({ offset: true }),
    requestDigest: hash,
  })
  .strict();
export type ZeroCsvApplicationRequest = z.infer<typeof zeroCsvApplicationRequestSchema>;
