import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, opendir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
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
import type { ZeroCsvProjectVerifierConfig } from "./zero-csv-project-verifier.js";
import {
  checkZeroCsvProjectFreshness,
  verifyZeroCsvProject,
  ZERO_CSV_PROJECT_LIMITS,
} from "./zero-csv-project-verifier.js";

/** Supplied by trusted application binding, never accepted as tool arguments. */
export interface ZeroCsvPrincipal {
  spaceId: string;
  userId: string;
  scopeId: string;
  policyRevision: string;
  expiresAt: string;
}
export type ZeroCsvAuthorize = (principal: ZeroCsvPrincipal) => Promise<void>;
export type ZeroCsvResolveVerifier = (
  principal: ZeroCsvPrincipal,
) => Promise<ZeroCsvProjectVerifierConfig | undefined>;
export const ZERO_CSV_VERIFICATION_PROFILE = "zero-csv-project-v1";
interface Dependencies {
  prisma: PrismaClient;
  artifacts: ArtifactStore;
  jobs: JobPublisher;
  authorize: ZeroCsvAuthorize;
  resolveVerifier?: ZeroCsvResolveVerifier;
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
    deadline: z
      .string()
      .datetime({ offset: true })
      .refine((value) => Number.isFinite(Date.parse(value))),
  })
  .strict();
const verifyInputSchema = z
  .object({
    preparationJobId: z.string().uuid(),
    idempotencyKey: z.string().min(1).max(128),
    deadline: z
      .string()
      .datetime({ offset: true })
      .refine((value) => Number.isFinite(Date.parse(value))),
  })
  .strict();
const principalSchema = z
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
const prepareRequestSchema = z
  .object({
    kind: z.literal("zero.csv.request.v1"),
    principal: principalSchema,
    profile: z.literal(ZERO_CSV_PROFILE),
    csv: csvText,
    deadline: z
      .string()
      .datetime({ offset: true })
      .refine((value) => Number.isFinite(Date.parse(value))),
    requestDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const verifyRequestSchema = z
  .object({
    kind: z.literal("zero.csv.verify.request.v1"),
    principal: principalSchema,
    profile: z.literal(ZERO_CSV_VERIFICATION_PROFILE),
    preparationJobId: z.string().uuid(),
    preparationArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    verifierBindingSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    deadline: z
      .string()
      .datetime({ offset: true })
      .refine((value) => Number.isFinite(Date.parse(value))),
    requestDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
const requestSchema = z.discriminatedUnion("kind", [prepareRequestSchema, verifyRequestSchema]);
type Request = z.infer<typeof requestSchema>;
type RequestHeader = Pick<Request, "principal" | "profile" | "kind" | "requestDigest"> & {
  deadline?: string;
  inputSha256?: string | null;
};
type State = "succeeded" | "failed" | "blocked" | "cancelled";
const jobName = (request: Pick<Request, "kind">) =>
  request.kind === "zero.csv.verify.request.v1"
    ? ("zero.csv.verify" as const)
    : ("zero.csv.prepare" as const);
const keyFor = (id: string, request: Pick<Request, "kind">) => `${jobName(request)}:${id}`;
const receiptNonce = (id: string) => `zero.csv.receipt:${id}`;
const requestDigest = (request: Record<string, unknown>) => zeroCsvHash(JSON.stringify(request));
const runtimeLimit = (request: Pick<Request, "kind">) =>
  request.kind === "zero.csv.verify.request.v1"
    ? ZERO_CSV_PROJECT_LIMITS.wallMs + 5000
    : ZERO_CSV_LIMITS.runtimeMs;
const contextFor = (principal: ZeroCsvPrincipal, id: string): AdapterContext => ({
  ...principal,
  operationId: id,
  traceId: id,
  signal: AbortSignal.timeout(ZERO_CSV_LIMITS.runtimeMs),
});

async function authorize(
  deps: { prisma: Pick<PrismaClient, "spaceMember">; authorize: ZeroCsvAuthorize },
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

async function loadHeader(
  deps: Pick<Dependencies, "prisma">,
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
  // Current authorized grants may access historical jobs in the same binding.
  // Execution still uses the immutable original revision/expiry checked below.
  if (
    principal &&
    (owner.spaceId !== principal.spaceId ||
      owner.userId !== principal.userId ||
      owner.scopeId !== principal.scopeId)
  )
    throw new IsolationError();
  if (row.spaceId !== owner.spaceId || row.userId !== owner.userId) throw new IsolationError();
  const kind = z
    .enum(["zero.csv.request.v1", "zero.csv.verify.request.v1"])
    .parse(metadata.kind ?? "zero.csv.request.v1");
  const header: RequestHeader = {
    principal: owner,
    kind,
    profile:
      kind === "zero.csv.verify.request.v1" ? ZERO_CSV_VERIFICATION_PROFILE : ZERO_CSV_PROFILE,
    requestDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .parse(metadata.requestDigest),
    ...(metadata.deadline
      ? {
          deadline: z
            .string()
            .datetime({ offset: true })
            .refine((value) => Number.isFinite(Date.parse(value)))
            .parse(metadata.deadline),
        }
      : {}),
    inputSha256: metadata.inputSha256
      ? z
          .string()
          .regex(/^[a-f0-9]{64}$/u)
          .parse(metadata.inputSha256)
      : null,
  };
  return { row, header };
}

async function loadRequest(
  deps: Pick<Dependencies, "prisma" | "artifacts"> & { authorize?: ZeroCsvAuthorize },
  id: string,
  principal?: ZeroCsvPrincipal,
  cached?: Awaited<ReturnType<typeof loadHeader>>,
) {
  const { row, header } = cached ?? (await loadHeader(deps, id, principal));
  const owner = header.principal;
  // Historical callers use their current grant; dispatch uses the original owner.
  if (!deps.authorize) throw new IsolationError();
  await authorize({ prisma: deps.prisma, authorize: deps.authorize }, principal ?? owner);
  const bytes = await deps.artifacts.get(row.storageKey, contextFor(owner, id));
  if (bytes.byteLength !== row.size || zeroCsvHash(bytes) !== row.hash)
    throw new Error("request_artifact_integrity_failed");
  const request = requestSchema.parse(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
  const { requestDigest: digest, ...body } = request;
  if (
    requestDigest(body) !== digest ||
    digest !== header.requestDigest ||
    request.kind !== header.kind ||
    (header.deadline !== undefined && header.deadline !== request.deadline) ||
    JSON.stringify(owner) !== JSON.stringify(request.principal) ||
    (request.kind === "zero.csv.request.v1" &&
      header.inputSha256 !== null &&
      header.inputSha256 !== undefined &&
      header.inputSha256 !== zeroCsvHash(request.csv))
  )
    throw new Error("request_digest_mismatch");
  return { row, request };
}

async function findReceipt(
  prisma: Pick<PrismaClient, "artifact">,
  request: RequestHeader,
  id: string,
) {
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
  deps: Pick<Dependencies, "prisma" | "artifacts"> & { authorize?: ZeroCsvAuthorize },
  id: string,
  request: RequestHeader,
  state: State,
  details: Record<string, unknown>,
) {
  const bytes = Buffer.from(
    JSON.stringify({
      kind: "zero.csv.receipt.v1",
      jobId: id,
      requestDigest: request.requestDigest,
      inputSha256:
        "csv" in request && typeof request.csv === "string"
          ? zeroCsvHash(request.csv)
          : (request.inputSha256 ?? null),
      profile: request.profile,
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
      if (state === "succeeded") {
        if (!deps.authorize) throw new IsolationError();
        // Storage can await arbitrarily after the worker's earlier checks. Recheck the
        // current operator grant and transaction-visible membership at publication.
        // A separate policy store cannot be locked atomically with this DB commit.
        await authorize({ prisma: tx, authorize: deps.authorize }, request.principal);
      }
      if (
        state === "succeeded" &&
        Date.now() - Date.parse(String(details.startedAt)) >= runtimeLimit(request)
      )
        throw new Error("job_runtime_exceeded");
      // A timed-out successful result must never overwrite cancellation or become success later.
      if (
        state === "succeeded" &&
        (!request.deadline ||
          Date.parse(request.deadline) <= Date.now() ||
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
            profile: request.profile,
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

async function successfulPreparation(
  deps: Pick<Dependencies, "prisma" | "artifacts"> & { authorize?: ZeroCsvAuthorize },
  id: string,
  principal: ZeroCsvPrincipal,
) {
  const { request } = await loadRequest(deps, id, principal);
  if (request.kind !== "zero.csv.request.v1") throw new Error("verification_preparation_required");
  const row = await findReceipt(deps.prisma, request, id);
  if (!row || row.size > ZERO_CSV_LIMITS.artifactBytes)
    throw new Error("verification_preparation_required");
  if (!deps.authorize) throw new IsolationError();
  await authorize({ prisma: deps.prisma, authorize: deps.authorize }, principal);
  const bytes = await deps.artifacts.get(row.storageKey, contextFor(principal, id));
  if (bytes.byteLength !== row.size || zeroCsvHash(bytes) !== row.hash)
    throw new Error("receipt_artifact_integrity_failed");
  const content = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (
    content.kind !== "zero.csv.receipt.v1" ||
    content.jobId !== id ||
    content.state !== "succeeded" ||
    content.profile !== ZERO_CSV_PROFILE ||
    content.requestDigest !== request.requestDigest ||
    content.component?.profile !== ZERO_CSV_PROFILE
  )
    throw new Error("verification_preparation_required");
  return row;
}

/**
 * Current grants control historical access within the same user/space/scope.
 * Renewal preserves each job's execution principal and its outstanding quota.
 * Recovery requires known job IDs; lost IDs still need operator recovery.
 */
export function createZeroCsvPreparationService(
  deps: Dependencies,
  trustedPrincipal: ZeroCsvPrincipal,
) {
  const principal = principalSchema.parse(trustedPrincipal);
  const submit = async (input: unknown, verification = false) => {
    await authorize(deps, principal);
    const parsed = verification ? verifyInputSchema.parse(input) : inputSchema.parse(input);
    if ("csv" in parsed && Buffer.byteLength(parsed.csv) > ZERO_CSV_LIMITS.inputBytes)
      throw new Error("csv_limit_exceeded");
    const { idempotencyKey, ...params } = parsed;
    let body: Record<string, unknown>;
    if ("preparationJobId" in params) {
      const verifier = await deps.resolveVerifier?.(principal);
      if (!verifier) throw new Error("verification_unavailable");
      const preparation = await successfulPreparation(deps, params.preparationJobId, principal);
      body = {
        kind: "zero.csv.verify.request.v1",
        principal,
        profile: ZERO_CSV_VERIFICATION_PROFILE,
        ...params,
        preparationArtifactSha256: preparation.hash,
        verifierBindingSha256: zeroCsvHash(JSON.stringify(verifier)),
      };
    } else body = { kind: "zero.csv.request.v1", principal, profile: ZERO_CSV_PROFILE, ...params };
    const normalized = verification
      ? verifyRequestSchema.omit({ requestDigest: true }).parse(body)
      : prepareRequestSchema.omit({ requestDigest: true }).parse(body);
    const request: Request = { ...normalized, requestDigest: requestDigest(normalized) };
    const scopePrefix = `zero.csv.request:${zeroCsvHash(JSON.stringify([principal.userId, principal.scopeId]))}:`;
    const nonce = `${scopePrefix}${verification ? "verify:" : ""}${zeroCsvHash(idempotencyKey)}`;
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
            if (JSON.parse(existing.description ?? "null")?.requestDigest !== request.requestDigest)
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
              description: JSON.stringify({
                principal,
                kind: request.kind,
                deadline: request.deadline,
                inputSha256:
                  request.kind === "zero.csv.request.v1" ? zeroCsvHash(request.csv) : null,
                requestDigest: request.requestDigest,
              }),
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
        name: jobName(request),
        payload: { requestArtifactId: row.id },
        replaceKey: keyFor(row.id, request),
        keepExisting: true,
        maxAttempts: 3,
      });
    return { jobId: row.id, requestDigest: request.requestDigest };
  };
  return {
    submit: (input: unknown) => submit(input),
    submitVerify: (input: unknown) => submit(input, true),
    async verificationAvailable() {
      return Boolean(await deps.resolveVerifier?.(principal));
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
        Prisma.sql`SELECT attempts, max_attempts, locked_at, last_error FROM graphile_worker._private_jobs WHERE key = ${keyFor(jobId, request)}`,
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
      await deps.jobs.cancel(keyFor(jobId, request));
      return { jobId, ...JSON.parse(receipt.description!), artifactId: receipt.id };
    },
    async artifact(jobId: string) {
      await authorize(deps, principal);
      const { request } = await loadRequest(deps, jobId, principal);
      const row = await findReceipt(deps.prisma, request, jobId);
      if (!row || row.size > ZERO_CSV_LIMITS.artifactBytes) throw new IsolationError();
      await authorize(deps, principal);
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

type WorkerDependencies = Pick<Dependencies, "prisma" | "artifacts"> & {
  authorize?: ZeroCsvAuthorize;
  resolveVerifier?: ZeroCsvResolveVerifier;
};
export const ZERO_CSV_STAGING_LIMITS = Object.freeze({
  slotsPerScope: 4,
  bytesPerSlot: 1_048_576,
  entriesPerSlot: 128,
});

async function reserveVerificationStaging(
  config: ZeroCsvProjectVerifierConfig,
  principal: ZeroCsvPrincipal,
  id: string,
) {
  const bad = () => new Error("verification_staging_operator_cleanup_required");
  try {
    const base = config.snapshot.stagingRoot;
    if (!path.isAbsolute(base) || (await realpath(base)) !== base) throw bad();
    const scope = path.join(
      base,
      `zero-csv-scope-${zeroCsvHash(JSON.stringify([principal.spaceId, principal.userId, principal.scopeId]))}`,
    );
    await mkdir(scope, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    const root = await lstat(scope);
    if (
      !root.isDirectory() ||
      root.isSymbolicLink() ||
      root.uid !== process.getuid!() ||
      (root.mode & 0o777) !== 0o700 ||
      (await realpath(scope)) !== scope
    )
      throw bad();
    const scan = async (directory: string, writable = false) => {
      let bytes = 0;
      let entries = 0;
      const walk = async (current: string, depth: number) => {
        if (depth > 8) throw bad();
        const info = await lstat(current);
        if (info.uid !== process.getuid!() || info.isSymbolicLink()) throw bad();
        if (info.isDirectory()) {
          if (writable) await chmod(current, 0o700);
          for await (const entry of await opendir(current)) {
            if (++entries > ZERO_CSV_STAGING_LIMITS.entriesPerSlot) throw bad();
            await walk(path.join(current, entry.name), depth + 1);
          }
        } else {
          if (!info.isFile() || info.nlink !== 1) throw bad();
          bytes += info.size;
          if (bytes > ZERO_CSV_STAGING_LIMITS.bytesPerSlot) throw bad();
        }
      };
      await walk(directory, 0);
    };
    // Existing reservations may be active or crash orphans. Count and bound them;
    // never delete them to make room, and refuse unknown/special entries.
    for await (const entry of await opendir(scope)) {
      if (!/^slot-[0-3]$/u.test(entry.name) || !entry.isDirectory()) throw bad();
      await scan(path.join(scope, entry.name));
    }
    for (let slot = 0; slot < ZERO_CSV_STAGING_LIMITS.slotsPerScope; slot++) {
      const directory = path.join(scope, `slot-${slot}`);
      try {
        await mkdir(directory, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
        throw error;
      }
      const identity = await lstat(directory);
      await writeFile(
        path.join(directory, "reservation.json"),
        JSON.stringify({ version: 1, jobId: id }),
        { mode: 0o600, flag: "wx" },
      );
      return {
        config: { ...config, snapshot: { ...config.snapshot, stagingRoot: directory } },
        async release() {
          const current = await lstat(directory);
          if (
            !current.isDirectory() ||
            current.dev !== identity.dev ||
            current.ino !== identity.ino
          )
            throw bad();
          await scan(directory, true);
          await rm(directory, { recursive: true });
        },
      };
    }
    throw bad();
  } catch {
    throw bad();
  }
}

async function runVerification(
  deps: WorkerDependencies & { authorize: ZeroCsvAuthorize },
  id: string,
  request: z.infer<typeof verifyRequestSchema>,
  retain: (release: () => Promise<void>) => void,
) {
  const recheck = () =>
    authorize({ prisma: deps.prisma, authorize: deps.authorize }, request.principal);
  const preparation = await successfulPreparation(
    deps,
    request.preparationJobId,
    request.principal,
  );
  if (preparation.hash !== request.preparationArtifactSha256)
    throw new Error("verification_preparation_changed");
  const verifier = await deps.resolveVerifier?.(request.principal);
  if (!verifier) throw new Error("verification_unavailable");
  if (zeroCsvHash(JSON.stringify(verifier)) !== request.verifierBindingSha256)
    throw new Error("verification_policy_changed");
  await recheck();
  const reservation = await reserveVerificationStaging(verifier, request.principal, id);
  retain(reservation.release);
  await recheck();
  const controller = new AbortController();
  const timeout = AbortSignal.timeout(
    Math.max(
      1,
      Math.min(
        runtimeLimit(request),
        Date.parse(request.deadline) - Date.now(),
        Date.parse(request.principal.expiresAt) - Date.now(),
      ),
    ),
  );
  const signal = AbortSignal.any([controller.signal, timeout]);
  let polling = false;
  const cancellation = setInterval(() => {
    if (polling) return;
    polling = true;
    void findReceipt(deps.prisma, request, id)
      .then((receipt) => {
        if (receipt) controller.abort();
      })
      .catch(() => controller.abort())
      .finally(() => {
        polling = false;
      });
  }, 200);
  let denied = false;
  try {
    const verified = await verifyZeroCsvProject(
      {
        ...reservation.config,
        beforeDispatch: async () => {
          try {
            await recheck();
            const current = await deps.resolveVerifier?.(request.principal);
            if (!current || zeroCsvHash(JSON.stringify(current)) !== request.verifierBindingSha256)
              throw new IsolationError();
            if (await findReceipt(deps.prisma, request, id)) controller.abort();
          } catch (error) {
            denied = error instanceof IsolationError;
            throw error;
          }
        },
      },
      signal,
    );
    await recheck();
    const freshness = await checkZeroCsvProjectFreshness(
      reservation.config,
      verified.receipt.snapshot.sha256,
      signal,
    );
    if (freshness.state !== "unchanged") {
      verified.receipt.outcome = "unknown";
      verified.receipt.reason = "host_project_changed_after_snapshot";
    }
    return {
      preparationJobId: request.preparationJobId,
      preparationArtifactSha256: preparation.hash,
      verification: verified.receipt,
      freshness: { state: freshness.state, sha256: freshness.sha256 },
      storage: {
        ...ZERO_CSV_STAGING_LIMITS,
        retention: "transient; crash orphans require operator cleanup",
      },
    };
  } catch (error) {
    if (denied) throw new IsolationError();
    throw error;
  } finally {
    clearInterval(cancellation);
  }
}

async function runCsvJob(deps: WorkerDependencies, id: string, expectedKind: Request["kind"]) {
  const cached = await loadHeader(deps, id);
  let request: RequestHeader = cached.header;
  if (await findReceipt(deps.prisma, request, id)) return;
  const started = Date.now();
  const attemptId = randomUUID();
  if (!deps.authorize) {
    await publish(deps, id, request, "blocked", { reason: "project_authorizer_unavailable" });
    return;
  }
  let release: (() => Promise<void>) | undefined;
  let terminal = false;
  try {
    const loaded = await loadRequest(deps, id, undefined, cached);
    request = loaded.request;
    if (loaded.request.kind !== expectedKind) throw new Error("job_kind_mismatch");
    if (Date.parse(loaded.request.deadline) <= Date.now()) throw new Error("job_deadline_exceeded");
    const details =
      loaded.request.kind === "zero.csv.verify.request.v1"
        ? await runVerification(
            { ...deps, authorize: deps.authorize },
            id,
            loaded.request,
            (cleanup) => {
              release = cleanup;
            },
          )
        : {
            component: await prepareZeroCsvComponent(),
            result: executeZeroCsv(loaded.request.csv),
            inputSnapshot: {
              sha256: zeroCsvHash(loaded.request.csv),
              bytes: Buffer.byteLength(loaded.request.csv),
            },
          };
    if (Date.now() - started >= runtimeLimit(request)) throw new Error("job_runtime_exceeded");
    await authorize({ ...deps, authorize: deps.authorize }, request.principal);
    await publish(deps, id, request, "succeeded", {
      attemptId,
      startedAt: new Date(started).toISOString(),
      producer:
        request.kind === "zero.csv.verify.request.v1"
          ? "zero-csv-project-worker-v1"
          : "zero-csv-worker-v1",
      ...details,
      runtime: { platform: process.platform, arch: process.arch, node: process.versions.node },
      limits:
        request.kind === "zero.csv.verify.request.v1" ? ZERO_CSV_PROJECT_LIMITS : ZERO_CSV_LIMITS,
      elapsedMs: Date.now() - started,
      limitations: [
        "Deterministic development conformance; no independent holdout or hostile-code isolation claim",
        request.kind === "zero.csv.verify.request.v1"
          ? "Only the fixed operator-enabled CSV project profile is executed"
          : "No arbitrary source execution; pinned package parseRows only",
        "Unreferenced staged bytes may remain after process death; never exposed as committed output",
      ],
    });
    terminal = true;
  } catch (error) {
    // Domain rejection is durable. Infrastructure/database errors remain Graphile failures.
    if (
      !(error instanceof Error) ||
      (!/^(unsupported_|malformed_|unterminated_|csv_|component_|verification_|job_|artifact_limit_exceeded)/.test(
        error.message,
      ) &&
        !(error instanceof IsolationError))
    )
      throw error;
    await publish(
      deps,
      id,
      request,
      error instanceof IsolationError || error.message.startsWith("verification_")
        ? "blocked"
        : "failed",
      {
        reason: error instanceof IsolationError ? "project_scope_rejected" : error.message,
      },
    );
    terminal = true;
  } finally {
    // Only this attempt's reservation is released after a durable winner exists.
    // Uncommitted infrastructure failures retain a bounded reservation for operator recovery.
    if (terminal && release) await release();
  }
}

export const runZeroCsvPreparation = (deps: WorkerDependencies, id: string) =>
  runCsvJob(deps, id, "zero.csv.request.v1");
export const runZeroCsvVerification = (deps: WorkerDependencies, id: string) =>
  runCsvJob(deps, id, "zero.csv.verify.request.v1");
