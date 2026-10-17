/** Shared bounded loopback transport for the CSV and Jev application clients. */
import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export interface ZeroApplicationBinding {
  apiUrl: string;
  spaceId: string;
  scopeId: string;
  sessionToken: string;
  expiresAt: string;
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
  "verification_unavailable",
  "verification_preparation_required",
  "routing_profile_unavailable",
  "routing_budget_unavailable",
  "routing_backend_unavailable",
  "invalid_job_bounds",
  "request_limit_exceeded",
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
export type ZeroApplicationTransportErrorCode = (typeof errorCodes)[number];
export class ZeroApplicationTransportError extends Error {
  constructor(readonly code: ZeroApplicationTransportErrorCode) {
    super(code);
    this.name = "ZeroApplicationTransportError";
  }
}
export interface ZeroApplicationTransportOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}
const responseLimit = 32767;
function fail(code: ZeroApplicationTransportErrorCode): never {
  throw new ZeroApplicationTransportError(code);
}

async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) {
    void response.body?.cancel().catch(() => undefined);
    fail("request_timeout");
  }
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
    if (error instanceof ZeroApplicationTransportError) throw error;
    fail("invalid_response");
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

export function createZeroApplicationTransport(
  trustedBinding: ZeroApplicationBinding,
  family: "csv" | "jev",
  options: ZeroApplicationTransportOptions = {},
) {
  if (family !== "csv" && family !== "jev") fail("invalid_binding");
  const parsed = bindingSchema.safeParse(trustedBinding);
  if (!parsed.success) fail("invalid_binding");
  const binding = parsed.data;
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
    fail("invalid_binding");
  const fetcher = options.fetch ?? globalThis.fetch;
  const prefix = `/api/zero/${family}/scopes/${encodeURIComponent(binding.scopeId)}`;
  const active = () => {
    if (Date.parse(binding.expiresAt) <= Date.now()) fail("binding_expired");
  };
  async function request<T>(
    suffix: string,
    schema: z.ZodType<T>,
    body?: unknown,
    expectedStatus: 200 | 202 = 200,
  ): Promise<T> {
    active();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ZeroApplicationTransportError("request_timeout"));
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
          if (response.status !== expectedStatus) {
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
      if (error instanceof ZeroApplicationTransportError) throw error;
      fail(controller.signal.aborted ? "request_timeout" : "application_unavailable");
    } finally {
      clearTimeout(timer!);
    }
  }
  return request;
}
