import { z } from "zod";
import type {
  ZeroApplicationTransportErrorCode,
  ZeroApplicationTransportOptions,
} from "./zero-application-transport.js";
import {
  createZeroApplicationTransport,
  ZeroApplicationTransportError,
} from "./zero-application-transport.js";
import { ZERO_CSV_LIMITS, ZERO_CSV_PROFILE } from "./zero-csv-profile.js";
import { readZeroOperatorFile } from "./zero-operator-file.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const jobIdSchema = z.string().uuid();
const limitsSchema = z
  .object({
    inputBytes: z.literal(ZERO_CSV_LIMITS.inputBytes),
    rows: z.literal(ZERO_CSV_LIMITS.rows),
    columns: z.literal(ZERO_CSV_LIMITS.columns),
    cellChars: z.literal(ZERO_CSV_LIMITS.cellChars),
    artifactBytes: z.literal(ZERO_CSV_LIMITS.artifactBytes),
    runtimeMs: z.literal(ZERO_CSV_LIMITS.runtimeMs),
    outstandingJobsPerScope: z.literal(ZERO_CSV_LIMITS.outstandingJobsPerScope),
  })
  .strict();
export const zeroCsvStatusSchema = z
  .object({
    profile: z.literal(ZERO_CSV_PROFILE),
    backend: z.literal("available"),
    paidModelCalls: z.literal(0),
    execution: z.enum(["csv-preparation-only", "csv-preparation-and-verification"]),
    verification: z.literal("zero-csv-project-v1").optional(),
    limits: limitsSchema,
  })
  .strict();
export const zeroCsvPreparedSchema = z.object({ jobId: jobIdSchema, requestDigest: hash }).strict();
export const zeroCsvFreshnessSchema = z.strictObject({
  jobId: jobIdSchema,
  artifactId: id,
  revision: z.literal(2),
  receiptSha256: hash,
  verifiedSnapshotSha256: hash,
  currentSnapshotSha256: hash,
  state: z.enum(["unchanged", "changed"]),
  checkedAt: z.iso.datetime({ offset: true }).refine((value) => Number.isFinite(Date.parse(value))),
});
const terminal = {
  jobId: jobIdSchema,
  state: z.enum(["succeeded", "failed", "blocked", "cancelled"]),
  profile: z.enum([ZERO_CSV_PROFILE, "zero-csv-project-v1"]),
  requestDigest: hash,
  artifactId: id,
};
export const zeroCsvJobSchema = z.union([
  z.object({ ...terminal, revision: z.literal(2), sha256: hash }).strict(),
  z
    .object({
      jobId: jobIdSchema,
      state: z.enum(["queued", "running", "unknown"]),
      attempts: z.number().int().min(0).max(3).nullable(),
      reason: z.enum(["queue_and_receipt_absent", "worker_attempts_exhausted"]).nullable(),
    })
    .strict(),
]);
export const zeroCsvCancelledSchema = z.object(terminal).strict();
export const zeroCsvArtifactPageSchema = z
  .object({
    artifactId: id,
    revision: z.literal(2),
    sha256: hash,
    totalBytes: z.number().int().min(1).max(ZERO_CSV_LIMITS.artifactBytes),
    offset: z.number().int().min(0).max(ZERO_CSV_LIMITS.artifactBytes),
    nextOffset: z.number().int().min(1).max(ZERO_CSV_LIMITS.artifactBytes).nullable(),
    encoding: z.literal("base64"),
    contentBase64: z
      .string()
      .max(4 * Math.ceil(16384 / 3))
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  })
  .strict();
export const zeroCsvPrepareInputSchema = z
  .object({
    csv: z.string().min(1).max(ZERO_CSV_LIMITS.inputBytes),
    idempotencyKey: z.string().min(1).max(128),
    deadline: z
      .string()
      .datetime({ offset: true })
      .refine((value) => Number.isFinite(Date.parse(value))),
  })
  .strict();

export type ZeroCsvStatus = z.infer<typeof zeroCsvStatusSchema>;
export type ZeroCsvPrepared = z.infer<typeof zeroCsvPreparedSchema>;
export type ZeroCsvFreshness = z.infer<typeof zeroCsvFreshnessSchema>;
export type ZeroCsvJob = z.infer<typeof zeroCsvJobSchema>;
export type ZeroCsvCancelled = z.infer<typeof zeroCsvCancelledSchema>;
export type ZeroCsvArtifactPage = z.infer<typeof zeroCsvArtifactPageSchema>;
export type ZeroCsvPrepareInput = z.infer<typeof zeroCsvPrepareInputSchema>;
export const zeroCsvVerifyInputSchema = z
  .object({
    preparationJobId: jobIdSchema,
    idempotencyKey: z.string().min(1).max(128),
    deadline: z
      .string()
      .datetime({ offset: true })
      .refine((value) => Number.isFinite(Date.parse(value))),
  })
  .strict();
export type ZeroCsvVerifyInput = z.infer<typeof zeroCsvVerifyInputSchema>;
/** Trusted local Zero BetterAuth session binding. Never host subscription authentication. */
export interface ZeroCsvApplicationBinding {
  apiUrl: string;
  spaceId: string;
  scopeId: string;
  sessionToken: string;
  expiresAt: string;
}
export interface ZeroCsvApplicationClient {
  status(): Promise<ZeroCsvStatus>;
  prepare(input: ZeroCsvPrepareInput): Promise<ZeroCsvPrepared>;
  verify(input: ZeroCsvVerifyInput): Promise<ZeroCsvPrepared>;
  get(jobId: string): Promise<ZeroCsvJob>;
  freshness(jobId: string): Promise<ZeroCsvFreshness>;
  cancel(jobId: string): Promise<ZeroCsvCancelled>;
  artifactPage(
    jobId: string,
    page?: { offset?: number; limit?: number },
  ): Promise<ZeroCsvArtifactPage>;
}
export type ZeroCsvApplicationErrorCode = ZeroApplicationTransportErrorCode;
export class ZeroCsvApplicationError extends Error {
  constructor(readonly code: ZeroCsvApplicationErrorCode) {
    super(code);
    this.name = "ZeroCsvApplicationError";
  }
}
type Options = ZeroApplicationTransportOptions;
function fail(code: ZeroCsvApplicationErrorCode): never {
  throw new ZeroCsvApplicationError(code);
}

export function createZeroCsvApplicationClient(
  trustedBinding: ZeroCsvApplicationBinding,
  options: Options = {},
): ZeroCsvApplicationClient {
  let transport: ReturnType<typeof createZeroApplicationTransport>;
  try {
    transport = createZeroApplicationTransport(trustedBinding, "csv", options);
  } catch (error) {
    if (error instanceof ZeroApplicationTransportError) fail(error.code);
    fail("invalid_binding");
  }
  async function request<T>(suffix: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    try {
      return await transport(
        suffix,
        schema,
        body,
        suffix === "/prepare" || suffix === "/verify" ? 202 : 200,
      );
    } catch (error) {
      if (error instanceof ZeroApplicationTransportError) fail(error.code);
      fail("application_unavailable");
    }
  }
  const checkedJob = (value: string) => {
    const checked = jobIdSchema.safeParse(value);
    if (!checked.success) fail("invalid_request");
    return checked.data;
  };
  return {
    status: () => request("/status", zeroCsvStatusSchema),
    async prepare(input) {
      const checked = zeroCsvPrepareInputSchema.safeParse(input);
      if (!checked.success || Buffer.byteLength(checked.data.csv) > ZERO_CSV_LIMITS.inputBytes)
        fail("invalid_request");
      const remaining = Date.parse(checked.data.deadline) - Date.now();
      if (remaining <= 0 || remaining > 10 * 60_000) fail("invalid_request");
      return request("/prepare", zeroCsvPreparedSchema, checked.data);
    },
    async verify(input) {
      const checked = zeroCsvVerifyInputSchema.safeParse(input);
      if (!checked.success) fail("invalid_request");
      const remaining = Date.parse(checked.data.deadline) - Date.now();
      if (remaining <= 0 || remaining > 10 * 60_000) fail("invalid_request");
      return request("/verify", zeroCsvPreparedSchema, checked.data);
    },
    async get(value) {
      const jobId = checkedJob(value);
      const output = await request(`/jobs/${jobId}`, zeroCsvJobSchema);
      if (output.jobId !== jobId) fail("invalid_response");
      return output;
    },
    async freshness(value) {
      const jobId = checkedJob(value);
      const output = await request(`/jobs/${jobId}/freshness`, zeroCsvFreshnessSchema);
      if (output.jobId !== jobId) fail("invalid_response");
      if ((output.state === "unchanged") !==
        (output.currentSnapshotSha256 === output.verifiedSnapshotSha256)) fail("invalid_response");
      return output;
    },
    async cancel(value) {
      const jobId = checkedJob(value);
      const output = await request(`/jobs/${jobId}/cancel`, zeroCsvCancelledSchema, {});
      if (output.jobId !== jobId) fail("invalid_response");
      return output;
    },
    async artifactPage(value, page = {}) {
      const jobId = checkedJob(value);
      const checked = z
        .object({
          offset: z.number().int().min(0).max(ZERO_CSV_LIMITS.artifactBytes).default(0),
          limit: z.number().int().min(1).max(16384).default(8192),
        })
        .strict()
        .safeParse(page);
      if (!checked.success) fail("invalid_request");
      const output = await request(
        `/jobs/${jobId}/artifact?offset=${checked.data.offset}&limit=${checked.data.limit}`,
        zeroCsvArtifactPageSchema,
      );
      const bytes = Buffer.from(output.contentBase64, "base64");
      const end = output.offset + bytes.byteLength;
      if (
        bytes.toString("base64") !== output.contentBase64 ||
        output.offset !== checked.data.offset ||
        bytes.byteLength > checked.data.limit ||
        end > output.totalBytes ||
        output.nextOffset !== (end < output.totalBytes ? end : null) ||
        (end < output.totalBytes && !bytes.byteLength)
      )
        fail("invalid_response");
      return output;
    },
  };
}

/** Re-read the private Zero session binding per operation; no stale file success is cached. */
export function createZeroCsvApplicationClientFromFile(
  file: string,
  options: Options = {},
): ZeroCsvApplicationClient {
  const client = async () => {
    try {
      const bytes = await readZeroOperatorFile(file, 8192);
      return createZeroCsvApplicationClient(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
        options,
      );
    } catch (error) {
      if (error instanceof ZeroCsvApplicationError) throw error;
      fail("invalid_binding");
    }
  };
  return {
    status: async () => (await client()).status(),
    prepare: async (input) => (await client()).prepare(input),
    verify: async (input) => (await client()).verify(input),
    get: async (jobId) => (await client()).get(jobId),
    freshness: async (jobId) => (await client()).freshness(jobId),
    cancel: async (jobId) => (await client()).cancel(jobId),
    artifactPage: async (jobId, page) => (await client()).artifactPage(jobId, page),
  };
}
