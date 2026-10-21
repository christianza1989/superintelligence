import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { Server } from "node:http";
import path from "node:path";
import type {
  ZeroComponentPrincipal,
  ZeroUrlResearchBinding,
  ZeroUrlResearchTestTransport,
} from "@rakazo/adapters";
import {
  createBackgroundJobHandlers,
  GraphileJobWorkerHost,
  LocalArtifactStore,
} from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import { createDb, IsolationError } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sessionCookieHeader } from "../../../packages/testkit/src/index.js";
import { zeroComponentHash } from "../../../packages/adapters/src/zero-component-jobs.js";
import {
  ZERO_URL_RESEARCH_MODE,
  ZERO_URL_RESEARCH_PROFILE,
} from "../../../packages/adapters/src/zero-url-research-contract.js";
import type { AppHandles } from "./app.js";
import { createApp } from "./app.js";
import type { ZeroComponentScopePolicy } from "./zero-components.js";

const databaseUrl = process.env.ZERO_COMPONENT_TEST_DATABASE_URL;
const enabled =
  process.env.VERIFY_ZERO_URL_RESEARCH_DATABASE === "1" &&
  databaseUrl &&
  process.env.ZERO_STATIC_BROWSER_IMAGE_ID &&
  process.env.ZERO_STATIC_BROWSER_LOCK_SHA256;
(enabled ? describe.sequential : describe.skip)(
  "URL research actual API/PostgreSQL/Graphile/inert Docker with explicit synthetic HTTP transport",
  () => {
    let app: AppHandles, db: ReturnType<typeof createDb>, host: GraphileJobWorkerHost | undefined;
    let directory: string,
      cookie: string,
      foreignCookie: string,
      principal: ZeroComponentPrincipal,
      grant: ZeroComponentPrincipal | undefined;
    let artifacts: LocalArtifactStore,
      binding: ZeroUrlResearchBinding,
      source: Server,
      sourceOrigin: string;
    const origin = "http://127.0.0.1:5173",
      scopeId = "url-research-proof",
      prefix = `/api/zero/research/scopes/${scopeId}`;
    let html =
      "<title>Approved public schedule</title><h1>Library hours</h1><p>Saturday 10:00-14:00</p><a href='/access'>Access</a>";
    const hits: string[] = [],
      privateHeaders: string[] = [];
    let successfulJob = "";
    let successfulSource = "";
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
      resolveUrlResearch: async (owner) => {
        await policy.authorize(owner);
        return binding;
      },
    };
    // Explicit qualification-only transport: the production URL/DNS policy has no loopback exception.
    const transport: ZeroUrlResearchTestTransport = {
      resolveHostname: async () => [{ address: "93.184.216.34", family: 4 }],
      fetch: (async (input, init) => {
        const remote = new URL(String(input));
        if (remote.origin !== "https://research-fixture.example")
          throw new Error("Unexpected test origin");
        const { dispatcher: _dispatcher, ...safe } = init as RequestInit & { dispatcher?: unknown };
        return globalThis.fetch(sourceOrigin + remote.pathname, safe);
      }) as typeof globalThis.fetch,
    };
    const request = (
      route: string,
      body?: unknown,
      session = cookie,
      extra: Record<string, string> = {},
    ) =>
      app.app.request(route, {
        method: body === undefined ? "GET" : "POST",
        headers: { cookie: session, origin, "content-type": "application/json", ...extra },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const params = (taskId = "hours") => ({
      taskId,
      idempotencyKey: randomUUID(),
      deadline: new Date(Date.now() + 60_000).toISOString(),
    });
    const submit = async (taskId = "hours") => {
      const input = params(taskId),
        response = await request(prefix + "/extract", input);
      expect(response.status, await response.clone().text()).toBe(202);
      return { ...((await response.json()) as { jobId: string; requestDigest: string }), input };
    };
    const terminal = async (id: string, state = "succeeded") => {
      await expect
        .poll(
          async () =>
            ((await (await request(prefix + "/jobs/" + id)).json()) as { state: string }).state,
          { timeout: 40_000, interval: 50 },
        )
        .toBe(state);
      let offset = 0;
      const chunks: Buffer[] = [];
      let expected = "";
      do {
        const response = await request(prefix + "/jobs/" + id + "/artifact?offset=" + offset);
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
      expect(zeroComponentHash(bytes)).toBe(expected);
      expect(bytes.toString()).not.toContain(directory);
      const receipt = JSON.parse(bytes.toString());
      const evidence = process.env.ZERO_URL_RESEARCH_EVIDENCE_DIR;
      if (evidence) {
        await mkdir(evidence, { recursive: true, mode: 0o700 });
        await writeFile(path.join(evidence, id + ".json"), bytes, { mode: 0o600 });
        if (receipt.extraction?.screenshot)
          await writeFile(
            path.join(evidence, id + ".png"),
            Buffer.from(receipt.extraction.screenshot.contentBase64, "base64"),
            { mode: 0o600 },
          );
      }
      return receipt;
    };
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
          resolveZeroUrlResearch: policy.resolveUrlResearch,
          zeroUrlResearchTestTransport: transport,
          executor: { continueRun: model },
          runtime: { run: model },
          workerId: "url-research-proof",
        } as never),
      );
    };
    const stop = async () => {
      await host?.stop();
      host = undefined;
    };
    beforeAll(async () => {
      if (!new URL(databaseUrl!).pathname.startsWith("/zero_csv_test"))
        throw Error("Dedicated fixture database required");
      vi.stubEnv("ZERO_PROJECT_POLICY_FILE", "");
      vi.stubEnv("DATABASE_URL", databaseUrl!);
      vi.stubEnv("REALTIME_DATABASE_URL", databaseUrl!);
      directory = await mkdtemp("/tmp/zero-url-research-api-");
      await mkdir(path.join(directory, "docker"), { mode: 0o700 });
      source = createServer((req, res) => {
        const route = req.url ?? "/";
        hits.push(route);
        if (req.headers.authorization || req.headers.cookie) privateHeaders.push(route);
        if (route === "/redirect") {
          res.writeHead(302, { location: "https://forbidden-fixture.example/private" });
          res.end();
          return;
        }
        if (route === "/slow") {
          setTimeout(() => {
            if (!res.destroyed) {
              res.setHeader("content-type", "text/html");
              res.end(html);
            }
          }, 3000);
          return;
        }
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(html);
      });
      await new Promise<void>((resolve) => source.listen(0, "127.0.0.1", resolve));
      const address = source.address();
      if (!address || typeof address === "string") throw Error("Source fixture missing");
      sourceOrigin = "http://127.0.0.1:" + address.port;
      html +=
        "<script>fetch(" +
        JSON.stringify(sourceOrigin + "/private") +
        ")</script><img src='" +
        sourceOrigin +
        "/private'>";
      binding = {
        profile: ZERO_URL_RESEARCH_PROFILE,
        tasks: [
          {
            taskId: "hours",
            sourceId: "hours-source",
            url: "https://research-fixture.example/hours",
          },
          {
            taskId: "redirect",
            sourceId: "redirect-source",
            url: "https://research-fixture.example/redirect",
          },
          { taskId: "slow", sourceId: "slow-source", url: "https://research-fixture.example/slow" },
        ],
        runtime: {
          dockerExecutable: "/usr/bin/docker",
          dockerConfigDirectory: path.join(directory, "docker"),
          imageId: process.env.ZERO_STATIC_BROWSER_IMAGE_ID!,
          buildInputLockSha256: process.env.ZERO_STATIC_BROWSER_LOCK_SHA256!,
        },
      };
      if (process.env.ZERO_URL_RESEARCH_EVIDENCE_DIR) {
        await mkdir(process.env.ZERO_URL_RESEARCH_EVIDENCE_DIR, { recursive: true, mode: 0o700 });
        await writeFile(
          path.join(process.env.ZERO_URL_RESEARCH_EVIDENCE_DIR, "task-inputs-before-run.json"),
          JSON.stringify(
            {
              profile: ZERO_URL_RESEARCH_PROFILE,
              mode: ZERO_URL_RESEARCH_MODE,
              registry: binding.tasks,
              sourceSha256: zeroComponentHash(html),
              sourceBytes: Buffer.byteLength(html),
              transport:
                "explicit qualification-only loopback HTTP; production publicHTTPS guard unchanged",
            },
            null,
            2,
          ),
          { mode: 0o600, flag: "wx" },
        );
      }
      app = await createApp({
        databaseUrl: databaseUrl!,
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
        zeroUrlResearchTestTransport: transport,
      });
      const signup = async (name: string) => {
        const response = await app.app.request("/api/auth/sign-up/email", {
          method: "POST",
          headers: { "content-type": "application/json", origin },
          body: JSON.stringify({
            name,
            email: name + "-" + randomUUID() + "@fixture.invalid",
            password: "fixture-password-123",
          }),
        });
        expect(response.status).toBeLessThan(400);
        return sessionCookieHeader(response);
      };
      cookie = await signup("research-owner");
      foreignCookie = await signup("research-foreign");
      const actor = ((await (await request("/rpc/me", { json: {} })).json()) as { json: Actor })
        .json;
      principal = {
        spaceId: actor.spaceId,
        userId: actor.userId,
        scopeId,
        policyRevision: "url-v1",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      };
      grant = { ...principal };
      artifacts = new LocalArtifactStore(directory);
      db = createDb(databaseUrl!, { poolMax: 8 });
      await start();
    });
    afterAll(async () => {
      await stop();
      if (app) await app.stop();
      if (db) {
        await db.prisma.$disconnect();
        await db.pool.end();
      }
      if (source) {
        source.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          source.close((error) => (error ? reject(error) : resolve())),
        );
      }
      if (directory) await rm(directory, { recursive: true, force: true });
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });
    it("requires actual session, scope and same-origin authorization before URL source access", async () => {
      expect((await request(prefix + "/status", undefined, "")).status).toBe(401);
      expect((await request(prefix + "/status", undefined, foreignCookie)).status).toBe(403);
      expect(
        (
          await request(prefix + "/extract", params(), cookie, {
            origin: "https://foreign.invalid",
          })
        ).status,
      ).toBe(403);
      expect(hits).toHaveLength(0);
      const response = await request(prefix + "/status");
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        profile: ZERO_URL_RESEARCH_PROFILE,
        execution: ZERO_URL_RESEARCH_MODE,
        limits: { outstandingJobsPerScope: 4 },
      });
    });
    it("fetches real HTTP bytes then uses actual inert Docker with source and PNG provenance", async () => {
      const job = await submit();
      successfulJob = job.jobId;
      const replay = await request(prefix + "/extract", job.input);
      expect(await replay.json()).toMatchObject({ jobId: job.jobId });
      const receipt = await terminal(job.jobId);
      expect(receipt).toMatchObject({
        mode: ZERO_URL_RESEARCH_MODE,
        paidModelCalls: 0,
        source: { url: "https://research-fixture.example/hours", sha256: zeroComponentHash(html) },
        extraction: {
          url: "https://zero-static.invalid/input",
          title: "Approved public schedule",
          sourceSha256: zeroComponentHash(html),
        },
      });
      expect(receipt.extraction.visibleText).toContain("Saturday 10:00-14:00");
      expect(receipt.extraction.renderedSha256).not.toBe(receipt.source.sha256);
      expect(receipt.extraction.rendering.removedElements).toBeGreaterThanOrEqual(2);
      expect(hits.filter((route) => route === "/private")).toHaveLength(0);
      const png = Buffer.from(receipt.extraction.screenshot.contentBase64, "base64");
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(zeroComponentHash(png)).toBe(receipt.extraction.screenshot.sha256);
      expect(Buffer.from(receipt.sourceContent.contentBase64, "base64").toString()).toBe(html);
      successfulSource = receipt.source.artifactId;
      const stored = await app.prisma.artifact.findUniqueOrThrow({
        where: { id: receipt.source.artifactId },
      });
      expect(stored).toMatchObject({
        name: "zero-research-source.html",
        spaceId: principal.spaceId,
        userId: principal.userId,
        hash: zeroComponentHash(html),
      });
      expect(hits.filter((route) => route === "/hours")).toHaveLength(1);
      expect(privateHeaders).toHaveLength(0);
      expect(model).not.toHaveBeenCalled();
    });
    it("denies generic artifact transport bypass after the current grant is revoked", async () => {
      grant = undefined;
      try {
        const response = await request("/rpc/artifacts/getById", {
          json: { artifactId: successfulSource },
        });
        expect(response.status).toBe(403);
        expect(await response.text()).not.toContain("contentBase64");
      } finally {
        grant = { ...principal };
      }
    });
    it("denies foreign access to request, receipt and raw source transport", async () => {
      for (const tail of ["", "/artifact"])
        expect(
          (await request(prefix + "/jobs/" + successfulJob + tail, undefined, foreignCookie))
            .status,
        ).toBe(403);
    });
    it("rejects caller URL, path, JavaScript, selectors, source IDs and unknown tasks", async () => {
      const before = hits.length;
      for (const extra of [
        { url: "https://elsewhere.example/" },
        { path: "/private" },
        { js: "fetchPrivate()" },
        { selector: "body" },
        { sourceId: "other" },
        { taskId: "unknown" },
      ]) {
        const response = await request(prefix + "/extract", { ...params(), ...extra });
        expect([400, 403]).toContain(response.status);
      }
      expect(hits).toHaveLength(before);
    });
    it("rejects HTTP redirect before any second source request and retains failed receipt", async () => {
      const before = hits.length,
        job = await submit("redirect"),
        receipt = await terminal(job.jobId, "failed");
      expect(receipt.reason).toBe("research_source_fetch_rejected");
      expect(hits.slice(before)).toEqual(["/redirect"]);
      expect(receipt.extraction).toBeUndefined();
    });
    it("preserves cancellation across worker reconnect without fetching source", async () => {
      await stop();
      const before = hits.length,
        job = await submit();
      expect((await request(prefix + "/jobs/" + job.jobId + "/cancel", {})).status).toBe(200);
      await start();
      await terminal(job.jobId, "cancelled");
      expect(hits).toHaveLength(before);
    });
    it("blocks a registry revoked before worker reconnect before reading private request bytes", async () => {
      await stop();
      const before = hits.length,
        job = await submit(),
        original = binding.tasks[0]!.sourceId;
      binding.tasks[0]!.sourceId = "revoked-source";
      await start();
      await expect
        .poll(
          async () =>
            app.prisma.artifact.findFirst({
              where: { rootArtifactId: job.jobId, name: "zero-research-receipt.json" },
            }),
          { timeout: 10_000 },
        )
        .not.toBeNull();
      binding.tasks[0]!.sourceId = original;
      const receipt = await terminal(job.jobId, "blocked");
      expect(receipt.reason).toBe("project_scope_rejected");
      expect(hits).toHaveLength(before);
    });
    it("rechecks a grant revoked during raw snapshot storage before publishing or rendering", async () => {
      const original = artifacts.put.bind(artifacts);
      const put = vi.spyOn(artifacts, "put");
      put.mockImplementation(async (input, context) => {
        const result = await original(input, context);
        if (input.name === "zero-research-source.html") grant = undefined;
        return result;
      });
      const job = await submit();
      await expect
        .poll(
          async () =>
            app.prisma.artifact.findFirst({
              where: { rootArtifactId: job.jobId, name: "zero-research-receipt.json" },
            }),
          { timeout: 10_000 },
        )
        .not.toBeNull();
      grant = { ...principal };
      put.mockRestore();
      const receipt = await terminal(job.jobId, "blocked");
      expect(receipt.source).toBeUndefined();
      expect(receipt.extraction).toBeUndefined();
    });
    it("cancels an active HTTP fetch and keeps one terminal cancellation", async () => {
      const before = hits.filter((route) => route === "/slow").length,
        job = await submit("slow");
      await expect
        .poll(() => hits.filter((route) => route === "/slow").length, { timeout: 5000 })
        .toBe(before + 1);
      expect((await request(prefix + "/jobs/" + job.jobId + "/cancel", {})).status).toBe(200);
      await terminal(job.jobId, "cancelled");
      await expect
        .poll(async () => app.prisma.artifact.count({ where: { rootArtifactId: job.jobId } }), {
          timeout: 10_000,
        })
        .toBe(1);
    });
    it("shares four outstanding slots with CSV without widening the existing cap", async () => {
      await stop();
      const ids: string[] = [];
      try {
        for (let i = 0; i < 4; i++) ids.push((await submit()).jobId);
        expect((await request(prefix + "/extract", params())).status).toBe(429);
        const csv = await request(`/api/zero/csv/scopes/${scopeId}/prepare`, {
          csv: "a,b\n1,2\n",
          idempotencyKey: randomUUID(),
          deadline: new Date(Date.now() + 60_000).toISOString(),
        });
        expect(csv.status).toBe(429);
      } finally {
        for (const id of ids) await request(prefix + "/jobs/" + id + "/cancel", {});
        await start();
      }
    });
  },
);
