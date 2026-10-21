import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ZeroComponentPrincipal, ZeroCsvApplicationBinding } from "@rakazo/adapters";
import {
  createBackgroundJobHandlers,
  GraphileJobWorkerHost,
  LocalArtifactStore,
} from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import { ZERO_CSV_SOURCE_PINS } from "@rakazo/core/zero-prepared-profiles";
import { createDb, IsolationError } from "@rakazo/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadZeroCsvApplicationAttribution } from "../../../packages/adapters/src/zero-csv-application-attribution.js";
import {
  ZERO_CSV_APPLICATION_PROFILE,
  ZERO_CSV_APPLICATION_RECIPE,
} from "../../../packages/adapters/src/zero-csv-application-contract.js";
import { ZERO_CSV_APPLICATION_HARNESS } from "../../../packages/adapters/src/zero-csv-application-harness.js";
import type { ZeroCsvApplicationVerification } from "../../../packages/adapters/src/zero-csv-application-verifier.js";
import type { ZeroCsvApplicationWorkspace } from "../../../packages/adapters/src/zero-csv-application.js";
import { captureZeroDockerProcess } from "../../../packages/adapters/src/zero-docker-process.js";
import { zeroComponentContext } from "../../../packages/adapters/src/zero-component-jobs.js";
import { sessionCookieHeader } from "../../../packages/testkit/src/index.js";
import type { AppHandles } from "./app.js";
import { createApp } from "./app.js";
import type { ZeroComponentScopePolicy } from "./zero-components.js";

const databaseUrl = process.env.ZERO_COMPONENT_TEST_DATABASE_URL;
const enabled = process.env.VERIFY_ZERO_APPLICATION_DATABASE === "1";
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
type Accepted = { jobId: string; requestDigest: string };
type Page = {
  artifactId: string;
  revision: number;
  sha256: string;
  totalBytes: number;
  offset: number;
  nextOffset: number | null;
  encoding: string;
  contentBase64: string;
};
type Receipt = {
  jobId: string;
  requestDigest: string;
  state: string;
  reason?: string;
  paidModelCalls: number;
  source?: { artifactId: string; sha256: string; bytes: number };
  workspace?: { artifactId: string; revision: number; sha256: string; manifestSha256: string };
  verification?: ZeroCsvApplicationVerification;
};
type SavedWorkspace = {
  kind: string;
  jobId: string;
  requestDigest: string;
  inputSha256: string;
  workspace: ZeroCsvApplicationWorkspace;
};

/**
 * Explicit local development proof through the existing API, PostgreSQL, Graphile
 * and installed pinned browser image. No model, pull, installer or G2 grader.
 * Included in the existing Vitest config; skipped without VERIFY_ZERO_APPLICATION_DATABASE=1.
 * Operators also provide ZERO_COMPONENT_TEST_DATABASE_URL, ZERO_STATIC_BROWSER_IMAGE_ID,
 * ZERO_STATIC_BROWSER_LOCK_SHA256, ZERO_APPLICATION_TEST_POSTGRES_ID,
 * ZERO_APPLICATION_PROOF_SOURCE_SHA and ZERO_APPLICATION_PROOF_DIRECTORY.
 * Run this file alone, serially, only after the shared heavy slot is granted:
 * pnpm exec vitest run apps/api/src/zero-application.postgres.test.ts --maxWorkers=1
 */
(enabled ? describe.sequential : describe.skip)(
  "CSV application actual API/PostgreSQL/Graphile/pinned Docker",
  () => {
    let app: AppHandles, db: ReturnType<typeof createDb>, host: GraphileJobWorkerHost | undefined;
    let directory: string, dataDirectory: string, dockerDirectory: string;
    let cookie: string, otherCookie: string, principal: ZeroComponentPrincipal, otherActor: Actor;
    let grant: ZeroComponentPrincipal | undefined, binding: ZeroCsvApplicationBinding;
    let baseline: ZeroCsvApplicationBinding, artifacts: LocalArtifactStore;
    let source: Awaited<ReturnType<typeof ownedInput>>;
    let successful: Accepted, successWorkspace: SavedWorkspace;
    const accepted: Array<{ family: "application" | "csv"; jobId: string }> = [];
    const dispatches: string[] = [];
    const origin = "http://127.0.0.1:5173",
      scopeId = "csv-application-proof";
    const prefix = "/api/zero/application/scopes/" + scopeId;
    const csv =
      'category,amount,note\r\nTravel,12.50,"first, leg"\r\nFood,7.25,lunch\r\nTravel,3.00,return\r\n';
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
      resolveApplication: async (owner) => {
        await policy.authorize(owner);
        return {
          ...binding,
          runtime: { ...binding.runtime, attribution: await loadZeroCsvApplicationAttribution() },
        };
      },
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
    const params = (input = source) => ({
      recipe: ZERO_CSV_APPLICATION_RECIPE,
      inputArtifactId: input.id,
      expectedInputSha256: input.hash,
      idempotencyKey: randomUUID(),
      deadline: new Date(Date.now() + 120_000).toISOString(),
    });
    async function ownedInput(
      content: string,
      options: { name?: string; clientNonce?: string; owner?: Actor } = {},
    ) {
      const owner = options.owner ?? principal;
      const bytes = Buffer.from(content);
      const stored = await artifacts.put(
        { name: options.name ?? "expenses.csv", mimeType: "text/csv", bytes },
        zeroComponentContext(
          { ...principal, spaceId: owner.spaceId, userId: owner.userId },
          randomUUID(),
          "application",
        ),
      );
      return app.prisma.artifact.create({
        data: {
          spaceId: owner.spaceId,
          userId: owner.userId,
          name: options.name ?? "expenses.csv",
          mimeType: "text/csv",
          size: bytes.length,
          hash: hash(bytes),
          storageKey: stored.id,
          ...(options.clientNonce ? { clientNonce: options.clientNonce } : {}),
        },
      });
    }
    const submit = async (input = params()) => {
      const response = await request(prefix + "/create", input);
      expect(response.status, await response.clone().text()).toBe(202);
      const value = (await response.json()) as Accepted;
      accepted.push({ family: "application", jobId: value.jobId });
      return { ...value, input };
    };
    const start = async () => {
      const handlers = createBackgroundJobHandlers({
        prisma: app.prisma,
        artifacts,
        jobs: app.jobs,
        authorizeZeroComponent: policy.authorize,
        resolveZeroApplication: policy.resolveApplication,
        executor: { continueRun: model },
        runtime: { run: model },
        workerId: "application-proof",
      } as never);
      const actual = handlers["zero.application.create"];
      handlers["zero.application.create"] = async (payload) => {
        dispatches.push(payload.requestArtifactId);
        await actual(payload);
      };
      host = new GraphileJobWorkerHost(db.pool, {
        concurrency: 1,
        pollInterval: 25,
        noHandleSignals: true,
      });
      await host.start(handlers);
    };
    const stop = async () => {
      await host?.stop();
      host = undefined;
    };
    const rowFor = (id: string, version: number) =>
      app.prisma.artifact.findFirstOrThrow({ where: { rootArtifactId: id, version } });
    const databaseTerminal = async (id: string, state: string) => {
      await expect
        .poll(
          async () => {
            const row = await app.prisma.artifact.findFirst({
              where: { rootArtifactId: id, version: 2 },
            });
            return row ? JSON.parse(row.description ?? "{}").state : undefined;
          },
          { timeout: 45_000, interval: 50 },
        )
        .toBe(state);
    };
    const pages = async (id: string, kind: "artifact" | "workspace", label = id + "-" + kind) => {
      const chunks: Buffer[] = [];
      let offset = 0,
        reference: Page | undefined;
      for (let count = 0; count < 512; count++) {
        const response = await request(
          prefix + "/jobs/" + id + "/" + kind + "?offset=" + offset + "&limit=8191",
        );
        expect(response.status, await response.clone().text()).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        const page = (await response.json()) as Page;
        expect(page.encoding).toBe("base64");
        expect(page.offset).toBe(offset);
        if (reference)
          expect({ ...page, offset: 0, nextOffset: null, contentBase64: "" }).toEqual({
            ...reference,
            offset: 0,
            nextOffset: null,
            contentBase64: "",
          });
        reference ??= page;
        const bytes = Buffer.from(page.contentBase64, "base64");
        expect(bytes.length).toBeLessThanOrEqual(8191);
        chunks.push(bytes);
        if (page.nextOffset === null) {
          const all = Buffer.concat(chunks);
          expect(all.length).toBe(page.totalBytes);
          expect(hash(all)).toBe(page.sha256);
          expect(all.toString()).not.toContain(dataDirectory);
          await writeFile(path.join(directory, label + ".json"), all, { mode: 0o600 });
          return { bytes: all, page };
        }
        expect(bytes.length).toBeGreaterThan(0);
        expect(page.nextOffset).toBe(offset + bytes.length);
        expect(page.nextOffset).toBeLessThanOrEqual(2_097_152);
        offset = page.nextOffset;
      }
      throw new Error("Bounded page count exhausted");
    };
    const terminal = async (id: string, state = "succeeded") => {
      await databaseTerminal(id, state);
      const result = await pages(id, "artifact"),
        receipt = JSON.parse(result.bytes.toString()) as Receipt;
      expect(receipt.state).toBe(state);
      expect(receipt.jobId).toBe(id);
      expect(receipt.paidModelCalls).toBe(0);
      return receipt;
    };
    beforeAll(async () => {
      if (!databaseUrl || !new URL(databaseUrl).pathname.startsWith("/zero_csv_test"))
        throw new Error("Dedicated fixture database required");
      const imageId = process.env.ZERO_STATIC_BROWSER_IMAGE_ID,
        lock = process.env.ZERO_STATIC_BROWSER_LOCK_SHA256;
      const postgresId = process.env.ZERO_APPLICATION_TEST_POSTGRES_ID;
      const expectedSource = process.env.ZERO_APPLICATION_PROOF_SOURCE_SHA,
        evidenceRoot = process.env.ZERO_APPLICATION_PROOF_DIRECTORY;
      if (
        !imageId ||
        !/^sha256:[a-f0-9]{64}$/u.test(imageId) ||
        !lock ||
        !/^[a-f0-9]{64}$/u.test(lock) ||
        !postgresId ||
        !/^[a-f0-9]{64}$/u.test(postgresId) ||
        !expectedSource ||
        !/^[a-f0-9]{40}$/u.test(expectedSource) ||
        !evidenceRoot
      )
        throw new Error(
          "Explicit image, lock, fixture identity, source pin and private proof directory required",
        );
      const checkout = fileURLToPath(new URL("../../../../", import.meta.url));
      const git = (...args: string[]) =>
        execFileSync("git", args, { cwd: checkout, encoding: "utf8", timeout: 3000 }).trim();
      expect(git("rev-parse", "HEAD")).toBe(expectedSource);
      expect(git("status", "--porcelain", "--untracked-files=no")).toBe("");
      git("ls-files", "--error-unmatch", "platform/apps/api/src/zero-application.postgres.test.ts");
      const privateRoot = await realpath(path.join(checkout, ".artifacts")),
        selected = path.resolve(evidenceRoot);
      if (!selected.startsWith(privateRoot + path.sep))
        throw new Error("Proof directory must remain under ignored .artifacts");
      await mkdir(selected, { recursive: true, mode: 0o700 });
      if (!(await realpath(selected)).startsWith(privateRoot + path.sep))
        throw new Error("Proof symlink rejected");
      directory = await mkdtemp(path.join(selected, "epoch-"));
      dataDirectory = path.join(directory, "data");
      dockerDirectory = path.join(directory, "docker");
      await mkdir(dataDirectory, { mode: 0o700 });
      await mkdir(dockerDirectory, { mode: 0o700 });
      const pins = {
        sourceSha: expectedSource,
        imageId,
        buildInputLockSha256: lock,
        harnessSha256: hash(ZERO_CSV_APPLICATION_HARNESS),
        testSha256: hash(
          await readFile(new URL("./zero-application.postgres.test.ts", import.meta.url)),
        ),
        profile: ZERO_CSV_APPLICATION_PROFILE,
        recipe: ZERO_CSV_APPLICATION_RECIPE,
        scope: "development fixed recipe; no frozen coding/G2 acceptance",
        limitations: [
          "DOM textarea normalizes CRLF; module exact CSV export checked separately",
          "No parent-mediated CSV download or product UI/MCP proof",
        ],
      };
      // Save pins before container inspection or opening a database connection.
      await writeFile(path.join(directory, "pins.json"), JSON.stringify(pins, null, 2) + "\n", {
        mode: 0o600,
      });
      const inspected = await captureZeroDockerProcess(
        "/usr/bin/docker",
        [
          "container",
          "inspect",
          "--format",
          '{{.Id}} {{index .Config.Labels "org.repositoryzero.owner"}} {{.State.Running}}',
          postgresId,
        ],
        dockerDirectory,
        "",
        AbortSignal.timeout(3000),
        3000,
        512,
      );
      expect(inspected.reason).toBeUndefined();
      expect(inspected.code).toBe(0);
      expect(inspected.stdout.trim()).toBe(postgresId + " component-jobs-20261017 true");
      vi.stubEnv("ZERO_PROJECT_POLICY_FILE", "");
      vi.stubEnv("DATABASE_URL", databaseUrl);
      vi.stubEnv("REALTIME_DATABASE_URL", databaseUrl);
      baseline = {
        profile: ZERO_CSV_APPLICATION_PROFILE,
        recipe: ZERO_CSV_APPLICATION_RECIPE,
        runtime: {
          dockerExecutable: "/usr/bin/docker",
          dockerConfigDirectory: dockerDirectory,
          imageId,
          buildInputLockSha256: lock,
          attribution: await loadZeroCsvApplicationAttribution(),
        },
      };
      binding = structuredClone(baseline);
      await writeFile(
        path.join(directory, "attribution-pins.json"),
        JSON.stringify(
          {
            licenseSha256: hash(baseline.runtime.attribution.license),
            noticeSha256: hash(baseline.runtime.attribution.notice),
          },
          null,
          2,
        ) + "\n",
        { mode: 0o600 },
      );
      app = await createApp({
        databaseUrl,
        dataDir: dataDirectory,
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
        const response = await request(
          "/api/auth/sign-up/email",
          {
            name,
            email: name + "-" + randomUUID() + "@fixture.invalid",
            password: "fixture-password-123",
          },
          "",
        );
        expect(response.status).toBeLessThan(400);
        return sessionCookieHeader(response);
      };
      cookie = await signup("application-owner");
      otherCookie = await signup("application-other");
      const actorFor = async (session: string) =>
        ((await (await request("/rpc/me", { json: {} }, session)).json()) as { json: Actor }).json;
      const owner = await actorFor(cookie);
      otherActor = await actorFor(otherCookie);
      principal = {
        spaceId: owner.spaceId,
        userId: owner.userId,
        scopeId,
        policyRevision: "application-proof-v1",
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      };
      grant = { ...principal };
      artifacts = new LocalArtifactStore(dataDirectory);
      db = createDb(databaseUrl, { poolMax: 8 });
      source = await ownedInput(csv);
    });
    beforeEach(() => {
      grant = { ...principal };
      binding = structuredClone(baseline);
    });
    afterEach(async () => {
      await stop();
      vi.restoreAllMocks();
      if (app && principal) {
        grant = { ...principal };
        binding = structuredClone(baseline);
        for (const item of accepted)
          await request(
            "/api/zero/" + item.family + "/scopes/" + scopeId + "/jobs/" + item.jobId + "/cancel",
            {},
          );
      }
      if (directory)
        await writeFile(
          path.join(directory, "dispatches.json"),
          JSON.stringify(dispatches) + "\n",
          { mode: 0o600 },
        );
    });
    afterAll(async () => {
      await stop();
      if (app) await app.stop();
      if (db) {
        await db.prisma.$disconnect();
        await db.pool.end();
      }
      if (directory)
        await writeFile(
          path.join(directory, "cleanup.json"),
          JSON.stringify(
            {
              graphileStopped: !host,
              appStopped: Boolean(app),
              modelDispatches: model.mock.calls.length,
              retained:
                "Fixture rows, source/workspace/evidence bytes and all epochs remain private",
            },
            null,
            2,
          ) + "\n",
          { mode: 0o600 },
        );
      vi.unstubAllEnvs();
      expect(model).not.toHaveBeenCalled();
    });
    it("requires session, current owner/scope and same-origin intent", async () => {
      expect((await request(prefix + "/status", undefined, "")).status).toBe(401);
      expect((await request(prefix + "/status", undefined, otherCookie)).status).toBe(403);
      expect((await request(prefix.replace(scopeId, "other-scope") + "/status")).status).toBe(403);
      expect(
        (await request(prefix + "/create", params(), cookie, { origin: "https://foreign.invalid" }))
          .status,
      ).toBe(403);
      expect(
        (await request(prefix + "/create", params(), cookie, { "sec-fetch-site": "cross-site" }))
          .status,
      ).toBe(403);
      const status = await request(prefix + "/status");
      expect(status.status).toBe(200);
      expect(await status.json()).toMatchObject({
        profile: ZERO_CSV_APPLICATION_PROFILE,
        paidModelCalls: 0,
        limits: { outstandingJobsPerScope: 4 },
        execution: "native-esm-expense-build+opaque-browser-check",
      });
      for (const extra of [
        { commands: ["sh"] },
        { imageId: baseline.runtime.imageId },
        { path: "/private" },
        { sourceUrl: "https://example.invalid" },
      ])
        expect((await request(prefix + "/create", { ...params(), ...extra })).status).toBe(400);
      expect(model).not.toHaveBeenCalled();
    });
    it("creates a real application through Graphile with hash-bound workspace, source pins and desktop/mobile PNG evidence", async () => {
      const submitted = await submit();
      successful = submitted;
      const replay = await request(prefix + "/create", submitted.input);
      expect(replay.status).toBe(202);
      expect(await replay.json()).toEqual({
        jobId: submitted.jobId,
        requestDigest: submitted.requestDigest,
      });
      expect(
        (
          await request(prefix + "/create", {
            ...submitted.input,
            deadline: new Date(Date.parse(submitted.input.deadline) + 1000).toISOString(),
          })
        ).status,
      ).toBe(409);
      await start();
      const receipt = await terminal(submitted.jobId);
      expect(receipt.requestDigest).toBe(submitted.requestDigest);
      expect(receipt.source).toEqual({
        artifactId: source.id,
        sha256: source.hash,
        bytes: source.size,
      });
      expect(dispatches.filter((id) => id === submitted.jobId)).toHaveLength(1);
      const saved = await pages(submitted.jobId, "workspace");
      successWorkspace = JSON.parse(saved.bytes.toString()) as SavedWorkspace;
      expect(successWorkspace).toMatchObject({
        kind: "zero.application.workspace.v1",
        jobId: submitted.jobId,
        requestDigest: submitted.requestDigest,
        inputSha256: source.hash,
      });
      const workspace = successWorkspace.workspace;
      expect(hash(JSON.stringify(workspace.manifest))).toBe(workspace.manifestSha256);
      expect(workspace.manifest.inputSha256).toBe(hash(csv));
      expect(workspace.files).toHaveLength(10);
      expect(workspace.manifest.files).toHaveLength(10);
      expect(workspace.manifest.totalBytes).toBe(
        workspace.files.reduce((total, file) => total + Buffer.byteLength(file.content), 0),
      );
      expect(workspace.preview).toMatchObject({ origin: "opaque", sandbox: "allow-scripts" });
      expect(workspace.preview.contentSecurityPolicy).toContain("connect-src 'none'");
      for (const file of workspace.files) {
        const pinned = workspace.manifest.files.find((entry) => entry.path === file.path)!;
        expect(pinned).toMatchObject({
          sha256: hash(file.content),
          bytes: Buffer.byteLength(file.content),
        });
      }
      const sourceLockFile = workspace.files.find((file) => file.path === "source-lock.json")!;
      const sourceLock = JSON.parse(sourceLockFile.content);
      expect(hash(sourceLockFile.content)).toBe(workspace.manifest.sourceLockSha256);
      expect(sourceLock.component.files).toHaveLength(4);
      expect(sourceLock.component).toMatchObject({
        name: "d3-dsv",
        version: "3.0.1",
        license: "ISC",
        usedEntrypoint: "src/csv.js#csvParseRows",
      });
      for (const pin of sourceLock.component.files as Array<{ path: string; sha256: string }>)
        expect(hash(workspace.files.find((file) => file.path === pin.path)!.content)).toBe(
          pin.sha256,
        );
      for (const [file, pin] of Object.entries(ZERO_CSV_SOURCE_PINS))
        expect(
          hash(workspace.files.find((entry) => entry.path === "vendor/d3-dsv/" + file)!.content),
        ).toBe(pin);
      expect(workspace.files.find((file) => file.path === "LICENSE")!.content).toBe(
        baseline.runtime.attribution.license,
      );
      expect(sourceLock.attribution).toEqual({
        licenseSha256: hash(baseline.runtime.attribution.license),
        noticeSha256: hash(baseline.runtime.attribution.notice),
      });
      expect(receipt.workspace).toEqual({
        artifactId: saved.page.artifactId,
        revision: 3,
        sha256: saved.page.sha256,
        manifestSha256: workspace.manifestSha256,
      });
      const verification = receipt.verification!;
      expect(verification.outcome).toBe("pass");
      if (verification.outcome !== "pass") throw new Error("Actual Docker verifier did not pass");
      expect(verification).toMatchObject({
        imageId: baseline.runtime.imageId,
        buildInputLockSha256: baseline.runtime.buildInputLockSha256,
        harnessSha256: hash(ZERO_CSV_APPLICATION_HARNESS),
        workspaceManifestSha256: workspace.manifestSha256,
        cleanup: "confirmed_absent",
      });
      expect(verification.evidence.runtime).toMatchObject({ networkAttempts: 0, pageErrors: 0 });
      expect(verification.evidence.actualUse.calls).toHaveLength(4);
      expect(verification.evidence.checks.every((check) => check.passed)).toBe(true);
      expect(verification.evidence.checks.map((check) => check.name)).toEqual(
        expect.arrayContaining([
          "category_totals",
          "decimal_string_sum",
          "category_filter",
          "exact_crlf_export",
          "pinned_parser_invoked",
          "desktop_visible_totals",
          "mobile_visible_totals",
          "desktop_opaque_origin",
          "mobile_opaque_origin",
        ]),
      );
      for (const image of verification.evidence.screenshots) {
        const png = Buffer.from(image.contentBase64, "base64");
        expect(png.length).toBe(image.bytes);
        expect(hash(png)).toBe(image.sha256);
        expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(
          image.viewport === "desktop" ? [1280, 720] : [390, 844],
        );
        await writeFile(path.join(directory, image.viewport + ".png"), png, { mode: 0o600 });
      }
      expect(await app.prisma.artifact.count({ where: { rootArtifactId: submitted.jobId } })).toBe(
        2,
      );
      expect(model).not.toHaveBeenCalled();
    }, 60_000);
    it("keeps successful request, workspace and receipt private outside the scoped authenticated route", async () => {
      expect(successful).toBeDefined();
      const privateRows = await app.prisma.artifact.findMany({
        where: { OR: [{ id: successful.jobId }, { rootArtifactId: successful.jobId }] },
      });
      expect(privateRows).toHaveLength(3);
      for (const row of privateRows)
        for (const [method, input] of [
          ["getById", { artifactId: row.id }],
          ["listVersions", { familyId: row.id }],
          ["remove", { artifactId: row.id }],
        ] as const)
          expect((await request("/rpc/artifacts/" + method, { json: input })).status).toBe(403);
      const list = await request("/rpc/artifacts/listSpace", { json: { limit: 60 } });
      expect(list.status).toBe(200);
      const listed = await list.text();
      for (const row of privateRows) expect(listed).not.toContain(row.id);
      for (const kind of ["artifact", "workspace"]) {
        const route = prefix + "/jobs/" + successful.jobId + "/" + kind;
        expect((await request(route, undefined, "")).status).toBe(401);
        expect((await request(route, undefined, otherCookie)).status).toBe(403);
        expect((await request(route.replace(scopeId, "other-scope"))).status).toBe(403);
        for (const query of [
          "offset=01",
          "offset=-1",
          "limit=0",
          "limit=16385",
          "offset=0&offset=1",
          "limit=1&limit=2",
          "unknown=1",
        ])
          expect((await request(route + "?" + query)).status).toBe(400);
      }
      expect((await request(prefix + "/jobs/" + successful.jobId + "/preview")).status).toBe(404);
    });
    it.each(["foreign", "private-name", "private-nonce", "wrong-hash"])(
      "rejects %s input before storage or enqueue",
      async (kind) => {
        const input = await ownedInput(csv, {
          ...(kind === "foreign" ? { owner: otherActor } : {}),
          ...(kind === "private-name" ? { name: "zero-application-workspace.json" } : {}),
          ...(kind === "private-nonce"
            ? { clientNonce: "zero.application.workspace:" + randomUUID() }
            : {}),
        });
        const reads = vi.spyOn(LocalArtifactStore.prototype, "get");
        const count = await app.prisma.artifact.count({
          where: { name: "zero-application-request.json", userId: principal.userId },
        });
        const response = await request(prefix + "/create", {
          ...params(input),
          ...(kind === "wrong-hash" ? { expectedInputSha256: "a".repeat(64) } : {}),
        });
        expect(response.status).toBe(403);
        expect(reads).not.toHaveBeenCalled();
        expect(
          await app.prisma.artifact.count({
            where: { name: "zero-application-request.json", userId: principal.userId },
          }),
        ).toBe(count);
      },
    );
    it("checks expected SHA against actual bytes rather than trusting artifact metadata", async () => {
      const input = await ownedInput(csv);
      await writeFile(
        path.join(dataDirectory, "artifacts", principal.spaceId, input.storageKey),
        "tampered",
        { mode: 0o600 },
      );
      const response = await request(prefix + "/create", params(input));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "component_input_rejected" });
    });
    it.each(["grant", "binding"])(
      "rechecks %s after source storage I/O before enqueue",
      async (change) => {
        const original = LocalArtifactStore.prototype.get;
        vi.spyOn(LocalArtifactStore.prototype, "get").mockImplementation(async function (
          this: LocalArtifactStore,
          id,
          context,
        ) {
          const bytes = await original.call(this, id, context);
          if (id === source.storageKey) {
            if (change === "grant") grant = undefined;
            else binding.runtime.imageId = "sha256:" + "d".repeat(64);
          }
          return bytes;
        });
        const count = await app.prisma.artifact.count({
          where: { name: "zero-application-request.json", userId: principal.userId },
        });
        expect((await request(prefix + "/create", params())).status).toBe(403);
        expect(
          await app.prisma.artifact.count({
            where: { name: "zero-application-request.json", userId: principal.userId },
          }),
        ).toBe(count);
      },
    );
    it.each(["grant", "binding"])(
      "blocks a stale queued %s before private request bytes or Docker dispatch",
      async (change) => {
        const queued = await submit();
        if (change === "grant") grant = undefined;
        else binding.runtime.buildInputLockSha256 = "e".repeat(64);
        const reads = vi.spyOn(LocalArtifactStore.prototype, "get");
        expect((await request(prefix + "/jobs/" + queued.jobId)).status).toBe(403);
        await start();
        await databaseTerminal(queued.jobId, "blocked");
        await stop();
        expect(reads).not.toHaveBeenCalled();
        reads.mockRestore();
        grant = { ...principal };
        binding = structuredClone(baseline);
        const receipt = await terminal(queued.jobId, "blocked");
        expect(receipt.reason).toBe("project_scope_rejected");
        expect(receipt.workspace).toBeUndefined();
      },
    );
    it("rechecks queued input bytes before source generation in the worker", async () => {
      const input = await ownedInput(csv),
        queued = await submit(params(input));
      await writeFile(
        path.join(dataDirectory, "artifacts", principal.spaceId, input.storageKey),
        "changed-after-queue",
        { mode: 0o600 },
      );
      await start();
      const receipt = await terminal(queued.jobId, "failed");
      expect(receipt.reason).toBe("component_input_integrity_failed");
      expect(receipt.workspace).toBeUndefined();
      expect(receipt.verification).toBeUndefined();
    });
    it.each([
      ["artifact", "grant"],
      ["artifact", "binding"],
      ["workspace", "grant"],
      ["workspace", "binding"],
    ] as const)(
      "rechecks %s storage I/O against current %s before exposing private bytes",
      async (kind, change) => {
        const row = await rowFor(successful.jobId, kind === "artifact" ? 2 : 3);
        const original = LocalArtifactStore.prototype.get;
        vi.spyOn(LocalArtifactStore.prototype, "get").mockImplementation(async function (
          this: LocalArtifactStore,
          id,
          context,
        ) {
          const bytes = await original.call(this, id, context);
          if (id === row.storageKey) {
            if (change === "grant") grant = undefined;
            else binding.runtime.imageId = "sha256:" + "f".repeat(64);
          }
          return bytes;
        });
        const response = await request(prefix + "/jobs/" + successful.jobId + "/" + kind);
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "project_scope_rejected" });
      },
    );
    it("denies stale workspace bytes and preserves the exact saved revision", async () => {
      const row = await rowFor(successful.jobId, 3),
        file = path.join(dataDirectory, "artifacts", principal.spaceId, row.storageKey);
      const original = await readFile(file);
      try {
        await writeFile(file, "stale-workspace", { mode: 0o600 });
        const response = await request(prefix + "/jobs/" + successful.jobId + "/workspace");
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "preparation_backend_unavailable" });
      } finally {
        await writeFile(file, original, { mode: 0o600 });
      }
      expect(
        JSON.parse(
          (await pages(successful.jobId, "workspace", "restored-workspace")).bytes.toString(),
        ),
      ).toEqual(successWorkspace);
      expect((await rowFor(successful.jobId, 3)).hash).toBe(row.hash);
    });
    it("preserves cancellation across worker reconnect without a workspace or extra terminal row", async () => {
      const queued = await submit(),
        route = prefix + "/jobs/" + queued.jobId;
      expect((await request(route + "/cancel", {})).status).toBe(200);
      expect((await terminal(queued.jobId, "cancelled")).verification).toBeUndefined();
      await start();
      await stop();
      expect(await app.prisma.artifact.count({ where: { rootArtifactId: queued.jobId } })).toBe(1);
      expect(
        await app.prisma.artifact.count({ where: { rootArtifactId: queued.jobId, version: 3 } }),
      ).toBe(0);
      const reads = vi.spyOn(LocalArtifactStore.prototype, "get");
      await app.jobs.enqueue({
        name: "zero.application.create",
        payload: { requestArtifactId: queued.jobId },
        replaceKey: "application-cancel-restart-" + queued.jobId,
        maxAttempts: 1,
      });
      await start();
      await expect
        .poll(() => dispatches.filter((id) => id === queued.jobId).length, {
          timeout: 10_000,
          interval: 50,
        })
        .toBe(1);
      await stop();
      expect(reads).not.toHaveBeenCalled();
      reads.mockRestore();
      expect((await terminal(queued.jobId, "cancelled")).requestDigest).toBe(queued.requestDigest);
      expect(await app.prisma.artifact.count({ where: { rootArtifactId: queued.jobId } })).toBe(1);
    });
    it("enforces four total outstanding jobs shared with CSV under concurrent submissions", async () => {
      const csvRoute = "/api/zero/csv/scopes/" + scopeId + "/prepare";
      const csvParams = () => ({
        csv,
        idempotencyKey: randomUUID(),
        deadline: new Date(Date.now() + 120_000).toISOString(),
      });
      const initialApplication = await submit();
      const initialCsv = await request(csvRoute, csvParams());
      expect(initialCsv.status).toBe(202);
      const initialCsvValue = (await initialCsv.json()) as Accepted;
      accepted.push({ family: "csv", jobId: initialCsvValue.jobId });
      // Two occupied families guarantee a mixed cohort; six concurrent requests race for only two remaining slots.
      const responses = await Promise.all(
        Array.from({ length: 6 }, (_, index) => {
          const family = index % 2 === 0 ? ("application" as const) : ("csv" as const);
          return request(
            family === "application" ? prefix + "/create" : csvRoute,
            family === "application" ? params() : csvParams(),
          ).then(async (response) => ({
            family,
            status: response.status,
            value: (await response.json()) as Accepted,
          }));
        }),
      );
      const allowed = responses.filter((response) => response.status === 202);
      for (const entry of allowed)
        accepted.push({ family: entry.family, jobId: entry.value.jobId });
      expect(allowed).toHaveLength(2);
      expect(responses.filter((response) => response.status === 429)).toHaveLength(4);
      const ids = [
        initialApplication.jobId,
        initialCsvValue.jobId,
        ...allowed.map((entry) => entry.value.jobId),
      ];
      const rows = await app.prisma.artifact.findMany({ where: { id: { in: ids } } });
      expect(rows).toHaveLength(4);
      expect(new Set(rows.map((row) => row.name))).toEqual(
        new Set(["zero-csv-request.json", "zero-application-request.json"]),
      );
      const replay = await request(prefix + "/create", initialApplication.input);
      expect(replay.status).toBe(202);
      expect(await replay.json()).toMatchObject({ jobId: initialApplication.jobId });
    });
    it("preserves a real failed runtime workspace with an honest failure receipt", async () => {
      const invalid = await ownedInput("category,amount\nInvalid,1.001\n"),
        queued = await submit(params(invalid));
      await start();
      const receipt = await terminal(queued.jobId, "failed");
      expect(receipt.verification).toMatchObject({
        outcome: "fail",
        reason: "APPLICATION_RUNTIME_FAILED",
        cleanup: "confirmed_absent",
        paidModelCalls: 0,
      });
      const saved = await pages(queued.jobId, "workspace"),
        workspace = JSON.parse(saved.bytes.toString()) as SavedWorkspace;
      expect(workspace.inputSha256).toBe(invalid.hash);
      expect(receipt.workspace?.sha256).toBe(saved.page.sha256);
      expect(workspace.workspace.files.some((file) => file.path === "vendor/d3-dsv/LICENSE")).toBe(
        true,
      );
      expect(await app.prisma.artifact.count({ where: { rootArtifactId: queued.jobId } })).toBe(2);
      expect(model).not.toHaveBeenCalled();
    }, 60_000);
  },
);
