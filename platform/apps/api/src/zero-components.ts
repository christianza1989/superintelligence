import type { ArtifactStore, JobPublisher } from "@rakazo/adapter-kit";
import type {
  ZeroBrowserResolve,
  ZeroComponentAuthorize,
  ZeroComponentPrincipal,
  ZeroPdfResolve,
} from "@rakazo/adapters";
import {
  createZeroBrowserService,
  createZeroPdfService,
  ZERO_BROWSER_STATIC_JOB_LIMITS,
  ZERO_BROWSER_STATIC_PROFILE,
  ZERO_PDF_JOB_LIMITS,
  ZERO_PDF_PROFILE,
} from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { IsolationError } from "@rakazo/db";
import type { Context, Hono } from "hono";
import { readBoundedBody } from "./http-body.js";

export interface ZeroComponentScopePolicy {
  resolve(actor: Actor, scopeId: string): Promise<ZeroComponentPrincipal>;
  authorize: ZeroComponentAuthorize;
  resolvePdf?: ZeroPdfResolve;
  resolveBrowser?: ZeroBrowserResolve;
}
type Service = ReturnType<typeof createZeroPdfService>;
const PAGE_BYTES = 16_384;
export function mountZeroComponentRoutes(
  app: Hono,
  deps: {
    prisma: PrismaClient;
    artifacts: ArtifactStore;
    jobs: JobPublisher;
    policy?: ZeroComponentScopePolicy;
    authenticate(request: Request): Promise<Actor | null>;
    trustedOrigin(origin: string): boolean;
  },
) {
  // Family is selected only here at composition, never from a body or tool argument.
  for (const family of ["pdf", "browser"] as const) {
    const prefix = `/api/zero/${family}/scopes/:scopeId`;
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
          principal.scopeId !== scopeId ||
          !Number.isFinite(Date.parse(principal.expiresAt)) ||
          Date.parse(principal.expiresAt) <= Date.now()
        )
          throw new IsolationError();
        await deps.policy.authorize(principal);
        const service = (family === "pdf" ? createZeroPdfService : createZeroBrowserService)(
          {
            prisma: deps.prisma,
            artifacts: deps.artifacts,
            jobs: deps.jobs,
            authorize: (owner) => deps.policy!.authorize(owner),
            resolvePdf: deps.policy.resolvePdf
              ? (owner) => deps.policy!.resolvePdf!(owner)
              : undefined,
            resolveBrowser: deps.policy.resolveBrowser
              ? (owner) => deps.policy!.resolveBrowser!(owner)
              : undefined,
          },
          principal,
        );
        return await action(service);
      } catch (error) {
        if (error instanceof IsolationError)
          return c.json({ error: "project_scope_rejected" }, 403);
        if (error instanceof Error && error.name === "ZodError")
          return c.json({ error: "invalid_request" }, 400);
        if (
          error instanceof Error &&
          ["idempotency_key_conflict", "idempotency_key_expired"].includes(error.message)
        )
          return c.json({ error: error.message }, 409);
        if (error instanceof Error && error.message === "scope_job_limit_exceeded")
          return c.json({ error: error.message }, 429);
        if (error instanceof Error && error.message === "invalid_job_deadline")
          return c.json({ error: error.message }, 400);
        if (error instanceof Error && error.message === "component_profile_unavailable")
          return c.json({ error: error.message }, 503);
        if (error instanceof Error && error.message === "component_input_cleanup_required")
          return c.json({ error: error.message }, 503);
        if (
          error instanceof Error &&
          (error.name === "ProjectSnapshotError" ||
            error.message === "component_input_integrity_failed" ||
            error instanceof TypeError)
        )
          return c.json({ error: "component_input_rejected" }, 400);
        return c.json({ error: "preparation_backend_unavailable" }, 503);
      }
    };
    const body = async (c: Context) => {
      if (c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json")
        return { error: c.json({ error: "json_required" }, 415) };
      const raw = await readBoundedBody(c.req.raw, 8192);
      if (raw === null) return { error: c.json({ error: "request_too_large" }, 413) };
      try {
        return { value: JSON.parse(raw) as unknown };
      } catch {
        return { error: c.json({ error: "invalid_json" }, 400) };
      }
    };
    app.get(`${prefix}/status`, (c) =>
      scoped(c, async (service) => {
        if (!(await service.available()))
          return c.json({ error: "component_profile_unavailable" }, 503);
        return c.json({
          profile: family === "pdf" ? ZERO_PDF_PROFILE : ZERO_BROWSER_STATIC_PROFILE,
          backend: "available",
          paidModelCalls: 0,
          execution: family === "pdf" ? "pdf-extraction" : "browser-static-extraction",
          limits: family === "pdf" ? ZERO_PDF_JOB_LIMITS : ZERO_BROWSER_STATIC_JOB_LIMITS,
        });
      }),
    );
    app.post(`${prefix}/extract`, (c) =>
      scoped(c, async (service) => {
        const parsed = await body(c);
        if (parsed.error) return parsed.error;
        return c.json(await service.submit(parsed.value), 202);
      }),
    );
    app.get(`${prefix}/jobs/:jobId`, (c) =>
      scoped(c, async (service) => c.json(await service.get(c.req.param("jobId")))),
    );
    app.post(`${prefix}/jobs/:jobId/cancel`, (c) =>
      scoped(c, async (service) => {
        const parsed = await body(c);
        if (parsed.error) return parsed.error;
        if (
          !parsed.value ||
          typeof parsed.value !== "object" ||
          Array.isArray(parsed.value) ||
          Object.keys(parsed.value).length
        )
          return c.json({ error: "invalid_request" }, 400);
        return c.json(await service.cancel(c.req.param("jobId")));
      }),
    );
    app.get(`${prefix}/jobs/:jobId/artifact`, (c) =>
      scoped(c, async (service) => {
        const query = c.req.query();
        if (
          Object.keys(query).some((key) => key !== "offset" && key !== "limit") ||
          !/^\d+$/u.test(query.offset ?? "0") ||
          !/^\d+$/u.test(query.limit ?? String(PAGE_BYTES))
        )
          return c.json({ error: "invalid_page" }, 400);
        const offset = Number(query.offset ?? "0"),
          limit = Number(query.limit ?? PAGE_BYTES);
        if (
          !Number.isSafeInteger(offset) ||
          offset < 0 ||
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > PAGE_BYTES
        )
          return c.json({ error: "invalid_page" }, 400);
        const artifact = await service.artifact(c.req.param("jobId"));
        const bytes = Buffer.from(artifact.content);
        if (offset > bytes.length) return c.json({ error: "invalid_page" }, 400);
        const end = Math.min(offset + limit, bytes.length);
        return c.json({
          artifactId: artifact.artifactId,
          revision: artifact.revision,
          sha256: artifact.sha256,
          totalBytes: bytes.length,
          offset,
          nextOffset: end < bytes.length ? end : null,
          encoding: "base64",
          contentBase64: bytes.subarray(offset, end).toString("base64"),
        });
      }),
    );
  }
}
