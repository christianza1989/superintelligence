import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ZeroBrowserBinding, ZeroComponentPrincipal, ZeroPdfBinding } from "@rakazo/adapters";
import {
  createBackgroundJobHandlers,
  GraphileJobWorkerHost,
  LocalArtifactStore,
} from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import { createDb, IsolationError } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ZERO_PDF_BUNDLE } from "../../../packages/adapters/src/zero-pdf-contract.js";
import { zeroPdfCsvPageSchema } from "../../../packages/adapters/src/zero-pdf-csv-contract.js";
import { sessionCookieHeader } from "../../../packages/testkit/src/index.js";
import {
  renderZeroPdfFixture,
  ZERO_PDF_FIXTURES,
} from "../../../packages/testkit/src/zero-pdf-fixtures.js";
import type { AppHandles } from "./app.js";
import { createApp } from "./app.js";
import type { ZeroComponentScopePolicy } from "./zero-components.js";

const url = process.env.ZERO_COMPONENT_TEST_DATABASE_URL;
const enabled =
  process.env.VERIFY_ZERO_COMPONENT_DATABASE === "1" &&
  url &&
  process.env.ZERO_STATIC_BROWSER_IMAGE_ID &&
  process.env.ZERO_STATIC_BROWSER_LOCK_SHA256;
const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
(enabled ? describe.sequential : describe.skip)(
  "authenticated file components through PostgreSQL and Graphile",
  () => {
    let app: AppHandles, db: ReturnType<typeof createDb>, host: GraphileJobWorkerHost | undefined;
    let directory: string, cookie: string, otherCookie: string, principal: ZeroComponentPrincipal;
    let grant: ZeroComponentPrincipal | undefined;
    let pdf: ZeroPdfBinding, browser: ZeroBrowserBinding;
    let artifacts: LocalArtifactStore;
    const origin = "http://127.0.0.1:5173",
      scopeId = "component-fixture";
    const html =
      "<title>Operator document</title><h1>Harbor board</h1><p>Berth 17 is ready.</p><a href='/schedule'>Schedule</a>";
    const pdfBytes = renderZeroPdfFixture(ZERO_PDF_FIXTURES[0]!);
    const model = vi.fn(() => {
      throw new Error("Model dispatch forbidden");
    });
    const policy: ZeroComponentScopePolicy = {
      resolve: async (actor, scope) => {
        if (
          !grant ||
          actor.userId !== grant.userId ||
          actor.spaceId !== grant.spaceId ||
          scope !== grant.scopeId
        )
          throw new IsolationError();
        return { ...grant };
      },
      authorize: async (owner) => {
        if (!grant || JSON.stringify(owner) !== JSON.stringify(grant)) throw new IsolationError();
      },
      resolvePdf: async (owner) => {
        await policy.authorize(owner);
        return pdf;
      },
      resolveBrowser: async (owner) => {
        await policy.authorize(owner);
        return browser;
      },
    };
    const prefix = (family: string) => `/api/zero/${family}/scopes/${scopeId}`;
    const request = (
      route: string,
      body?: unknown,
      session = cookie,
      extra: Record<string, string> = {},
    ) =>
      app.app.request(route, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          cookie: session,
          origin,
          "content-type": "application/json",
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const input = (family: string) => ({
      fileId: family === "pdf" ? "invoice" : "operator-html",
      idempotencyKey: randomUUID(),
      deadline: new Date(Date.now() + 60_000).toISOString(),
    });
    const start = async () => {
      host = new GraphileJobWorkerHost(db.pool, {
        concurrency: 1,
        pollInterval: 25,
        noHandleSignals: true,
      });
      await host.start(
        createBackgroundJobHandlers({
          prisma: app.prisma,
          artifacts,
          jobs: app.jobs,
          authorizeZeroComponent: policy.authorize,
          resolveZeroPdf: policy.resolvePdf,
          resolveZeroBrowser: policy.resolveBrowser,
          executor: { continueRun: model },
          runtime: { run: model },
          workerId: "component-fixture",
        } as never),
      );
    };
    const stop = async () => {
      await host?.stop();
      host = undefined;
    };
    const submit = async (family: string) => {
      const params = input(family),
        response = await request(`${prefix(family)}/extract`, params);
      expect(response.status, await response.clone().text()).toBe(202);
      return {
        ...((await response.json()) as {
          jobId: string;
          requestDigest: string;
        }),
        params,
      };
    };
    const terminal = async (family: string, id: string, state = "succeeded") => {
      await expect
        .poll(
          async () =>
            ((await (await request(`${prefix(family)}/jobs/${id}`)).json()) as { state: string })
              .state,
          { timeout: 35_000, interval: 50 },
        )
        .toBe(state);
      let offset = 0;
      const chunks: Buffer[] = [];
      let expected = "";
      do {
        const response = await request(`${prefix(family)}/jobs/${id}/artifact?offset=${offset}`);
        expect(response.status).toBe(200);
        const page = (await response.json()) as {
          contentBase64: string;
          nextOffset: number | null;
          sha256: string;
        };
        chunks.push(Buffer.from(page.contentBase64, "base64"));
        expected = page.sha256;
        if (page.nextOffset === null) break;
        offset = page.nextOffset;
      } while (offset < 2_097_152);
      const bytes = Buffer.concat(chunks);
      expect(hash(bytes)).toBe(expected);
      expect(bytes.toString()).not.toContain(directory);
      return JSON.parse(bytes.toString());
    };
    beforeAll(async () => {
      if (!new URL(url!).pathname.startsWith("/zero_csv_test"))
        throw new Error("Dedicated fixture database required");
      vi.stubEnv("ZERO_PROJECT_POLICY_FILE", "");
      vi.stubEnv("DATABASE_URL", url!);
      vi.stubEnv("REALTIME_DATABASE_URL", url!);
      directory = await mkdtemp("/tmp/zero-component-api-");
      for (const name of ["project", "pdf-staging", "browser-staging", "profile", "docker"])
        await mkdir(path.join(directory, name), { mode: 0o700 });
      await writeFile(path.join(directory, "project/invoice.pdf"), pdfBytes, {
        mode: 0o600,
      });
      await writeFile(path.join(directory, "project/page.html"), html, {
        mode: 0o600,
      });
      for (const entry of ZERO_PDF_BUNDLE) {
        const bytes = Buffer.from(
          (
            await readFile(
              new URL(`../../../packages/adapters/pdfplumber/${entry.name}`, import.meta.url),
              "utf8",
            )
          ).replace(/\r\n/gu, "\n"),
        );
        expect(bytes.length).toBe(entry.bytes);
        expect(hash(bytes)).toBe(entry.sha256);
        await writeFile(path.join(directory, "profile", entry.name), bytes, {
          mode: 0o600,
        });
      }
      pdf = {
        snapshot: {
          projectRoot: path.join(directory, "project"),
          stagingRoot: path.join(directory, "pdf-staging"),
        },
        files: [{ fileId: "invoice", path: "invoice.pdf", sha256: hash(pdfBytes) }],
        runtime: { bundleDirectory: path.join(directory, "profile") },
      };
      browser = {
        snapshot: {
          projectRoot: path.join(directory, "project"),
          stagingRoot: path.join(directory, "browser-staging"),
        },
        files: [{ fileId: "operator-html", path: "page.html", sha256: hash(html) }],
        runtime: {
          dockerExecutable: "/usr/bin/docker",
          dockerConfigDirectory: path.join(directory, "docker"),
          imageId: process.env.ZERO_STATIC_BROWSER_IMAGE_ID!,
          buildInputLockSha256: process.env.ZERO_STATIC_BROWSER_LOCK_SHA256!,
        },
      };
      app = await createApp({
        databaseUrl: url!,
        dataDir: directory,
        sandboxProvider: "fake",
        agentRuntime: "scripted",
        wakeupDriver: "graphile",
        signupsEnabled: "true",
        webOrigin: origin,
        authUrl: origin,
        apiUrl: origin,
        zeroComponentScopes: policy,
        zeroCsvScopes: policy,
      });
      const signup = async (name: string) => {
        const response = await app.app.request("/api/auth/sign-up/email", {
          method: "POST",
          headers: { "content-type": "application/json", origin },
          body: JSON.stringify({
            name,
            email: `${name}-${randomUUID()}@fixture.invalid`,
            password: "fixture-password-123",
          }),
        });
        expect(response.status).toBeLessThan(400);
        return sessionCookieHeader(response);
      };
      cookie = await signup("component-owner");
      otherCookie = await signup("component-other");
      const me = await request("/rpc/me", { json: {} });
      const actor = ((await me.json()) as { json: Actor }).json;
      principal = {
        spaceId: actor.spaceId,
        userId: actor.userId,
        scopeId,
        policyRevision: "fixture-v1",
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      };
      grant = { ...principal };
      artifacts = new LocalArtifactStore(directory);
      db = createDb(url!, { poolMax: 8 });
      await start();
    });
    afterAll(async () => {
      await stop();
      if (app) await app.stop();
      if (db) {
        await db.prisma.$disconnect();
        await db.pool.end();
      }
      if (directory) await rm(directory, { recursive: true, force: true });
      vi.unstubAllEnvs();
    });
    it("requires a real session, scope grant and same-origin request for both families", async () => {
      for (const family of ["pdf", "browser"]) {
        expect((await request(`${prefix(family)}/status`, undefined, "")).status).toBe(401);
        expect((await request(`${prefix(family)}/status`, undefined, otherCookie)).status).toBe(
          403,
        );
        expect(
          (
            await request(`${prefix(family)}/extract`, input(family), cookie, {
              origin: "https://foreign.invalid",
            })
          ).status,
        ).toBe(403);
        const status = await request(`${prefix(family)}/status`);
        expect(status.status).toBe(200);
        expect(await status.json()).toMatchObject({
          backend: "available",
          paidModelCalls: 0,
          limits: { outstandingJobsPerScope: 4 },
        });
      }
    });
    it.each(["pdf", "browser"])(
      "runs actual %s extraction through API, owned input and Graphile",
      async (family) => {
        const accepted = await submit(family);
        const replay = await request(`${prefix(family)}/extract`, accepted.params);
        expect(await replay.json()).toMatchObject({
          jobId: accepted.jobId,
          requestDigest: accepted.requestDigest,
        });
        const receipt = await terminal(family, accepted.jobId);
        expect(receipt.paidModelCalls).toBe(0);
        expect(receipt.source.sha256).toBe(family === "pdf" ? hash(pdfBytes) : hash(html));
        if (family === "pdf") {
          expect(receipt.extraction.pages).toBe(1);
          expect(receipt.extraction.tables[0].data.num_rows).toBe(4);
        } else {
          expect(receipt.extraction.title).toBe("Operator document");
          expect(receipt.extraction.visibleText).toContain("Berth 17");
          expect(receipt.extraction.screenshot.bytes).toBeGreaterThan(8);
        }
        expect(
          await app.prisma.artifact.count({
            where: { rootArtifactId: accepted.jobId },
          }),
        ).toBe(1);
        expect(model).not.toHaveBeenCalled();
      },
    );

    it("exports actual PDF cells as hash-bound CSV without changing the immutable JSON receipt", async () => {
      const accepted = await submit("pdf"),
        receipt = await terminal("pdf", accepted.jobId);
      const row = await app.prisma.artifact.findFirstOrThrow({
        where: { rootArtifactId: accepted.jobId },
      });
      const expected = "Item,Quantity,Amount USD\nAlpha,2,20\nBeta,3,60\nGamma,4,120";
      const route = `${prefix("pdf")}/jobs/${accepted.jobId}/tables/0.csv`;
      const response = await request(route);
      expect(response.status, await response.clone().text()).toBe(200);
      expect(await response.text()).toBe(expected);
      expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
      expect(response.headers.get("content-disposition")).toBe(
        'attachment; filename="pdf-table.csv"',
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-zero-source-sha256")).toBe(hash(pdfBytes));
      expect(response.headers.get("x-zero-receipt-sha256")).toBe(row.hash);
      expect(response.headers.get("x-zero-csv-sha256")).toBe(hash(expected));
      expect(response.headers.get("x-zero-pdf-table-index")).toBe("0");
      expect(JSON.parse(response.headers.get("x-zero-pdf-provenance")!)).toEqual(
        receipt.extraction.tables[0].provenance,
      );
      expect((await app.prisma.artifact.findUniqueOrThrow({ where: { id: row.id } })).hash).toBe(
        row.hash,
      );
      expect(await terminal("pdf", accepted.jobId)).toEqual(receipt);
      expect((await request(route, undefined, "")).status).toBe(401);
      expect((await request(route, undefined, otherCookie)).status).toBe(403);
      expect((await request(`${route}?table=1`)).status).toBe(400);
      expect((await request(route.replace("0.csv", "32.csv"))).status).toBe(400);
      expect((await request(route.replace("0.csv", "1.csv"))).status).toBe(404);
      const saved = grant;
      try {
        grant = undefined;
        expect((await request(route)).status).toBe(403);
      } finally {
        grant = saved;
      }
      expect(model).not.toHaveBeenCalled();
    });

    it("pages actual PDF CSV bytes with stable provenance, bounded cursors and caller isolation", async () => {
      const accepted = await submit("pdf"),
        receipt = await terminal("pdf", accepted.jobId);
      const row = await app.prisma.artifact.findFirstOrThrow({
        where: { rootArtifactId: accepted.jobId },
      });
      const route = `${prefix("pdf")}/jobs/${accepted.jobId}/tables/0/csv`;
      const chunks: Buffer[] = [];
      let offset = 0;
      let sha256 = "";
      do {
        const response = await request(`${route}?offset=${offset}&limit=7`);
        expect(response.status, await response.clone().text()).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        const page = zeroPdfCsvPageSchema.parse(await response.json());
        expect(page.offset).toBe(offset);
        expect(page.metadata.receipt).toEqual({
          artifactId: row.id,
          revision: row.version,
          sha256: row.hash,
        });
        expect(page.metadata.sourceSha256).toBe(hash(pdfBytes));
        expect(page.metadata.table.provenance).toEqual(receipt.extraction.tables[0].provenance);
        const bytes = Buffer.from(page.contentBase64, "base64");
        expect(bytes.length).toBeGreaterThan(0);
        expect(bytes.length).toBeLessThanOrEqual(7);
        chunks.push(bytes);
        sha256 = page.metadata.csv.sha256;
        if (page.nextOffset === null) break;
        expect(page.nextOffset).toBe(offset + bytes.length);
        offset = page.nextOffset;
      } while (offset < 262_144);
      const bytes = Buffer.concat(chunks);
      expect(hash(bytes)).toBe(sha256);
      expect(bytes.toString()).toBe("Item,Quantity,Amount USD\nAlpha,2,20\nBeta,3,60\nGamma,4,120");
      expect((await request(route)).status).toBe(200);
      const eof = await request(`${route}?offset=${bytes.length}`);
      expect(eof.status).toBe(200);
      expect(await eof.json()).toMatchObject({
        nextOffset: null,
        contentBase64: "",
      });
      for (const query of [
        "offset=-1",
        "offset=01",
        "offset=1.0",
        "offset=1e0",
        "offset=9007199254740992",
        "limit=0",
        "limit=8193",
        "limit=01",
        "offset=0&offset=1",
        "limit=1&limit=2",
        "table=1",
        `offset=${bytes.length + 1}`,
      ])
        expect((await request(`${route}?${query}`)).status, query).toBe(400);
      expect((await request(route, undefined, "")).status).toBe(401);
      expect((await request(route, undefined, otherCookie)).status).toBe(403);
      expect((await request(route.replace("/tables/0/", "/tables/32/"))).status).toBe(400);
      expect((await request(route.replace("/tables/0/", "/tables/1/"))).status).toBe(404);
      expect(
        (await request(route.replace("/scopes/component-fixture/", "/scopes/foreign-scope/")))
          .status,
      ).toBe(403);
      expect((await request(route.replace("/pdf/", "/browser/"))).status).toBe(404);
      const saved = grant;
      try {
        grant = undefined;
        expect((await request(`${route}?offset=7&limit=7`)).status).toBe(403);
      } finally {
        grant = saved;
      }
      expect(await terminal("pdf", accepted.jobId)).toEqual(receipt);
      expect((await app.prisma.artifact.findUniqueOrThrow({ where: { id: row.id } })).hash).toBe(
        row.hash,
      );
      expect(model).not.toHaveBeenCalled();
    });

    it("does not export queued or cancelled PDF jobs", async () => {
      await stop();
      try {
        const accepted = await submit("pdf"),
          route = `${prefix("pdf")}/jobs/${accepted.jobId}/tables/0.csv`;
        expect((await request(route)).status).toBe(409);
        expect((await request(route.replace("0.csv", "0/csv"))).status).toBe(409);
        expect((await request(`${prefix("pdf")}/jobs/${accepted.jobId}/cancel`, {})).status).toBe(
          200,
        );
        expect((await request(route)).status).toBe(409);
      } finally {
        await start();
      }
    });

    it.each(["0.csv", "0/csv"])(
      "rechecks the PDF file grant after receipt I/O before exposing %s",
      async (tableRoute) => {
        const accepted = await submit("pdf");
        await terminal("pdf", accepted.jobId);
        const row = await app.prisma.artifact.findFirstOrThrow({
          where: { rootArtifactId: accepted.jobId },
        });
        const saved = pdf,
          original = LocalArtifactStore.prototype.get;
        const reads = vi
          .spyOn(LocalArtifactStore.prototype, "get")
          .mockImplementation(async function (this: LocalArtifactStore, id, context) {
            const bytes = await original.call(this, id, context);
            if (id === row.storageKey) pdf = { ...pdf, files: [] };
            return bytes;
          });
        try {
          const response = await request(
            `${prefix("pdf")}/jobs/${accepted.jobId}/tables/${tableRoute}`,
          );
          expect(response.status).toBe(403);
          expect(await response.json()).toEqual({
            error: "project_scope_rejected",
          });
        } finally {
          reads.mockRestore();
          pdf = saved;
        }
      },
    );

    it("keeps scoped PDF source and receipt artifacts outside generic artifact RPC reads and writes", async () => {
      const accepted = await submit("pdf"),
        receipt = await terminal("pdf", accepted.jobId);
      const sourceId = receipt.source.artifactId as string;
      const sourceRow = await app.prisma.artifact.findUniqueOrThrow({
        where: { id: sourceId },
      });
      const receiptRow = await app.prisma.artifact.findFirstOrThrow({
        where: { rootArtifactId: accepted.jobId },
      });
      const saved = grant;
      try {
        for (const privateId of [sourceId, receiptRow.id]) {
          expect(
            (
              await request("/rpc/artifacts/getById", {
                json: { artifactId: privateId },
              })
            ).status,
          ).toBe(403);
        }
        grant = undefined;
        for (const [name, value] of [
          ["getById", { artifactId: sourceId }],
          ["listVersions", { familyId: sourceId }],
          ["remove", { artifactId: sourceId }],
          ["getById", { artifactId: receiptRow.id }],
          ["listVersions", { familyId: receiptRow.id }],
          ["remove", { artifactId: receiptRow.id }],
        ] as const)
          expect((await request(`/rpc/artifacts/${name}`, { json: value })).status).toBe(403);
        const list = await request("/rpc/artifacts/listSpace", {
          json: { limit: 60 },
        });
        expect(list.status).toBe(200);
        const content = await list.text();
        expect(content).not.toContain(sourceId);
        expect(content).not.toContain(accepted.jobId);
        expect(content).not.toContain(sourceRow.description);
        expect(
          (
            await app.prisma.artifact.findUniqueOrThrow({
              where: { id: sourceId },
            })
          ).hash,
        ).toBe(sourceRow.hash);
      } finally {
        grant = saved;
      }
    });

    it("rejects paths, URLs, base64, source IDs and selectors as submit arguments", async () => {
      for (const family of ["pdf", "browser"])
        for (const extra of [
          { path: "/private" },
          { url: "https://example.invalid" },
          { base64: "AAAA" },
          { source: { artifactId: "foreign" } },
          { selector: "body" },
        ])
          expect(
            (
              await request(`${prefix(family)}/extract`, {
                ...input(family),
                ...extra,
              })
            ).status,
          ).toBe(400);
    });
    it("preserves cancellation before worker reconnect and one terminal artifact", async () => {
      await stop();
      for (const family of ["pdf", "browser"]) {
        const accepted = await submit(family);
        expect((await request(`${prefix(family)}/jobs/${accepted.jobId}/cancel`, {})).status).toBe(
          200,
        );
        const receipt = await terminal(family, accepted.jobId, "cancelled");
        expect(receipt.extraction).toBeUndefined();
      }
      await start();
    });
    it("blocks revoked file grants before loading the private queued request", async () => {
      await stop();
      const accepted = await submit("browser"),
        saved = browser.files;
      browser = { ...browser, files: [] };
      const reads = vi.spyOn(artifacts, "get");
      await start();
      await expect
        .poll(
          async () =>
            JSON.parse(
              (
                await app.prisma.artifact.findFirst({
                  where: { rootArtifactId: accepted.jobId },
                })
              )?.description ?? "null",
            )?.state,
          { timeout: 10_000 },
        )
        .toBe("blocked");
      expect(reads).not.toHaveBeenCalled();
      reads.mockRestore();
      browser = { ...browser, files: saved };
      expect((await terminal("browser", accepted.jobId, "blocked")).reason).toBe(
        "project_scope_rejected",
      );
    });
    it("executes immutable PDF bytes even after the live host file changes", async () => {
      await stop();
      const accepted = await submit("pdf");
      await writeFile(path.join(directory, "project/invoice.pdf"), "%PDF-changed-host-file");
      await start();
      const receipt = await terminal("pdf", accepted.jobId);
      expect(receipt.extraction.sourceSha256).toBe(hash(pdfBytes));
      await writeFile(path.join(directory, "project/invoice.pdf"), pdfBytes);
    });
    it.each(["pdf", "browser"])(
      "denies %s job metadata if its file grant is revoked during a request read",
      async (family) => {
        await stop();
        const accepted = await submit(family);
        const row = await app.prisma.artifact.findUniqueOrThrow({
          where: { id: accepted.jobId },
        });
        const saved = family === "pdf" ? pdf : browser;
        const original = LocalArtifactStore.prototype.get;
        const reads = vi
          .spyOn(LocalArtifactStore.prototype, "get")
          .mockImplementation(async function (this: LocalArtifactStore, id, context) {
            const bytes = await original.call(this, id, context);
            if (id === row.storageKey) {
              if (family === "pdf") pdf = { ...pdf, files: [] };
              else browser = { ...browser, files: [] };
            }
            return bytes;
          });
        try {
          const response = await request(`${prefix(family)}/jobs/${accepted.jobId}`);
          expect(response.status).toBe(403);
          expect(await response.json()).toEqual({
            error: "project_scope_rejected",
          });
        } finally {
          reads.mockRestore();
          if (family === "pdf") pdf = saved as ZeroPdfBinding;
          else browser = saved as ZeroBrowserBinding;
          await request(`${prefix(family)}/jobs/${accepted.jobId}/cancel`, {});
          await start();
        }
      },
    );
    it.each(["pdf", "browser"])(
      "denies %s receipt bytes if its file grant is revoked during storage I/O",
      async (family) => {
        const accepted = await submit(family);
        await terminal(family, accepted.jobId);
        const row = await app.prisma.artifact.findFirstOrThrow({
          where: { rootArtifactId: accepted.jobId },
        });
        const saved = family === "pdf" ? pdf : browser;
        const original = LocalArtifactStore.prototype.get;
        const reads = vi
          .spyOn(LocalArtifactStore.prototype, "get")
          .mockImplementation(async function (this: LocalArtifactStore, id, context) {
            const bytes = await original.call(this, id, context);
            if (id === row.storageKey) {
              if (family === "pdf") pdf = { ...pdf, files: [] };
              else browser = { ...browser, files: [] };
            }
            return bytes;
          });
        try {
          const response = await request(`${prefix(family)}/jobs/${accepted.jobId}/artifact`);
          expect(response.status).toBe(403);
          expect(await response.json()).toEqual({
            error: "project_scope_rejected",
          });
        } finally {
          reads.mockRestore();
          if (family === "pdf") pdf = saved as ZeroPdfBinding;
          else browser = saved as ZeroBrowserBinding;
        }
      },
    );
    it("rechecks grant revocation after successful output storage", async () => {
      const original = artifacts.put.bind(artifacts);
      const staged = vi.spyOn(artifacts, "put").mockImplementation(async (artifact, context) => {
        const result = await original(artifact, context);
        if (
          artifact.name === "zero-pdf-receipt.json" &&
          JSON.parse(Buffer.from(artifact.bytes).toString()).state === "succeeded"
        )
          grant = undefined;
        return result;
      });
      const accepted = await submit("pdf");
      await expect
        .poll(
          async () =>
            JSON.parse(
              (
                await app.prisma.artifact.findFirst({
                  where: { rootArtifactId: accepted.jobId },
                })
              )?.description ?? "null",
            )?.state,
          { timeout: 15_000 },
        )
        .toBe("blocked");
      staged.mockRestore();
      grant = { ...principal };
      expect((await terminal("pdf", accepted.jobId, "blocked")).extraction).toBeUndefined();
      expect(
        await app.prisma.artifact.count({
          where: { rootArtifactId: accepted.jobId },
        }),
      ).toBe(1);
    });
    it("shares four outstanding slots with the existing CSV service", async () => {
      await stop();
      const accepted: Array<{ family: string; jobId: string }> = [];
      try {
        for (const family of ["pdf", "browser", "pdf", "browser"])
          accepted.push({ family, ...(await submit(family)) });
        const response = await request(`/api/zero/csv/scopes/${scopeId}/prepare`, {
          csv: "a,b\n1,2\n",
          idempotencyKey: randomUUID(),
          deadline: new Date(Date.now() + 60_000).toISOString(),
        });
        expect(response.status).toBe(429);
      } finally {
        for (const item of accepted)
          await request(`${prefix(item.family)}/jobs/${item.jobId}/cancel`, {});
        await start();
      }
    });
  },
);
