/** One selected-profile job on the existing queue. No default paid activation or retry. */
import { randomUUID } from "node:crypto";
import type { AdapterContext, ArtifactStore, JobPublisher } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { IsolationError, Prisma, recordUsage, reserveBudgetInvocation } from "@rakazo/db";
import type { Pool } from "pg";
import { z } from "zod";
import { withAbort } from "./web-ssrf.js";
import type { ZeroCsvPrincipal } from "./zero-csv-preparation.js";
import { executeZeroCsv, prepareZeroCsvComponent, zeroCsvHash } from "./zero-csv-profile.js";
import type { ZeroJevResolver } from "./zero-jev-profile.js";
import { zeroJevPrincipalSchema, zeroJevProfileSchema } from "./zero-jev-profile.js";
import type { SystemOneUsageEvent } from "./zero-systemone.js";
import { selectToolWithJev } from "./zero-tool-selector.js";

export const ZERO_JEV_LIMITS = Object.freeze({
  inputBytes: 16384,
  goalChars: 2000,
  artifactBytes: 98304,
  outstandingJobsPerScope: 4,
  deadlineMs: 120000,
  runtimeMs: 30000,
});
const instant = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)));
const inputSchema = z
  .object({
    goal: z.string().trim().min(1).max(ZERO_JEV_LIMITS.goalChars),
    data: z.string().min(1).max(ZERO_JEV_LIMITS.inputBytes),
    deadline: instant,
    idempotencyKey: z.string().min(1).max(128),
  })
  .strict();
const requestSchema = z
  .object({
    kind: z.literal("zero.jev.request.v1"),
    principal: zeroJevPrincipalSchema,
    profile: zeroJevProfileSchema,
    connectionDigest: z.string().regex(/^[a-f0-9]{64}$/),
    callId: z.string().uuid(),
    input: inputSchema.omit({ idempotencyKey: true }),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
type Request = z.infer<typeof requestSchema>;
export interface ZeroJevWorkerDependencies {
  prisma: PrismaClient;
  pool?: Pool;
  artifacts: ArtifactStore;
  resolve?: ZeroJevResolver;
  /** Offline boundary injection; production omits it and uses the fixed SystemOne transport. */
  fetch?: typeof fetch;
}
const key = (id: string) => `zero.jev-tool.execute:${id}`;
const receiptNonce = (id: string) => `zero.jev.receipt:${id}`;
const context = (principal: ZeroCsvPrincipal, id: string): AdapterContext => ({
  ...principal,
  operationId: id,
  traceId: id,
  signal: AbortSignal.timeout(30000),
});
const descriptions = {
  "csv.parse":
    "Parse a rectangular comma-separated CSV table into rows. Strict quoting, LF/CRLF, no BOM. Does not run code.",
  "json.normalize":
    "Normalize valid JSON to deterministic sorted object keys and compact formatting. Native JSON number and duplicate-key semantics. Does not run code.",
};

/** Native JSON semantics: bounded depth/nodes/collections; object keys sort recursively. */
export function normalizeZeroJson(text: string) {
  if (Buffer.byteLength(text) > ZERO_JEV_LIMITS.inputBytes) throw new Error("input_limit_exceeded");
  let nodes = 1024;
  const normalize = (value: unknown, depth = 0): unknown => {
    if (--nodes < 0 || depth > 8) throw new Error("json_structure_limit_exceeded");
    if (value === null || typeof value === "boolean" || typeof value === "string") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (Array.isArray(value)) {
      if (value.length > 128) throw new Error("json_structure_limit_exceeded");
      return value.map((item) => normalize(item, depth + 1));
    }
    if (!value || typeof value !== "object") throw new Error("invalid_json_value");
    const keys = Object.keys(value).sort();
    if (keys.length > 128 || keys.some((k) => k.length > 128))
      throw new Error("json_structure_limit_exceeded");
    const result: Record<string, unknown> = Object.create(null);
    for (const k of keys) result[k] = normalize((value as Record<string, unknown>)[k], depth + 1);
    return result;
  };
  const normalized = normalize(JSON.parse(text));
  const output = JSON.stringify(normalized);
  nodes = 1024;
  if (JSON.stringify(normalize(JSON.parse(output))) !== output)
    throw new Error("json_verification_failed");
  return { output, verification: { outcome: "pass", verifier: "bounded-json-roundtrip-v1" } };
}

async function connection(deps: ZeroJevWorkerDependencies, principal: ZeroCsvPrincipal) {
  zeroJevPrincipalSchema.parse(principal);
  if (!deps.resolve || Date.parse(principal.expiresAt) <= Date.now()) throw new IsolationError();
  const pending = deps.resolve({ ...principal });
  void pending.catch(() => undefined);
  const result = await withAbort(pending, AbortSignal.timeout(5000));
  const profile = zeroJevProfileSchema.parse(result.profile);
  if (
    Math.min(Date.parse(principal.expiresAt), Date.parse(profile.expiresAt)) <= Date.now() ||
    !/^[a-f0-9]{64}$/.test(result.connectionDigest) ||
    !result.apiKey
  )
    throw new IsolationError();
  return { ...result, profile };
}
async function recheck(deps: ZeroJevWorkerDependencies, request: Request) {
  if (Date.parse(request.input.deadline) <= Date.now()) throw new IsolationError();
  const current = await connection(deps, request.principal);
  if (
    Date.parse(request.input.deadline) <= Date.now() ||
    JSON.stringify(current.profile) !== JSON.stringify(request.profile) ||
    current.connectionDigest !== request.connectionDigest
  )
    throw new IsolationError();
  return current;
}
async function receipt(deps: ZeroJevWorkerDependencies, request: Request, id: string) {
  return deps.prisma.artifact.findUnique({
    where: {
      spaceId_userId_clientNonce: {
        spaceId: request.principal.spaceId,
        userId: request.principal.userId,
        clientNonce: receiptNonce(id),
      },
    },
  });
}
async function load(deps: ZeroJevWorkerDependencies, id: string, principal?: ZeroCsvPrincipal) {
  z.string().uuid().parse(id);
  const row = await deps.prisma.artifact.findFirst({
    where: {
      id,
      name: "zero-jev-request.json",
      ...(principal ? { spaceId: principal.spaceId, userId: principal.userId } : {}),
    },
  });
  if (!row || row.size > ZERO_JEV_LIMITS.artifactBytes) throw new IsolationError();
  const owner = zeroJevPrincipalSchema.parse(JSON.parse(row.description ?? "null")?.principal);
  if (
    row.spaceId !== owner.spaceId ||
    row.userId !== owner.userId ||
    (principal && JSON.stringify(principal) !== JSON.stringify(owner))
  )
    throw new IsolationError();
  const bytes = await deps.artifacts.get(row.storageKey, context(owner, id));
  if (bytes.byteLength !== row.size || zeroCsvHash(bytes) !== row.hash)
    throw new Error("request_integrity_failed");
  const request = requestSchema.parse(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
  const { digest, callId: _, ...binding } = request;
  if (
    zeroCsvHash(JSON.stringify(binding)) !== digest ||
    JSON.stringify(request.principal) !== JSON.stringify(owner)
  )
    throw new Error("request_binding_failed");
  return request;
}

async function publish(
  deps: ZeroJevWorkerDependencies,
  request: Request,
  id: string,
  details: Record<string, unknown>,
) {
  const bytes = Buffer.from(
    JSON.stringify({
      kind: "zero.jev.receipt.v1",
      jobId: id,
      callId: request.callId,
      requestDigest: request.digest,
      inputSha256: zeroCsvHash(request.input.data),
      model: request.profile.model,
      profileRevision: request.profile.revision,
      ...details,
      finishedAt: new Date().toISOString(),
    }),
  );
  if (bytes.byteLength > ZERO_JEV_LIMITS.artifactBytes) throw new Error("receipt_limit_exceeded");
  const ctx = context(request.principal, id);
  const staged = await deps.artifacts.put(
    { name: "zero-jev-receipt.json", mimeType: "application/json", bytes },
    ctx,
  );
  let committed = false;
  try {
    return await deps.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM artifacts WHERE id = ${id} FOR UPDATE`);
        const existing = await tx.artifact.findUnique({
          where: {
            spaceId_userId_clientNonce: {
              spaceId: request.principal.spaceId,
              userId: request.principal.userId,
              clientNonce: receiptNonce(id),
            },
          },
        });
        if (existing) return existing;
        if (details.state === "succeeded") {
          await recheck(deps, request);
          if (Date.now() - Date.parse(String(details.startedAt)) >= ZERO_JEV_LIMITS.runtimeMs)
            throw new Error("job_runtime_exceeded");
        }
        const created = await tx.artifact.create({
          data: {
            spaceId: request.principal.spaceId,
            userId: request.principal.userId,
            name: "zero-jev-receipt.json",
            mimeType: "application/json",
            size: bytes.byteLength,
            description: JSON.stringify({
              state: details.state,
              callId: request.callId,
              requestDigest: request.digest,
            }),
            storageKey: staged.id,
            hash: zeroCsvHash(bytes),
            rootArtifactId: id,
            version: 2,
            clientNonce: receiptNonce(id),
          },
        });
        committed = true;
        return created;
      },
      { timeout: 10000 },
    );
  } finally {
    if (!committed) await deps.artifacts.remove(staged.id, ctx).catch(() => undefined);
  }
}

/** Application supplies its authenticated principal; no public identity fields exist here. */
export function createZeroJevToolService(
  deps: ZeroJevWorkerDependencies & { jobs: JobPublisher },
  trustedPrincipal: ZeroCsvPrincipal,
) {
  const principal = zeroJevPrincipalSchema.parse(trustedPrincipal);
  return {
    async submit(input: unknown) {
      const resolved = await connection(deps, principal);
      const { idempotencyKey, ...params } = inputSchema.parse(input);
      const remaining = Date.parse(params.deadline) - Date.now();
      if (
        Buffer.byteLength(params.data) > ZERO_JEV_LIMITS.inputBytes ||
        remaining <= 0 ||
        remaining > ZERO_JEV_LIMITS.deadlineMs ||
        Date.parse(params.deadline) >
          Math.min(Date.parse(principal.expiresAt), Date.parse(resolved.profile.expiresAt))
      )
        throw new Error("invalid_job_bounds");
      const binding = {
        kind: "zero.jev.request.v1" as const,
        principal,
        profile: resolved.profile,
        connectionDigest: resolved.connectionDigest,
        input: params,
      };
      const digest = zeroCsvHash(JSON.stringify(binding));
      const prefix =
        "zero.jev.request:" +
        zeroCsvHash(JSON.stringify([principal.spaceId, principal.userId, principal.scopeId])) +
        ":";
      const nonce = prefix + zeroCsvHash(idempotencyKey);
      const identity = {
        spaceId_userId_clientNonce: {
          spaceId: principal.spaceId,
          userId: principal.userId,
          clientNonce: nonce,
        },
      };
      const callId = randomUUID();
      const bytes = Buffer.from(JSON.stringify({ ...binding, callId, digest }));
      if (bytes.byteLength > ZERO_JEV_LIMITS.artifactBytes)
        throw new Error("request_limit_exceeded");
      const ctx = context(principal, callId);
      const staged = await deps.artifacts.put(
        { name: "zero-jev-request.json", mimeType: "application/json", bytes },
        ctx,
      );
      let committed = false;
      let row: { id: string };
      try {
        row = await deps.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw(
              Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${prefix}, 0))::text`,
            );
            const existing = await tx.artifact.findUnique({ where: identity });
            if (existing) {
              if (JSON.parse(existing.description ?? "null")?.digest !== digest)
                throw new Error("idempotency_key_conflict");
              return existing;
            }
            const count = await tx.artifact.count({
              where: {
                spaceId: principal.spaceId,
                userId: principal.userId,
                clientNonce: { startsWith: prefix },
                versions: { none: { name: "zero-jev-receipt.json" } },
              },
            });
            if (count >= ZERO_JEV_LIMITS.outstandingJobsPerScope)
              throw new Error("scope_job_limit_exceeded");
            await recheck(deps, { ...binding, callId, digest });
            const created = await tx.artifact.create({
              data: {
                id: randomUUID(),
                spaceId: principal.spaceId,
                userId: principal.userId,
                name: "zero-jev-request.json",
                mimeType: "application/json",
                size: bytes.byteLength,
                storageKey: staged.id,
                hash: zeroCsvHash(bytes),
                version: 1,
                clientNonce: nonce,
                description: JSON.stringify({ principal, digest }),
              },
            });
            committed = true;
            return created;
          },
          { timeout: 10000 },
        );
      } finally {
        if (!committed) await deps.artifacts.remove(staged.id, ctx).catch(() => undefined);
      }
      const request = await load(deps, row.id, principal);
      if (!(await receipt(deps, request, row.id)))
        await deps.jobs.enqueue({
          name: "zero.jev-tool.execute",
          payload: { requestArtifactId: row.id },
          replaceKey: key(row.id),
          keepExisting: true,
          maxAttempts: 1,
        });
      return { jobId: row.id, callId: request.callId, requestDigest: request.digest };
    },
    async get(id: string) {
      await connection(deps, principal);
      const request = await load(deps, id, principal);
      const row = await receipt(deps, request, id);
      if (!row)
        return {
          jobId: id,
          callId: request.callId,
          state: "unknown",
          reason: "no_terminal_receipt",
        };
      if (
        row.name !== "zero-jev-receipt.json" ||
        row.rootArtifactId !== id ||
        row.version !== 2 ||
        row.size > ZERO_JEV_LIMITS.artifactBytes
      )
        throw new Error("receipt_binding_failed");
      const bytes = await deps.artifacts.get(row.storageKey, context(principal, id));
      if (bytes.byteLength !== row.size || zeroCsvHash(bytes) !== row.hash)
        throw new Error("receipt_integrity_failed");
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    },
  };
}

export async function runZeroJevTool(deps: ZeroJevWorkerDependencies, id: string) {
  const request = await load(deps, id);
  if (await receipt(deps, request, id)) return;
  const startedAt = Date.now();
  let usage: SystemOneUsageEvent | null = null;
  let priorInvocation = false;
  let reservationUncertain = false;
  let toolExecuted: string | null = null;
  try {
    const pool = deps.pool;
    if (!pool) throw new Error("Routing budget unavailable");
    const resolved = await recheck(deps, request);
    const signal = AbortSignal.timeout(
      Math.min(
        request.profile.timeoutMs,
        Math.max(1, Date.parse(request.input.deadline) - Date.now()),
      ),
    );
    const selection = await selectToolWithJev(
      {
        apiKey: resolved.apiKey,
        model: resolved.profile.model,
        timeoutMs: resolved.profile.timeoutMs,
      },
      {
        fetch: deps.fetch,
        reserve: async (invocationId) => {
          await recheck(deps, request);
          reservationUncertain = true;
          const admitted = await reserveBudgetInvocation(pool, {
            invocationId,
            accountId: request.profile.payerAccountId,
            lane: request.profile.lane,
            usdMicros: BigInt(request.profile.reserveUsdMicros),
            tokens: BigInt(request.profile.reserveTokens),
          });
          if (!admitted) {
            const prior = await pool.query(
              'SELECT 1 FROM zero_budget_reservations WHERE "invocationId" = $1',
              [invocationId],
            );
            priorInvocation = prior.rowCount === 1;
          }
          reservationUncertain = false;
          return admitted;
        },
        authorizeDispatch: async () => {
          await recheck(deps, request);
          return true;
        },
        stillEligible: async (toolId, revision) => {
          await recheck(deps, request);
          return (
            request.profile.tools.includes(toolId as "csv.parse" | "json.normalize") &&
            revision === request.profile.revision
          );
        },
        onUsage: async (event) => {
          usage = event;
          await recordUsage(deps.prisma, event, {
            spaceId: request.principal.spaceId,
            userId: request.principal.userId,
            operationId: id,
            operationKind: "retrieval",
          });
        },
      },
      {
        invocationId: request.callId,
        generation: 0,
        goal: request.input.goal,
        signal,
        tools: request.profile.tools.map((toolId) => ({
          id: toolId,
          revision: request.profile.revision,
          description: descriptions[toolId],
          enabled: true,
          authorized: true,
        })),
      },
    );
    const accounting = () => ({
      usage,
      dispatchAttempts: usage ? 1 : priorInvocation || reservationUncertain ? null : 0,
      priorInvocation,
      startedAt: new Date(startedAt).toISOString(),
      elapsedMs: Date.now() - startedAt,
    });
    if (selection.status !== "selected") {
      await publish(deps, request, id, {
        state: priorInvocation || reservationUncertain ? "unknown" : selection.status,
        selection,
        tool: null,
        ...accounting(),
      });
      return;
    }
    signal.throwIfAborted();
    await recheck(deps, request);
    let result: unknown;
    let source: unknown;
    if (selection.toolId === "csv.parse") {
      const component = await prepareZeroCsvComponent();
      source = {
        profile: component.profile,
        files: component.files.map((file) => ({ path: file.path, sha256: file.sha256 })),
      };
      result = executeZeroCsv(request.input.data);
    } else if (selection.toolId === "json.normalize") {
      source = { profile: "bounded-native-json-v1" };
      result = normalizeZeroJson(request.input.data);
    } else throw new Error("tool_not_allowed");
    toolExecuted = selection.toolId;
    signal.throwIfAborted();
    await recheck(deps, request);
    await publish(deps, request, id, {
      state: "succeeded",
      selection,
      source,
      tool: {
        id: selection.toolId,
        revision: selection.revision,
        outputSha256: zeroCsvHash(JSON.stringify(result)),
        result,
      },
      ...accounting(),
    });
  } catch {
    await publish(deps, request, id, {
      state: usage || priorInvocation || reservationUncertain ? "unknown" : "blocked",
      reason: "profile_tool_or_receipt_unavailable",
      toolExecuted,
      startedAt: new Date(startedAt).toISOString(),
      dispatchAttempts: usage ? 1 : priorInvocation || reservationUncertain ? null : 0,
      usage,
      tool: null,
      elapsedMs: Date.now() - startedAt,
    });
  }
}
