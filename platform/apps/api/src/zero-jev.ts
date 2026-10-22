import type { ArtifactStore, JobPublisher } from "@rakazo/adapter-kit";
import type {
  ZeroCsvPrincipal,
  ZeroJevProfile,
  ZeroJevResolver,
  ZeroReuseVerifierConfig,
} from "@rakazo/adapters";
import {
  createZeroJevToolService,
  getZeroJevAvailability,
} from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import type { Pool, PrismaClient } from "@rakazo/db";
import { IsolationError } from "@rakazo/db";
import type { Context, Hono } from "hono";
import { readBoundedBody } from "./http-body.js";
import type { ZeroCsvScopePolicy } from "./zero-csv.js";

export interface ZeroJevScopePolicy extends ZeroCsvScopePolicy {
  resolveJev(principal: ZeroCsvPrincipal): Promise<ZeroJevProfile>;
  resolveReuseVerifier?(
    principal: ZeroCsvPrincipal,
  ): Promise<ZeroReuseVerifierConfig | undefined>;
}
export const ZERO_JEV_API_PREFIX = "/api/zero/jev/scopes";
export function mountZeroJevRoutes(
  app: Hono,
  deps: {
    prisma: PrismaClient;
    pool?: Pool;
    artifacts: ArtifactStore;
    jobs: JobPublisher;
    policy?: ZeroJevScopePolicy;
    resolve?: ZeroJevResolver;
    authenticate(request: Request): Promise<Actor | null>;
    trustedOrigin(origin: string): boolean;
  },
) {
  const worker = {
    prisma: deps.prisma,
    pool: deps.pool,
    artifacts: deps.artifacts,
    resolve: deps.resolve,
    resolveReuseVerifier: deps.policy?.resolveReuseVerifier?.bind(deps.policy),
  };
  const scoped = async (
    c: Context,
    action: (principal: ZeroCsvPrincipal) => Promise<Response>,
  ) => {
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
      if (!deps.policy || !deps.resolve)
        return c.json({ error: "routing_profile_unavailable" }, 503);
      const scopeId = c.req.param("scopeId");
      if (!scopeId || !/^[A-Za-z0-9_-]{1,128}$/.test(scopeId))
        return c.json({ error: "invalid_scope" }, 400);
      const principal = await deps.policy.resolve(actor, scopeId);
      if (
        principal.userId !== actor.userId ||
        principal.spaceId !== actor.spaceId ||
        principal.scopeId !== scopeId ||
        !Number.isFinite(Date.parse(principal.expiresAt)) ||
        Date.parse(principal.expiresAt) <= Date.now()
      )
        throw new IsolationError();
      await deps.policy.authorize(principal);
      return await action(principal);
    } catch (error) {
      if (error instanceof IsolationError)
        return c.json({ error: "project_scope_rejected" }, 403);
      if (error instanceof Error && error.name === "ZodError")
        return c.json({ error: "invalid_request" }, 400);
      if (
        error instanceof Error &&
        error.message === "idempotency_key_conflict"
      )
        return c.json({ error: error.message }, 409);
      if (
        error instanceof Error &&
        error.message === "scope_job_limit_exceeded"
      )
        return c.json({ error: error.message }, 429);
      if (
        error instanceof Error &&
        ["invalid_job_bounds", "request_limit_exceeded"].includes(error.message)
      )
        return c.json({ error: error.message }, 400);
      if (
        error instanceof Error &&
        error.message === "routing_budget_unavailable"
      )
        return c.json({ error: error.message }, 503);
      return c.json({ error: "routing_backend_unavailable" }, 503);
    }
  };
  const service = (principal: ZeroCsvPrincipal) =>
    createZeroJevToolService({ ...worker, jobs: deps.jobs }, principal);
  app.get(`${ZERO_JEV_API_PREFIX}/:scopeId/status`, (c) =>
    scoped(c, async (principal) =>
      c.json(await getZeroJevAvailability(worker, principal)),
    ),
  );
  app.post(`${ZERO_JEV_API_PREFIX}/:scopeId/execute`, (c) =>
    scoped(c, async (principal) => {
      // A status read never reserves. The worker makes the authoritative atomic admission later.
      if (
        c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase() !==
        "application/json"
      )
        return c.json({ error: "json_required" }, 415);
      const raw = await readBoundedBody(c.req.raw, 36 * 1024);
      if (raw === null) return c.json({ error: "request_too_large" }, 413);
      let input: unknown;
      try {
        input = JSON.parse(raw);
      } catch {
        return c.json({ error: "invalid_json" }, 400);
      }
      if (!(
        input &&
        typeof input === "object" &&
        "mode" in input &&
        input.mode === "verify-component"
      ))
        await getZeroJevAvailability(worker, principal);
      return c.json(await service(principal).submit(input), 202);
    }),
  );
  app.get(`${ZERO_JEV_API_PREFIX}/:scopeId/jobs/:jobId`, (c) =>
    scoped(c, async (principal) =>
      c.json(await service(principal).job(c.req.param("jobId"))),
    ),
  );
  app.get(`${ZERO_JEV_API_PREFIX}/:scopeId/jobs/:jobId/artifact`, (c) =>
    scoped(c, async (principal) => {
      const query = c.req.query();
      if (
        Object.keys(query).some((key) => key !== "offset" && key !== "limit") ||
        !/^\d+$/.test(query.offset ?? "0") ||
        !/^\d+$/.test(query.limit ?? "8192")
      )
        return c.json({ error: "invalid_page" }, 400);
      const offset = Number(query.offset ?? "0"),
        limit = Number(query.limit ?? "8192");
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 16384
      )
        return c.json({ error: "invalid_page" }, 400);
      const artifact = await service(principal).artifact(c.req.param("jobId"));
      const bytes = Buffer.from(artifact.content);
      if (offset > bytes.byteLength)
        return c.json({ error: "invalid_page" }, 400);
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
