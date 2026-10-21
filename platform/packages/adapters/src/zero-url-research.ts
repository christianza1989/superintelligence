import { randomUUID } from "node:crypto";
import type { AdapterContext } from "@rakazo/adapter-kit";
import { IsolationError, Prisma } from "@rakazo/db";
import { z } from "zod";
import type { ResolveHostname } from "./web-ssrf.js";
import { fetchSafeWebBytes } from "./web-ssrf.js";
import { ZERO_BROWSER_STATIC_PROFILE, zeroBrowserRequestSchema } from "./zero-browser-contract.js";
import { executeZeroBrowser } from "./zero-browser-static-runtime.js";
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
  zeroComponentContext,
  zeroComponentDatabaseNow,
  zeroComponentDigest,
  zeroComponentHash,
} from "./zero-component-jobs.js";
import {
  ZERO_URL_DOCUMENT_LIMITS,
  ZERO_URL_DOCUMENT_MODE,
  ZERO_URL_DOCUMENT_PROFILE,
} from "./zero-url-document-contract.js";
import { executeZeroUrlDocument } from "./zero-url-document-runtime.js";
import type {
  ZeroUrlResearchBinding,
  ZeroUrlResearchRequest,
} from "./zero-url-research-contract.js";
import {
  ZERO_URL_RESEARCH_LIMITS,
  ZERO_URL_RESEARCH_MODE,
  ZERO_URL_RESEARCH_PROFILE,
  zeroUrlResearchBindingSchema,
  zeroUrlResearchExecutionSubmitSchema,
  zeroUrlResearchRequestSchema,
} from "./zero-url-research-contract.js";

export type ZeroUrlResearchResolve = (
  principal: ZeroComponentPrincipal,
) => Promise<ZeroUrlResearchBinding | undefined>;
/** Test composition only. Production operator policy cannot express transport or DNS overrides. */
export interface ZeroUrlResearchTestTransport {
  fetch: typeof globalThis.fetch;
  resolveHostname: ResolveHostname;
}
export type ZeroUrlResearchDependencies = ZeroComponentDependencies & {
  resolveUrlResearch?: ZeroUrlResearchResolve;
  testOnlyTransport?: ZeroUrlResearchTestTransport;
};
const family = "research" as const;
const registryHash = (binding: ZeroUrlResearchBinding) => {
  if (binding.profile === ZERO_URL_DOCUMENT_PROFILE)
    return zeroComponentHash(
      JSON.stringify({
        profile: binding.profile,
        tasks: binding.tasks,
        runtime: binding.runtime,
        resourceProfile: binding.resourceProfile,
      }),
    );
  // Preserve the historical inert-profile registry serialization exactly.
  return zeroComponentHash(
    JSON.stringify({
      profile: binding.profile,
      tasks: binding.tasks,
      imageId: binding.runtime.imageId,
      buildInputLockSha256: binding.runtime.buildInputLockSha256,
    }),
  );
};
async function bindingFor(
  deps: ZeroUrlResearchDependencies,
  principal: ZeroComponentPrincipal,
  header?: Pick<ZeroComponentHeader, "fileId" | "inputSha256">,
): Promise<ZeroUrlResearchBinding> {
  await deps.authorize(principal);
  const configured = await deps.resolveUrlResearch?.(principal);
  if (!configured) throw new Error("component_profile_unavailable");
  const binding = zeroUrlResearchBindingSchema.parse(configured);
  await deps.authorize(principal);
  if (
    header &&
    (!binding.tasks.some((task) => task.taskId === header.fileId) ||
      registryHash(binding) !== header.inputSha256)
  )
    throw new IsolationError();
  return binding;
}
function decode(value: unknown, header: ZeroComponentHeader): ZeroUrlResearchRequest {
  const request = zeroUrlResearchRequestSchema.parse(value);
  if (request.fileId !== header.fileId || request.registrySha256 !== header.inputSha256)
    throw new IsolationError();
  return request;
}
export function createZeroUrlResearchService(
  deps: ZeroUrlResearchDependencies,
  principal: ZeroComponentPrincipal,
) {
  const reader = async (jobId: string) => {
    z.string().uuid().parse(jobId);
    await authorizeZeroComponent(deps, principal);
    const cached = await loadZeroComponentHeader(deps, family, jobId, principal);
    await bindingFor(deps, principal, cached.header);
    return createZeroComponentReader(
      {
        ...deps,
        authorize: async (owner) => {
          await bindingFor(deps, owner, cached.header);
        },
      },
      family,
      principal,
      decode,
    );
  };
  return {
    async available() {
      await authorizeZeroComponent(deps, principal);
      await bindingFor(deps, principal);
      return true;
    },
    async status() {
      await authorizeZeroComponent(deps, principal);
      const binding = await bindingFor(deps, principal);
      await authorizeZeroComponent(deps, principal);
      return binding.profile === ZERO_URL_DOCUMENT_PROFILE
        ? {
            profile: binding.profile,
            backend: "available" as const,
            paidModelCalls: 0 as const,
            execution: ZERO_URL_DOCUMENT_MODE,
            resourceProfile: binding.resourceProfile,
            limits: { ...ZERO_URL_RESEARCH_LIMITS, ...ZERO_URL_DOCUMENT_LIMITS },
          }
        : {
            profile: ZERO_URL_RESEARCH_PROFILE,
            backend: "available" as const,
            paidModelCalls: 0 as const,
            execution: ZERO_URL_RESEARCH_MODE,
            limits: ZERO_URL_RESEARCH_LIMITS,
          };
    },
    async submit(input: unknown) {
      const parsed = zeroUrlResearchExecutionSubmitSchema.parse(input);
      await authorizeZeroComponent(deps, principal);
      const binding = await bindingFor(deps, principal),
        task = binding.tasks.find((item) => item.taskId === parsed.taskId);
      if (
        !task ||
        ("profile" in parsed ? parsed.profile : ZERO_URL_RESEARCH_PROFILE) !== binding.profile
      )
        throw new IsolationError();
      const execution =
        binding.profile === ZERO_URL_DOCUMENT_PROFILE
          ? {
              kind: "zero.research.document.request.v1" as const,
              profile: ZERO_URL_DOCUMENT_PROFILE,
            }
          : {
              kind: "zero.research.request.v1" as const,
              profile: ZERO_URL_RESEARCH_PROFILE,
            };
      const body = {
        ...execution,
        principal,
        fileId: task.taskId,
        sourceId: task.sourceId,
        url: task.url,
        ...(task.expectedSha256 ? { expectedSha256: task.expectedSha256 } : {}),
        registrySha256: registryHash(binding),
        imageId: binding.runtime.imageId,
        buildInputLockSha256: binding.runtime.buildInputLockSha256,
        deadline: parsed.deadline,
        ...(binding.profile === ZERO_URL_DOCUMENT_PROFILE
          ? {
              resourceProfile: binding.resourceProfile,
              runnerSha256: binding.runtime.runnerSha256,
            }
          : {}),
      };
      const request = zeroUrlResearchRequestSchema.parse({
        ...body,
        requestDigest: zeroComponentDigest(body),
      });
      const header = { fileId: task.taskId, inputSha256: body.registrySha256 };
      return submitZeroComponent(
        {
          ...deps,
          authorize: async (owner) => {
            await bindingFor(deps, owner, header);
          },
        },
        family,
        principal,
        request,
        parsed.idempotencyKey,
        { inputSha256: body.registrySha256 },
      );
    },
    async get(id: string) {
      return (await reader(id)).get(id);
    },
    async cancel(id: string) {
      return (await reader(id)).cancel(id);
    },
    async artifact(id: string) {
      return (await reader(id)).artifact(id);
    },
  };
}
const sourceMetadata = z
  .object({
    jobId: z.string().uuid(),
    taskId: z.string(),
    sourceId: z.string(),
    url: z.string(),
    registrySha256: z.string(),
    fetchedAt: z.string().datetime({ offset: true }),
    fetchElapsedMs: z.number().int().nonnegative(),
    contentType: z.string().max(128),
  })
  .strict();
async function sourceFor(
  deps: ZeroUrlResearchDependencies,
  id: string,
  request: ZeroUrlResearchRequest,
  recheck: () => Promise<void>,
  signal: AbortSignal,
) {
  const context: AdapterContext = {
    ...zeroComponentContext(request.principal, id, family),
    signal,
  };
  const nonce = "zero.research.source:" + id;
  const identity = {
    spaceId_userId_clientNonce: {
      spaceId: request.principal.spaceId,
      userId: request.principal.userId,
      clientNonce: nonce,
    },
  };
  const load = async () => {
    const row = await deps.prisma.artifact.findUnique({ where: identity });
    await recheck();
    if (!row) return undefined;
    const meta = sourceMetadata.parse(JSON.parse(row.description ?? "null"));
    if (
      row.name !== "zero-research-source.html" ||
      row.version !== 1 ||
      row.rootArtifactId !== null ||
      row.spaceId !== request.principal.spaceId ||
      row.userId !== request.principal.userId ||
      row.mimeType !== "text/html" ||
      row.size < 1 ||
      row.size > ZERO_URL_RESEARCH_LIMITS.sourceBytes ||
      meta.jobId !== id ||
      meta.taskId !== request.fileId ||
      meta.sourceId !== request.sourceId ||
      meta.url !== request.url ||
      meta.registrySha256 !== request.registrySha256
    )
      throw new IsolationError();
    const bytes = await deps.artifacts.get(row.storageKey, context);
    await recheck();
    if (
      bytes.byteLength !== row.size ||
      zeroComponentHash(bytes) !== row.hash ||
      (request.expectedSha256 && request.expectedSha256 !== row.hash)
    )
      throw new Error("research_source_integrity_failed");
    return {
      bytes,
      source: {
        artifactId: row.id,
        url: meta.url,
        sourceId: meta.sourceId,
        sha256: row.hash,
        bytes: row.size,
        contentType: meta.contentType,
        fetchedAt: meta.fetchedAt,
        fetchElapsedMs: meta.fetchElapsedMs,
      },
    };
  };
  const previous = await load();
  if (previous) return previous;
  await recheck();
  const began = Date.now();
  let fetched: Awaited<ReturnType<typeof fetchSafeWebBytes>>;
  try {
    fetched = await fetchSafeWebBytes(request.url, {
      timeoutMs: ZERO_URL_RESEARCH_LIMITS.fetchMs,
      maxBytes: ZERO_URL_RESEARCH_LIMITS.sourceBytes,
      maxRedirects: 0,
      allowedPorts: [443],
      signal,
      ...(deps.testOnlyTransport
        ? {
            fetch: deps.testOnlyTransport.fetch,
            resolveHostname: deps.testOnlyTransport.resolveHostname,
          }
        : {}),
    });
  } catch {
    throw new Error(signal.aborted ? "research_fetch_cancelled" : "research_source_fetch_rejected");
  }
  await recheck();
  signal.throwIfAborted();
  if (
    fetched.url !== request.url ||
    !/^text\/html(?:\s*;|$)/iu.test(fetched.contentType ?? "") ||
    fetched.body.byteLength < 1 ||
    fetched.body.byteLength > ZERO_URL_RESEARCH_LIMITS.sourceBytes ||
    (request.expectedSha256 && zeroComponentHash(fetched.body) !== request.expectedSha256)
  )
    throw new Error("research_source_rejected");
  // The fixed renderer accepts UTF-8 HTML only; preserve exact fetched bytes separately.
  new TextDecoder("utf-8", { fatal: true }).decode(fetched.body);
  const metadata = sourceMetadata.parse({
    jobId: id,
    taskId: request.fileId,
    sourceId: request.sourceId,
    url: request.url,
    registrySha256: request.registrySha256,
    fetchedAt: new Date().toISOString(),
    fetchElapsedMs: Date.now() - began,
    contentType: fetched.contentType,
  });
  const stored = await deps.artifacts.put(
    { name: "zero-research-source.html", mimeType: "text/html", bytes: fetched.body },
    context,
  );
  let committed = false;
  try {
    await recheck();
    await deps.prisma.artifact.create({
      data: {
        id: randomUUID(),
        spaceId: request.principal.spaceId,
        userId: request.principal.userId,
        name: "zero-research-source.html",
        description: JSON.stringify(metadata),
        mimeType: "text/html",
        size: fetched.body.byteLength,
        hash: zeroComponentHash(fetched.body),
        storageKey: stored.id,
        version: 1,
        clientNonce: nonce,
      },
    });
    committed = true;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
      throw error;
  } finally {
    if (!committed) await deps.artifacts.remove(stored.id, context).catch(() => undefined);
  }
  return (await load())!;
}
/** Same PostgreSQL/Graphile lifecycle; no additional scheduler or browser runtime. */
export async function runZeroUrlResearch(
  deps: Omit<ZeroUrlResearchDependencies, "jobs" | "authorize"> & {
    authorize?: ZeroComponentDependencies["authorize"];
  },
  id: string,
) {
  const cached = await loadZeroComponentHeader(deps, family, id);
  let header: ZeroComponentHeader = cached.header;
  if (await findZeroComponentReceipt(deps.prisma, family, header, id)) return;
  if (!deps.authorize) {
    await publishZeroComponent(deps, family, id, header, "blocked", {
      reason: "project_authorizer_unavailable",
    });
    return;
  }
  const configured = { ...deps, authorize: deps.authorize } as ZeroUrlResearchDependencies;
  const guarded = {
    ...configured,
    authorize: async (principal: ZeroComponentPrincipal) => {
      await bindingFor(configured, principal, header);
    },
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    const started = await zeroComponentDatabaseNow(deps.prisma),
      startedAt = new Date(started).toISOString();
    const loaded = await loadZeroComponentRequest(
      guarded,
      family,
      id,
      header.principal,
      decode,
      cached,
    );
    const request = loaded.request;
    header = { ...request, inputSha256: request.registrySha256 };
    const recheck = () => assertZeroComponentActive(guarded, family, id, header, startedAt);
    await recheck();
    const binding = await bindingFor(configured, request.principal, header);
    const selected = binding.tasks.find((task) => task.taskId === request.fileId);
    if (
      !selected ||
      selected.url !== request.url ||
      selected.sourceId !== request.sourceId ||
      selected.expectedSha256 !== request.expectedSha256 ||
      binding.runtime.imageId !== request.imageId ||
      binding.runtime.buildInputLockSha256 !== request.buildInputLockSha256
    )
      throw new IsolationError();
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(
        Math.max(
          1,
          Math.min(
            ZERO_URL_RESEARCH_LIMITS.runtimeMs,
            Date.parse(request.deadline) - Date.now(),
            Date.parse(request.principal.expiresAt) - Date.now(),
          ),
        ),
      ),
    ]);
    let polling = false,
      pollError: unknown;
    timer = setInterval(() => {
      if (polling) return;
      polling = true;
      void recheck()
        .catch((error) => {
          pollError = error;
          controller.abort();
        })
        .finally(() => {
          polling = false;
        });
    }, 200);
    if (process.platform !== "linux" || !process.getuid || process.getuid() === 0)
      throw new Error("research_runtime_unsupported");
    const input = await sourceFor(guarded, id, request, recheck, signal);
    if (request.kind === "zero.research.document.request.v1") {
      if (
        binding.profile !== ZERO_URL_DOCUMENT_PROFILE ||
        binding.runtime.runnerSha256 !== request.runnerSha256 ||
        binding.resourceProfile !== request.resourceProfile
      )
        throw new IsolationError();
      const result = await executeZeroUrlDocument(
        {
          dockerExecutable: binding.runtime.dockerExecutable,
          dockerConfigDirectory: binding.runtime.dockerConfigDirectory,
          imageId: request.imageId,
          buildInputLockSha256: request.buildInputLockSha256,
          runnerDirectory: binding.runtime.runnerDirectory,
          runnerSha256: request.runnerSha256,
          authorize: async (active) => {
            active.throwIfAborted();
            await recheck();
            active.throwIfAborted();
          },
        },
        {
          source: {
            url: input.source.url,
            sha256: input.source.sha256,
            bytes: input.source.bytes,
          },
          contentBase64: Buffer.from(input.bytes).toString("base64"),
        },
        signal,
      );
      if (pollError) throw pollError;
      await recheck();
      if (result.state !== "succeeded") {
        await publishZeroComponent(
          guarded,
          family,
          id,
          header,
          result.state === "unknown" ? "blocked" : "failed",
          {
            reason: result.code,
            ...(result.state === "unknown"
              ? { cleanup: { state: "unknown", quarantineId: result.quarantineId } }
              : {}),
          },
        );
        return;
      }
      await publishZeroComponent(guarded, family, id, header, "succeeded", {
        startedAt,
        mode: ZERO_URL_DOCUMENT_MODE,
        resourceProfile: request.resourceProfile,
        taskId: request.fileId,
        registrySha256: request.registrySha256,
        source: input.source,
        sourceCapture: {
          kind: deps.testOnlyTransport ? "synthetic_fixture_transport" : "bounded_https_fetch",
        },
        sourceContent: {
          encoding: "base64",
          contentBase64: Buffer.from(input.bytes).toString("base64"),
        },
        imageId: request.imageId,
        buildInputLockSha256: request.buildInputLockSha256,
        runnerSha256: request.runnerSha256,
        cleanup: result.cleanup,
        extraction: result.output,
        elapsedMs: Date.now() - started,
        limitations: [
          "Original-URL captured-response replay; Chromium does not perform live TLS fetch or interactive browsing",
          "Scripts and external resources are disabled; no original-page fidelity",
          "First visible paragraph is an observed source quote; task truth grading is separate",
          "Execution success does not establish frozen acceptance, native host support or G2",
          "Private source snapshots and receipts require operator-managed retention",
        ],
      });
      return;
    }
    if (binding.profile !== ZERO_URL_RESEARCH_PROFILE) throw new IsolationError();
    const body = zeroBrowserRequestSchema.parse({
      kind: "zero.browser.request.v1",
      profile: ZERO_BROWSER_STATIC_PROFILE,
      principal: request.principal,
      fileId: request.fileId,
      source: {
        artifactId: input.source.artifactId,
        sha256: input.source.sha256,
        bytes: input.source.bytes,
      },
      imageId: request.imageId,
      buildInputLockSha256: request.buildInputLockSha256,
      deadline: request.deadline,
    });
    await recheck();
    const result = await executeZeroBrowser(
      { ...binding.runtime, beforeDispatch: recheck },
      {
        request: body,
        requestDigest: zeroComponentDigest(body),
        bytes: input.bytes,
      },
      signal,
    );
    if (pollError) throw pollError;
    await recheck();
    if (result.state !== "succeeded") {
      await publishZeroComponent(
        guarded,
        family,
        id,
        header,
        result.state === "unknown" ? "blocked" : "failed",
        {
          reason: result.code,
          ...(result.state === "unknown"
            ? { cleanup: { state: "unknown", quarantineId: result.quarantineId } }
            : {}),
        },
      );
      return;
    }
    await publishZeroComponent(guarded, family, id, header, "succeeded", {
      startedAt,
      mode: ZERO_URL_RESEARCH_MODE,
      taskId: request.fileId,
      registrySha256: request.registrySha256,
      source: input.source,
      sourceContent: {
        encoding: "base64",
        contentBase64: Buffer.from(input.bytes).toString("base64"),
      },
      imageId: request.imageId,
      buildInputLockSha256: request.buildInputLockSha256,
      extraction: result.output,
      elapsedMs: Date.now() - started,
      limitations: [
        "HTTPS fetched source; Chromium rendered an inert snapshot, not the original URL or live site",
        "No original-page fidelity, page JavaScript, credentials, redirects or arbitrary browser actions",
        "Bounded development capability; frozen30 URL-navigation tasks and G2 remain unqualified",
        "Immutable source snapshots and receipts require operator-managed retention",
      ],
    });
  } catch (error) {
    if (error instanceof z.ZodError) error = new Error("research_registry_or_source_rejected");
    if (error instanceof TypeError) error = new Error("research_source_rejected");
    if (
      !(error instanceof IsolationError) &&
      !(
        error instanceof Error &&
        /^(research_|component_|job_|request_|invalid_job_deadline|artifact_limit_exceeded)/u.test(
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
      error instanceof IsolationError ? "blocked" : "failed",
      {
        reason:
          error instanceof IsolationError ? "project_scope_rejected" : (error as Error).message,
      },
    );
  } finally {
    if (timer) clearInterval(timer);
  }
}
