import { createHash } from "node:crypto";
import { z } from "zod";

export const ZERO_BROWSER_STATIC_PROFILE = "zero-browser-static-v1" as const;
export const ZERO_BROWSER_STATIC_LIMITS = Object.freeze({
  inputBytes: 16_384,
  runtimeMs: 20_000,
  artifactBytes: 2_097_152,
  outstandingJobsPerScope: 4,
  screenshotBytes: 1_048_576,
  visibleTextBytes: 65_536,
  headings: 128,
  links: 256,
});
export const ZERO_BROWSER_STATIC_JOB_LIMITS = Object.freeze({
  inputBytes: ZERO_BROWSER_STATIC_LIMITS.inputBytes,
  runtimeMs: ZERO_BROWSER_STATIC_LIMITS.runtimeMs,
  artifactBytes: ZERO_BROWSER_STATIC_LIMITS.artifactBytes,
  outstandingJobsPerScope: ZERO_BROWSER_STATIC_LIMITS.outstandingJobsPerScope,
});
export const ZERO_BROWSER_STATIC_ORIGIN = "https://zero-static.invalid";
export const ZERO_BROWSER_STATIC_URL = `${ZERO_BROWSER_STATIC_ORIGIN}/input`;
export const zeroBrowserHash = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/u);
const timestamp = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)));
export const zeroBrowserSubmitSchema = z
  .object({
    fileId: id,
    idempotencyKey: z.string().min(1).max(128),
    deadline: timestamp,
  })
  .strict();
const principal = z
  .object({
    spaceId: id,
    userId: id,
    scopeId: id,
    policyRevision: id,
    expiresAt: timestamp,
  })
  .strict();
export const zeroBrowserRequestSchema = z
  .object({
    kind: z.literal("zero.browser.request.v1"),
    principal,
    fileId: id,
    source: z
      .object({
        artifactId: id,
        sha256: hash,
        bytes: z.number().int().min(1).max(ZERO_BROWSER_STATIC_LIMITS.inputBytes),
      })
      .strict(),
    profile: z.literal(ZERO_BROWSER_STATIC_PROFILE),
    imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    buildInputLockSha256: hash,
    deadline: timestamp,
  })
  .strict();
export type ZeroBrowserRequest = z.infer<typeof zeroBrowserRequestSchema>;
const text = z.string().max(1024);
export const zeroBrowserExtractionSchema = z
  .object({
    profile: z.literal(ZERO_BROWSER_STATIC_PROFILE),
    sourceSha256: hash,
    renderedSha256: hash,
    rendering: z
      .object({
        policy: z.literal("inert-static-v1"),
        removedElements: z.number().int().min(0).max(8192),
        removedAttributes: z.number().int().min(0).max(16384),
        inertLinks: z.number().int().min(0).max(256),
      })
      .strict(),
    url: z.literal(ZERO_BROWSER_STATIC_URL),
    title: z.string().max(512),
    headings: z
      .array(z.object({ level: z.number().int().min(1).max(6), text }).strict())
      .max(ZERO_BROWSER_STATIC_LIMITS.headings),
    links: z
      .array(z.object({ text, href: z.string().max(2048) }).strict())
      .max(ZERO_BROWSER_STATIC_LIMITS.links),
    visibleText: z
      .string()
      .refine((value) => Buffer.byteLength(value) <= ZERO_BROWSER_STATIC_LIMITS.visibleTextBytes),
    screenshot: z
      .object({
        mimeType: z.literal("image/png"),
        encoding: z.literal("base64"),
        sha256: hash,
        bytes: z.number().int().min(8).max(ZERO_BROWSER_STATIC_LIMITS.screenshotBytes),
        contentBase64: z
          .string()
          .max(1_398_104)
          .regex(/^[A-Za-z0-9+/]+={0,2}$/u),
      })
      .strict(),
    actualUse: z
      .object({ provider: z.literal("computer"), navigate: z.literal(1), snapshot: z.literal(1) })
      .strict(),
    runtime: z
      .object({
        nodeVersion: z.literal("24.22.0"),
        playwright: z.literal("1.63.0"),
        chromium: z.literal("153.0.8010.12"),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    const bytes = Buffer.from(value.screenshot.contentBase64, "base64");
    if (
      bytes.length !== value.screenshot.bytes ||
      zeroBrowserHash(bytes) !== value.screenshot.sha256 ||
      bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      bytes.toString("base64") !== value.screenshot.contentBase64
    )
      context.addIssue({ code: "custom", message: "Invalid screenshot integrity" });
  });
export type ZeroBrowserExtraction = z.infer<typeof zeroBrowserExtractionSchema>;
