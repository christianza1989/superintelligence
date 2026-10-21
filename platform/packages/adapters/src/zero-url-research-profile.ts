import { z } from "zod";

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
export type ZeroUrlResearchSubmit = z.infer<typeof zeroUrlResearchSubmitSchema>;
