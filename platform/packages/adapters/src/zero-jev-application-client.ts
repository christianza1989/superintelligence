import { z } from "zod";
import type {
  ZeroApplicationBinding,
  ZeroApplicationTransportOptions,
} from "./zero-application-transport.js";
import {
  createZeroApplicationTransport,
  ZeroApplicationTransportError,
} from "./zero-application-transport.js";
import { zeroCsvArtifactPageSchema } from "./zero-csv-application-client.js";
import { ZERO_JEV_LIMITS } from "./zero-jev-worker.js";
import { readZeroOperatorFile } from "./zero-project-policy.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const jobId = z.string().uuid();
export const zeroJevExecuteInputSchema = z
  .object({
    goal: z.string().trim().min(1).max(ZERO_JEV_LIMITS.goalChars),
    data: z.string().min(1).max(ZERO_JEV_LIMITS.inputBytes),
    deadline: z
      .string()
      .datetime({ offset: true })
      .refine((value) => Number.isFinite(Date.parse(value))),
    idempotencyKey: z.string().min(1).max(128),
  })
  .strict();
export const zeroJevStatusSchema = z
  .object({
    profile: z.literal("jev-tool-selector-v1"),
    backend: z.literal("available"),
    execution: z.literal("jev-tool-selection"),
    paidModelCalls: z.literal(0),
    profileRevision: z.string().min(1).max(128),
    model: z.string().min(1).max(200),
    tools: z
      .array(z.enum(["csv.parse", "json.normalize"]))
      .min(1)
      .max(2),
    limits: z
      .object({
        inputBytes: z.literal(ZERO_JEV_LIMITS.inputBytes),
        goalChars: z.literal(ZERO_JEV_LIMITS.goalChars),
        artifactBytes: z.literal(ZERO_JEV_LIMITS.artifactBytes),
        outstandingJobsPerScope: z.literal(ZERO_JEV_LIMITS.outstandingJobsPerScope),
        deadlineMs: z.literal(ZERO_JEV_LIMITS.deadlineMs),
        runtimeMs: z.literal(ZERO_JEV_LIMITS.runtimeMs),
      })
      .strict(),
  })
  .strict();
export const zeroJevSubmittedSchema = z
  .object({ jobId, callId: jobId, requestDigest: hash })
  .strict();
export const zeroJevJobSchema = z.union([
  z
    .object({
      jobId,
      callId: jobId.nullable(),
      state: z.literal("unknown"),
      reason: z.literal("no_terminal_receipt"),
    })
    .strict(),
  z
    .object({
      jobId,
      callId: jobId.nullable(),
      state: z.enum(["succeeded", "failed", "blocked", "abstained", "unknown"]),
      requestDigest: hash,
      artifactId: id,
      revision: z.literal(2),
      sha256: hash,
    })
    .strict(),
]);
export const zeroJevArtifactPageSchema = zeroCsvArtifactPageSchema;
export type ZeroJevExecuteInput = z.infer<typeof zeroJevExecuteInputSchema>;
export type ZeroJevStatus = z.infer<typeof zeroJevStatusSchema>;
export type ZeroJevSubmitted = z.infer<typeof zeroJevSubmittedSchema>;
export type ZeroJevJob = z.infer<typeof zeroJevJobSchema>;
export type ZeroJevArtifactPage = z.infer<typeof zeroJevArtifactPageSchema>;
export type ZeroJevApplicationBinding = ZeroApplicationBinding;
export { ZeroApplicationTransportError as ZeroJevApplicationError };
export interface ZeroJevApplicationClient {
  status(): Promise<ZeroJevStatus>;
  execute(input: ZeroJevExecuteInput): Promise<ZeroJevSubmitted>;
  get(jobId: string): Promise<ZeroJevJob>;
  artifactPage(
    jobId: string,
    page?: { offset?: number; limit?: number },
  ): Promise<ZeroJevArtifactPage>;
}
function fail(code: "invalid_request" | "invalid_response" | "invalid_binding"): never {
  throw new ZeroApplicationTransportError(code);
}
export function createZeroJevApplicationClient(
  binding: ZeroJevApplicationBinding,
  options: ZeroApplicationTransportOptions = {},
): ZeroJevApplicationClient {
  const request = createZeroApplicationTransport(binding, "jev", options);
  const checkedJob = (value: string) => {
    const parsed = jobId.safeParse(value);
    if (!parsed.success) fail("invalid_request");
    return parsed.data;
  };
  return {
    status: () => request("/status", zeroJevStatusSchema),
    async execute(input) {
      const checked = zeroJevExecuteInputSchema.safeParse(input);
      if (
        !checked.success ||
        Buffer.byteLength(checked.data.data) > ZERO_JEV_LIMITS.inputBytes ||
        Buffer.byteLength(JSON.stringify(checked.data)) > 36 * 1024
      )
        fail("invalid_request");
      const remaining = Date.parse(checked.data.deadline) - Date.now();
      if (remaining <= 0 || remaining > ZERO_JEV_LIMITS.deadlineMs) fail("invalid_request");
      return request("/execute", zeroJevSubmittedSchema, checked.data, 202);
    },
    async get(value) {
      const job = checkedJob(value);
      const output = await request(`/jobs/${job}`, zeroJevJobSchema);
      if (output.jobId !== job) fail("invalid_response");
      return output;
    },
    async artifactPage(value, page = {}) {
      const job = checkedJob(value);
      const checked = z
        .object({
          offset: z.number().int().min(0).max(ZERO_JEV_LIMITS.artifactBytes).default(0),
          limit: z.number().int().min(1).max(16384).default(8192),
        })
        .strict()
        .safeParse(page);
      if (!checked.success) fail("invalid_request");
      const output = await request(
        `/jobs/${job}/artifact?offset=${checked.data.offset}&limit=${checked.data.limit}`,
        zeroJevArtifactPageSchema,
      );
      const bytes = Buffer.from(output.contentBase64, "base64"),
        end = output.offset + bytes.byteLength;
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
/** Only the existing private Zero application-session binding, re-read each operation. */
export function createZeroJevApplicationClientFromFile(
  file: string,
  options: ZeroApplicationTransportOptions = {},
): ZeroJevApplicationClient {
  const client = async () => {
    try {
      const bytes = await readZeroOperatorFile(file, 8192);
      return createZeroJevApplicationClient(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
        options,
      );
    } catch (error) {
      if (error instanceof ZeroApplicationTransportError) throw error;
      fail("invalid_binding");
    }
  };
  return {
    status: async () => (await client()).status(),
    execute: async (input) => (await client()).execute(input),
    get: async (id) => (await client()).get(id),
    artifactPage: async (id, page) => (await client()).artifactPage(id, page),
  };
}
