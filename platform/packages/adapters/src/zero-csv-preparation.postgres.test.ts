import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ArtifactStore } from "@rakazo/adapter-kit";
import { createDb, IsolationError } from "@rakazo/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalArtifactStore } from "./artifacts.js";
import { createBackgroundJobHandlers } from "./background-job-handlers.js";
import { GraphileJobPublisher, GraphileJobWorkerHost } from "./wakeup.js";
import type { ZeroCsvAuthorize, ZeroCsvPrincipal } from "./zero-csv-preparation.js";
import { createZeroCsvPreparationService } from "./zero-csv-preparation.js";
import { prepareZeroCsvComponent, zeroCsvHash } from "./zero-csv-profile.js";
import type { ZeroCsvProjectVerifierConfig } from "./zero-csv-project-verifier.js";
import * as projectVerifier from "./zero-csv-project-verifier.js";

const databaseUrl = process.env.ZERO_CSV_TEST_DATABASE_URL;
const postgres =
  process.env.VERIFY_ZERO_CSV_DATABASE === "1" && databaseUrl ? describe.sequential : describe.skip;

postgres("CSV preparation through the existing Graphile worker (PostgreSQL)", () => {
  const suffix = randomUUID();
  const userId = `csv-user-${suffix}`;
  const spaceId = `csv-space-${suffix}`;
  let db: ReturnType<typeof createDb>;
  let dataDir: string;
  let artifacts: ArtifactStore;
  let jobs: GraphileJobPublisher;
  let host: GraphileJobWorkerHost | undefined;
  let service: ReturnType<typeof createZeroCsvPreparationService>;
  let principal: ZeroCsvPrincipal;
  let verifierConfig: ZeroCsvProjectVerifierConfig | undefined;
  const resolveVerifier = async () => verifierConfig;
  const modelRun = vi.fn(() => {
    throw new Error("Model dispatch forbidden");
  });
  const authorize: ZeroCsvAuthorize = async (actor) => {
    if (
      actor.userId !== userId ||
      actor.spaceId !== spaceId ||
      actor.scopeId !== "fixture-project" ||
      actor.policyRevision !== "fixture-policy-v1"
    )
      throw new Error("Unauthorized fixture principal");
  };
  const input = (overrides: Record<string, unknown> = {}) => ({
    csv: 'name,value\n"one,two",3\n',
    idempotencyKey: randomUUID(),
    deadline: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  });
  const start = async (store = artifacts, guard: ZeroCsvAuthorize | undefined = authorize) => {
    host = new GraphileJobWorkerHost(db.pool, {
      concurrency: 1,
      pollInterval: 25,
      noHandleSignals: true,
    });
    const handlers = createBackgroundJobHandlers({
      prisma: db.prisma,
      artifacts: store,
      authorizeZeroCsv: guard,
      resolveZeroCsvVerifier: resolveVerifier,
      jobs,
      workerId: "csv-fixture-worker",
      executor: { continueRun: modelRun },
      runtime: { run: modelRun },
    } as unknown as Parameters<typeof createBackgroundJobHandlers>[0]);
    await host.start(handlers);
  };
  const stop = async () => {
    await host?.stop();
    host = undefined;
  };
  const terminal = async (id: string, state: string) => {
    await expect
      .poll(async () => (await service.get(id)).state, { timeout: 10_000, interval: 25 })
      .toBe(state);
    return JSON.parse((await service.artifact(id)).content);
  };
  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.startsWith("/zero_csv_test"))
      throw new Error("Explicit dedicated zero_csv_test database required");
    db = createDb(databaseUrl!, { poolMax: 8 });
    dataDir = await mkdtemp(path.join(tmpdir(), "zero-csv-proof-"));
    artifacts = new LocalArtifactStore(dataDir);
    jobs = new GraphileJobPublisher(db.pool);
    principal = {
      spaceId,
      userId,
      scopeId: "fixture-project",
      policyRevision: "fixture-policy-v1",
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    };
    service = createZeroCsvPreparationService(
      { prisma: db.prisma, artifacts, jobs, authorize, resolveVerifier },
      principal,
    );
    await db.prisma.user.create({
      data: { id: userId, name: "CSV fixture", email: `${suffix}@fixture.invalid` },
    });
    await db.prisma.organization.create({
      data: { id: spaceId, name: "CSV fixture", slug: spaceId, createdAt: new Date() },
    });
    await db.prisma.space.create({
      data: { id: spaceId, organizationId: spaceId, name: "CSV fixture" },
    });
    await db.prisma.member.create({
      data: { id: suffix, organizationId: spaceId, userId, role: "owner", createdAt: new Date() },
    });
    await db.prisma.spaceMember.create({
      data: {
        id: suffix,
        spaceId,
        organizationId: spaceId,
        userId,
        role: "owner",
        createdAt: new Date(),
      },
    });
    // Initialize the existing Graphile schema even while the worker is stopped.
    await start();
    await stop();
  });
  afterAll(async () => {
    await stop();
    await jobs?.close();
    if (db) {
      await db.prisma.organization.deleteMany({ where: { id: spaceId } });
      await db.prisma.user.deleteMany({ where: { id: userId } });
      await db.prisma.$disconnect();
      await db.pool.end();
    }
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it("rejects non-finite timestamp offsets before persisting or dispatching a request", async () => {
    const invalid = "2026-10-17T12:00:00+99:99";
    expect(Number.isNaN(Date.parse(invalid))).toBe(true);
    const before = await db.prisma.artifact.count({ where: { spaceId, userId } });
    await expect(service.submit(input({ deadline: invalid }))).rejects.toMatchObject({
      name: "ZodError",
    });
    expect(() =>
      createZeroCsvPreparationService(
        { prisma: db.prisma, artifacts, jobs, authorize },
        { ...principal, expiresAt: invalid },
      ),
    ).toThrow();
    expect(await db.prisma.artifact.count({ where: { spaceId, userId } })).toBe(before);
  });

  it("executes an immutable request after worker/application reconnection and preserves one versioned receipt", async () => {
    const params = input();
    const submitted = await service.submit(params);
    expect(await service.get(submitted.jobId)).toMatchObject({ state: "queued" });
    service = createZeroCsvPreparationService(
      { prisma: db.prisma, artifacts, jobs, authorize, resolveVerifier },
      principal,
    );
    expect(await service.submit(params)).toEqual(submitted);
    await expect(service.submit({ ...params, csv: "different" })).rejects.toThrow(
      "idempotency_key_conflict",
    );
    await start();
    const receipt = await terminal(submitted.jobId, "succeeded");
    expect(receipt).toMatchObject({
      jobId: submitted.jobId,
      requestDigest: submitted.requestDigest,
      paidModelCalls: 0,
      modelExecution: "none",
      result: {
        rows: [
          ["name", "value"],
          ["one,two", "3"],
        ],
        verification: { outcome: "pass", rows: 2, columns: 2 },
      },
      component: { version: "3.0.1", license: "ISC" },
    });
    const row = await db.prisma.artifact.findFirstOrThrow({
      where: { rootArtifactId: submitted.jobId },
    });
    expect(row.version).toBe(2);
    await jobs.enqueue({
      name: "zero.csv.prepare",
      payload: { requestArtifactId: submitted.jobId },
      replaceKey: `zero.csv.prepare:${submitted.jobId}`,
      maxAttempts: 3,
    });
    await expect
      .poll(
        async () =>
          (
            await db.pool.query(
              "select count(*)::int as count from graphile_worker._private_jobs where key=$1",
              [`zero.csv.prepare:${submitted.jobId}`],
            )
          ).rows[0].count,
      )
      .toBe(0);
    expect(await db.prisma.artifact.count({ where: { rootArtifactId: submitted.jobId } })).toBe(1);
    expect((await service.artifact(submitted.jobId)).artifactId).toBe(row.id);
    expect(modelRun).not.toHaveBeenCalled();
    expect(await db.prisma.usageRecord.count({ where: { spaceId } })).toBe(0);
  });

  it("deduplicates simultaneous submissions without conflicting artifact publication", async () => {
    const params = input();
    const accepted = await Promise.all([service.submit(params), service.submit(params)]);
    expect(accepted[0]).toEqual(accepted[1]);
    await terminal(accepted[0]!.jobId, "succeeded");
    expect(await db.prisma.artifact.count({ where: { rootArtifactId: accepted[0]!.jobId } })).toBe(
      1,
    );
  });

  it("persists cancellation before dispatch and prevents a stale queued duplicate from succeeding", async () => {
    await stop();
    const { jobId } = await service.submit(input());
    expect(await service.cancel(jobId)).toMatchObject({ state: "cancelled" });
    await jobs.enqueue({
      name: "zero.csv.prepare",
      payload: { requestArtifactId: jobId },
      replaceKey: `zero.csv.prepare:${jobId}`,
      maxAttempts: 3,
    });
    await start();
    const receipt = await terminal(jobId, "cancelled");
    expect(receipt.result).toBeUndefined();
    expect(await db.prisma.artifact.count({ where: { rootArtifactId: jobId } })).toBe(1);
  });

  it("lets durable cancellation win against already staged successful output", async () => {
    await stop();
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const staged = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const delayed: ArtifactStore = {
      describe: () => artifacts.describe(),
      get: (...args) => artifacts.get(...args),
      remove: (...args) => artifacts.remove(...args),
      put: async (...args) => {
        const result = await artifacts.put(...args);
        if (
          args[0].name === "zero-csv-receipt.json" &&
          JSON.parse(new TextDecoder().decode(args[0].bytes)).state === "succeeded"
        ) {
          entered();
          await gate;
        }
        return result;
      },
    };
    const { jobId } = await service.submit(input());
    await start(delayed);
    try {
      await staged;
      expect(await service.cancel(jobId)).toMatchObject({ state: "cancelled" });
    } finally {
      release();
    }
    await stop();
    expect((await service.get(jobId)).state).toBe("cancelled");
    expect(JSON.parse((await service.artifact(jobId)).content).result).toBeUndefined();
    expect(await db.prisma.artifact.count({ where: { rootArtifactId: jobId } })).toBe(1);
    await start();
  });

  it("does not publish success when storage stalls beyond the runtime bound", async () => {
    await stop();
    const stalled: ArtifactStore = {
      describe: () => artifacts.describe(),
      get: (...args) => artifacts.get(...args),
      remove: (...args) => artifacts.remove(...args),
      put: async (...args) => {
        const stored = await artifacts.put(...args);
        if (
          args[0].name === "zero-csv-receipt.json" &&
          JSON.parse(new TextDecoder().decode(args[0].bytes)).state === "succeeded"
        )
          await new Promise((resolve) => setTimeout(resolve, 5100));
        return stored;
      },
    };
    const { jobId } = await service.submit(input());
    await start(stalled);
    expect(await terminal(jobId, "failed")).toMatchObject({ reason: "job_runtime_exceeded" });
    expect(JSON.parse((await service.artifact(jobId)).content).result).toBeUndefined();
    await stop();
    await start();
  });

  it.each(["grant", "membership"] as const)(
    "rechecks %s revocation after successful bytes are staged before committing a receipt",
    async (revocation) => {
      await stop();
      let release!: () => void;
      let entered!: () => void;
      let revoked = false;
      let removedMembership = false;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const staged = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const membership = await db.prisma.spaceMember.findUniqueOrThrow({
        where: { spaceId_userId: { spaceId, userId } },
      });
      const delayed: ArtifactStore = {
        describe: () => artifacts.describe(),
        get: (...args) => artifacts.get(...args),
        remove: (...args) => artifacts.remove(...args),
        put: async (...args) => {
          const result = await artifacts.put(...args);
          if (
            args[0].name === "zero-csv-receipt.json" &&
            JSON.parse(new TextDecoder().decode(args[0].bytes)).state === "succeeded"
          ) {
            entered();
            await gate;
          }
          return result;
        },
      };
      const { jobId } = await service.submit(input());
      await start(delayed, async (owner) => {
        await authorize(owner);
        if (revoked) throw new IsolationError();
      });
      try {
        await staged;
        if (revocation === "grant") revoked = true;
        else {
          await db.prisma.spaceMember.delete({ where: { id: membership.id } });
          removedMembership = true;
        }
      } finally {
        release();
        await stop();
        if (removedMembership) await db.prisma.spaceMember.create({ data: membership });
      }
      const receipt = await terminal(jobId, "blocked");
      expect(receipt.reason).toBe("project_scope_rejected");
      expect(receipt.result).toBeUndefined();
      expect(await db.prisma.artifact.count({ where: { rootArtifactId: jobId } })).toBe(1);
      await start();
    },
  );

  it("records deadline exhaustion and rejects reuse of the expired idempotency key", async () => {
    await stop();
    const params = input({ deadline: new Date(Date.now() + 150).toISOString() });
    const { jobId } = await service.submit(params);
    await new Promise((resolve) => setTimeout(resolve, 175));
    await start();
    expect(await terminal(jobId, "failed")).toMatchObject({ reason: "job_deadline_exceeded" });
    await expect(service.submit(params)).rejects.toThrow("idempotency_key_expired");
  });

  it("keeps malformed CSV failed and missing project authorization blocked", async () => {
    const malformed = await service.submit(input({ csv: '"bad' }));
    expect(await terminal(malformed.jobId, "failed")).toMatchObject({
      reason: "unterminated_csv_quote",
    });
    await stop();
    const blocked = await service.submit(input());
    // Explicit undefined is distinct from start's default authorization seam.
    host = new GraphileJobWorkerHost(db.pool, {
      concurrency: 1,
      pollInterval: 25,
      noHandleSignals: true,
    });
    await host.start(
      createBackgroundJobHandlers({
        prisma: db.prisma,
        artifacts,
        jobs,
        executor: { continueRun: modelRun },
        workerId: "csv-fixture-worker",
      } as unknown as Parameters<typeof createBackgroundJobHandlers>[0]),
    );
    expect(await terminal(blocked.jobId, "blocked")).toMatchObject({
      reason: "project_authorizer_unavailable",
    });
    await stop();
    await start();
  });

  it("bounds outstanding operations per principal/project before queue dispatch", async () => {
    await stop();
    const params = Array.from({ length: 5 }, () => input());
    const results = await Promise.allSettled(params.map((item) => service.submit(item)));
    const accepted = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    expect(accepted).toHaveLength(4);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      (results.find((result) => result.status === "rejected") as PromiseRejectedResult).reason
        .message,
    ).toBe("scope_job_limit_exceeded");
    for (const item of accepted) await service.cancel(item.jobId);
    await start();
  });

  it("isolates a different scope and reports queue/receipt loss as unknown", async () => {
    await stop();
    const { jobId } = await service.submit(input());
    const other = createZeroCsvPreparationService(
      { prisma: db.prisma, artifacts, jobs, authorize: async () => undefined },
      { ...principal, scopeId: "other-project" },
    );
    await expect(other.get(jobId)).rejects.toThrow("Resource not found");
    await jobs.cancel(`zero.csv.prepare:${jobId}`);
    expect(await service.get(jobId)).toMatchObject({
      state: "unknown",
      reason: "queue_and_receipt_absent",
    });
    await service.cancel(jobId);
    await start();
  });

  it("allows a renewed same-scope grant to recover stranded quota without gaining execution rights", async () => {
    await stop();
    let current = { ...principal };
    const exactGrant: ZeroCsvAuthorize = async (owner) => {
      if (
        (["spaceId", "userId", "scopeId", "policyRevision", "expiresAt"] as const).some(
          (key) => owner[key] !== current[key],
        )
      )
        throw new IsolationError();
    };
    const scopedService = () =>
      createZeroCsvPreparationService(
        { prisma: db.prisma, artifacts, jobs, authorize: exactGrant },
        current,
      );
    const original = scopedService();
    const stranded: string[] = [];
    for (let i = 0; i < 4; i++) {
      const accepted = await original.submit(input());
      stranded.push(accepted.jobId);
      // Simulate queue loss while retaining the immutable request artifacts.
      await jobs.cancel(`zero.csv.prepare:${accepted.jobId}`);
    }
    current = {
      ...current,
      policyRevision: "fixture-policy-v2",
      expiresAt: new Date(Date.parse(current.expiresAt) + 60_000).toISOString(),
    };
    const renewed = scopedService();
    await expect(renewed.submit(input())).rejects.toThrow("scope_job_limit_exceeded");
    for (const id of stranded) {
      expect(await renewed.get(id)).toMatchObject({ state: "unknown" });
      expect(await renewed.cancel(id)).toMatchObject({ state: "cancelled" });
      const receipt = JSON.parse((await renewed.artifact(id)).content);
      expect(receipt.state).toBe("cancelled");
      expect(receipt.result).toBeUndefined();
    }
    const fresh = await renewed.submit(input());
    expect(await renewed.get(fresh.jobId)).toMatchObject({ state: "queued" });
    await renewed.cancel(fresh.jobId);
    // Historical access does not upgrade an old request to the replacement grant.
    current = { ...principal };
    const oldRequest = await scopedService().submit(input());
    current = {
      ...current,
      policyRevision: "fixture-policy-v2",
      expiresAt: new Date(Date.parse(current.expiresAt) + 60_000).toISOString(),
    };
    await start(artifacts, exactGrant);
    const latest = scopedService();
    await expect.poll(async () => (await latest.get(oldRequest.jobId)).state).toBe("blocked");
    const blocked = JSON.parse((await latest.artifact(oldRequest.jobId)).content);
    expect(blocked.reason).toBe("project_scope_rejected");
    expect(blocked.result).toBeUndefined();
    await stop();
    await start();
  });

  const docker =
    process.env.VERIFY_ZERO_CSV_PROJECT_DOCKER === "1" && process.env.ZERO_CSV_PROJECT_IMAGE_ID
      ? describe.sequential
      : describe.skip;
  docker("operator-enabled host verification through the same worker", () => {
    let project: string;
    let staging: string;
    const app = `import {csvParseRows} from './vendor/d3-dsv/src/csv.js'; export function parseCsv(input){return csvParseRows(input);}`;
    beforeEach(async () => {
      project = await mkdtemp(path.join(dataDir, "verify-project-"));
      staging = await mkdtemp(path.join(dataDir, "verify-staging-"));
      await writeFile(path.join(project, "app.mjs"), app);
      for (const file of (await prepareZeroCsvComponent()).files) {
        const target = path.join(project, "vendor/d3-dsv", file.path);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, file.content);
      }
      verifierConfig = {
        dockerExecutable: "/usr/bin/docker",
        imageId: process.env.ZERO_CSV_PROJECT_IMAGE_ID!,
        snapshot: {
          scopeId: principal.scopeId,
          projectRoot: project,
          stagingRoot: staging,
          allowedFiles: [...projectVerifier.ZERO_CSV_PROJECT_FILES],
          limits: { maxFiles: 5, maxFileBytes: 131_072, maxTotalBytes: 262_144 },
        },
      };
      if (!host) await start();
    });
    afterEach(async () => {
      await stop();
      vi.restoreAllMocks();
      verifierConfig = undefined;
      await start();
    });
    const preparation = async () => {
      const accepted = await service.submit(input());
      await terminal(accepted.jobId, "succeeded");
      return accepted.jobId;
    };
    const verifying = (preparationJobId: string, extra = {}) => ({
      preparationJobId,
      idempotencyKey: randomUUID(),
      deadline: new Date(Date.now() + 30_000).toISOString(),
      ...extra,
    });
    const scopeDirectory = () =>
      path.join(
        staging,
        `zero-csv-scope-${zeroCsvHash(JSON.stringify([spaceId, userId, principal.scopeId]))}`,
      );
    const passedVerification = async () => {
      const accepted = await service.submitVerify(verifying(await preparation()));
      expect(await terminal(accepted.jobId, "succeeded")).toMatchObject({
        verification: { outcome: "pass" },
      });
      await stop();
      return accepted.jobId;
    };

    it("observes unchanged then edited host bytes without mutating the successful receipt", async () => {
      const id = await passedVerification();
      const original = await service.artifact(id);
      const dispatch = vi.spyOn(projectVerifier, "verifyZeroCsvProject");
      const fresh = await service.freshness(id);
      expect(fresh).toMatchObject({
        jobId: id,
        artifactId: original.artifactId,
        revision: 2,
        receiptSha256: original.sha256,
        state: "unchanged",
      });
      expect(fresh.verifiedSnapshotSha256).toBe(fresh.currentSnapshotSha256);
      await writeFile(
        path.join(project, "app.mjs"),
        `${app}\n// host edited after immutable PASS\n`,
      );
      const changed = await service.freshness(id);
      expect(changed).toMatchObject({
        state: "changed",
        verifiedSnapshotSha256: fresh.verifiedSnapshotSha256,
        receiptSha256: original.sha256,
      });
      expect(changed.currentSnapshotSha256).not.toBe(changed.verifiedSnapshotSha256);
      expect(await service.artifact(id)).toEqual(original);
      expect(await db.prisma.artifact.count({ where: { rootArtifactId: id } })).toBe(1);
      expect(await readdir(scopeDirectory())).toEqual([]);
      expect(dispatch).not.toHaveBeenCalled();
      expect(modelRun).not.toHaveBeenCalled();
    });

    it("rejects a changed verifier binding before reading host source", async () => {
      const id = await passedVerification();
      const source = vi.spyOn(projectVerifier, "checkZeroCsvProjectFreshness");
      verifierConfig = { ...verifierConfig!, imageId: `sha256:${"a".repeat(64)}` };
      await expect(service.freshness(id)).rejects.toThrow("verification_policy_changed");
      expect(source).not.toHaveBeenCalled();
      expect(await readdir(scopeDirectory())).toEqual([]);
    });

    it.each(["foreign scope", "revoked grant", "membership revoked"])(
      "denies freshness for %s before private bytes or source",
      async (mode) => {
        const id = await passedVerification();
        const source = vi.spyOn(projectVerifier, "checkZeroCsvProjectFreshness");
        const get = vi.spyOn(artifacts, "get");
        const membership = await db.prisma.spaceMember.findUniqueOrThrow({
          where: { spaceId_userId: { spaceId, userId } },
        });
        const caller = createZeroCsvPreparationService(
          {
            prisma: db.prisma,
            artifacts,
            jobs,
            resolveVerifier,
            authorize:
              mode === "revoked grant"
                ? async () => {
                    throw new IsolationError();
                  }
                : async () => undefined,
          },
          mode === "foreign scope"
            ? { ...principal, scopeId: "another-authorized-scope" }
            : principal,
        );
        if (mode === "membership revoked")
          await db.prisma.spaceMember.delete({ where: { id: membership.id } });
        try {
          await expect(caller.freshness(id)).rejects.toBeInstanceOf(IsolationError);
        } finally {
          if (mode === "membership revoked")
            await db.prisma.spaceMember.create({ data: membership });
        }
        expect(get).not.toHaveBeenCalled();
        expect(source).not.toHaveBeenCalled();
        expect(await readdir(scopeDirectory())).toEqual([]);
      },
    );

    it("limits concurrent freshness snapshots to four and releases only its own reservations", async () => {
      const id = await passedVerification();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = projectVerifier.checkZeroCsvProjectFreshness;
      let entered = 0;
      vi.spyOn(projectVerifier, "checkZeroCsvProjectFreshness").mockImplementation(
        async (...args) => {
          entered++;
          await gate;
          return original(...args);
        },
      );
      const checks = Array.from({ length: 4 }, () => service.freshness(id));
      try {
        await expect.poll(() => entered).toBe(4);
        await expect(service.freshness(id)).rejects.toThrow(
          "verification_staging_operator_cleanup_required",
        );
        expect(entered).toBe(4);
      } finally {
        release();
      }
      expect((await Promise.all(checks)).every((result) => result.state === "unchanged")).toBe(
        true,
      );
      expect(await readdir(scopeDirectory())).toEqual([]);
    });

    it("rechecks a grant after capture and publishes no freshness when it is revoked", async () => {
      const id = await passedVerification();
      const immutable = await service.artifact(id);
      let revoked = false;
      const original = projectVerifier.checkZeroCsvProjectFreshness;
      vi.spyOn(projectVerifier, "checkZeroCsvProjectFreshness").mockImplementation(
        async (...args) => {
          const result = await original(...args);
          revoked = true;
          return result;
        },
      );
      const caller = createZeroCsvPreparationService(
        {
          prisma: db.prisma,
          artifacts,
          jobs,
          resolveVerifier,
          authorize: async () => {
            if (revoked) throw new IsolationError();
          },
        },
        principal,
      );
      await expect(caller.freshness(id)).rejects.toBeInstanceOf(IsolationError);
      expect(await readdir(scopeDirectory())).toEqual([]);
      expect(await service.artifact(id)).toEqual(immutable);
    });

    it("honors an aborted freshness request before private reads or staging", async () => {
      const id = await passedVerification();
      const source = vi.spyOn(projectVerifier, "checkZeroCsvProjectFreshness");
      const get = vi.spyOn(artifacts, "get");
      const controller = new AbortController();
      controller.abort();
      await expect(service.freshness(id, controller.signal)).rejects.toThrow(
        "verification_freshness_unavailable",
      );
      expect(get).not.toHaveBeenCalled();
      expect(source).not.toHaveBeenCalled();
      expect(await readdir(scopeDirectory())).toEqual([]);
    });

    it("rejects preparation, queued and cancelled jobs before private request bytes", async () => {
      const prepared = await preparation();
      await stop();
      const pending = await service.submitVerify(verifying(prepared));
      const get = vi.spyOn(artifacts, "get");
      await expect(service.freshness(prepared)).rejects.toThrow("verification_result_required");
      await expect(service.freshness(pending.jobId)).rejects.toThrow(
        "verification_result_required",
      );
      expect(get).not.toHaveBeenCalled();
      await service.cancel(pending.jobId);
      get.mockClear();
      await expect(service.freshness(pending.jobId)).rejects.toThrow(
        "verification_result_required",
      );
      expect(get).not.toHaveBeenCalled();
    });

    it.each(["foreign manifest scope", "incorrect snapshot hash", "duplicate manifest file"])(
      "rejects a %s receipt before host source is captured",
      async (mode) => {
        const id = await passedVerification();
        const row = await db.prisma.artifact.findFirstOrThrow({ where: { rootArtifactId: id } });
        const receipt = JSON.parse((await service.artifact(id)).content);
        if (mode === "foreign manifest scope")
          receipt.verification.snapshot.manifest.scopeId = "foreign";
        if (mode === "incorrect snapshot hash")
          receipt.verification.snapshot.sha256 = "0".repeat(64);
        if (mode === "duplicate manifest file") {
          receipt.verification.snapshot.manifest.files[0].path =
            receipt.verification.snapshot.manifest.files[1].path;
          receipt.verification.snapshot.sha256 = zeroCsvHash(
            JSON.stringify(receipt.verification.snapshot.manifest),
          );
        }
        // Simulate corrupt stored metadata too, so the semantic receipt guard is exercised.
        const bytes = Buffer.from(JSON.stringify(receipt));
        const stored = await artifacts.put(
          { name: "corrupt-fixture.json", mimeType: "application/json", bytes },
          {
            ...principal,
            operationId: "synthetic-corruption",
            traceId: "synthetic-corruption",
            signal: new AbortController().signal,
          },
        );
        await db.prisma.artifact.update({
          where: { id: row.id },
          data: { storageKey: stored.id, size: bytes.length, hash: zeroCsvHash(bytes) },
        });
        const source = vi.spyOn(projectVerifier, "checkZeroCsvProjectFreshness");
        await expect(service.freshness(id)).rejects.toThrow("verification_result_required");
        expect(source).not.toHaveBeenCalled();
        expect(await readdir(scopeDirectory())).toEqual([]);
      },
    );

    it("cleans its reservation when request cancellation arrives before source capture", async () => {
      const id = await passedVerification();
      const controller = new AbortController();
      const original = projectVerifier.checkZeroCsvProjectFreshness;
      vi.spyOn(projectVerifier, "checkZeroCsvProjectFreshness").mockImplementation(
        async (...args) => {
          controller.abort();
          return original(...args);
        },
      );
      await expect(service.freshness(id, controller.signal)).rejects.toThrow(
        "verification_freshness_unavailable",
      );
      expect(await readdir(scopeDirectory())).toEqual([]);
    });

    it("binds a real prepared component, host snapshot and invocation receipt idempotently without private paths", async () => {
      const prepared = await preparation();
      const params = verifying(prepared);
      const accepted = await service.submitVerify(params);
      expect(await service.submitVerify(params)).toEqual(accepted);
      const receipt = await terminal(accepted.jobId, "succeeded");
      expect(receipt).toMatchObject({
        profile: "zero-csv-project-v1",
        preparationJobId: prepared,
        verification: {
          outcome: "pass",
          cases: [
            { actualUse: { calls: 1 } },
            { actualUse: { calls: 1 } },
            { actualUse: { calls: 1 } },
          ],
        },
        freshness: { state: "unchanged" },
        paidModelCalls: 0,
      });
      expect(JSON.stringify(receipt)).not.toContain(dataDir);
      expect(await db.prisma.artifact.count({ where: { rootArtifactId: accepted.jobId } })).toBe(1);
      await stop();
      expect(await readdir(scopeDirectory())).toEqual([]);
      await start();
      await expect(service.submitVerify(verifying(prepared, { root: "/" }))).rejects.toThrow();
      await expect(
        service.submitVerify({ ...params, preparationJobId: randomUUID() }),
      ).rejects.toThrow();
      await expect(service.submitVerify(verifying(accepted.jobId))).rejects.toThrow(
        "verification_preparation_required",
      );
      expect(modelRun).not.toHaveBeenCalled();
    });

    it.each(["unused", "tampered"])(
      "does not upgrade %s host code into a verified result",
      async (mode) => {
        const prepared = await preparation();
        if (mode === "unused")
          await writeFile(path.join(project, "app.mjs"), `export function parseCsv(){return [];}`);
        else await writeFile(path.join(project, "vendor/d3-dsv/LICENSE"), "tampered");
        const accepted = await service.submitVerify(verifying(prepared));
        expect(await terminal(accepted.jobId, "succeeded")).toMatchObject({
          verification: {
            outcome: "fail",
            reason: mode === "unused" ? "component_not_used" : "component_source_mismatch",
          },
        });
        await expect(service.freshness(accepted.jobId)).rejects.toThrow(
          "verification_result_required",
        );
      },
    );

    it("marks a host edit after execution stale instead of publishing a current-project PASS", async () => {
      const prepared = await preparation();
      const original = projectVerifier.verifyZeroCsvProject;
      vi.spyOn(projectVerifier, "verifyZeroCsvProject").mockImplementation(async (...args) => {
        const result = await original(...args);
        await writeFile(path.join(project, "app.mjs"), `${app}\n// host changed after snapshot`);
        return result;
      });
      const accepted = await service.submitVerify(verifying(prepared));
      expect(await terminal(accepted.jobId, "succeeded")).toMatchObject({
        verification: { outcome: "unknown", reason: "host_project_changed_after_snapshot" },
        freshness: { state: "changed" },
      });
    });

    it("blocks revoked original grants before reading their private verify request bytes", async () => {
      const prepared = await preparation();
      await stop();
      const accepted = await service.submitVerify(verifying(prepared));
      const get = vi.fn(artifacts.get.bind(artifacts));
      const guarded: ArtifactStore = {
        describe: () => artifacts.describe(),
        get,
        put: (...args) => artifacts.put(...args),
        remove: (...args) => artifacts.remove(...args),
      };
      await start(guarded, async () => {
        throw new IsolationError();
      });
      expect(await terminal(accepted.jobId, "blocked")).toMatchObject({
        reason: "project_scope_rejected",
      });
      expect(get).not.toHaveBeenCalled();
    });

    it("rechecks a grant revoked after snapshot capture before Docker dispatch", async () => {
      const prepared = await preparation();
      await stop();
      let allowed = true;
      await start(artifacts, async (owner) => {
        await authorize(owner);
        if (!allowed) throw new IsolationError();
      });
      const original = projectVerifier.verifyZeroCsvProject;
      vi.spyOn(projectVerifier, "verifyZeroCsvProject").mockImplementation((config, signal) =>
        original(
          {
            ...config,
            beforeDispatch: async () => {
              allowed = false;
              await config.beforeDispatch?.();
            },
          },
          signal,
        ),
      );
      const accepted = await service.submitVerify(verifying(prepared));
      const receipt = await terminal(accepted.jobId, "blocked");
      expect(receipt.reason).toBe("project_scope_rejected");
      expect(receipt.verification).toBeUndefined();
      await stop();
      expect(await readdir(scopeDirectory())).toEqual([]);
    });

    it("preserves a cancellation winner and stops the bounded in-flight container", async () => {
      const prepared = await preparation();
      await writeFile(path.join(project, "app.mjs"), `${app}\nwhile(true){}`);
      let entered!: () => void;
      const dispatched = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const original = projectVerifier.verifyZeroCsvProject;
      vi.spyOn(projectVerifier, "verifyZeroCsvProject").mockImplementation((config, signal) =>
        original(
          {
            ...config,
            beforeDispatch: async () => {
              await config.beforeDispatch?.();
              entered();
            },
          },
          signal,
        ),
      );
      const accepted = await service.submitVerify(verifying(prepared));
      await dispatched;
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(await service.cancel(accepted.jobId)).toMatchObject({ state: "cancelled" });
      await stop();
      expect(
        JSON.parse((await service.artifact(accepted.jobId)).content).verification,
      ).toBeUndefined();
      expect(await readdir(scopeDirectory())).toEqual([]);
      expect(await db.prisma.artifact.count({ where: { rootArtifactId: accepted.jobId } })).toBe(1);
    });

    it("refuses bounded crash-orphan capacity without deleting old reservations or executing", async () => {
      const prepared = await preparation();
      await mkdir(scopeDirectory(), { mode: 0o700 });
      for (let i = 0; i < 4; i++)
        await mkdir(path.join(scopeDirectory(), `slot-${i}`), { mode: 0o700 });
      const execute = vi.spyOn(projectVerifier, "verifyZeroCsvProject");
      const accepted = await service.submitVerify(verifying(prepared));
      expect(await terminal(accepted.jobId, "blocked")).toMatchObject({
        reason: "verification_staging_operator_cleanup_required",
      });
      expect(execute).not.toHaveBeenCalled();
      expect(await readdir(scopeDirectory())).toHaveLength(4);
    });
    it.each(["oversized", "symlink"])(
      "refuses %s orphan contents before capture without deleting them",
      async (kind) => {
        const prepared = await preparation();
        const slot = path.join(scopeDirectory(), "slot-0");
        await mkdir(scopeDirectory(), { mode: 0o700 });
        await mkdir(slot, { mode: 0o700 });
        const retained = path.join(slot, "retained");
        if (kind === "oversized") await writeFile(retained, Buffer.alloc(1_048_577));
        else await symlink(project, retained);
        const execute = vi.spyOn(projectVerifier, "verifyZeroCsvProject");
        const accepted = await service.submitVerify(verifying(prepared));
        expect(await terminal(accepted.jobId, "blocked")).toMatchObject({
          reason: "verification_staging_operator_cleanup_required",
        });
        expect(execute).not.toHaveBeenCalled();
        expect(await readdir(slot)).toEqual(["retained"]);
      },
    );
  });
});
