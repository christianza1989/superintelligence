import { createHash, randomUUID } from "node:crypto";
import type { AdapterContext, ArtifactStore, JobPublisher } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { IsolationError, Prisma } from "@rakazo/db";
import { z } from "zod";
import { ZERO_CSV_LIMITS, ZERO_CSV_PROFILE } from "./zero-csv-profile.js";
import { ZERO_CSV_PROJECT_LIMITS } from "./zero-csv-project-verifier.js";
import { ZERO_PDF_LIMITS, ZERO_PDF_PROFILE } from "./zero-pdf-contract.js";

// Closed execution policy, not a plugin registry or a second scheduler.
const policies = Object.freeze({
  csv: Object.freeze({
    requestName: "zero-csv-request.json",
    receiptName: "zero-csv-receipt.json",
    receiptKind: "zero.csv.receipt.v1",
    legacyNoncePrefix: "zero.csv",
    requestBytes: ZERO_CSV_LIMITS.inputBytes * 2 + 4096,
    artifactBytes: ZERO_CSV_LIMITS.artifactBytes,
    requestKinds: Object.freeze({
      "zero.csv.request.v1": Object.freeze({
        profile: ZERO_CSV_PROFILE,
        jobName: "zero.csv.prepare",
        runtimeMs: ZERO_CSV_LIMITS.runtimeMs,
      }),
      "zero.csv.verify.request.v1": Object.freeze({
        profile: "zero-csv-project-v1",
        jobName: "zero.csv.verify",
        runtimeMs: ZERO_CSV_PROJECT_LIMITS.wallMs + 5000,
      }),
    }),
  }),
  application: Object.freeze({
    requestName: "zero-application-request.json",
    receiptName: "zero-application-receipt.json",
    receiptKind: "zero.application.receipt.v1",
    legacyNoncePrefix: "zero.application",
    requestBytes: 8192,
    artifactBytes: 2_097_152,
    requestKinds: Object.freeze({
      "zero.application.request.v1": Object.freeze({
        profile: "zero-csv-expense-application-v1",
        jobName: "zero.application.create",
        runtimeMs: 30_000,
      }),
    }),
  }),
  research: Object.freeze({
    requestName: "zero-research-request.json",
    receiptName: "zero-research-receipt.json",
    receiptKind: "zero.research.receipt.v1",
    legacyNoncePrefix: "zero.research",
    requestBytes: 8192,
    artifactBytes: 2_097_152,
    requestKinds: Object.freeze({
      "zero.research.request.v1": Object.freeze({
        profile: "zero-url-research-v1",
        jobName: "zero.research.extract",
        runtimeMs: 30_000,
      }),
    }),
  }),
  browser: Object.freeze({
    requestName: "zero-browser-request.json",
    receiptName: "zero-browser-receipt.json",
    receiptKind: "zero.browser.receipt.v1",
    legacyNoncePrefix: "zero.browser",
    requestBytes: 8192,
    artifactBytes: 2_097_152,
    requestKinds: Object.freeze({
      "zero.browser.request.v1": Object.freeze({
        profile: "zero-browser-static-v1",
        jobName: "zero.browser.extract",
        runtimeMs: 20_000,
      }),
    }),
  }),
  pdf: Object.freeze({
    requestName: "zero-pdf-request.json",
    receiptName: "zero-pdf-receipt.json",
    receiptKind: "zero.pdf.receipt.v1",
    legacyNoncePrefix: "zero.pdf",
    requestBytes: 8192,
    artifactBytes: ZERO_PDF_LIMITS.outputBytes + 16_384,
    requestKinds: Object.freeze({
      "zero.pdf.request.v1": Object.freeze({
        profile: ZERO_PDF_PROFILE,
        jobName: "zero.pdf.extract",
        runtimeMs: ZERO_PDF_LIMITS.runtimeMs,
      }),
    }),
  }),
});
export type ZeroComponentFamily = keyof typeof policies;
export const zeroComponentPrincipalSchema = z
  .object({
    spaceId: z.string().min(1).max(128),
    userId: z.string().min(1).max(128),
    scopeId: z.string().min(1).max(128),
    policyRevision: z.string().min(1).max(128),
    expiresAt: z
      .string()
      .datetime({ offset: true })
      .refine((value) => Number.isFinite(Date.parse(value))),
  })
  .strict();
export type ZeroComponentPrincipal = z.infer<typeof zeroComponentPrincipalSchema>;
export type ZeroComponentAuthorize = (principal: ZeroComponentPrincipal) => Promise<void>;
export interface ZeroComponentDependencies {
  prisma: PrismaClient;
  artifacts: ArtifactStore;
  jobs: JobPublisher;
  authorize: ZeroComponentAuthorize;
}
export interface ZeroComponentHeader {
  principal: ZeroComponentPrincipal;
  kind: string;
  profile: string;
  requestDigest: string;
  deadline?: string;
  inputSha256?: string | null;
  fileId?: string;
  bindingSha256?: string;
}
export type ZeroComponentState = "succeeded" | "failed" | "blocked" | "cancelled";
type StorageDependencies = Pick<ZeroComponentDependencies, "prisma" | "artifacts"> & {
  authorize?: ZeroComponentAuthorize;
};
type Database = Pick<PrismaClient, "artifact" | "spaceMember" | "$queryRaw">;
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const zeroComponentHash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export const zeroComponentDigest = (value: Record<string, unknown>) =>
  zeroComponentHash(JSON.stringify(value));
function execution(
  family: ZeroComponentFamily,
  request: Pick<ZeroComponentHeader, "kind" | "profile">,
) {
  const found = Object.entries(policies[family].requestKinds).find(
    ([kind]) => kind === request.kind,
  )?.[1];
  if (!found || found.profile !== request.profile) throw new IsolationError();
  return found;
}
export const zeroComponentRuntimeMs = (family: ZeroComponentFamily, request: ZeroComponentHeader) =>
  execution(family, request).runtimeMs;
export const zeroComponentJobKey = (
  family: ZeroComponentFamily,
  id: string,
  request: ZeroComponentHeader,
) => `${execution(family, request).jobName}:${id}`;
const receiptNonce = (family: ZeroComponentFamily, id: string) =>
  `${policies[family].legacyNoncePrefix}.receipt:${id}`;
const scopePrefix = (family: ZeroComponentFamily, principal: ZeroComponentPrincipal) =>
  `${policies[family].legacyNoncePrefix}.request:${zeroComponentHash(JSON.stringify([principal.userId, principal.scopeId]))}:`;
export const zeroComponentContext = (
  principal: ZeroComponentPrincipal,
  id: string,
  family: ZeroComponentFamily = "csv",
): AdapterContext => ({
  ...principal,
  operationId: id,
  traceId: id,
  signal: AbortSignal.timeout(
    family === "csv"
      ? ZERO_CSV_LIMITS.runtimeMs
      : family === "pdf" || family === "research" || family === "application"
        ? ZERO_PDF_LIMITS.runtimeMs
        : 20_000,
  ),
});

export async function authorizeZeroComponent(
  deps: { prisma: Pick<PrismaClient, "spaceMember">; authorize?: ZeroComponentAuthorize },
  principal: ZeroComponentPrincipal,
) {
  zeroComponentPrincipalSchema.parse(principal);
  if (!deps.authorize || Date.parse(principal.expiresAt) <= Date.now()) throw new IsolationError();
  await deps.authorize(principal);
  if (
    !(await deps.prisma.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId: principal.spaceId, userId: principal.userId } },
      select: { id: true },
    }))
  )
    throw new IsolationError();
}
export async function zeroComponentDatabaseNow(prisma: Pick<PrismaClient, "$queryRaw">) {
  const rows = await prisma.$queryRaw<Array<{ now: Date }>>(
    Prisma.sql`SELECT clock_timestamp() AS now`,
  );
  const now = rows[0]?.now instanceof Date ? rows[0].now.getTime() : NaN;
  if (!Number.isFinite(now)) throw new Error("job_clock_unavailable");
  return now;
}
/** Worker derives the owner here. Public services always supply a trusted principal. */
export async function loadZeroComponentHeader(
  deps: Pick<StorageDependencies, "prisma">,
  family: ZeroComponentFamily,
  id: string,
  principal?: ZeroComponentPrincipal,
) {
  const policy = policies[family];
  const row = await deps.prisma.artifact.findFirst({
    where: {
      id,
      name: policy.requestName,
      ...(principal ? { spaceId: principal.spaceId, userId: principal.userId } : {}),
    },
  });
  if (
    row?.version !== 1 ||
    row.mimeType !== "application/json" ||
    row.size < 1 ||
    row.size > policy.requestBytes
  )
    throw new IsolationError();
  const metadata = JSON.parse(row.description ?? "null");
  const owner = zeroComponentPrincipalSchema.parse(metadata?.principal);
  if (
    principal &&
    (owner.spaceId !== principal.spaceId ||
      owner.userId !== principal.userId ||
      owner.scopeId !== principal.scopeId)
  )
    throw new IsolationError();
  if (row.spaceId !== owner.spaceId || row.userId !== owner.userId) throw new IsolationError();
  const kind = metadata.kind ?? (family === "csv" ? "zero.csv.request.v1" : undefined);
  const profile = Object.entries(policy.requestKinds).find(([key]) => key === kind)?.[1].profile;
  if (!profile) throw new IsolationError();
  if (family === "application" && !hashSchema.safeParse(metadata.bindingSha256).success)
    throw new IsolationError();
  const header: ZeroComponentHeader = {
    principal: owner,
    kind,
    profile,
    requestDigest: hashSchema.parse(metadata.requestDigest),
    ...(metadata.bindingSha256 !== undefined
      ? { bindingSha256: hashSchema.parse(metadata.bindingSha256) }
      : {}),
    ...(metadata.deadline
      ? {
          deadline: z
            .string()
            .datetime({ offset: true })
            .refine((value) => Number.isFinite(Date.parse(value)))
            .parse(metadata.deadline),
        }
      : {}),
    inputSha256: metadata.inputSha256 ? hashSchema.parse(metadata.inputSha256) : null,
    ...(metadata.fileId !== undefined
      ? {
          fileId: z
            .string()
            .min(1)
            .max(128)
            .regex(/^[A-Za-z0-9_-]+$/u)
            .parse(metadata.fileId),
        }
      : {}),
  };
  return { row, header };
}
export async function loadZeroComponentRequest<T extends ZeroComponentHeader>(
  deps: StorageDependencies,
  family: ZeroComponentFamily,
  id: string,
  principal: ZeroComponentPrincipal,
  decode: (value: unknown, header: ZeroComponentHeader) => T,
  cached?: Awaited<ReturnType<typeof loadZeroComponentHeader>>,
) {
  const { row, header } = cached ?? (await loadZeroComponentHeader(deps, family, id, principal));
  const owner = header.principal;
  // A cached header is not authority: bind it again before reading private storage.
  if (
    owner.spaceId !== principal.spaceId ||
    owner.userId !== principal.userId ||
    owner.scopeId !== principal.scopeId
  )
    throw new IsolationError();
  await authorizeZeroComponent(deps, principal);
  const bytes = await deps.artifacts.get(row.storageKey, zeroComponentContext(owner, id, family));
  await authorizeZeroComponent(deps, principal);
  if (bytes.byteLength !== row.size || zeroComponentHash(bytes) !== row.hash)
    throw new Error("request_artifact_integrity_failed");
  const request = decode(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    header,
  );
  const { requestDigest, ...body } = request;
  execution(family, request);
  if (
    zeroComponentDigest(body) !== requestDigest ||
    requestDigest !== header.requestDigest ||
    request.kind !== header.kind ||
    (header.deadline !== undefined && header.deadline !== request.deadline) ||
    JSON.stringify(owner) !== JSON.stringify(request.principal)
  )
    throw new Error("request_digest_mismatch");
  return { row, request };
}
export async function findZeroComponentReceipt(
  prisma: Pick<PrismaClient, "artifact">,
  family: ZeroComponentFamily,
  request: ZeroComponentHeader,
  id: string,
) {
  const policy = policies[family];
  const row = await prisma.artifact.findUnique({
    where: {
      spaceId_userId_clientNonce: {
        spaceId: request.principal.spaceId,
        userId: request.principal.userId,
        clientNonce: receiptNonce(family, id),
      },
    },
  });
  if (
    row &&
    (row.rootArtifactId !== id ||
      row.version !== 2 ||
      row.name !== policy.receiptName ||
      row.mimeType !== "application/json")
  )
    throw new Error("receipt_binding_mismatch");
  return row;
}
/** Recheck at dispatch, after storage put, and under the sole-terminal row lock. */
export async function assertZeroComponentActive(
  deps: { prisma: Database; authorize?: ZeroComponentAuthorize },
  family: ZeroComponentFamily,
  id: string,
  request: ZeroComponentHeader,
  startedAt?: string,
) {
  execution(family, request);
  await authorizeZeroComponent(deps, request.principal);
  const now = await zeroComponentDatabaseNow(deps.prisma);
  if (
    !request.deadline ||
    !Number.isFinite(Date.parse(request.deadline)) ||
    Date.parse(request.deadline) <= now ||
    Date.parse(request.principal.expiresAt) <= now
  )
    throw new Error("job_deadline_exceeded");
  if (
    startedAt !== undefined &&
    (!Number.isFinite(Date.parse(startedAt)) ||
      now - Date.parse(startedAt) >= zeroComponentRuntimeMs(family, request))
  )
    throw new Error("job_runtime_exceeded");
  if (await findZeroComponentReceipt(deps.prisma, family, request, id))
    throw new Error("job_already_terminal");
}
export async function publishZeroComponent(
  deps: StorageDependencies,
  family: ZeroComponentFamily,
  id: string,
  request: ZeroComponentHeader,
  state: ZeroComponentState,
  details: Record<string, unknown>,
  currentPrincipal?: ZeroComponentPrincipal,
) {
  const policy = policies[family];
  const bytes = Buffer.from(
    JSON.stringify({
      kind: policy.receiptKind,
      jobId: id,
      requestDigest: request.requestDigest,
      inputSha256: request.inputSha256 ?? null,
      profile: request.profile,
      state,
      ...details,
      paidModelCalls: 0,
      modelExecution: "none",
      finishedAt: new Date().toISOString(),
    }),
  );
  if (bytes.byteLength > policy.artifactBytes) throw new Error("artifact_limit_exceeded");
  const context = zeroComponentContext(request.principal, id, family);
  const stored = await deps.artifacts.put(
    { name: policy.receiptName, mimeType: "application/json", bytes },
    context,
  );
  let referenced = false;
  let existingReference = false;
  const cancellationGuard = async (prisma: Database) => {
    if (state !== "cancelled") return;
    if (
      !currentPrincipal ||
      currentPrincipal.spaceId !== request.principal.spaceId ||
      currentPrincipal.userId !== request.principal.userId ||
      currentPrincipal.scopeId !== request.principal.scopeId
    )
      throw new IsolationError();
    await authorizeZeroComponent({ prisma, authorize: deps.authorize }, currentPrincipal);
    if (Date.parse(currentPrincipal.expiresAt) <= (await zeroComponentDatabaseNow(prisma)))
      throw new IsolationError();
  };
  try {
    await cancellationGuard(deps.prisma);
    if (state === "succeeded")
      await assertZeroComponentActive(deps, family, id, request, String(details.startedAt));
    const row = await deps.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM artifacts WHERE id = ${id} FOR UPDATE`);
      const existing = await findZeroComponentReceipt(tx, family, request, id);
      if (existing) {
        existingReference = existing.storageKey === stored.id;
        return existing;
      }
      await cancellationGuard(tx);
      if (state === "succeeded")
        await assertZeroComponentActive(
          { prisma: tx, authorize: deps.authorize },
          family,
          id,
          request,
          String(details.startedAt),
        );
      const result = await tx.artifact.create({
        data: {
          spaceId: request.principal.spaceId,
          userId: request.principal.userId,
          name: policy.receiptName,
          description: JSON.stringify({
            state,
            profile: request.profile,
            requestDigest: request.requestDigest,
          }),
          mimeType: "application/json",
          size: bytes.byteLength,
          hash: zeroComponentHash(bytes),
          storageKey: stored.id,
          rootArtifactId: id,
          version: 2,
          clientNonce: receiptNonce(family, id),
        },
      });
      return result;
    });
    referenced = row.storageKey === stored.id;
    return row;
  } finally {
    if (!referenced && !existingReference)
      await deps.artifacts.remove(stored.id, context).catch(() => undefined);
  }
}
export async function submitZeroComponent(
  deps: ZeroComponentDependencies,
  family: ZeroComponentFamily,
  principal: ZeroComponentPrincipal,
  request: ZeroComponentHeader & Record<string, unknown>,
  idempotencyKey: string,
  options: { inputSha256?: string | null } = {},
) {
  const policy = policies[family];
  execution(family, request);
  if (JSON.stringify(request.principal) !== JSON.stringify(principal)) throw new IsolationError();
  await authorizeZeroComponent(deps, principal);
  const prefix = scopePrefix(family, principal);
  const nonce = `${prefix}${request.kind === "zero.csv.verify.request.v1" ? "verify:" : ""}${zeroComponentHash(idempotencyKey)}`;
  const identity = {
    spaceId_userId_clientNonce: {
      spaceId: principal.spaceId,
      userId: principal.userId,
      clientNonce: nonce,
    },
  };
  let row = await deps.prisma.artifact.findUnique({ where: identity });
  const matches = (existing: { description: string | null }) => {
    if (JSON.parse(existing.description ?? "null")?.requestDigest !== request.requestDigest)
      throw new Error("idempotency_key_conflict");
  };
  const deadline = async (prisma: Pick<PrismaClient, "$queryRaw">, retry: boolean) => {
    const now = await zeroComponentDatabaseNow(prisma);
    const time = Date.parse(request.deadline ?? "");
    if (!Number.isFinite(time) || time <= now)
      throw new Error(retry ? "idempotency_key_expired" : "invalid_job_deadline");
    if (time - now > 600_000 || time > Date.parse(principal.expiresAt))
      throw new Error("invalid_job_deadline");
  };
  if (row) {
    matches(row);
    await deadline(deps.prisma, true);
  } else {
    await deadline(deps.prisma, false);
    const bytes = Buffer.from(JSON.stringify(request));
    if (bytes.byteLength > policy.requestBytes) throw new Error("artifact_limit_exceeded");
    const context = zeroComponentContext(principal, `${policy.legacyNoncePrefix}.submit`, family);
    const stored = await deps.artifacts.put(
      { name: policy.requestName, mimeType: "application/json", bytes },
      context,
    );
    try {
      await authorizeZeroComponent(deps, principal);
      await deadline(deps.prisma, false);
      row = await deps.prisma.$transaction(async (tx) => {
        const lock = `zero.component.scope:${zeroComponentHash(JSON.stringify([principal.spaceId, principal.userId, principal.scopeId]))}`;
        await tx.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))::text`,
        );
        await authorizeZeroComponent({ prisma: tx, authorize: deps.authorize }, principal);
        await deadline(tx, false);
        const existing = await tx.artifact.findUnique({ where: identity });
        if (existing) {
          matches(existing);
          return existing;
        }
        const outstanding = await tx.artifact.findMany({
          where: {
            spaceId: principal.spaceId,
            userId: principal.userId,
            OR: (Object.keys(policies) as ZeroComponentFamily[]).map((key) => ({
              name: policies[key].requestName,
              clientNonce: { startsWith: scopePrefix(key, principal) },
            })),
            versions: {
              none: { name: { in: Object.values(policies).map((item) => item.receiptName) } },
            },
          },
          select: { id: true },
          take: 4,
        });
        if (outstanding.length >= 4) throw new Error("scope_job_limit_exceeded");
        return tx.artifact.create({
          data: {
            id: randomUUID(),
            spaceId: principal.spaceId,
            userId: principal.userId,
            name: policy.requestName,
            description: JSON.stringify({
              principal,
              kind: request.kind,
              deadline: request.deadline,
              inputSha256: options.inputSha256 ?? null,
              ...("fileId" in request ? { fileId: request.fileId } : {}),
              requestDigest: request.requestDigest,
              ...(request.bindingSha256 ? { bindingSha256: request.bindingSha256 } : {}),
            }),
            mimeType: "application/json",
            size: bytes.byteLength,
            hash: zeroComponentHash(bytes),
            storageKey: stored.id,
            version: 1,
            clientNonce: nonce,
          },
        });
      });
      if (row.storageKey !== stored.id) await deps.artifacts.remove(stored.id, context);
    } catch (error) {
      await deps.artifacts.remove(stored.id, context).catch(() => undefined);
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
        throw error;
      row = await deps.prisma.artifact.findUniqueOrThrow({ where: identity });
      matches(row);
    }
  }
  if (!(await findZeroComponentReceipt(deps.prisma, family, request, row.id)))
    await deps.jobs.enqueue({
      name: execution(family, request).jobName,
      payload: { requestArtifactId: row.id },
      replaceKey: zeroComponentJobKey(family, row.id, request),
      keepExisting: true,
      maxAttempts: 3,
    });
  return { jobId: row.id, requestDigest: request.requestDigest };
}
export function createZeroComponentReader<T extends ZeroComponentHeader>(
  deps: ZeroComponentDependencies,
  family: ZeroComponentFamily,
  principal: ZeroComponentPrincipal,
  decode: (value: unknown, header: ZeroComponentHeader) => T,
) {
  const load = async (jobId: string) => {
    await authorizeZeroComponent(deps, principal);
    return loadZeroComponentRequest(deps, family, jobId, principal, decode);
  };
  return {
    async get(jobId: string) {
      const { request } = await load(jobId);
      const receipt = await findZeroComponentReceipt(deps.prisma, family, request, jobId);
      await authorizeZeroComponent(deps, principal);
      if (receipt)
        return {
          jobId,
          ...JSON.parse(receipt.description!),
          artifactId: receipt.id,
          revision: receipt.version,
          sha256: receipt.hash,
        };
      const jobs = await deps.prisma.$queryRaw<
        Array<{ attempts: number; max_attempts: number; locked_at: Date | null }>
      >(
        Prisma.sql`SELECT attempts, max_attempts, locked_at FROM graphile_worker._private_jobs WHERE key = ${zeroComponentJobKey(family, jobId, request)}`,
      );
      const job = jobs[0];
      await authorizeZeroComponent(deps, principal);
      return {
        jobId,
        state:
          !job || job.attempts >= job.max_attempts
            ? "unknown"
            : job.locked_at
              ? "running"
              : "queued",
        attempts: job?.attempts ?? null,
        reason: !job
          ? "queue_and_receipt_absent"
          : job.attempts >= job.max_attempts
            ? "worker_attempts_exhausted"
            : null,
      };
    },
    async cancel(jobId: string) {
      const { request } = await load(jobId);
      const receipt = await publishZeroComponent(
        deps,
        family,
        jobId,
        request,
        "cancelled",
        {
          reason: "principal_cancelled",
        },
        principal,
      );
      await deps.jobs.cancel(zeroComponentJobKey(family, jobId, request));
      return { jobId, ...JSON.parse(receipt.description!), artifactId: receipt.id };
    },
    async artifact(jobId: string) {
      const { request } = await load(jobId);
      const row = await findZeroComponentReceipt(deps.prisma, family, request, jobId);
      if (!row || row.size > policies[family].artifactBytes) throw new IsolationError();
      await authorizeZeroComponent(deps, principal);
      const bytes = await deps.artifacts.get(
        row.storageKey,
        zeroComponentContext(principal, jobId, family),
      );
      await authorizeZeroComponent(deps, principal);
      if (bytes.byteLength !== row.size || zeroComponentHash(bytes) !== row.hash)
        throw new Error("receipt_artifact_integrity_failed");
      return {
        artifactId: row.id,
        revision: row.version,
        sha256: row.hash,
        content: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      };
    },
  };
}
