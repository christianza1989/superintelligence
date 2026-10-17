import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createBudgetAllocation, createDb, reserveBudgetInvocation } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { LocalArtifactStore } from "./artifacts.js";
import { createBackgroundJobHandlers } from "./background-job-handlers.js";
import { GraphileJobPublisher, GraphileJobWorkerHost } from "./wakeup.js";
import type { ZeroCsvPrincipal } from "./zero-csv-preparation.js";
import type { ZeroJevProfile } from "./zero-jev-profile.js";
import { createStoredZeroJevResolver } from "./zero-jev-profile.js";
import { createZeroJevToolService, runZeroJevTool } from "./zero-jev-worker.js";

const url = process.env.ZERO_JEV_TEST_DATABASE_URL;
const postgres =
  process.env.VERIFY_ZERO_JEV_DATABASE === "1" && url ? describe.sequential : describe.skip;
postgres(
  "selected Jev profile through existing Graphile queue (PostgreSQL, offline provider)",
  () => {
    const suffix = randomUUID();
    const userId = `jev-user-${suffix}`;
    const spaceId = `jev-space-${suffix}`;
    let db: ReturnType<typeof createDb>;
    let directory: string;
    let artifacts: LocalArtifactStore;
    let jobs: GraphileJobPublisher;
    let host: GraphileJobWorkerHost | undefined;
    let service: ReturnType<typeof createZeroJevToolService>;
    let principal: ZeroCsvPrincipal;
    let profile: ZeroJevProfile;
    let allowed = true;
    let mode = "csv.parse";
    const dispatch = vi.fn<typeof fetch>(async (_url, options) => {
      expect(String(_url)).toBe("https://openrouter.ai/api/v1/systemone");
      const body = JSON.parse(String(options?.body));
      expect(body.state).toEqual({
        task: mode === "abstain" ? "Explain a photograph" : "Fixture tool task",
      });
      expect(JSON.stringify(body)).not.toContain("PRIVATE_LOCAL_DATA");
      if (mode === "timeout") return new Promise(() => {});
      if (mode === "malformed")
        return Response.json({
          answers: "invalid",
          usage: { input_tokens: 8, output_tokens: 1, cost: 0.00001 },
        });
      if (mode === "revoked-after") allowed = false;
      return Response.json({
        answers: {
          tool: {
            type: "choice",
            choice: ["revoked-after", "csv-unknown-usage"].includes(mode) ? "csv.parse" : mode,
          },
        },
        id: "fixture-provider-request",
        usage:
          mode === "csv-unknown-usage"
            ? undefined
            : { input_tokens: 8, output_tokens: 1, cost: 0.00001 },
      });
    });
    const modelRun = vi.fn(() => {
      throw new Error("Coding model forbidden");
    });
    const resolve = () =>
      createStoredZeroJevResolver({
        prisma: db.prisma,
        secretStore: { load: async () => "fixture-secret-never-live" },
        policy: async (actor) => {
          if (!allowed || JSON.stringify(actor) !== JSON.stringify(principal))
            throw new Error("revoked fixture grant");
          return profile;
        },
      });
    const deps = () => ({
      prisma: db.prisma,
      pool: db.pool,
      artifacts,
      resolve: resolve(),
      fetch: dispatch,
    });
    const stop = async () => {
      await host?.stop();
      host = undefined;
    };
    const start = async (configured = true, concurrency = 1) => {
      host = new GraphileJobWorkerHost(db.pool, {
        concurrency,
        pollInterval: 25,
        noHandleSignals: true,
      });
      await host.start(
        createBackgroundJobHandlers({
          prisma: db.prisma,
          artifacts,
          jobs,
          zeroJev: { pool: db.pool, resolve: configured ? resolve() : undefined, fetch: dispatch },
          executor: { continueRun: modelRun },
          runtime: { run: modelRun },
          workerId: "jev-fixture-worker",
        } as unknown as Parameters<typeof createBackgroundJobHandlers>[0]),
      );
    };
    const input = (data = "name,value\nPRIVATE_LOCAL_DATA,2\n") => ({
      goal: mode === "abstain" ? "Explain a photograph" : "Fixture tool task",
      data,
      deadline: new Date(Date.now() + 60000).toISOString(),
      idempotencyKey: randomUUID(),
    });
    const terminal = async (jobId: string) => {
      await expect
        .poll(
          async () =>
            db.prisma.artifact.count({
              where: {
                rootArtifactId: jobId,
                name: "zero-jev-receipt.json",
              },
            }),
          { timeout: 10000, interval: 25 },
        )
        .toBe(1);
      const row = await db.prisma.artifact.findFirstOrThrow({ where: { rootArtifactId: jobId } });
      const bytes = await artifacts.get(row.storageKey, {
        ...principal,
        operationId: jobId,
        traceId: jobId,
        signal: AbortSignal.timeout(1000),
      });
      return JSON.parse(Buffer.from(bytes).toString("utf8"));
    };
    const configure = async (calls = 10) => {
      await stop();
      allowed = true;
      mode = "csv.parse";
      dispatch.mockClear();
      profile = {
        revision: "fixture-profile-v1",
        credentialId: `credential-${suffix}`,
        model: "fixture/jev",
        payerAccountId: `payer-${randomUUID()}`,
        lane: "routing",
        reserveUsdMicros: "10000",
        reserveTokens: "100",
        timeoutMs: 250,
        enabled: true,
        allowTaskDataToOpenRouter: true,
        tools: ["csv.parse", "json.normalize"],
        expiresAt: principal.expiresAt,
      };
      const limit = { calls, usdMicros: 1000000n, tokens: 100000n };
      await createBudgetAllocation(db.pool, {
        accountId: profile.payerAccountId,
        total: limit,
        lanes: { routing: limit },
      });
      service = createZeroJevToolService({ ...deps(), jobs }, principal);
    };
    beforeAll(async () => {
      if (!new URL(url!).pathname.startsWith("/zero_jev_test"))
        throw new Error("Dedicated zero_jev_test database required");
      db = createDb(url!, { poolMax: 8 });
      directory = await mkdtemp(path.join(tmpdir(), "zero-jev-proof-"));
      artifacts = new LocalArtifactStore(directory);
      jobs = new GraphileJobPublisher(db.pool);
      principal = {
        spaceId,
        userId,
        scopeId: "fixture-project",
        policyRevision: "fixture-grant-v1",
        expiresAt: new Date(Date.now() + 10 * 60000).toISOString(),
      };
      await db.prisma.user.create({
        data: { id: userId, name: "Fixture", email: `${suffix}@fixture.invalid` },
      });
      await db.prisma.organization.create({
        data: { id: spaceId, name: "Fixture", slug: spaceId, createdAt: new Date() },
      });
      await db.prisma.space.create({
        data: { id: spaceId, organizationId: spaceId, name: "Fixture" },
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
      await db.prisma.secret.create({
        data: { id: `secret-${suffix}`, userId, kind: "model", ciphertext: "fixture-ref" },
      });
      await db.prisma.userModelCredential.create({
        data: {
          id: `credential-${suffix}`,
          userId,
          provider: "openrouter",
          label: "Fixture",
          secretId: `secret-${suffix}`,
        },
      });
      await db.prisma.spaceModelPreference.create({
        data: { spaceId, userId, credentialId: `credential-${suffix}`, modelId: "fixture/jev" },
      });
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
      if (directory) await rm(directory, { recursive: true, force: true });
    });

    it("selects and actually executes pinned CSV; one call links reservation, usage and receipt after reconnect", async () => {
      await configure();
      const params = input();
      const submitted = await service.submit(params);
      service = createZeroJevToolService({ ...deps(), jobs }, principal);
      expect(await service.submit(params)).toEqual(submitted);
      await expect(service.submit({ ...params, data: "different" })).rejects.toThrow(
        "idempotency_key_conflict",
      );
      await start();
      const result = await terminal(submitted.jobId);
      expect(result).toMatchObject({
        state: "succeeded",
        callId: submitted.callId,
        dispatchAttempts: 1,
        tool: {
          id: "csv.parse",
          result: {
            rows: [
              ["name", "value"],
              ["PRIVATE_LOCAL_DATA", "2"],
            ],
            verification: { outcome: "pass" },
          },
        },
      });
      expect(result.source.files).toContainEqual(expect.objectContaining({ path: "src/csv.js" }));
      const usage = await db.prisma.usageRecord.findMany({ where: { callId: submitted.callId } });
      expect(usage).toHaveLength(1);
      expect(usage[0]).toMatchObject({
        userId,
        spaceId,
        runId: null,
        botId: null,
        operationId: submitted.jobId,
        operationKind: "retrieval",
        inputTokens: 8,
        outputTokens: 1,
        provider: "openrouter",
      });
      expect(
        (
          await db.pool.query(
            'SELECT state FROM zero_budget_reservations WHERE "invocationId" = $1',
            [submitted.callId],
          )
        ).rows,
      ).toEqual([{ state: "held" }]);
      await runZeroJevTool(deps(), submitted.jobId);
      expect(dispatch).toHaveBeenCalledOnce();
      expect((await service.get(submitted.jobId)).state).toBe("succeeded");
      expect(modelRun).not.toHaveBeenCalled();
    });
    it("executes the permitted JSON alternative and abstains on a meaningful no-fit", async () => {
      await configure();
      mode = "json.normalize";
      const json = await service.submit(input('{"z":2,"a":1}'));
      await start();
      expect(await terminal(json.jobId)).toMatchObject({
        state: "succeeded",
        tool: { id: "json.normalize", result: { output: '{"a":1,"z":2}' } },
      });
      await stop();
      mode = "abstain";
      const nofit = await service.submit(input());
      await start();
      expect(await terminal(nofit.jobId)).toMatchObject({
        state: "abstained",
        selection: { reason: "no_suitable_tool" },
        tool: null,
        dispatchAttempts: 1,
      });
      expect(dispatch).toHaveBeenCalledTimes(2);
    });
    it("denies cap zero and an unconfigured worker without any provider dispatch", async () => {
      await configure(0);
      const capped = await service.submit(input());
      await start();
      expect(await terminal(capped.jobId)).toMatchObject({
        state: "blocked",
        dispatchAttempts: 0,
        tool: null,
      });
      expect(dispatch).not.toHaveBeenCalled();
      await configure();
      const absent = await service.submit(input());
      await start(false);
      expect(await terminal(absent.jobId)).toMatchObject({
        state: "blocked",
        dispatchAttempts: 0,
        tool: null,
      });
      expect(dispatch).not.toHaveBeenCalled();
    });
    it("keeps an already admitted invocation unknown without redispatch after a crash gap", async () => {
      await configure();
      const job = await service.submit(input());
      await reserveBudgetInvocation(db.pool, {
        invocationId: job.callId,
        accountId: profile.payerAccountId,
        lane: "routing",
        usdMicros: 10000n,
        tokens: 100n,
      });
      await start();
      expect(await terminal(job.jobId)).toMatchObject({
        state: "unknown",
        priorInvocation: true,
        dispatchAttempts: null,
        tool: null,
      });
      expect(dispatch).not.toHaveBeenCalled();
    });
    it.each(["timeout", "malformed", "unknown-choice"])(
      "retains %s debit and emits one usage receipt without executing a tool",
      async (selectedMode) => {
        await configure();
        mode = selectedMode;
        const job = await service.submit(input());
        await start();
        const result = await terminal(job.jobId);
        expect(result.state).toMatch(/unknown|blocked/);
        expect(result.tool).toBeNull();
        expect(result.dispatchAttempts).toBe(1);
        expect(dispatch).toHaveBeenCalledOnce();
        expect(await db.prisma.usageRecord.count({ where: { callId: job.callId } })).toBe(1);
        expect(
          (
            await db.pool.query(
              'SELECT state FROM zero_budget_reservations WHERE "invocationId" = $1',
              [job.callId],
            )
          ).rows,
        ).toEqual([{ state: "held" }]);
        if (selectedMode === "timeout")
          expect(result.usage).toMatchObject({
            inputTokens: null,
            outputTokens: null,
            costUsd: null,
          });
      },
    );
    it("rechecks revocation after selection and never publishes a successful output", async () => {
      await configure();
      mode = "revoked-after";
      const job = await service.submit(input());
      await start();
      expect(await terminal(job.jobId)).toMatchObject({
        state: "unknown",
        tool: null,
        dispatchAttempts: 1,
      });
      expect(dispatch).toHaveBeenCalledOnce();
      await expect(service.get(job.jobId)).rejects.toThrow();
    });
    it("rejects expired/revised profile and credential rotation before dispatch", async () => {
      await configure();
      const revised = await service.submit(input());
      profile.revision = "fixture-profile-v2";
      await start();
      expect(await terminal(revised.jobId)).toMatchObject({
        state: "blocked",
        dispatchAttempts: 0,
      });
      await configure();
      const rotated = await service.submit(input());
      await db.prisma.secret.update({
        where: { id: `secret-${suffix}` },
        data: { ciphertext: "rotated-fixture-ref" },
      });
      await start();
      expect(await terminal(rotated.jobId)).toMatchObject({
        state: "blocked",
        dispatchAttempts: 0,
      });
      expect(dispatch).not.toHaveBeenCalled();
    });
    it("keeps unknown provider usage held without inventing a zero cost", async () => {
      await configure();
      mode = "csv-unknown-usage";
      const job = await service.submit(input());
      await start();
      expect(await terminal(job.jobId)).toMatchObject({
        state: "succeeded",
        dispatchAttempts: 1,
        usage: { inputTokens: null, outputTokens: null, costUsd: null, usageSource: "unknown" },
      });
      const record = await db.prisma.usageRecord.findFirstOrThrow({
        where: { callId: job.callId },
      });
      expect(record.inputTokens).toBeNull();
      expect(record.costUsd).toBeNull();
      expect(
        (
          await db.pool.query(
            'SELECT state FROM zero_budget_reservations WHERE "invocationId" = $1',
            [job.callId],
          )
        ).rows,
      ).toEqual([{ state: "held" }]);
    });
    it("holds a real dispatch when the usage authority fails, without tool execution", async () => {
      await configure();
      const job = await service.submit(input());
      const sink = vi
        .spyOn(db.prisma.usageRecord, "createMany")
        .mockRejectedValue(new Error("fixture-private-error"));
      try {
        await start();
        const result = await terminal(job.jobId);
        expect(result).toMatchObject({
          state: "unknown",
          tool: null,
          dispatchAttempts: 1,
          selection: { reason: "usage_receipt_requires_reconciliation" },
        });
        expect(JSON.stringify(result)).not.toContain("fixture-private-error");
        expect(sink).toHaveBeenCalledOnce();
        expect(dispatch).toHaveBeenCalledOnce();
        expect(
          (
            await db.pool.query(
              'SELECT state FROM zero_budget_reservations WHERE "invocationId" = $1',
              [job.callId],
            )
          ).rows,
        ).toEqual([{ state: "held" }]);
      } finally {
        sink.mockRestore();
      }
    });
    it("rechecks grant after output staging and preserves an honest withheld receipt", async () => {
      await configure();
      const job = await service.submit(input());
      const put = artifacts.put.bind(artifacts);
      const staging = vi.spyOn(artifacts, "put").mockImplementation(async (input, context) => {
        const result = await put(input, context);
        if (input.name === "zero-jev-receipt.json") allowed = false;
        return result;
      });
      try {
        await start();
        expect(await terminal(job.jobId)).toMatchObject({
          state: "unknown",
          tool: null,
          toolExecuted: "csv.parse",
          dispatchAttempts: 1,
        });
        expect(await db.prisma.artifact.count({ where: { rootArtifactId: job.jobId } })).toBe(1);
      } finally {
        staging.mockRestore();
      }
    });
    it("rejects scope expiry and revoked grant at worker dispatch with zero requests", async () => {
      await configure();
      const expired = await service.submit(input());
      profile.expiresAt = new Date(0).toISOString();
      await start();
      expect(await terminal(expired.jobId)).toMatchObject({
        state: "blocked",
        dispatchAttempts: 0,
      });
      await configure();
      const revoked = await service.submit(input());
      allowed = false;
      await start();
      expect(await terminal(revoked.jobId)).toMatchObject({
        state: "blocked",
        dispatchAttempts: 0,
      });
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("shares one account cap across concurrent submitted jobs", async () => {
      await configure(1);
      const submitted = await Promise.all([service.submit(input()), service.submit(input())]);
      await start(true, 2);
      const results = await Promise.all(submitted.map((job) => terminal(job.jobId)));
      expect(results.map((result) => result.state).sort()).toEqual(["blocked", "succeeded"]);
      expect(dispatch).toHaveBeenCalledOnce();
      expect(
        (
          await db.pool.query('SELECT "reservedCalls" FROM zero_budget_accounts WHERE id = $1', [
            profile.payerAccountId,
          ])
        ).rows[0].reservedCalls,
      ).toBe(1);
    });
  },
);
