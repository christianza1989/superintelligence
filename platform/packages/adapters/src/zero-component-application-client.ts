import { z } from "zod";
import type {
  ZeroApplicationBinding,
  ZeroApplicationTransportOptions,
} from "./zero-application-transport.js";
import {
  createZeroApplicationTransport,
  ZeroApplicationTransportError,
} from "./zero-application-transport.js";
import {
  ZERO_BROWSER_STATIC_LIMITS,
  ZERO_BROWSER_STATIC_PROFILE,
} from "./zero-browser-contract.js";
import { readZeroOperatorFile } from "./zero-operator-file.js";
import { ZERO_PDF_JOB_LIMITS, ZERO_PDF_PROFILE } from "./zero-pdf-contract.js";

export type ZeroExtractionFamily = "pdf" | "browser";
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u);
const jobId = z.uuid();
export const zeroExtractionInputSchema = z.strictObject({
  fileId: id,
  idempotencyKey: z.string().min(1).max(128),
  deadline: z.iso.datetime({ offset: true }).refine((value) => Number.isFinite(Date.parse(value))),
});
export const zeroExtractionSubmittedSchema = z.strictObject({ jobId, requestDigest: hash });
export type ZeroExtractionInput = z.infer<typeof zeroExtractionInputSchema>;

/** Closed schemas for the two extraction routes; no runtime or database imports. */
export function zeroExtractionSchemas(family: ZeroExtractionFamily) {
  if (family !== "pdf" && family !== "browser")
    throw new ZeroApplicationTransportError("invalid_binding");
  const pdf = family === "pdf";
  const limits = pdf ? ZERO_PDF_JOB_LIMITS : ZERO_BROWSER_STATIC_LIMITS;
  const profile = z.literal(pdf ? ZERO_PDF_PROFILE : ZERO_BROWSER_STATIC_PROFILE);
  const terminal = {
    jobId,
    state: z.enum(["succeeded", "failed", "blocked", "cancelled"]),
    profile,
    requestDigest: hash,
    artifactId: id,
  };
  return {
    artifactBytes: limits.artifactBytes,
    status: z.strictObject({
      profile,
      backend: z.literal("available"),
      paidModelCalls: z.literal(0),
      execution: z.literal(pdf ? "pdf-extraction" : "browser-static-extraction"),
      limits: z.strictObject({
        inputBytes: z.literal(limits.inputBytes),
        runtimeMs: z.literal(limits.runtimeMs),
        artifactBytes: z.literal(limits.artifactBytes),
        outstandingJobsPerScope: z.literal(4),
      }),
    }),
    job: z.union([
      z.strictObject({ ...terminal, revision: z.literal(2), sha256: hash }),
      z.strictObject({
        jobId,
        state: z.enum(["queued", "running", "unknown"]),
        attempts: z.number().int().min(0).max(3).nullable(),
        reason: z.enum(["queue_and_receipt_absent", "worker_attempts_exhausted"]).nullable(),
      }),
    ]),
    cancelled: z.strictObject(terminal),
    page: z.strictObject({
      artifactId: id,
      revision: z.literal(2),
      sha256: hash,
      totalBytes: z.number().int().min(1).max(limits.artifactBytes),
      offset: z.number().int().min(0).max(limits.artifactBytes),
      nextOffset: z.number().int().min(1).max(limits.artifactBytes).nullable(),
      encoding: z.literal("base64"),
      contentBase64: z
        .string()
        .max(4 * Math.ceil(8192 / 3))
        .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u),
    }),
  };
}
type Schemas = ReturnType<typeof zeroExtractionSchemas>;
export interface ZeroComponentApplicationClient {
  readonly family: ZeroExtractionFamily;
  status(): Promise<z.infer<Schemas["status"]>>;
  extract(input: ZeroExtractionInput): Promise<z.infer<typeof zeroExtractionSubmittedSchema>>;
  get(jobId: string): Promise<z.infer<Schemas["job"]>>;
  cancel(jobId: string): Promise<z.infer<Schemas["cancelled"]>>;
  artifactPage(
    jobId: string,
    page?: { offset?: number; limit?: number },
  ): Promise<z.infer<Schemas["page"]>>;
}
function fail(code: "invalid_request" | "invalid_response" | "invalid_binding"): never {
  throw new ZeroApplicationTransportError(code);
}

export function createZeroComponentApplicationClient(
  family: ZeroExtractionFamily,
  binding: ZeroApplicationBinding,
  options: ZeroApplicationTransportOptions = {},
): ZeroComponentApplicationClient {
  const schemas = zeroExtractionSchemas(family);
  const request = createZeroApplicationTransport(binding, family, options);
  const checkedId = (value: string) => {
    const parsed = jobId.safeParse(value);
    if (!parsed.success) fail("invalid_request");
    return parsed.data;
  };
  return {
    family,
    status: () => request("/status", schemas.status),
    async extract(input) {
      const parsed = zeroExtractionInputSchema.safeParse(input);
      if (!parsed.success) fail("invalid_request");
      const remaining = Date.parse(parsed.data.deadline) - Date.now();
      if (remaining <= 0 || remaining > 600_000) fail("invalid_request");
      return request("/extract", zeroExtractionSubmittedSchema, parsed.data, 202);
    },
    async get(value) {
      const id = checkedId(value);
      const result = await request(`/jobs/${id}`, schemas.job);
      if (result.jobId !== id) fail("invalid_response");
      return result;
    },
    async cancel(value) {
      const id = checkedId(value);
      const result = await request(`/jobs/${id}/cancel`, schemas.cancelled, {});
      if (result.jobId !== id) fail("invalid_response");
      return result;
    },
    async artifactPage(value, page = {}) {
      const id = checkedId(value);
      const parsed = z
        .strictObject({
          offset: z.number().int().min(0).max(schemas.artifactBytes).default(0),
          limit: z.number().int().min(1).max(8192).default(8192),
        })
        .safeParse(page);
      if (!parsed.success) fail("invalid_request");
      const result = await request(
        `/jobs/${id}/artifact?offset=${parsed.data.offset}&limit=${parsed.data.limit}`,
        schemas.page,
      );
      const bytes = Buffer.from(result.contentBase64, "base64");
      const end = result.offset + bytes.length;
      if (
        bytes.toString("base64") !== result.contentBase64 ||
        result.offset !== parsed.data.offset ||
        bytes.length > parsed.data.limit ||
        end > result.totalBytes ||
        result.nextOffset !== (end < result.totalBytes ? end : null) ||
        (end < result.totalBytes && bytes.length === 0)
      )
        fail("invalid_response");
      return result;
    },
  };
}

/** Every operation reloads the same protected Zero binding; never caches a grant. */
export function createZeroComponentApplicationClientFromFile(
  family: ZeroExtractionFamily,
  file: string,
  options: ZeroApplicationTransportOptions = {},
): ZeroComponentApplicationClient {
  zeroExtractionSchemas(family);
  const client = async () => {
    try {
      const bytes = await readZeroOperatorFile(file, 8192);
      return createZeroComponentApplicationClient(
        family,
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
        options,
      );
    } catch (error) {
      if (error instanceof ZeroApplicationTransportError) throw error;
      fail("invalid_binding");
    }
  };
  return {
    family,
    status: async () => (await client()).status(),
    extract: async (input) => (await client()).extract(input),
    get: async (id) => (await client()).get(id),
    cancel: async (id) => (await client()).cancel(id),
    artifactPage: async (id, page) => (await client()).artifactPage(id, page),
  };
}
