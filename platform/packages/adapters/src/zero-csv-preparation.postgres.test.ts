import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ArtifactStore } from "@rakazo/adapter-kit";
import { createDb, IsolationError } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { LocalArtifactStore } from "./artifacts.js";
import { createBackgroundJobHandlers } from "./background-job-handlers.js";
import { GraphileJobPublisher, GraphileJobWorkerHost } from "./wakeup.js";
import type { ZeroCsvAuthorize, ZeroCsvPrincipal } from "./zero-csv-preparation.js";
import { createZeroCsvPreparationService } from "./zero-csv-preparation.js";

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
      { prisma: db.prisma, artifacts, jobs, authorize },
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

  it("executes an immutable request after worker/application reconnection and preserves one versioned receipt", async () => {
    const params = input();
    const submitted = await service.submit(params);
    expect(await service.get(submitted.jobId)).toMatchObject({ state: "queued" });
    service = createZeroCsvPreparationService(
      { prisma: db.prisma, artifacts, jobs, authorize },
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
});
