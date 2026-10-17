import { randomUUID } from "node:crypto";
import type { AdapterContext, ArtifactStore, JobPublisher } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { IsolationError, Prisma } from "@rakazo/db";
import { z } from "zod";
import {
  executeZeroCsv,
  prepareZeroCsvComponent,
  ZERO_CSV_LIMITS,
  ZERO_CSV_PROFILE,
  zeroCsvHash,
} from "./zero-csv-profile.js";

/** Supplied by trusted application binding, never accepted as tool arguments. */
export interface ZeroCsvPrincipal {
  spaceId: string;
  userId: string;
  scopeId: string;
  policyRevision: string;
  expiresAt: string;
}
export type ZeroCsvAuthorize = (principal: ZeroCsvPrincipal) => Promise<void>;
interface Dependencies {
  prisma: PrismaClient;
  artifacts: ArtifactStore;
  jobs: JobPublisher;
  authorize: ZeroCsvAuthorize;
}
// Restrict transport controls so the JSON request envelope is bounded by twice the CSV bytes.
const csvText = z
  .string()
  .min(1)
  .max(ZERO_CSV_LIMITS.inputBytes)
  .refine((value) => {
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) return false;
    }
    return true;
  });
const inputSchema = z
  .object({
    csv: csvText,
    idempotencyKey: z.string().min(1).max(128),
    deadline: z.string().datetime({ offset: true }),
  })
  .strict();
const principalSchema = z
  .object({
    spaceId: z.string().min(1).max(128),
    userId: z.string().min(1).max(128),
    scopeId: z.string().min(1).max(128),
    policyRevision: z.string().min(1).max(128),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();
const requestSchema = z
  .object({
    kind: z.literal("zero.csv.request.v1"),
    principal: principalSchema,
    profile: z.literal(ZERO_CSV_PROFILE),
    csv: csvText,
    deadline: z.string().datetime({ offset: true }),
    requestDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
type Request = z.infer<typeof requestSchema>;
type State = "succeeded" | "failed" | "blocked" | "cancelled";
const keyFor = (id: string) => `zero.csv.prepare:${id}`;
const receiptNonce = (id: string) => `zero.csv.receipt:${id}`;
const requestDigest = (request: Omit<Request, "requestDigest">) =>
  zeroCsvHash(JSON.stringify(request));
const contextFor = (principal: ZeroCsvPrincipal, id: string): AdapterContext => ({
  ...principal,
  operationId: id,
  traceId: id,
  signal: AbortSignal.timeout(ZERO_CSV_LIMITS.runtimeMs),
});

async function authorize(
  deps: Pick<Dependencies, "prisma" | "authorize">,
  principal: ZeroCsvPrincipal,
) {
  principalSchema.parse(principal);
  if (Date.parse(principal.expiresAt) <= Date.now()) throw new IsolationError("Scope expired");
  await deps.authorize(principal);
  if (
    !(await deps.prisma.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId: principal.spaceId, userId: principal.userId } },
      select: { id: true },
    }))
  )
    throw new IsolationError();
}

async function loadRequest(
  deps: Pick<Dependencies, "prisma" | "artifacts">,
  id: string,
  principal?: ZeroCsvPrincipal,
) {
  const row = await deps.prisma.artifact.findFirst({
    where: {
      id,
      name: "zero-csv-request.json",
      ...(principal ? { spaceId: principal.spaceId, userId: principal.userId } : {}),
    },
  });
  if (!row || row.size > ZERO_CSV_LIMITS.inputBytes * 2 + 4096) throw new IsolationError();
  // Scope metadata is checked before loading any private input content.
  const metadata = JSON.parse(row.description ?? "null");
  const owner = principalSchema.parse(metadata?.principal);
  if (principal && JSON.stringify(owner) !== JSON.stringify(principal)) throw new IsolationError();
  if (row.spaceId !== owner.spaceId || row.userId !== owner.userId) throw new IsolationError();
  const bytes = await deps.artifacts.get(row.storageKey, contextFor(owner, id));
  if (bytes.byteLength !== row.size || zeroCsvHash(bytes) !== row.hash)
    throw new Error("request_artifact_integrity_failed");
  const request = requestSchema.parse(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
  const { requestDigest: digest, ...body } = request;
  if (requestDigest(body) !== digest || JSON.stringify(owner) !== JSON.stringify(request.principal))
    throw new Error("request_digest_mismatch");
  return { row, request };
}

async function findReceipt(prisma: Pick<PrismaClient, "artifact">, request: Request, id: string) {
  const row = await prisma.artifact.findUnique({
    where: {
      spaceId_userId_clientNonce: {
        spaceId: request.principal.spaceId,
        userId: request.principal.userId,
        clientNonce: receiptNonce(id),
      },
    },
  });
  if (
    row &&
    (row.rootArtifactId !== id ||
      row.version !== 2 ||
      row.name !== "zero-csv-receipt.json" ||
      row.mimeType !== "application/json")
  )
    throw new Error("receipt_binding_mismatch");
  return row;
}

/** Stage bytes first; one request-row lock chooses the sole truthful terminal receipt. */
async function publish(
  deps: Pick<Dependencies, "prisma" | "artifacts">,
  id: string,
  request: Request,
  state: State,
  details: Record<string, unknown>,
) {
  const bytes = Buffer.from(
    JSON.stringify({
      kind: "zero.csv.receipt.v1",
      jobId: id,
      requestDigest: request.requestDigest,
      inputSha256: zeroCsvHash(request.csv),
      profile: ZERO_CSV_PROFILE,
      state,
      ...details,
      paidModelCalls: 0,
      modelExecution: "none",
      finishedAt: new Date().toISOString(),
    }),
  );
  if (bytes.byteLength > ZERO_CSV_LIMITS.artifactBytes) throw new Error("artifact_limit_exceeded");
  const context = contextFor(request.principal, id);
  const stored = await deps.artifacts.put(
    { name: "zero-csv-receipt.json", mimeType: "application/json", bytes },
    context,
  );
  let committed = false;
  try {
    const row = await deps.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM artifacts WHERE id = ${id} FOR UPDATE`);
      const existing = await findReceipt(tx, request, id);
      if (existing) return existing;
      if (
        state === "succeeded" &&
        Date.now() - Date.parse(String(details.startedAt)) >= ZERO_CSV_LIMITS.runtimeMs
      )
        throw new Error("job_runtime_exceeded");
      // A timed-out successful result must never overwrite cancellation or become success later.
      if (
        state === "succeeded" &&
        (Date.parse(request.deadline) <= Date.now() ||
          Date.parse(request.principal.expiresAt) <= Date.now())
      )
        throw new Error("job_deadline_exceeded");
      const result = await tx.artifact.create({
        data: {
          spaceId: request.principal.spaceId,
          userId: request.principal.userId,
          name: "zero-csv-receipt.json",
          description: JSON.stringify({
            state,
            profile: ZERO_CSV_PROFILE,
            requestDigest: request.requestDigest,
          }),
          mimeType: "application/json",
          size: bytes.byteLength,
          hash: zeroCsvHash(bytes),
          storageKey: stored.id,
          rootArtifactId: id,
          version: 2,
          clientNonce: receiptNonce(id),
        },
      });
      committed = true;
      return result;
    });
    return row;
  } finally {
    if (!committed) await deps.artifacts.remove(stored.id, context).catch(() => undefined);
  }
}

export function createZeroCsvPreparationService(
  deps: Dependencies,
  trustedPrincipal: ZeroCsvPrincipal,
) {
  const principal = principalSchema.parse(trustedPrincipal);
  return {
    async submit(input: unknown) {
      await authorize(deps, principal);
      const parsed = inputSchema.parse(input);
      if (Buffer.byteLength(parsed.csv) > ZERO_CSV_LIMITS.inputBytes)
        throw new Error("csv_limit_exceeded");
      const { idempotencyKey, ...params } = parsed;
      const body: Omit<Request, "requestDigest"> = {
        kind: "zero.csv.request.v1" as const,
        principal,
        profile: ZERO_CSV_PROFILE,
        ...params,
      };
      const request = { ...body, requestDigest: requestDigest(body) };
      const scopePrefix = `zero.csv.request:${zeroCsvHash(JSON.stringify([principal.userId, principal.scopeId]))}:`;
      const nonce = `${scopePrefix}${zeroCsvHash(idempotencyKey)}`;
      const identity = {
        spaceId_userId_clientNonce: {
          spaceId: principal.spaceId,
          userId: principal.userId,
          clientNonce: nonce,
        },
      };
      let row = await deps.prisma.artifact.findUnique({ where: identity });
      if (row) {
        if (JSON.parse(row.description ?? "null")?.requestDigest !== request.requestDigest)
          throw new Error("idempotency_key_conflict");
        if (Date.parse(parsed.deadline) <= Date.now()) throw new Error("idempotency_key_expired");
      } else {
        const remaining = Date.parse(parsed.deadline) - Date.now();
        if (
          remaining <= 0 ||
          remaining > 10 * 60_000 ||
          Date.parse(parsed.deadline) > Date.parse(principal.expiresAt)
        )
          throw new Error("invalid_job_deadline");
        const bytes = Buffer.from(JSON.stringify(request));
        const context = contextFor(principal, "zero.csv.submit");
        const stored = await deps.artifacts.put(
          { name: "zero-csv-request.json", mimeType: "application/json", bytes },
          context,
        );
        try {
          row = await deps.prisma.$transaction(async (tx) => {
            await tx.$queryRaw(
              Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${principal.spaceId}:${scopePrefix}`}, 0))::text`,
            );
            const existing = await tx.artifact.findUnique({ where: identity });
            if (existing) {
              if (
                JSON.parse(existing.description ?? "null")?.requestDigest !== request.requestDigest
              )
                throw new Error("idempotency_key_conflict");
              return existing;
            }
            const outstanding = await tx.artifact.findMany({
              where: {
                spaceId: principal.spaceId,
                userId: principal.userId,
                clientNonce: { startsWith: scopePrefix },
                versions: { none: { name: "zero-csv-receipt.json" } },
              },
              select: { id: true },
              take: ZERO_CSV_LIMITS.outstandingJobsPerScope,
            });
            if (outstanding.length >= ZERO_CSV_LIMITS.outstandingJobsPerScope)
              throw new Error("scope_job_limit_exceeded");
            return tx.artifact.create({
              data: {
                id: randomUUID(),
                spaceId: principal.spaceId,
                userId: principal.userId,
                name: "zero-csv-request.json",
                description: JSON.stringify({ principal, requestDigest: request.requestDigest }),
                mimeType: "application/json",
                size: bytes.byteLength,
                hash: zeroCsvHash(bytes),
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
          if (JSON.parse(row.description ?? "null")?.requestDigest !== request.requestDigest)
            throw new Error("idempotency_key_conflict");
        }
      }
      if (!(await findReceipt(deps.prisma, request, row.id)))
        await deps.jobs.enqueue({
          name: "zero.csv.prepare",
          payload: { requestArtifactId: row.id },
          replaceKey: keyFor(row.id),
          keepExisting: true,
          maxAttempts: 3,
        });
      return { jobId: row.id, requestDigest: request.requestDigest };
    },
    async get(jobId: string) {
      await authorize(deps, principal);
      const { request } = await loadRequest(deps, jobId, principal);
      const receipt = await findReceipt(deps.prisma, request, jobId);
      if (receipt)
        return {
          jobId,
          ...JSON.parse(receipt.description!),
          artifactId: receipt.id,
          revision: receipt.version,
          sha256: receipt.hash,
        };
      const jobs = await deps.prisma.$queryRaw<
        Array<{
          attempts: number;
          max_attempts: number;
          locked_at: Date | null;
          last_error: string | null;
        }>
      >(
        Prisma.sql`SELECT attempts, max_attempts, locked_at, last_error FROM graphile_worker._private_jobs WHERE key = ${keyFor(jobId)}`,
      );
      const job = jobs[0];
      return {
        jobId,
        state: !job
          ? "unknown"
          : job.attempts >= job.max_attempts
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
      await authorize(deps, principal);
      const { request } = await loadRequest(deps, jobId, principal);
      const receipt = await publish(deps, jobId, request, "cancelled", {
        reason: "principal_cancelled",
      });
      await deps.jobs.cancel(keyFor(jobId));
      return { jobId, ...JSON.parse(receipt.description!), artifactId: receipt.id };
    },
    async artifact(jobId: string) {
      await authorize(deps, principal);
      const { request } = await loadRequest(deps, jobId, principal);
      const row = await findReceipt(deps.prisma, request, jobId);
      if (!row || row.size > ZERO_CSV_LIMITS.artifactBytes) throw new IsolationError();
      const bytes = await deps.artifacts.get(row.storageKey, contextFor(principal, jobId));
      if (bytes.byteLength !== row.size || zeroCsvHash(bytes) !== row.hash)
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

export async function runZeroCsvPreparation(
  deps: Pick<Dependencies, "prisma" | "artifacts"> & { authorize?: ZeroCsvAuthorize },
  id: string,
) {
  const { request } = await loadRequest(deps, id);
  if (await findReceipt(deps.prisma, request, id)) return;
  const started = Date.now();
  const attemptId = randomUUID();
  if (!deps.authorize) {
    await publish(deps, id, request, "blocked", { reason: "project_authorizer_unavailable" });
    return;
  }
  try {
    await authorize({ ...deps, authorize: deps.authorize }, request.principal);
    if (Date.parse(request.deadline) <= Date.now()) throw new Error("job_deadline_exceeded");
    const component = await prepareZeroCsvComponent();
    const result = executeZeroCsv(request.csv);
    if (Date.now() - started >= ZERO_CSV_LIMITS.runtimeMs) throw new Error("job_runtime_exceeded");
    await authorize({ ...deps, authorize: deps.authorize }, request.principal);
    await publish(deps, id, request, "succeeded", {
      attemptId,
      startedAt: new Date(started).toISOString(),
      producer: "zero-csv-worker-v1",
      component,
      result,
      inputSnapshot: { sha256: zeroCsvHash(request.csv), bytes: Buffer.byteLength(request.csv) },
      runtime: { platform: process.platform, arch: process.arch, node: process.versions.node },
      limits: ZERO_CSV_LIMITS,
      elapsedMs: Date.now() - started,
      limitations: [
        "Deterministic development conformance; no independent holdout or hostile-code isolation claim",
        "No arbitrary source execution; pinned package parseRows only",
        "Unreferenced staged bytes may remain after process death; never exposed as committed output",
      ],
    });
  } catch (error) {
    // Domain rejection is durable. Infrastructure/database errors remain Graphile failures.
    if (
      !(error instanceof Error) ||
      (!/^(unsupported_|malformed_|unterminated_|csv_|component_|job_|artifact_limit_exceeded)/.test(
        error.message,
      ) &&
        !(error instanceof IsolationError))
    )
      throw error;
    await publish(deps, id, request, error instanceof IsolationError ? "blocked" : "failed", {
      reason: error instanceof IsolationError ? "project_scope_rejected" : error.message,
    });
  }
}
