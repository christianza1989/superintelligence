import { z } from "zod";
import { ZERO_CSV_LIMITS, ZERO_CSV_PROFILE } from "./zero-csv-profile.js";
import { readZeroOperatorFile } from "./zero-project-policy.js";

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
  cancel(jobId: string): Promise<ZeroCsvCancelled>;
  artifactPage(
    jobId: string,
    page?: { offset?: number; limit?: number },
  ): Promise<ZeroCsvArtifactPage>;
}
const bindingSchema = z
  .object({
    apiUrl: z
      .string()
      .max(128)
      .refine((value) => {
        const match = /^http:\/\/(127\.0\.0\.1|\[::1\]):([1-9]\d{0,4})\/?$/.exec(value);
        return Boolean(match && Number(match[2]) <= 65535);
      }),
    spaceId: id,
    scopeId: id,
    sessionToken: z
      .string()
      .min(16)
      .max(4096)
      .regex(/^[\x21-\x7e]+$/),
    expiresAt: z
      .string()
      .datetime({ offset: true })
      .refine((value) => Number.isFinite(Date.parse(value))),
  })
  .strict();
const errorCodes = [
  "authentication_required",
  "project_scope_rejected",
  "origin_rejected",
  "project_policy_unavailable",
  "invalid_scope",
  "invalid_request",
  "idempotency_key_conflict",
  "idempotency_key_expired",
  "scope_job_limit_exceeded",
  "csv_limit_exceeded",
  "invalid_job_deadline",
  "verification_unavailable",
  "verification_preparation_required",
  "preparation_backend_unavailable",
  "json_required",
  "request_too_large",
  "invalid_json",
  "invalid_page",
  "invalid_binding",
  "binding_expired",
  "application_unavailable",
  "request_timeout",
  "response_too_large",
  "invalid_response",
  "redirect_rejected",
] as const;
export type ZeroCsvApplicationErrorCode = (typeof errorCodes)[number];
export class ZeroCsvApplicationError extends Error {
  constructor(readonly code: ZeroCsvApplicationErrorCode) {
    super(code);
    this.name = "ZeroCsvApplicationError";
  }
}
interface Options {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}
const responseLimit = 32767;
function fail(code: ZeroCsvApplicationErrorCode): never {
  throw new ZeroCsvApplicationError(code);
}

async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (
    response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
      "application/json" ||
    !response.body
  ) {
    void response.body?.cancel().catch(() => undefined);
    fail("invalid_response");
  }
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > responseLimit)) {
    void response.body.cancel().catch(() => undefined);
    fail("response_too_large");
  }
  const reader = response.body.getReader();
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (signal.aborted) fail("request_timeout");
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > responseLimit) {
        abort();
        fail("response_too_large");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    abort();
    if (error instanceof ZeroCsvApplicationError) throw error;
    fail("invalid_response");
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

export function createZeroCsvApplicationClient(
  trustedBinding: ZeroCsvApplicationBinding,
  options: Options = {},
): ZeroCsvApplicationClient {
  const parsed = bindingSchema.safeParse(trustedBinding);
  if (!parsed.success) fail("invalid_binding");
  const binding = parsed.data;
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
    fail("invalid_binding");
  const fetcher = options.fetch ?? globalThis.fetch;
  const prefix = `/api/zero/csv/scopes/${encodeURIComponent(binding.scopeId)}`;
  const active = () => {
    if (Date.parse(binding.expiresAt) <= Date.now()) fail("binding_expired");
  };
  async function request<T>(suffix: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    active();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ZeroCsvApplicationError("request_timeout"));
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        timeout,
        (async () => {
          const target = new URL(prefix + suffix, binding.apiUrl);
          const response = await fetcher(target, {
            method: body === undefined ? "GET" : "POST",
            headers: {
              authorization: `Bearer ${binding.sessionToken}`,
              "x-rakazo-space-id": binding.spaceId,
              ...(body !== undefined ? { "content-type": "application/json" } : {}),
            },
            redirect: "error",
            cache: "no-store",
            signal: controller.signal,
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          });
          if (
            response.redirected ||
            (response.status >= 300 && response.status < 400) ||
            (response.url && new URL(response.url).origin !== target.origin)
          ) {
            void response.body?.cancel().catch(() => undefined);
            fail("redirect_rejected");
          }
          const json = await readJson(response, controller.signal);
          active();
          if (response.status !== (suffix === "/prepare" || suffix === "/verify" ? 202 : 200)) {
            const error = z
              .object({ error: z.enum(errorCodes) })
              .strict()
              .safeParse(json);
            fail(error.success ? error.data.error : "application_unavailable");
          }
          const output = schema.safeParse(json);
          if (!output.success) fail("invalid_response");
          return output.data;
        })(),
      ]);
    } catch (error) {
      if (error instanceof ZeroCsvApplicationError) throw error;
      fail(controller.signal.aborted ? "request_timeout" : "application_unavailable");
    } finally {
      clearTimeout(timer!);
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
    cancel: async (jobId) => (await client()).cancel(jobId),
    artifactPage: async (jobId, page) => (await client()).artifactPage(jobId, page),
  };
}
