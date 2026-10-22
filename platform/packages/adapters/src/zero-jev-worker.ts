/** One selected-profile job on the existing queue. No default paid activation or retry. */
import { randomUUID } from "node:crypto";
import type {
  AdapterContext,
  ArtifactStore,
  JobPublisher,
} from "@rakazo/adapter-kit";
import type { Artifact, PrismaClient } from "@rakazo/db";
import {
  IsolationError,
  Prisma,
  recordUsage,
  reserveBudgetInvocation,
} from "@rakazo/db";
import type { Pool } from "pg";
import { z } from "zod";
import {
  eligibleZeroReuseModules,
  zeroReuseModules,
} from "@rakazo/core/zero-reuse-modules";
import type { ZeroReuseToolId } from "@rakazo/core/zero-reuse-modules";
import { withAbort } from "./web-ssrf.js";
import type { ZeroCsvPrincipal } from "./zero-csv-preparation.js";
import {
  executeZeroCsv,
  prepareZeroCsvComponent,
  zeroCsvHash,
} from "./zero-csv-profile.js";
import type { ZeroJevResolver } from "./zero-jev-profile.js";
import {
  zeroJevPrincipalSchema,
  zeroJevProfileSchema,
} from "./zero-jev-profile.js";
import type { SystemOneUsageEvent } from "./zero-systemone.js";
import { selectToolWithJev } from "./zero-tool-selector.js";
import { ZERO_JEV_LIMITS } from "./zero-jev-limits.js";
import { prepareZeroReuseModule } from "./zero-reuse-module.js";
import type { ZeroReuseVerifierConfig } from "./zero-reuse-verifier.js";
import { verifyZeroReuseModule } from "./zero-reuse-verifier.js";
import {
  zeroJevExecuteInputSchema,
  zeroJevStoredInputSchema,
} from "./zero-jev-contract.js";
import { sourceSelectionOptions } from "./zero-source-selection.js";
import { selectRepositoryWithJev } from "./zero-repository-selector.js";

export { ZERO_JEV_LIMITS } from "./zero-jev-limits.js";
const instant = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)));
const inputSchema = zeroJevExecuteInputSchema;
const requestSchema = z
  .object({
    kind: z.literal("zero.jev.request.v1"),
    principal: zeroJevPrincipalSchema,
    profile: zeroJevProfileSchema,
    connectionDigest: z.string().regex(/^[a-f0-9]{64}$/),
    callId: z.string().uuid(),
    input: zeroJevStoredInputSchema,
    // Zod preserves schema order. Keep signed optional fields after input, as in submit().
    moduleCatalogDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    sourceCatalogDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
type Request = z.infer<typeof requestSchema>;
interface Header {
  row: Artifact;
  principal: ZeroCsvPrincipal;
  digest: string;
  callId: string | null;
  model: string | null;
  profileRevision: string | null;
  deadline: string | null;
  profileDigest: string | null;
  connectionDigest: string | null;
}
export interface ZeroJevWorkerDependencies {
  prisma: PrismaClient;
  pool?: Pool;
  artifacts: ArtifactStore;
  resolve?: ZeroJevResolver;
  /** Offline boundary injection; production omits it and uses the fixed SystemOne transport. */
  fetch?: typeof fetch;
  resolveReuseVerifier?: (
    principal: ZeroCsvPrincipal,
  ) => Promise<ZeroReuseVerifierConfig | undefined>;
  /** Optional cumulative allocation outside this DB; failure retains the DB hold and denies dispatch. */
  reserveExternalBudget?: (invocationId: string) => Promise<boolean>;
}
const key = (id: string) => `zero.jev-tool.execute:${id}`;
const receiptNonce = (id: string) => `zero.jev.receipt:${id}`;
const context = (principal: ZeroCsvPrincipal, id: string): AdapterContext => ({
  ...principal,
  operationId: id,
  traceId: id,
  signal: AbortSignal.timeout(30000),
});
const descriptions: Record<string, string> = {
  "csv.parse":
    "Parse a rectangular comma-separated CSV table into rows. Strict quoting, LF/CRLF, no BOM. Does not run code.",
  "json.normalize":
    "Normalize valid JSON to deterministic sorted object keys and compact formatting. Native JSON number and duplicate-key semantics. Does not run code.",
  ...Object.fromEntries(
    zeroReuseModules.map((module) => [module.toolId, module.description]),
  ),
};

/** Native JSON semantics: bounded depth/nodes/collections; object keys sort recursively. */
export function normalizeZeroJson(text: string) {
  if (Buffer.byteLength(text) > ZERO_JEV_LIMITS.inputBytes)
    throw new Error("input_limit_exceeded");
  let nodes = 1024;
  const normalize = (value: unknown, depth = 0): unknown => {
    if (--nodes < 0 || depth > 8)
      throw new Error("json_structure_limit_exceeded");
    if (
      value === null ||
      typeof value === "boolean" ||
      typeof value === "string"
    )
      return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (Array.isArray(value)) {
      if (value.length > 128) throw new Error("json_structure_limit_exceeded");
      return value.map((item) => normalize(item, depth + 1));
    }
    if (!value || typeof value !== "object")
      throw new Error("invalid_json_value");
    const keys = Object.keys(value).sort();
    if (keys.length > 128 || keys.some((k) => k.length > 128))
      throw new Error("json_structure_limit_exceeded");
    const result: Record<string, unknown> = Object.create(null);
    for (const k of keys)
      result[k] = normalize((value as Record<string, unknown>)[k], depth + 1);
    return result;
  };
  const normalized = normalize(JSON.parse(text));
  const output = JSON.stringify(normalized);
  nodes = 1024;
  if (JSON.stringify(normalize(JSON.parse(output))) !== output)
    throw new Error("json_verification_failed");
  return {
    output,
    verification: { outcome: "pass", verifier: "bounded-json-roundtrip-v1" },
  };
}

async function connection(
  deps: ZeroJevWorkerDependencies,
  principal: ZeroCsvPrincipal,
) {
  zeroJevPrincipalSchema.parse(principal);
  if (!deps.resolve || Date.parse(principal.expiresAt) <= Date.now())
    throw new IsolationError();
  const pending = deps.resolve({ ...principal });
  void pending.catch(() => undefined);
  const result = await withAbort(pending, AbortSignal.timeout(5000));
  const profile = zeroJevProfileSchema.parse(result.profile);
  if (
    Math.min(Date.parse(principal.expiresAt), Date.parse(profile.expiresAt)) <=
      Date.now() ||
    !/^[a-f0-9]{64}$/.test(result.connectionDigest) ||
    !result.apiKey
  )
    throw new IsolationError();
  return { ...result, profile };
}
async function recheck(deps: ZeroJevWorkerDependencies, request: Request) {
  if (Date.parse(request.input.deadline) <= Date.now())
    throw new IsolationError();
  const current = await connection(deps, request.principal);
  if (
    Date.parse(request.input.deadline) <= Date.now() ||
    JSON.stringify(current.profile) !== JSON.stringify(request.profile) ||
    current.connectionDigest !== request.connectionDigest ||
    (request.input.mode === "prepare-component" &&
      request.moduleCatalogDigest !==
        zeroCsvHash(JSON.stringify(zeroReuseModules))) ||
    (request.input.mode === "select-source" &&
      request.sourceCatalogDigest !==
        zeroCsvHash(
          JSON.stringify(
            sourceSelectionOptions(
              request.input.candidateIds!,
              current.profile.sourceRepositories ?? [],
            ),
          ),
        ))
  )
    throw new IsolationError();
  return current;
}
async function receipt(
  deps: ZeroJevWorkerDependencies,
  request: Pick<Request, "principal">,
  id: string,
) {
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
async function loadHeader(
  deps: ZeroJevWorkerDependencies,
  id: string,
  principal?: ZeroCsvPrincipal,
): Promise<Header> {
  z.string().uuid().parse(id);
  const row = await deps.prisma.artifact.findFirst({
    where: {
      id,
      name: "zero-jev-request.json",
      ...(principal
        ? { spaceId: principal.spaceId, userId: principal.userId }
        : {}),
    },
  });
  if (!row || row.size > ZERO_JEV_LIMITS.artifactBytes)
    throw new IsolationError();
  const metadata = z
    .object({
      principal: zeroJevPrincipalSchema,
      digest: z.string().regex(/^[a-f0-9]{64}$/),
      callId: z.string().uuid().optional(),
      model: z.string().min(1).max(200).optional(),
      profileRevision: z.string().min(1).max(128).optional(),
      deadline: instant.optional(),
      profileDigest: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
      connectionDigest: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
    })
    .strict()
    .parse(JSON.parse(row.description ?? "null"));
  const owner = metadata.principal;
  if (
    row.spaceId !== owner.spaceId ||
    row.userId !== owner.userId ||
    (principal && JSON.stringify(principal) !== JSON.stringify(owner))
  )
    throw new IsolationError();
  return {
    row,
    principal: owner,
    digest: metadata.digest,
    callId: metadata.callId ?? null,
    model: metadata.model ?? null,
    profileRevision: metadata.profileRevision ?? null,
    deadline: metadata.deadline ?? null,
    profileDigest: metadata.profileDigest ?? null,
    connectionDigest: metadata.connectionDigest ?? null,
  };
}
async function load(
  deps: ZeroJevWorkerDependencies,
  id: string,
  principal?: ZeroCsvPrincipal,
  cached?: Header,
) {
  const header = cached ?? (await loadHeader(deps, id, principal));
  const { row, principal: owner } = header;
  // Metadata-only authorization precedes every private request read. Original principal never renews itself.
  const current = await connection(deps, principal ?? owner);
  if (
    !header.callId ||
    !header.deadline ||
    header.model !== current.profile.model ||
    header.profileRevision !== current.profile.revision ||
    header.profileDigest !== zeroCsvHash(JSON.stringify(current.profile)) ||
    header.connectionDigest !== current.connectionDigest ||
    Date.parse(header.deadline) <= Date.now()
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
    digest !== header.digest ||
    request.callId !== header.callId ||
    request.input.deadline !== header.deadline ||
    JSON.stringify(request.principal) !== JSON.stringify(owner) ||
    JSON.stringify(current.profile) !== JSON.stringify(request.profile) ||
    current.connectionDigest !== request.connectionDigest
  )
    throw new IsolationError();
  return request;
}

async function publish(
  deps: ZeroJevWorkerDependencies,
  request: Request | Header,
  id: string,
  details: Record<string, unknown>,
) {
  const bytes = Buffer.from(
    JSON.stringify({
      kind: "zero.jev.receipt.v1",
      jobId: id,
      callId: request.callId,
      requestDigest: request.digest,
      ...("input" in request
        ? { inputSha256: zeroCsvHash(request.input.data) }
        : {}),
      model: "profile" in request ? request.profile.model : request.model,
      profileRevision:
        "profile" in request
          ? request.profile.revision
          : request.profileRevision,
      ...details,
      finishedAt: new Date().toISOString(),
    }),
  );
  if (bytes.byteLength > ZERO_JEV_LIMITS.artifactBytes)
    throw new Error("receipt_limit_exceeded");
  const ctx = context(request.principal, id);
  const staged = await deps.artifacts.put(
    { name: "zero-jev-receipt.json", mimeType: "application/json", bytes },
    ctx,
  );
  let committed = false;
  try {
    return await deps.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM artifacts WHERE id = ${id} FOR UPDATE`,
        );
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
          if (!("input" in request)) throw new IsolationError();
          await recheck(deps, request);
          if (
            Date.now() - Date.parse(String(details.startedAt)) >=
            ZERO_JEV_LIMITS.runtimeMs
          )
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
    if (!committed)
      await deps.artifacts.remove(staged.id, ctx).catch(() => undefined);
  }
}

/** A read-only check, never a reservation or proof of provider entitlement/pricing. */
export async function getZeroJevAvailability(
  deps: ZeroJevWorkerDependencies,
  principal: ZeroCsvPrincipal,
) {
  const resolved = await connection(deps, principal);
  if (!deps.pool) throw new Error("routing_budget_unavailable");
  const available = await deps.pool.query(
    'SELECT 1 FROM zero_budget_accounts a JOIN zero_budget_lanes l ON l."accountId" = a.id WHERE a.id = $1 AND l.id = $2 AND a.enabled AND l.enabled AND a."reservedCalls" < a."callLimit" AND l."reservedCalls" < l."callLimit" AND a."usdLimitMicros" - a."reservedUsdMicros" >= $3 AND l."usdLimitMicros" - l."reservedUsdMicros" >= $3 AND a."tokenLimit" - a."reservedTokens" >= $4 AND l."tokenLimit" - l."reservedTokens" >= $4',
    [
      resolved.profile.payerAccountId,
      resolved.profile.lane,
      resolved.profile.reserveUsdMicros,
      resolved.profile.reserveTokens,
    ],
  );
  if (!available.rowCount) throw new Error("routing_budget_unavailable");
  return {
    profile: "jev-tool-selector-v1" as const,
    backend: "available" as const,
    execution: "jev-tool-selection" as const,
    paidModelCalls: 0 as const,
    profileRevision: resolved.profile.revision,
    model: resolved.profile.model,
    tools: resolved.profile.tools,
    ...(resolved.profile.sourceRepositories
      ? { sourceRepositories: resolved.profile.sourceRepositories }
      : {}),
    limits: ZERO_JEV_LIMITS,
  };
}
async function lookupReceipt(
  deps: ZeroJevWorkerDependencies,
  principal: ZeroCsvPrincipal,
  id: string,
) {
  await connection(deps, principal);
  const header = await loadHeader(deps, id, principal);
  const row = await receipt(deps, header, id);
  if (
    row &&
    (row.name !== "zero-jev-receipt.json" ||
      row.rootArtifactId !== id ||
      row.version !== 2 ||
      row.spaceId !== principal.spaceId ||
      row.userId !== principal.userId ||
      row.size > ZERO_JEV_LIMITS.artifactBytes)
  )
    throw new IsolationError();
  return { header, row };
}
async function readReceipt(
  deps: ZeroJevWorkerDependencies,
  principal: ZeroCsvPrincipal,
  id: string,
) {
  const { header, row } = await lookupReceipt(deps, principal, id);
  if (!row) throw new IsolationError();
  // Receipt bytes may contain task output: authorize immediately before reading them too.
  await connection(deps, principal);
  const bytes = await deps.artifacts.get(
    row.storageKey,
    context(principal, id),
  );
  if (bytes.byteLength !== row.size || zeroCsvHash(bytes) !== row.hash)
    throw new Error("receipt_integrity_failed");
  const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const body = JSON.parse(content);
  if (
    body.jobId !== id ||
    body.requestDigest !== header.digest ||
    body.callId !== header.callId
  )
    throw new Error("receipt_binding_failed");
  return {
    artifactId: row.id,
    revision: 2 as const,
    sha256: row.hash,
    content,
  };
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
          Math.min(
            Date.parse(principal.expiresAt),
            Date.parse(resolved.profile.expiresAt),
          )
      )
        throw new Error("invalid_job_bounds");
      const binding = {
        kind: "zero.jev.request.v1" as const,
        principal,
        profile: resolved.profile,
        connectionDigest: resolved.connectionDigest,
        input: params,
        ...(params.mode === "prepare-component"
          ? {
              moduleCatalogDigest: zeroCsvHash(
                JSON.stringify(zeroReuseModules),
              ),
            }
          : {}),
        ...(params.mode === "select-source"
          ? {
              sourceCatalogDigest: zeroCsvHash(
                JSON.stringify(
                  sourceSelectionOptions(
                    params.candidateIds!,
                    resolved.profile.sourceRepositories ?? [],
                  ),
                ),
              ),
            }
          : {}),
      };
      const digest = zeroCsvHash(JSON.stringify(binding));
      const prefix =
        "zero.jev.request:" +
        zeroCsvHash(
          JSON.stringify([
            principal.spaceId,
            principal.userId,
            principal.scopeId,
          ]),
        ) +
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
                description: JSON.stringify({
                  principal,
                  digest,
                  callId,
                  model: binding.profile.model,
                  profileRevision: binding.profile.revision,
                  deadline: params.deadline,
                  profileDigest: zeroCsvHash(JSON.stringify(binding.profile)),
                  connectionDigest: binding.connectionDigest,
                }),
              },
            });
            committed = true;
            return created;
          },
          { timeout: 10000 },
        );
      } finally {
        if (!committed)
          await deps.artifacts.remove(staged.id, ctx).catch(() => undefined);
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
      return {
        jobId: row.id,
        callId: request.callId,
        requestDigest: request.digest,
      };
    },
    async job(id: string) {
      const { header, row } = await lookupReceipt(deps, principal, id);
      if (!row)
        return {
          jobId: id,
          callId: header.callId,
          state: "unknown" as const,
          reason: "no_terminal_receipt" as const,
        };
      const metadata = z
        .object({
          state: z.enum([
            "succeeded",
            "failed",
            "blocked",
            "abstained",
            "unknown",
          ]),
          callId: z.string().uuid().nullable(),
          requestDigest: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict()
        .parse(JSON.parse(row.description ?? "null"));
      if (
        metadata.callId !== header.callId ||
        metadata.requestDigest !== header.digest
      )
        throw new IsolationError();
      return {
        jobId: id,
        ...metadata,
        artifactId: row.id,
        revision: 2 as const,
        sha256: row.hash,
      };
    },
    artifact: (id: string) => readReceipt(deps, principal, id),
    async get(id: string) {
      const { header, row } = await lookupReceipt(deps, principal, id);
      if (!row)
        return {
          jobId: id,
          callId: header.callId,
          state: "unknown",
          reason: "no_terminal_receipt",
        };
      return JSON.parse((await readReceipt(deps, principal, id)).content);
    },
  };
}

export async function runZeroJevTool(
  deps: ZeroJevWorkerDependencies,
  id: string,
) {
  const header = await loadHeader(deps, id);
  if (await receipt(deps, header, id)) return;
  let request: Request;
  try {
    request = await load(deps, id, undefined, header);
  } catch (error) {
    if (!(error instanceof IsolationError)) throw error;
    await publish(deps, header, id, {
      state: "blocked",
      reason: "project_scope_rejected",
      dispatchAttempts: 0,
      tool: null,
      usage: null,
    });
    return;
  }
  const startedAt = Date.now();
  let usage: SystemOneUsageEvent | null = null;
  let priorInvocation = false;
  let reservationUncertain = false;
  let toolExecuted: string | null = null;
  try {
    const pool = deps.pool;
    if (!pool) throw new Error("Routing budget unavailable");
    const resolved = await recheck(deps, request);
    if (request.input.mode === "verify-component") {
      const artifact = await readReceipt(
        deps,
        request.principal,
        request.input.data,
      );
      const preparation = JSON.parse(artifact.content);
      const toolId = preparation.selection?.toolId;
      if (
        preparation.state !== "succeeded" ||
        preparation.phase !== "prepared" ||
        !zeroReuseModules.some((module) => module.toolId === toolId) ||
        !request.profile.tools.includes(toolId)
      )
        throw new IsolationError();
      const component = await prepareZeroReuseModule(toolId);
      if (JSON.stringify(component) !== JSON.stringify(preparation.component))
        throw new Error("prepared_module_changed");
      const config = await deps.resolveReuseVerifier?.(request.principal);
      if (!config) throw new IsolationError();
      const verification = await verifyZeroReuseModule(
        config,
        component,
        request.principal.scopeId,
        AbortSignal.timeout(
          Math.min(
            20000,
            Math.max(1, Date.parse(request.input.deadline) - Date.now()),
          ),
        ),
        async () => {
          await recheck(deps, request);
          if (
            JSON.stringify(
              await deps.resolveReuseVerifier?.(request.principal),
            ) !== JSON.stringify(config)
          )
            throw new IsolationError();
        },
      );
      await recheck(deps, request);
      if (
        JSON.stringify(await deps.resolveReuseVerifier?.(request.principal)) !==
        JSON.stringify(config)
      )
        throw new IsolationError();
      await publish(deps, request, id, {
        state: verification.outcome === "pass" ? "succeeded" : "failed",
        phase: "verified",
        preparationJobId: request.input.data,
        preparationSha256: artifact.sha256,
        verification,
        dispatchAttempts: 0,
        usage: null,
        startedAt: new Date(startedAt).toISOString(),
        elapsedMs: Date.now() - startedAt,
      });
      return;
    }
    const signal = AbortSignal.timeout(
      Math.min(
        request.profile.timeoutMs,
        Math.max(1, Date.parse(request.input.deadline) - Date.now()),
      ),
    );
    const config = {
      apiKey: resolved.apiKey,
      model: resolved.profile.model,
      timeoutMs: resolved.profile.timeoutMs,
    };
    const paid = {
      fetch: deps.fetch,
      reserve: async (invocationId: string) => {
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
        if (
          admitted &&
          deps.reserveExternalBudget &&
          !(await deps.reserveExternalBudget(invocationId))
        )
          return null;
        return admitted;
      },
      authorizeDispatch: async () => {
        await recheck(deps, request);
        return true;
      },
      onUsage: async (event: SystemOneUsageEvent) => {
        usage = event;
        await recordUsage(deps.prisma, event, {
          spaceId: request.principal.spaceId,
          userId: request.principal.userId,
          operationId: id,
          operationKind: "retrieval",
        });
      },
    };
    const accounting = () => ({
      usage,
      dispatchAttempts: usage
        ? 1
        : priorInvocation || reservationUncertain
          ? null
          : 0,
      priorInvocation,
      startedAt: new Date(startedAt).toISOString(),
      elapsedMs: Date.now() - startedAt,
    });
    if (request.input.mode === "select-source") {
      const candidates = sourceSelectionOptions(
        request.input.candidateIds!,
        request.profile.sourceRepositories ?? [],
      );
      const selection = await selectRepositoryWithJev(
        config,
        {
          ...paid,
          stillEligible: async (repository, revision) => {
            await recheck(deps, request);
            return candidates.some(
              (candidate) =>
                candidate.repository === repository &&
                candidate.sourceRevision === revision,
            );
          },
        },
        {
          invocationId: request.callId,
          generation: 0,
          signal,
          goal: request.input.goal,
          candidates,
          assessSingle: true,
        },
      );
      await publish(deps, request, id, {
        state:
          priorInvocation || reservationUncertain
            ? "unknown"
            : selection.status === "recommended"
              ? "succeeded"
              : selection.status === "missing"
                ? "abstained"
                : selection.status,
        phase: "selected",
        selection,
        candidates: candidates.map(({ repository, sourceRevision }) => ({
          repository,
          sourceRevision,
        })),
        prepared: false,
        verified: false,
        tool: null,
        ...accounting(),
      });
      return;
    }
    const selection = await selectToolWithJev(
      config,
      {
        ...paid,
        stillEligible: async (toolId, revision) => {
          await recheck(deps, request);
          return (
            request.profile.tools.some((id) => id === toolId) &&
            revision === request.profile.revision
          );
        },
      },
      {
        invocationId: request.callId,
        generation: 0,
        goal: request.input.goal,
        signal,
        tools: request.profile.tools
          .filter((toolId) =>
            request.input.mode === "prepare-component"
              ? eligibleZeroReuseModules(request.input.goal).some(
                  (module) => module.toolId === toolId,
                )
              : !toolId.startsWith("module."),
          )
          .map((toolId) => ({
            id: toolId,
            revision: request.profile.revision,
            description: descriptions[toolId]!,
            enabled: true,
            authorized: true,
          })),
      },
    );
    if (selection.status !== "selected") {
      await publish(deps, request, id, {
        state:
          priorInvocation || reservationUncertain
            ? "unknown"
            : selection.status === "missing"
              ? "abstained"
              : selection.status,
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
    if (request.input.mode === "prepare-component") {
      const component = await prepareZeroReuseModule(
        selection.toolId as ZeroReuseToolId,
      );
      const integration = await deps.resolveReuseVerifier?.(request.principal);
      signal.throwIfAborted();
      await recheck(deps, request);
      await publish(deps, request, id, {
        state: "succeeded",
        phase: "prepared",
        selection,
        component,
        integration:
          integration?.projectRelativeRoot &&
          integration.entrypoints[component.capability]
            ? {
                directory: integration.projectRelativeRoot,
                entrypoint: integration.entrypoints[component.capability],
              }
            : null,
        ...accounting(),
      });
      return;
    } else if (selection.toolId === "csv.parse") {
      const component = await prepareZeroCsvComponent();
      source = {
        profile: component.profile,
        files: component.files.map((file) => ({
          path: file.path,
          sha256: file.sha256,
        })),
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
      state:
        usage || priorInvocation || reservationUncertain
          ? "unknown"
          : "blocked",
      reason: "profile_tool_or_receipt_unavailable",
      toolExecuted,
      startedAt: new Date(startedAt).toISOString(),
      dispatchAttempts: usage
        ? 1
        : priorInvocation || reservationUncertain
          ? null
          : 0,
      usage,
      tool: null,
      elapsedMs: Date.now() - startedAt,
    });
  }
}
