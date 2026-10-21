import type { ArtifactStore, JobPublisher } from "@rakazo/adapter-kit";
import type {
  ZeroBrowserResolve,
  ZeroComponentAuthorize,
  ZeroComponentPrincipal,
  ZeroCsvApplicationResolve,
  ZeroPdfResolve,
  ZeroUrlResearchResolve,
  ZeroUrlResearchTestTransport,
} from "@rakazo/adapters";
import {
  createZeroBrowserService,
  createZeroCsvApplicationService,
  createZeroPdfService,
  createZeroUrlResearchService,
  projectZeroPdfCsv,
  projectZeroPdfCsvPage,
  ZERO_BROWSER_STATIC_JOB_LIMITS,
  ZERO_BROWSER_STATIC_PROFILE,
  ZERO_CSV_APPLICATION_LIMITS,
  ZERO_CSV_APPLICATION_PROFILE,
  ZERO_PDF_CSV_LIMITS,
  ZERO_PDF_JOB_LIMITS,
  ZERO_PDF_PROFILE,
  ZeroPdfCsvError,
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
  resolveUrlResearch?: ZeroUrlResearchResolve;
  resolveApplication?: ZeroCsvApplicationResolve;
}
type Service = ReturnType<typeof createZeroPdfService> &
  Partial<Pick<ReturnType<typeof createZeroCsvApplicationService>, "workspace">> &
  Partial<Pick<ReturnType<typeof createZeroUrlResearchService>, "status">>;
const PAGE_BYTES = 16_384;
export function mountZeroComponentRoutes(
  app: Hono,
  deps: {
    prisma: PrismaClient;
    artifacts: ArtifactStore;
    jobs: JobPublisher;
    policy?: ZeroComponentScopePolicy;
    urlResearchTestTransport?: ZeroUrlResearchTestTransport;
    authenticate(request: Request): Promise<Actor | null>;
    trustedOrigin(origin: string): boolean;
  },
) {
  // Family is selected only here at composition, never from a body or tool argument.
  for (const family of ["pdf", "browser", "research", "application"] as const) {
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
        const service = (
          family === "pdf"
            ? createZeroPdfService
            : family === "browser"
              ? createZeroBrowserService
              : family === "research"
                ? createZeroUrlResearchService
                : createZeroCsvApplicationService
        )(
          {
            prisma: deps.prisma,
            artifacts: deps.artifacts,
            jobs: deps.jobs,
            authorize: (owner) => deps.policy!.authorize(owner),
            resolveApplication: deps.policy.resolveApplication
              ? (owner) => deps.policy!.resolveApplication!(owner)
              : undefined,
            resolveUrlResearch: deps.policy.resolveUrlResearch
              ? (owner) => deps.policy!.resolveUrlResearch!(owner)
              : undefined,
            testOnlyTransport: deps.urlResearchTestTransport,
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
        if (error instanceof ZeroPdfCsvError) {
          const status =
            error.code === "pdf_csv_table_missing"
              ? 404
              : error.code === "pdf_csv_unavailable"
                ? 409
                : error.code === "pdf_csv_limit_exceeded"
                  ? 413
                  : error.code === "pdf_csv_invalid_receipt"
                    ? 503
                    : 400;
          return c.json({ error: error.code }, status);
        }
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
        if (family === "research") {
          if (!service.status) throw new IsolationError();
          return c.json(await service.status());
        }
        if (!(await service.available()))
          return c.json({ error: "component_profile_unavailable" }, 503);
        return c.json({
          profile:
            family === "pdf"
              ? ZERO_PDF_PROFILE
              : family === "browser"
                ? ZERO_BROWSER_STATIC_PROFILE
                : ZERO_CSV_APPLICATION_PROFILE,
          backend: "available",
          paidModelCalls: 0,
          execution:
            family === "pdf"
              ? "pdf-extraction"
              : family === "browser"
                ? "browser-static-extraction"
                : "native-esm-expense-build+opaque-browser-check",
          limits:
            family === "pdf"
              ? ZERO_PDF_JOB_LIMITS
              : family === "browser"
                ? ZERO_BROWSER_STATIC_JOB_LIMITS
                : ZERO_CSV_APPLICATION_LIMITS,
        });
      }),
    );
    app.post(prefix + (family === "application" ? "/create" : "/extract"), (c) =>
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
    if (family === "pdf") {
      const receipt = async (service: Service, jobId: string) => {
        if ((await service.get(jobId)).state !== "succeeded")
          throw new ZeroPdfCsvError("pdf_csv_unavailable");
        // The scoped reader rechecks current owner/file grants after receipt I/O.
        return service.artifact(jobId);
      };
      app.get(`${prefix}/jobs/:jobId/tables/:tableCsv{[^/]+[.]csv}`, (c) =>
        scoped(c, async (service) => {
          if (Object.keys(c.req.query()).length) return c.json({ error: "invalid_request" }, 400);
          const jobId = c.req.param("jobId");
          const result = projectZeroPdfCsv(
            await receipt(service, jobId),
            jobId,
            c.req.param("tableCsv").slice(0, -4),
          );
          c.header("content-type", "text/csv; charset=utf-8");
          c.header("content-disposition", 'attachment; filename="pdf-table.csv"');
          c.header("x-content-type-options", "nosniff");
          c.header("x-zero-source-sha256", result.metadata.sourceSha256);
          c.header("x-zero-receipt-sha256", result.metadata.receipt.sha256);
          c.header("x-zero-csv-sha256", result.metadata.csv.sha256);
          c.header("x-zero-pdf-table-index", String(result.metadata.table.index));
          c.header("x-zero-pdf-provenance", JSON.stringify(result.metadata.table.provenance));
          return c.body(result.csv);
        }),
      );
      app.get(`${prefix}/jobs/:jobId/tables/:tableIndex/csv`, (c) =>
        scoped(c, async (service) => {
          const query = c.req.queries();
          const offsetText = query.offset?.[0] ?? "0";
          const limitText = query.limit?.[0] ?? String(ZERO_PDF_CSV_LIMITS.pageBytes);
          if (
            Object.entries(query).some(
              ([key, values]) => (key !== "offset" && key !== "limit") || values.length !== 1,
            ) ||
            !/^(?:0|[1-9][0-9]*)$/u.test(offsetText) ||
            !/^[1-9][0-9]*$/u.test(limitText)
          )
            return c.json({ error: "pdf_csv_invalid_page" }, 400);
          const offset = Number(offsetText),
            limit = Number(limitText);
          if (
            !Number.isSafeInteger(offset) ||
            offset > ZERO_PDF_CSV_LIMITS.csvBytes ||
            !Number.isSafeInteger(limit) ||
            limit > ZERO_PDF_CSV_LIMITS.pageBytes
          )
            return c.json({ error: "pdf_csv_invalid_page" }, 400);
          const jobId = c.req.param("jobId");
          return c.json(
            projectZeroPdfCsvPage(
              await receipt(service, jobId),
              jobId,
              c.req.param("tableIndex"),
              offset,
              limit,
            ),
          );
        }),
      );
    }
    for (const artifactKind of (family === "application"
      ? ["artifact", "workspace"]
      : ["artifact"]) as Array<"artifact" | "workspace">) {
      app.get(prefix + "/jobs/:jobId/" + artifactKind, (c) =>
        scoped(c, async (service) => {
          const query = c.req.queries(),
            offsetText = query.offset?.[0] ?? "0",
            limitText = query.limit?.[0] ?? String(PAGE_BYTES);
          if (
            Object.entries(query).some(
              ([key, values]) => (key !== "offset" && key !== "limit") || values.length !== 1,
            ) ||
            !/^(?:0|[1-9][0-9]*)$/u.test(offsetText) ||
            !/^[1-9][0-9]*$/u.test(limitText)
          )
            return c.json({ error: "invalid_page" }, 400);
          const offset = Number(offsetText),
            limit = Number(limitText);
          if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(limit) || limit > PAGE_BYTES)
            return c.json({ error: "invalid_page" }, 400);
          const jobId = c.req.param("jobId");
          if (!jobId) return c.json({ error: "invalid_job" }, 400);
          const artifact =
            artifactKind === "workspace"
              ? await service.workspace!(jobId)
              : await service.artifact(jobId);
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
}
