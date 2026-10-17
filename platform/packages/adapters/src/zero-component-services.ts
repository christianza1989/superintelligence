import { IsolationError } from "@rakazo/db";
import { z } from "zod";
import {
  ZERO_BROWSER_STATIC_PROFILE,
  zeroBrowserRequestSchema,
  zeroBrowserSubmitSchema,
} from "./zero-browser-contract.js";
import type { ZeroBrowserRuntimeConfig } from "./zero-browser-static-runtime.js";
import { executeZeroBrowser } from "./zero-browser-static-runtime.js";
import type { ZeroComponentInputBinding } from "./zero-component-input.js";
import { captureZeroComponentInput, loadZeroComponentInput } from "./zero-component-input.js";
import type {
  ZeroComponentDependencies,
  ZeroComponentHeader,
  ZeroComponentPrincipal,
} from "./zero-component-jobs.js";
import {
  assertZeroComponentActive,
  authorizeZeroComponent,
  createZeroComponentReader,
  findZeroComponentReceipt,
  loadZeroComponentHeader,
  loadZeroComponentRequest,
  publishZeroComponent,
  submitZeroComponent,
  zeroComponentDatabaseNow,
  zeroComponentDigest,
  zeroComponentHash,
  zeroComponentPrincipalSchema,
} from "./zero-component-jobs.js";
import {
  ZERO_PDF_BUNDLE_SHA256,
  ZERO_PDF_IMAGE,
  ZERO_PDF_PROFILE,
  zeroPdfRequestSchema,
  zeroPdfSubmitSchema,
} from "./zero-pdf-contract.js";
import type { ZeroPdfRuntimeConfig } from "./zero-pdf-runtime.js";
import { executeZeroPdf } from "./zero-pdf-runtime.js";

export interface ZeroPdfBinding extends ZeroComponentInputBinding {
  runtime: Pick<ZeroPdfRuntimeConfig, "bundleDirectory">;
}
export interface ZeroBrowserBinding extends ZeroComponentInputBinding {
  runtime: Omit<ZeroBrowserRuntimeConfig, "beforeDispatch">;
}
export type ZeroPdfResolve = (
  principal: ZeroComponentPrincipal,
) => Promise<ZeroPdfBinding | undefined>;
export type ZeroBrowserResolve = (
  principal: ZeroComponentPrincipal,
) => Promise<ZeroBrowserBinding | undefined>;
export type ZeroComponentServiceDependencies = ZeroComponentDependencies & {
  resolvePdf?: ZeroPdfResolve;
  resolveBrowser?: ZeroBrowserResolve;
};
type Family = "pdf" | "browser";
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const pdfRequest = zeroPdfRequestSchema.extend({ requestDigest: digestSchema }).strict();
const browserRequest = zeroBrowserRequestSchema.extend({ requestDigest: digestSchema }).strict();
type Request = z.infer<typeof pdfRequest> | z.infer<typeof browserRequest>;
type Binding = ZeroPdfBinding | ZeroBrowserBinding;
const decode = (family: Family, value: unknown, header: ZeroComponentHeader): Request => {
  const request = (family === "pdf" ? pdfRequest : browserRequest).parse(value);
  if (
    !header.fileId ||
    request.fileId !== header.fileId ||
    request.source.sha256 !== header.inputSha256
  )
    throw new IsolationError();
  return request;
};
async function bindingFor(
  deps: Pick<ZeroComponentServiceDependencies, "resolvePdf" | "resolveBrowser">,
  family: Family,
  principal: ZeroComponentPrincipal,
  header?: Pick<ZeroComponentHeader, "fileId" | "inputSha256">,
  request?: Request,
): Promise<Binding> {
  const binding =
    family === "pdf" ? await deps.resolvePdf?.(principal) : await deps.resolveBrowser?.(principal);
  if (!binding) throw new Error("component_profile_unavailable");
  if (
    !binding.files.length ||
    binding.files.length > 10 ||
    new Set(binding.files.map((file) => file.fileId)).size !== binding.files.length
  )
    throw new IsolationError();
  if (header) {
    const file = binding.files.find((entry) => entry.fileId === header.fileId);
    if (!file || file.sha256 !== header.inputSha256) throw new IsolationError();
  }
  if (request?.kind === "zero.browser.request.v1") {
    const runtime = (binding as ZeroBrowserBinding).runtime;
    if (
      runtime.imageId !== request.imageId ||
      runtime.buildInputLockSha256 !== request.buildInputLockSha256
    )
      throw new IsolationError();
  }
  return binding;
}
function createService(
  deps: ZeroComponentServiceDependencies,
  family: Family,
  trustedPrincipal: ZeroComponentPrincipal,
) {
  const principal = zeroComponentPrincipalSchema.parse(trustedPrincipal);
  const guard = async (
    owner: ZeroComponentPrincipal,
    header?: Pick<ZeroComponentHeader, "fileId" | "inputSha256">,
    request?: Request,
  ) => {
    await deps.authorize(owner);
    return bindingFor(deps, family, owner, header, request);
  };
  const reader = async (jobId: string) => {
    z.string().uuid().parse(jobId);
    await authorizeZeroComponent(deps, principal);
    const cached = await loadZeroComponentHeader(deps, family, jobId, principal);
    await guard(principal, cached.header);
    return createZeroComponentReader(
      {
        ...deps,
        authorize: async (owner) => {
          await guard(owner, cached.header);
        },
      },
      family,
      principal,
      (value, header) => decode(family, value, header),
    );
  };
  return {
    async available() {
      await authorizeZeroComponent(deps, principal);
      return Boolean(
        family === "pdf"
          ? await deps.resolvePdf?.(principal)
          : await deps.resolveBrowser?.(principal),
      );
    },
    async submit(input: unknown) {
      const parsed = (family === "pdf" ? zeroPdfSubmitSchema : zeroBrowserSubmitSchema).parse(
        input,
      );
      await authorizeZeroComponent(deps, principal);
      const nonce = `zero.${family}.request:${zeroComponentHash(JSON.stringify([principal.userId, principal.scopeId]))}:${zeroComponentHash(parsed.idempotencyKey)}`;
      const previous = await deps.prisma.artifact.findUnique({
        where: {
          spaceId_userId_clientNonce: {
            spaceId: principal.spaceId,
            userId: principal.userId,
            clientNonce: nonce,
          },
        },
      });
      if (previous) {
        const metadata = JSON.parse(previous.description ?? "null");
        if (
          metadata?.fileId !== parsed.fileId ||
          metadata?.deadline !== parsed.deadline ||
          JSON.stringify(metadata?.principal) !== JSON.stringify(principal)
        )
          throw new Error("idempotency_key_conflict");
        if (Date.parse(parsed.deadline) <= (await zeroComponentDatabaseNow(deps.prisma)))
          throw new Error("idempotency_key_expired");
      }
      const binding = await guard(principal);
      const file = binding.files.find((entry) => entry.fileId === parsed.fileId);
      if (!file) throw new IsolationError();
      const header = { fileId: parsed.fileId, inputSha256: file.sha256 };
      const recheck = async () => {
        await authorizeZeroComponent(
          {
            prisma: deps.prisma,
            authorize: async (owner) => {
              await guard(owner, header);
            },
          },
          principal,
        );
        const now = await zeroComponentDatabaseNow(deps.prisma);
        const deadline = Date.parse(parsed.deadline);
        if (
          !Number.isFinite(deadline) ||
          deadline <= now ||
          deadline - now > 600_000 ||
          deadline > Date.parse(principal.expiresAt)
        )
          throw new Error("invalid_job_deadline");
      };
      await recheck();
      const source = await captureZeroComponentInput(
        deps,
        family,
        principal,
        parsed.fileId,
        binding,
        recheck,
      );
      const body =
        family === "pdf"
          ? zeroPdfRequestSchema.parse({
              kind: "zero.pdf.request.v1",
              principal,
              fileId: parsed.fileId,
              source,
              profile: ZERO_PDF_PROFILE,
              imageId: ZERO_PDF_IMAGE,
              bundleSha256: ZERO_PDF_BUNDLE_SHA256,
              deadline: parsed.deadline,
            })
          : zeroBrowserRequestSchema.parse({
              kind: "zero.browser.request.v1",
              principal,
              fileId: parsed.fileId,
              source,
              profile: ZERO_BROWSER_STATIC_PROFILE,
              imageId: (binding as ZeroBrowserBinding).runtime.imageId,
              buildInputLockSha256: (binding as ZeroBrowserBinding).runtime.buildInputLockSha256,
              deadline: parsed.deadline,
            });
      const request = { ...body, requestDigest: zeroComponentDigest(body) };
      await recheck();
      return submitZeroComponent(
        {
          ...deps,
          authorize: async (owner) => {
            await guard(owner, header, request);
          },
        },
        family,
        principal,
        request,
        parsed.idempotencyKey,
        { inputSha256: source.sha256 },
      );
    },
    async get(jobId: string) {
      return (await reader(jobId)).get(jobId);
    },
    async cancel(jobId: string) {
      return (await reader(jobId)).cancel(jobId);
    },
    async artifact(jobId: string) {
      return (await reader(jobId)).artifact(jobId);
    },
  };
}
export const createZeroPdfService = (
  deps: ZeroComponentServiceDependencies,
  principal: ZeroComponentPrincipal,
) => createService(deps, "pdf", principal);
export const createZeroBrowserService = (
  deps: ZeroComponentServiceDependencies,
  principal: ZeroComponentPrincipal,
) => createService(deps, "browser", principal);

export type ZeroComponentWorkerDependencies = Pick<
  ZeroComponentServiceDependencies,
  "prisma" | "artifacts" | "resolvePdf" | "resolveBrowser"
> & { authorize?: ZeroComponentDependencies["authorize"] };
async function run(deps: ZeroComponentWorkerDependencies, family: Family, id: string) {
  const cached = await loadZeroComponentHeader(deps, family, id);
  let header: ZeroComponentHeader = cached.header;
  if (await findZeroComponentReceipt(deps.prisma, family, header, id)) return;
  if (!deps.authorize) {
    await publishZeroComponent(deps, family, id, header, "blocked", {
      reason: "project_authorizer_unavailable",
    });
    return;
  }
  let request: Request | undefined;
  const guard = async (principal: ZeroComponentPrincipal) => {
    await deps.authorize!(principal);
    return bindingFor(deps, family, principal, header, request);
  };
  const authorized = {
    ...deps,
    authorize: async (principal: ZeroComponentPrincipal) => {
      await guard(principal);
    },
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    const started = await zeroComponentDatabaseNow(deps.prisma);
    const startedAt = new Date(started).toISOString();
    const loaded = await loadZeroComponentRequest(
      authorized,
      family,
      id,
      header.principal,
      (value, metadata) => decode(family, value, metadata),
      cached,
    );
    request = loaded.request;
    header = { ...request, fileId: request.fileId, inputSha256: request.source.sha256 };
    const recheck = () => assertZeroComponentActive(authorized, family, id, header, startedAt);
    await recheck();
    const binding = await guard(request.principal);
    const bytes = await loadZeroComponentInput(
      authorized,
      family,
      request.principal,
      request.fileId,
      request.source,
      binding,
      recheck,
    );
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(
        Math.max(
          1,
          Math.min(
            family === "pdf" ? 30_000 : 20_000,
            Date.parse(request.deadline) - Date.now(),
            Date.parse(request.principal.expiresAt) - Date.now(),
          ),
        ),
      ),
    ]);
    let polling = false;
    let pollError: unknown;
    timer = setInterval(() => {
      if (polling) return;
      polling = true;
      void recheck()
        .catch((error: unknown) => {
          pollError = error;
          controller.abort();
        })
        .finally(() => {
          polling = false;
        });
    }, 200);
    const { requestDigest, ...body } = request;
    const result =
      family === "pdf"
        ? await executeZeroPdf(
            { ...(binding as ZeroPdfBinding).runtime, beforeDispatch: recheck },
            { request: body, requestDigest, bytes },
            signal,
          )
        : await executeZeroBrowser(
            { ...(binding as ZeroBrowserBinding).runtime, beforeDispatch: recheck },
            { request: body, requestDigest, bytes },
            signal,
          );
    if (pollError) throw pollError;
    await recheck();
    if (result.state !== "succeeded") {
      await publishZeroComponent(
        authorized,
        family,
        id,
        header,
        result.state === "unknown" || result.state === "blocked" ? "blocked" : "failed",
        {
          reason: result.code,
          ...(result.state === "unknown"
            ? { cleanup: { state: "unknown", quarantineId: result.quarantineId } }
            : {}),
        },
      );
      return;
    }
    await publishZeroComponent(authorized, family, id, header, "succeeded", {
      startedAt,
      fileId: request.fileId,
      source: request.source,
      imageId: request.imageId,
      ...(request.kind === "zero.pdf.request.v1"
        ? { bundleSha256: request.bundleSha256 }
        : { buildInputLockSha256: request.buildInputLockSha256 }),
      extraction: result.output,
      elapsedMs: Date.now() - started,
      limitations: [
        "Bounded development profile; independent holdout and broader G2 acceptance remain open",
        "Owned immutable input; current host file freshness is not implied",
        "Retained immutable inputs and receipts require operator-managed retention",
      ],
    });
  } catch (error) {
    if (
      !(error instanceof IsolationError) &&
      !(
        error instanceof Error &&
        /^(component_|job_|invalid_job_deadline|artifact_limit_exceeded|request_|PDF_|BROWSER_)/u.test(
          error.message,
        )
      )
    )
      throw error;
    await publishZeroComponent(
      deps,
      family,
      id,
      header,
      error instanceof IsolationError ||
        (error instanceof Error && error.message === "component_profile_unavailable")
        ? "blocked"
        : "failed",
      {
        reason:
          error instanceof IsolationError ? "project_scope_rejected" : (error as Error).message,
      },
    );
  } finally {
    if (timer) clearInterval(timer);
  }
}
export const runZeroPdfExtraction = (deps: ZeroComponentWorkerDependencies, id: string) =>
  run(deps, "pdf", id);
export const runZeroBrowserExtraction = (deps: ZeroComponentWorkerDependencies, id: string) =>
  run(deps, "browser", id);
