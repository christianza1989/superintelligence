import { isZeroPrivateArtifact } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { IsolationError, Prisma } from "@rakazo/db";
import { z } from "zod";
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
  zeroComponentPrincipalSchema,
} from "./zero-component-jobs.js";
import {
  ZERO_CSV_APPLICATION_LIMITS,
  ZERO_CSV_APPLICATION_PROFILE,
  zeroCsvApplicationSubmitSchema,
} from "./zero-csv-application-contract.js";
import type {
  ZeroCsvApplicationBinding,
  ZeroCsvApplicationRequest,
} from "./zero-csv-application-service-contract.js";
import {
  zeroCsvApplicationBindingSchema,
  zeroCsvApplicationRequestSchema,
} from "./zero-csv-application-service-contract.js";
import { createZeroCsvApplicationWorkspace } from "./zero-csv-application.js";
import { verifyZeroCsvApplication } from "./zero-csv-application-verifier.js";
import { prepareZeroCsvComponent, validateZeroCsv } from "./zero-csv-profile.js";

export type ZeroCsvApplicationResolve = (
  principal: ZeroComponentPrincipal,
) => Promise<ZeroCsvApplicationBinding | undefined>;
type Dependencies = ZeroComponentDependencies & { resolveApplication?: ZeroCsvApplicationResolve };
type Database = Pick<PrismaClient, "artifact" | "spaceMember" | "$queryRaw">;
type WorkerDependencies = Omit<Dependencies, "jobs" | "authorize"> & {
  authorize?: Dependencies["authorize"];
};
const family = "application" as const;
const workspaceName = "zero-application-workspace.json";
const workspaceCap = ZERO_CSV_APPLICATION_LIMITS.workspaceBytes * 2 + 16_384;
const bindingHash = (binding: ZeroCsvApplicationBinding) =>
  zeroComponentHash(JSON.stringify(binding));
async function bindingFor(
  deps: Pick<Dependencies, "authorize" | "resolveApplication">,
  principal: ZeroComponentPrincipal,
  expectedHash?: string,
) {
  await deps.authorize(principal);
  const configured = await deps.resolveApplication?.(principal);
  if (!configured) throw new Error("component_profile_unavailable");
  const binding = zeroCsvApplicationBindingSchema.parse(configured);
  await deps.authorize(principal);
  if (expectedHash && bindingHash(binding) !== expectedHash) throw new IsolationError();
  return binding;
}
function decode(value: unknown, header: ZeroComponentHeader): ZeroCsvApplicationRequest {
  const request = zeroCsvApplicationRequestSchema.parse(value);
  if (
    request.fileId !== request.source.artifactId ||
    request.fileId !== header.fileId ||
    request.source.sha256 !== header.inputSha256 ||
    !header.bindingSha256 ||
    request.bindingSha256 !== header.bindingSha256
  )
    throw new IsolationError();
  return request;
}
async function loadInput(
  deps: Pick<Dependencies, "prisma" | "artifacts">,
  principal: ZeroComponentPrincipal,
  artifactId: string,
  expectedHash: string,
  recheck: () => Promise<void>,
) {
  await recheck();
  const row = await deps.prisma.artifact.findFirst({
    where: { id: artifactId, spaceId: principal.spaceId, userId: principal.userId },
  });
  await recheck();
  if (
    !row ||
    row.spaceId !== principal.spaceId ||
    row.userId !== principal.userId ||
    isZeroPrivateArtifact(row) ||
    !["text/csv", "text/plain"].includes(row.mimeType) ||
    row.hash !== expectedHash ||
    row.size < 1 ||
    row.size > ZERO_CSV_APPLICATION_LIMITS.inputBytes
  )
    throw new IsolationError();
  const bytes = await deps.artifacts.get(
    row.storageKey,
    zeroComponentContext(principal, artifactId, family),
  );
  await recheck();
  if (bytes.byteLength !== row.size || zeroComponentHash(bytes) !== expectedHash)
    throw new Error("component_input_integrity_failed");
  let csv: string;
  try {
    csv = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // The fixed profile binds original UTF-8 bytes; decoding must not silently remove a BOM.
    if (zeroComponentHash(Buffer.from(csv)) !== expectedHash)
      throw new Error("component_input_integrity_failed");
    validateZeroCsv(csv);
  } catch {
    throw new Error("component_input_integrity_failed");
  }
  return { csv, source: { artifactId: row.id, sha256: expectedHash, bytes: row.size } };
}
export function createZeroCsvApplicationService(
  deps: Dependencies,
  trustedPrincipal: ZeroComponentPrincipal,
) {
  const principal = zeroComponentPrincipalSchema.parse(trustedPrincipal);
  const ownedRequest = async (jobId: string) => {
    z.string().uuid().parse(jobId);
    await authorizeZeroComponent(deps, principal);
    const cached = await loadZeroComponentHeader(deps, family, jobId, principal);
    if (!cached.header.bindingSha256) throw new IsolationError();
    const guard = async (owner: ZeroComponentPrincipal) => {
      await bindingFor(deps, owner, cached.header.bindingSha256);
    };
    await guard(principal);
    const guarded = { ...deps, authorize: guard };
    const loaded = await loadZeroComponentRequest(
      guarded,
      family,
      jobId,
      principal,
      decode,
      cached,
    );
    return {
      guarded,
      request: loaded.request,
      reader: createZeroComponentReader(guarded, family, principal, decode),
    };
  };
  return {
    async available() {
      await authorizeZeroComponent(deps, principal);
      await bindingFor(deps, principal);
      return true;
    },
    async submit(value: unknown) {
      const parsed = zeroCsvApplicationSubmitSchema.parse(value);
      await authorizeZeroComponent(deps, principal);
      const binding = await bindingFor(deps, principal);
      const expectedBinding = bindingHash(binding);
      const recheck = async () => {
        await authorizeZeroComponent(
          {
            ...deps,
            authorize: async (owner) => {
              await bindingFor(deps, owner, expectedBinding);
            },
          },
          principal,
        );
        const now = await zeroComponentDatabaseNow(deps.prisma),
          deadline = Date.parse(parsed.deadline);
        if (
          deadline <= now ||
          deadline - now > 600_000 ||
          deadline > Date.parse(principal.expiresAt)
        )
          throw new Error("invalid_job_deadline");
      };
      const input = await loadInput(
        deps,
        principal,
        parsed.inputArtifactId,
        parsed.expectedInputSha256,
        recheck,
      );
      const body = {
        kind: "zero.application.request.v1" as const,
        profile: ZERO_CSV_APPLICATION_PROFILE,
        recipe: parsed.recipe,
        principal,
        fileId: parsed.inputArtifactId,
        source: input.source,
        bindingSha256: expectedBinding,
        imageId: binding.runtime.imageId,
        buildInputLockSha256: binding.runtime.buildInputLockSha256,
        deadline: parsed.deadline,
      };
      const request = zeroCsvApplicationRequestSchema.parse({
        ...body,
        requestDigest: zeroComponentDigest(body),
      });
      await recheck();
      return submitZeroComponent(
        {
          ...deps,
          authorize: async (owner) => {
            await bindingFor(deps, owner, expectedBinding);
          },
        },
        family,
        principal,
        request,
        parsed.idempotencyKey,
        { inputSha256: input.source.sha256 },
      );
    },
    async get(id: string) {
      return (await ownedRequest(id)).reader.get(id);
    },
    async cancel(id: string) {
      return (await ownedRequest(id)).reader.cancel(id);
    },
    async artifact(id: string) {
      return (await ownedRequest(id)).reader.artifact(id);
    },
    async workspace(id: string) {
      const { guarded, request } = await ownedRequest(id);
      await authorizeZeroComponent(guarded, principal);
      const row = await deps.prisma.artifact.findUnique({
        where: {
          spaceId_userId_clientNonce: {
            spaceId: principal.spaceId,
            userId: principal.userId,
            clientNonce: "zero.application.workspace:" + id,
          },
        },
      });
      await authorizeZeroComponent(guarded, principal);
      if (
        !row ||
        row.name !== workspaceName ||
        row.rootArtifactId !== id ||
        row.version !== 3 ||
        row.mimeType !== "application/json" ||
        row.size < 1 ||
        row.size > workspaceCap ||
        row.spaceId !== principal.spaceId ||
        row.userId !== principal.userId
      )
        throw new IsolationError();
      const bytes = await deps.artifacts.get(
        row.storageKey,
        zeroComponentContext(principal, id, family),
      );
      await authorizeZeroComponent(guarded, principal);
      if (bytes.byteLength !== row.size || zeroComponentHash(bytes) !== row.hash)
        throw new Error("application_workspace_integrity_failed");
      const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const saved = JSON.parse(content);
      if (
        saved.kind !== "zero.application.workspace.v1" ||
        saved.jobId !== id ||
        saved.requestDigest !== request.requestDigest ||
        saved.inputSha256 !== request.source.sha256
      )
        throw new IsolationError();
      return { artifactId: row.id, revision: row.version, sha256: row.hash, content };
    },
  };
}
async function retainWorkspace(
  deps: Pick<Dependencies, "prisma" | "artifacts" | "authorize">,
  id: string,
  request: ZeroCsvApplicationRequest,
  workspace: ReturnType<typeof createZeroCsvApplicationWorkspace>,
  recheck: (prisma?: Database) => Promise<void>,
) {
  const content = JSON.stringify({
    kind: "zero.application.workspace.v1",
    profile: request.profile,
    jobId: id,
    requestDigest: request.requestDigest,
    inputSha256: request.source.sha256,
    workspace,
  });
  const bytes = Buffer.from(content);
  if (bytes.length > workspaceCap) throw new Error("artifact_limit_exceeded");
  const nonce = "zero.application.workspace:" + id;
  await recheck();
  const stored = await deps.artifacts.put(
    { name: workspaceName, mimeType: "application/json", bytes },
    zeroComponentContext(request.principal, id, family),
  );
  let referenced = false;
  let existingReference = false;
  try {
    await recheck();
    const row = await deps.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql(["SELECT id FROM artifacts WHERE id = ", " FOR UPDATE"], id));
      await recheck(tx);
      const existing = await tx.artifact.findUnique({
        where: {
          spaceId_userId_clientNonce: {
            spaceId: request.principal.spaceId,
            userId: request.principal.userId,
            clientNonce: nonce,
          },
        },
      });
      if (existing) {
        if (
          existing.hash !== zeroComponentHash(bytes) ||
          existing.name !== workspaceName ||
          existing.rootArtifactId !== id ||
          existing.version !== 3 ||
          existing.mimeType !== "application/json" ||
          existing.size !== bytes.length ||
          existing.spaceId !== request.principal.spaceId ||
          existing.userId !== request.principal.userId
        )
          throw new IsolationError();
        existingReference = existing.storageKey === stored.id;
        return existing;
      }
      const created = await tx.artifact.create({
        data: {
          spaceId: request.principal.spaceId,
          userId: request.principal.userId,
          name: workspaceName,
          mimeType: "application/json",
          size: bytes.length,
          hash: zeroComponentHash(bytes),
          storageKey: stored.id,
          rootArtifactId: id,
          version: 3,
          clientNonce: nonce,
          description: JSON.stringify({
            requestDigest: request.requestDigest,
            workspaceManifestSha256: workspace.manifestSha256,
          }),
        },
      });
      return created;
    });
    referenced = row.storageKey === stored.id;
    await recheck();
    return {
      artifactId: row.id,
      revision: row.version,
      sha256: row.hash,
      manifestSha256: workspace.manifestSha256,
    };
  } finally {
    if (!referenced && !existingReference)
      await deps.artifacts
        .remove(stored.id, zeroComponentContext(request.principal, id, family))
        .catch(() => undefined);
  }
}
export async function runZeroCsvApplication(deps: WorkerDependencies, id: string) {
  const cached = await loadZeroComponentHeader(deps, family, id);
  let header = cached.header;
  if (await findZeroComponentReceipt(deps.prisma, family, header, id)) return;
  if (!deps.authorize) {
    await publishZeroComponent(deps, family, id, header, "blocked", {
      reason: "project_authorizer_unavailable",
    });
    return;
  }
  if (!header.bindingSha256) throw new IsolationError();
  const configured = { ...deps, authorize: deps.authorize };
  const guarded = {
    ...configured,
    authorize: async (owner: ZeroComponentPrincipal) => {
      await bindingFor(configured, owner, header.bindingSha256);
    },
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  let workspaceReference: Awaited<ReturnType<typeof retainWorkspace>> | undefined;
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
    header = { ...request, inputSha256: request.source.sha256 };
    const recheck = (prisma: Database = deps.prisma) =>
      assertZeroComponentActive({ ...guarded, prisma }, family, id, header, startedAt);
    await recheck();
    const binding = await bindingFor(configured, request.principal, request.bindingSha256);
    if (
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
            ZERO_CSV_APPLICATION_LIMITS.runtimeMs,
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
    const input = await loadInput(
      deps,
      request.principal,
      request.source.artifactId,
      request.source.sha256,
      recheck,
    );
    if (input.source.bytes !== request.source.bytes)
      throw new Error("component_input_integrity_failed");
    const workspace = createZeroCsvApplicationWorkspace(
      input.csv,
      await prepareZeroCsvComponent(),
      binding.runtime.attribution,
    );
    await recheck();
    workspaceReference = await retainWorkspace(guarded, id, request, workspace, recheck);
    const verification = await verifyZeroCsvApplication(
      { ...binding.runtime, beforeDispatch: () => recheck() },
      { csv: input.csv, workspace },
      signal,
    );
    if (pollError) throw pollError;
    await recheck();
    await publishZeroComponent(
      guarded,
      family,
      id,
      header,
      verification.outcome === "pass"
        ? "succeeded"
        : verification.outcome === "unknown"
          ? "blocked"
          : "failed",
      {
        startedAt,
        source: request.source,
        workspace: workspaceReference,
        verification,
        elapsedMs: Date.now() - started,
        limitations: [
          "Fixed CSV expense application development profile; no general coding or G2 acceptance",
          "Workspace and failed evidence are retained; operators own retention",
          "Preview source is a scoped JSON handoff only; product embedding and parent-mediated exact CSV download remain separate",
        ],
      },
    );
  } catch (error) {
    const known =
      error instanceof IsolationError ||
      error instanceof z.ZodError ||
      (error instanceof Error &&
        /^(application_|component_|job_|request_|invalid_job_deadline|artifact_limit_exceeded)/u.test(
          error.message,
        ));
    if (!known) throw error;
    await publishZeroComponent(
      deps,
      family,
      id,
      header,
      error instanceof IsolationError ? "blocked" : "failed",
      {
        reason:
          error instanceof IsolationError
            ? "project_scope_rejected"
            : error instanceof z.ZodError
              ? "application_request_rejected"
              : (error as Error).message,
        ...(workspaceReference ? { workspace: workspaceReference } : {}),
      },
    );
  } finally {
    if (timer) clearInterval(timer);
  }
}
