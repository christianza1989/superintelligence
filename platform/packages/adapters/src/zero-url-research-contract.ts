import { z } from "zod";
import { isBlockedHostname } from "./web-ssrf.js";
import { zeroComponentPrincipalSchema } from "./zero-component-jobs.js";

export const ZERO_URL_RESEARCH_PROFILE = "zero-url-research-v1" as const;
export const ZERO_URL_RESEARCH_MODE = "safe-http-fetch+inert-snapshot" as const;
export const ZERO_URL_RESEARCH_LIMITS = Object.freeze({
  sourceBytes: 16_384,
  fetchMs: 8000,
  runtimeMs: 30_000,
  artifactBytes: 2_097_152,
  tasks: 10,
  outstandingJobsPerScope: 4,
  redirects: 0,
  paidModelCalls: 0,
});
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/u);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
export function isZeroResearchSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.href === value &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !url.port &&
      !isBlockedHostname(url.hostname) &&
      !/[\\\u0000-\u0020\u007f]/u.test(value) &&
      value.length <= 2048
    );
  } catch {
    return false;
  }
}
export const zeroUrlResearchTaskSchema = z
  .object({
    taskId: id,
    sourceId: id,
    url: z.string().refine(isZeroResearchSourceUrl),
    expectedSha256: hash.optional(),
  })
  .strict();
export const zeroUrlResearchRuntimeSchema = z
  .object({
    dockerExecutable: z.string().startsWith("/").max(4096),
    dockerConfigDirectory: z.string().startsWith("/").max(4096),
    imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    buildInputLockSha256: hash,
  })
  .strict();
export const zeroUrlResearchBindingSchema = z
  .object({
    profile: z.literal(ZERO_URL_RESEARCH_PROFILE),
    tasks: z
      .array(zeroUrlResearchTaskSchema)
      .min(1)
      .max(ZERO_URL_RESEARCH_LIMITS.tasks)
      .refine(
        (tasks) =>
          new Set(tasks.map((task) => task.taskId)).size === tasks.length &&
          new Set(tasks.map((task) => task.sourceId)).size === tasks.length,
      ),
    runtime: zeroUrlResearchRuntimeSchema,
  })
  .strict();
export type ZeroUrlResearchBinding = z.infer<typeof zeroUrlResearchBindingSchema>;
export const zeroUrlResearchSubmitSchema = z
  .object({
    taskId: id,
    idempotencyKey: z.string().min(1).max(128),
    deadline: z
      .string()
      .datetime({ offset: true })
      .refine((value) => Number.isFinite(Date.parse(value))),
  })
  .strict();
export const zeroUrlResearchRequestSchema = z
  .object({
    kind: z.literal("zero.research.request.v1"),
    profile: z.literal(ZERO_URL_RESEARCH_PROFILE),
    principal: zeroComponentPrincipalSchema,
    fileId: id,
    sourceId: id,
    url: z.string().refine(isZeroResearchSourceUrl),
    expectedSha256: hash.optional(),
    registrySha256: hash,
    imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    buildInputLockSha256: hash,
    deadline: z.string().datetime({ offset: true }),
    requestDigest: hash,
  })
  .strict();
export type ZeroUrlResearchRequest = z.infer<typeof zeroUrlResearchRequestSchema>;
