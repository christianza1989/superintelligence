import type { ArtifactStore, JobPublisher } from "@rakazo/adapter-kit";
import type { ZeroCsvAuthorize, ZeroCsvPrincipal } from "@rakazo/adapters";
import {
  createZeroCsvPreparationService,
  ZERO_CSV_LIMITS,
  ZERO_CSV_PROFILE,
} from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { IsolationError } from "@rakazo/db";
import type { Context, Hono } from "hono";
import { readBoundedBody } from "./http-body.js";

/** Operator-owned project grants. The same authorizer guards worker dispatch. */
export interface ZeroCsvScopePolicy {
  resolve(actor: Actor, scopeId: string): Promise<ZeroCsvPrincipal>;
  authorize: ZeroCsvAuthorize;
}
export const ZERO_CSV_API_PREFIX = "/api/zero/csv/scopes";
const MAX_REQUEST_BYTES = 36 * 1024;
const MAX_PAGE_BYTES = 16 * 1024;
type Service = ReturnType<typeof createZeroCsvPreparationService>;

export function mountZeroCsvRoutes(
  app: Hono,
  deps: {
    prisma: PrismaClient;
    artifacts: ArtifactStore;
    jobs: JobPublisher;
    policy?: ZeroCsvScopePolicy;
    authenticate(request: Request): Promise<Actor | null>;
    trustedOrigin(origin: string): boolean;
  },
) {
  const scoped = async (c: Context, action: (service: Service) => Promise<Response>) => {
    c.header("cache-control", "no-store");
    try {
      const actor = await deps.authenticate(c.req.raw);
      if (!actor) return c.json({ error: "authentication_required" }, 401);
      const origin = c.req.header("origin");
      if (
        (origin && !deps.trustedOrigin(origin)) ||
        c.req.header("sec-fetch-site") === "cross-site"
      )
        return c.json({ error: "origin_rejected" }, 403);
      if (!deps.policy) return c.json({ error: "project_policy_unavailable" }, 503);
      const scopeId = c.req.param("scopeId");
      if (!scopeId || scopeId.length > 128) return c.json({ error: "invalid_scope" }, 400);
      const principal = await deps.policy.resolve(actor, scopeId);
      if (
        principal.userId !== actor.userId ||
        principal.spaceId !== actor.spaceId ||
        principal.scopeId !== scopeId
      )
        throw new IsolationError();
      if (
        !Number.isFinite(Date.parse(principal.expiresAt)) ||
        Date.parse(principal.expiresAt) <= Date.now()
      )
        throw new IsolationError();
      await deps.policy.authorize(principal);
      const service = createZeroCsvPreparationService(
        {
          prisma: deps.prisma,
          artifacts: deps.artifacts,
          jobs: deps.jobs,
          authorize: (owner) => deps.policy!.authorize(owner),
        },
        principal,
      );
      return await action(service);
    } catch (error) {
      if (error instanceof IsolationError) return c.json({ error: "project_scope_rejected" }, 403);
      if (error instanceof Error && error.name === "ZodError")
        return c.json({ error: "invalid_request" }, 400);
      if (
        error instanceof Error &&
        ["idempotency_key_conflict", "idempotency_key_expired"].includes(error.message)
      )
        return c.json({ error: error.message }, 409);
      if (error instanceof Error && error.message === "scope_job_limit_exceeded")
        return c.json({ error: error.message }, 429);
      if (
        error instanceof Error &&
        ["csv_limit_exceeded", "invalid_job_deadline"].includes(error.message)
      )
        return c.json({ error: error.message }, 400);
      // Never expose SQL, input contents, filesystem paths or credential details.
      return c.json({ error: "preparation_backend_unavailable" }, 503);
    }
  };
  const jsonBody = async (c: Context) => {
    if (c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json")
      return { error: c.json({ error: "json_required" }, 415) };
    const raw = await readBoundedBody(c.req.raw, MAX_REQUEST_BYTES);
    if (raw === null) return { error: c.json({ error: "request_too_large" }, 413) };
    try {
      return { value: JSON.parse(raw) as unknown };
    } catch {
      return { error: c.json({ error: "invalid_json" }, 400) };
    }
  };
  app.get(`${ZERO_CSV_API_PREFIX}/:scopeId/status`, (c) =>
    scoped(c, async () =>
      c.json({
        profile: ZERO_CSV_PROFILE,
        backend: "available",
        paidModelCalls: 0,
        execution: "csv-preparation-only",
        limits: ZERO_CSV_LIMITS,
      }),
    ),
  );
  app.post(`${ZERO_CSV_API_PREFIX}/:scopeId/prepare`, (c) =>
    scoped(c, async (service) => {
      const body = await jsonBody(c);
      if (body.error) return body.error;
      return c.json(await service.submit(body.value), 202);
    }),
  );
  app.get(`${ZERO_CSV_API_PREFIX}/:scopeId/jobs/:jobId`, (c) =>
    scoped(c, async (service) => c.json(await service.get(c.req.param("jobId")))),
  );
  app.post(`${ZERO_CSV_API_PREFIX}/:scopeId/jobs/:jobId/cancel`, (c) =>
    scoped(c, async (service) => {
      const body = await jsonBody(c);
      if (body.error) return body.error;
      if (
        !body.value ||
        typeof body.value !== "object" ||
        Array.isArray(body.value) ||
        Object.keys(body.value).length
      )
        return c.json({ error: "invalid_request" }, 400);
      return c.json(await service.cancel(c.req.param("jobId")));
    }),
  );
  app.get(`${ZERO_CSV_API_PREFIX}/:scopeId/jobs/:jobId/artifact`, (c) =>
    scoped(c, async (service) => {
      const query = c.req.query();
      if (
        Object.keys(query).some((key) => key !== "offset" && key !== "limit") ||
        !/^\d+$/.test(query.offset ?? "0") ||
        !/^\d+$/.test(query.limit ?? String(MAX_PAGE_BYTES))
      )
        return c.json({ error: "invalid_page" }, 400);
      const offset = Number(query.offset ?? "0");
      const limit = Number(query.limit ?? MAX_PAGE_BYTES);
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > MAX_PAGE_BYTES
      )
        return c.json({ error: "invalid_page" }, 400);
      const artifact = await service.artifact(c.req.param("jobId"));
      const bytes = Buffer.from(artifact.content);
      if (offset > bytes.byteLength) return c.json({ error: "invalid_page" }, 400);
      const end = Math.min(offset + limit, bytes.byteLength);
      return c.json({
        artifactId: artifact.artifactId,
        revision: artifact.revision,
        sha256: artifact.sha256,
        totalBytes: bytes.byteLength,
        offset,
        nextOffset: end < bytes.byteLength ? end : null,
        encoding: "base64",
        contentBase64: bytes.subarray(offset, end).toString("base64"),
      });
    }),
  );
}
