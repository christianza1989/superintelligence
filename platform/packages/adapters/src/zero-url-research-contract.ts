import { z } from "zod";
import { isBlockedHostname } from "./web-ssrf.js";
import { zeroComponentPrincipalSchema } from "./zero-component-jobs.js";
import { isUrlDocumentUrl, ZERO_URL_DOCUMENT_PROFILE } from "./zero-url-document-contract.js";

import {
  ZERO_URL_RESEARCH_LIMITS,
  ZERO_URL_RESEARCH_PROFILE,
  zeroUrlResearchSubmitSchema,
} from "./zero-url-research-profile.js";

export type { ZeroUrlResearchSubmit } from "./zero-url-research-profile.js";
export {
  ZERO_URL_RESEARCH_LIMITS,
  ZERO_URL_RESEARCH_MODE,
  ZERO_URL_RESEARCH_PROFILE,
  zeroUrlResearchSubmitSchema,
} from "./zero-url-research-profile.js";

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
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Deny ASCII controls at the URL syntax boundary.
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
export const zeroUrlResearchInertBindingSchema = z
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
export const zeroUrlResearchInertRequestSchema = z
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

// The standalone MCP research client deliberately retains the old Zod-only submit contract.
export const ZERO_URL_DOCUMENT_RESOURCE_PROFILE = "zero-url-document-scratch16m-v1" as const;
export const zeroUrlResearchDocumentBindingSchema = zeroUrlResearchInertBindingSchema
  .extend({
    profile: z.literal(ZERO_URL_DOCUMENT_PROFILE),
    resourceProfile: z.literal(ZERO_URL_DOCUMENT_RESOURCE_PROFILE),
    tasks: zeroUrlResearchInertBindingSchema.shape.tasks.refine((tasks) =>
      tasks.every((task) => isUrlDocumentUrl(task.url)),
    ),
    runtime: zeroUrlResearchRuntimeSchema
      .extend({
        runnerDirectory: z.string().startsWith("/").max(4096),
        runnerSha256: hash,
      })
      .strict(),
  })
  .strict();
export const zeroUrlResearchBindingSchema = z.discriminatedUnion("profile", [
  zeroUrlResearchInertBindingSchema,
  zeroUrlResearchDocumentBindingSchema,
]);
export type ZeroUrlResearchBinding = z.infer<typeof zeroUrlResearchBindingSchema>;
export const zeroUrlResearchDocumentRequestSchema = zeroUrlResearchInertRequestSchema
  .extend({
    kind: z.literal("zero.research.document.request.v1"),
    profile: z.literal(ZERO_URL_DOCUMENT_PROFILE),
    resourceProfile: z.literal(ZERO_URL_DOCUMENT_RESOURCE_PROFILE),
    runnerSha256: hash,
    url: z.string().refine(isUrlDocumentUrl),
  })
  .strict();
export const zeroUrlResearchRequestSchema = z.discriminatedUnion("kind", [
  zeroUrlResearchInertRequestSchema,
  zeroUrlResearchDocumentRequestSchema,
]);
export type ZeroUrlResearchRequest = z.infer<typeof zeroUrlResearchRequestSchema>;
export const zeroUrlResearchExecutionSubmitSchema = z.union([
  zeroUrlResearchSubmitSchema,
  zeroUrlResearchSubmitSchema.extend({ profile: z.literal(ZERO_URL_DOCUMENT_PROFILE) }).strict(),
]);
