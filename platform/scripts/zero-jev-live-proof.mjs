/** Explicit three-case worker qualification. All provider calls also debit the existing shared Lab ledger. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createBudgetAllocation, createDb } from "../packages/db/src/index.ts";
import { LocalArtifactStore } from "../packages/adapters/src/artifacts.ts";
import { createBackgroundJobHandlers } from "../packages/adapters/src/background-job-handlers.ts";
import { EncryptedSecretStore } from "../packages/adapters/src/secrets.ts";
import { createStoredZeroJevResolver } from "../packages/adapters/src/zero-jev-profile.ts";
import { createZeroJevToolService } from "../packages/adapters/src/zero-jev-worker.ts";
import {
  createZeroProjectPolicy,
  readZeroOperatorFile,
} from "../packages/adapters/src/zero-project-policy.ts";
import { GraphileJobPublisher, GraphileJobWorkerHost } from "../packages/adapters/src/wakeup.ts";
import { withJevLabBudget } from "./zero-lab-jev.mjs";
import {
  JEV_LIVE_MODEL,
  JEV_LIVE_MAX_CONTEXT,
  JEV_LIVE_RESERVE_MICROS,
  readJevPricing,
} from "./zero-jev-live-pricing.mjs";

if (process.argv.length === 2) {
  console.log(
    JSON.stringify({
      status: "NOT_RUN",
      paidCalls: 0,
      reason:
        "Explicit --live, dedicated database, private connection and historical budget ledger required",
    }),
  );
} else {
  await main().catch(() => {
    console.error(
      "Jev live qualification failed; private evidence and all budget holds retained. No automatic retry.",
    );
    process.exitCode = 1;
  });
}

async function main() {
  const offline = process.argv.length === 3 && process.argv[2] === "--offline-proof";
  if (!offline) assert.deepEqual(process.argv.slice(2), ["--live"]);
  assert.equal(process.env.VERIFY_ZERO_JEV_DATABASE, "1");
  const databaseUrl = process.env.ZERO_JEV_TEST_DATABASE_URL;
  assert.ok(databaseUrl && new URL(databaseUrl).pathname.startsWith("/zero_jev_test"));
  const directory = await mkdtemp(path.join(tmpdir(), "zero-jev-live-proof-"));
  let connectionFile = process.env.ZERO_JEV_CONNECTION_FILE;
  let ledgerFile = process.env.ZERO_JEV_BUDGET_LEDGER;
  // Explicit emulation has separate generated files and cannot read a real key or ledger.
  if (offline) {
    connectionFile = path.join(directory, "fixture-connection.json");
    ledgerFile = path.join(directory, "fixture-ledger.json");
    await writeFile(
      connectionFile,
      JSON.stringify({
        provider: "openrouter",
        model: JEV_LIVE_MODEL,
        apiKey: "fixture-key-never-dispatched",
      }),
      { mode: 0o600 },
    );
    await writeFile(
      ledgerFile,
      JSON.stringify({ limitUsdMicros: 1_000_000, reservedUsdMicros: 0, invocations: [] }),
      { mode: 0o600 },
    );
  }
  assert.ok(connectionFile && ledgerFile && path.isAbsolute(ledgerFile));
  const connection = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      await readZeroOperatorFile(connectionFile, 8192),
    ),
  );
  assert.deepEqual(Object.keys(connection).sort(), ["apiKey", "model", "provider"]);
  assert.equal(connection.provider, "openrouter");
  assert.equal(connection.model, JEV_LIVE_MODEL);
  assert.ok(
    typeof connection.apiKey === "string" &&
      connection.apiKey.length >= 16 &&
      connection.apiKey.length <= 512 &&
      !/[\r\n]/.test(connection.apiKey),
  );
  const pricingFetch = offline
    ? async () =>
        Response.json({
          data: {
            id: JEV_LIVE_MODEL,
            endpoints: [
              {
                context_length: JEV_LIVE_MAX_CONTEXT,
                pricing: { prompt: "0.000000042", completion: "0", discount: 0 },
              },
            ],
          },
        })
    : fetch;
  const providerFetch = offline
    ? async (_url, init) => {
        const task = JSON.parse(init.body).state.task;
        const choice = task.startsWith("Parse")
          ? "csv.parse"
          : task.startsWith("Normalize")
            ? "json.normalize"
            : "abstain";
        return Response.json({
          answers: { tool: { type: "choice", choice } },
          model: JEV_LIVE_MODEL,
          provider: "fixture",
          id: randomUUID(),
          usage: { input_tokens: 100, output_tokens: 1, cost: 0.0000042 },
        });
      }
    : fetch;
  const pricing = await readJevPricing(pricingFetch);
  // The historical ledger remains the cross-process spending authority. No copy or reset.
  const prior = JSON.parse(await readFile(ledgerFile, "utf8"));
  assert.equal(prior.limitUsdMicros, 1_000_000);
  assert.ok(prior.limitUsdMicros - prior.reservedUsdMicros >= 3 * JEV_LIVE_RESERVE_MICROS);
  await mkdir(path.join(directory, "data"), { mode: 0o700 });
  const report = {
    kind: "zero.jev.live-qualification.v1",
    emulated: offline,
    createdAt: new Date().toISOString(),
    status: "running",
    pricing,
    cases: [],
    modelDispatchAttempts: 0,
    actualCostUsd: null,
    limitations: [
      "Three development cases, not independent holdout or benefit measurement",
      "Private proof uses operator-bound service and stored encrypted credential; native host use is separate",
      "Historical and database reservations stay held; provider usage is not a refund",
    ],
  };
  const save = () =>
    writeFile(path.join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n", {
      mode: 0o600,
    });
  await save();
  const db = createDb(databaseUrl, { poolMax: 6 });
  const jobs = new GraphileJobPublisher(db.pool);
  const secretStore = new EncryptedSecretStore(randomBytes(32).toString("hex"));
  const artifacts = new LocalArtifactStore(path.join(directory, "data"));
  const suffix = randomUUID();
  const principal = {
    spaceId: `live-space-${suffix}`,
    userId: `live-user-${suffix}`,
    scopeId: "jev-qualification",
    policyRevision: "live-v1",
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
  const credentialId = `credential-${suffix}`;
  const payerAccountId = `authorized-account-${suffix}`;
  const policyFile = path.join(directory, "scope-policy.json");
  const profileFile = path.join(directory, "routing-profile.json");
  const profile = {
    revision: "jev-1.13-text-choice-v1",
    credentialId,
    model: JEV_LIVE_MODEL,
    payerAccountId,
    lane: "routing",
    reserveUsdMicros: String(JEV_LIVE_RESERVE_MICROS),
    reserveTokens: String(JEV_LIVE_MAX_CONTEXT),
    timeoutMs: 15_000,
    expiresAt: principal.expiresAt,
    enabled: true,
    allowTaskDataToOpenRouter: true,
    tools: ["csv.parse", "json.normalize"],
  };
  await writeFile(policyFile, JSON.stringify({ version: 1, grants: [principal] }), { mode: 0o600 });
  await writeFile(profileFile, JSON.stringify(profile), { mode: 0o600 });
  const policy = createZeroProjectPolicy(policyFile);
  const resolve = createStoredZeroJevResolver({
    prisma: db.prisma,
    secretStore,
    policy: async (actor) => {
      await policy.authorize(actor);
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await readZeroOperatorFile(profileFile, 8192),
        ),
      );
    },
  });
  const forbidden = () => {
    throw new Error("Coding model dispatch forbidden");
  };
  let host;
  let stage = "fixture-user";
  try {
    await db.prisma.user.create({
      data: { id: principal.userId, name: "Live fixture", email: `${suffix}@fixture.invalid` },
    });
    stage = "fixture-organization";
    await db.prisma.organization.create({
      data: {
        id: principal.spaceId,
        name: "Live fixture",
        slug: principal.spaceId,
        createdAt: new Date(),
      },
    });
    stage = "fixture-space";
    await db.prisma.space.create({
      data: { id: principal.spaceId, organizationId: principal.spaceId, name: "Live fixture" },
    });
    stage = "fixture-membership";
    await db.prisma.member.create({
      data: {
        id: suffix,
        organizationId: principal.spaceId,
        userId: principal.userId,
        role: "owner",
        createdAt: new Date(),
      },
    });
    await db.prisma.spaceMember.create({
      data: {
        id: suffix,
        spaceId: principal.spaceId,
        organizationId: principal.spaceId,
        userId: principal.userId,
        role: "owner",
        createdAt: new Date(),
      },
    });
    stage = "stored-credential";
    const secretId = `secret-${suffix}`;
    const sealed = await secretStore.put(
      connection.apiKey,
      { ...principal, operationId: suffix, traceId: suffix, signal: AbortSignal.timeout(5000) },
      { recordId: secretId },
    );
    await db.prisma.secret.create({
      data: {
        id: secretId,
        userId: principal.userId,
        kind: "model",
        ciphertext: sealed.ciphertext,
      },
    });
    await db.prisma.userModelCredential.create({
      data: {
        id: credentialId,
        userId: principal.userId,
        provider: "openrouter",
        label: "Qualification",
        secretId,
      },
    });
    await db.prisma.spaceModelPreference.create({
      data: {
        spaceId: principal.spaceId,
        userId: principal.userId,
        credentialId,
        modelId: JEV_LIVE_MODEL,
      },
    });
    stage = "finite-allocation";
    const limit = { calls: 3, usdMicros: 300_000n, tokens: 3n * BigInt(JEV_LIVE_MAX_CONTEXT) };
    await createBudgetAllocation(db.pool, {
      accountId: payerAccountId,
      total: limit,
      lanes: { routing: limit },
    });
    const service = createZeroJevToolService(
      { prisma: db.prisma, pool: db.pool, artifacts, jobs, resolve },
      principal,
    );
    const cases = [
      {
        id: "csv",
        goal: "Parse this rectangular comma-separated CSV table into rows, respecting quoted commas.",
        data: 'name,value\n"one,two",3\n',
        tool: "csv.parse",
      },
      {
        id: "json",
        goal: "Normalize this valid JSON to compact formatting with object keys sorted recursively.",
        data: '{"z":2,"a":{"d":4,"b":3}}',
        tool: "json.normalize",
      },
      {
        id: "no-fit",
        goal: "Create an animated three-dimensional character model from a photograph. None of the listed text data tools can do this.",
        data: "No photograph or 3D tool is available.",
        tool: null,
      },
    ];
    for (const item of cases) {
      stage = `case-${item.id}`;
      const input = {
        goal: item.goal,
        data: item.data,
        deadline: new Date(Date.now() + 60_000).toISOString(),
        idempotencyKey: randomUUID(),
      };
      const submitted = await service.submit(input);
      const startedAt = Date.now();
      let legacyReservations = 0;
      const budget = await withJevLabBudget(ledgerFile, async (reserve) => {
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
            workerId: "jev-live-qualification-worker",
            executor: { continueRun: forbidden },
            runtime: { run: forbidden },
            zeroJev: {
              pool: db.pool,
              resolve,
              fetch: async (url, init) => {
                assert.equal(String(url), "https://openrouter.ai/api/v1/systemone");
                const body = JSON.parse(String(init.body));
                assert.equal(body.model, JEV_LIVE_MODEL);
                assert.equal(body.state.task, item.goal);
                assert.equal(Object.keys(body.questions).length, 1);
                assert.ok(Buffer.byteLength(init.body) <= 32768);
                await readJevPricing(pricingFetch);
                const permit = await reserve(submitted.callId);
                assert.ok(permit, "Historical shared cap must admit the identical call ID");
                legacyReservations++;
                try {
                  report.modelDispatchAttempts++;
                  return await providerFetch(url, init);
                } finally {
                  await permit.hold();
                  await save();
                }
              },
            },
          }),
        );
        try {
          const until = Date.now() + 45_000;
          while (Date.now() < until) {
            const receipt = await service.get(submitted.jobId);
            if (receipt.reason !== "no_terminal_receipt") return receipt;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          throw new Error("No durable live receipt");
        } finally {
          await host.stop();
          host = undefined;
        }
      });
      const receipt = budget.result;
      const usage = await db.prisma.usageRecord.findMany({
        where: { spaceId: principal.spaceId, callId: submitted.callId },
      });
      assert.equal(legacyReservations, 1);
      assert.equal(receipt.callId, submitted.callId);
      assert.equal(usage.length, 1);
      assert.equal((await service.submit(input)).jobId, submitted.jobId);
      const passed =
        item.tool === null
          ? receipt.state === "abstained" && receipt.tool === null
          : receipt.state === "succeeded" &&
            receipt.tool?.id === item.tool &&
            receipt.tool?.result?.verification?.outcome === "pass";
      const outputMatches =
        item.id === "csv"
          ? JSON.stringify(receipt.tool?.result?.rows) ===
            JSON.stringify([
              ["name", "value"],
              ["one,two", "3"],
            ])
          : item.id === "json"
            ? receipt.tool?.result?.output === '{"a":{"b":3,"d":4},"z":2}'
            : receipt.tool === null;
      report.cases.push({
        id: item.id,
        passed: passed && outputMatches,
        elapsedMs: Date.now() - startedAt,
        receipt,
        usage: usage.map((row) => ({
          callId: row.callId,
          provider: row.provider,
          model: row.model,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          costUsd: row.costUsd,
          costSource: row.costSource,
        })),
        historicalReservedUsd: budget.reservedBudgetUsd,
      });
      await save();
      assert.ok(
        passed && outputMatches,
        "Live choice/tool result differs from fixed criterion; do not retry",
      );
    }
    report.status = "PASS";
    const costs = report.cases.map((item) => item.receipt.usage?.costUsd);
    report.actualCostUsd = costs.every(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
      ? costs.reduce((a, b) => a + b, 0)
      : null;
    console.log(
      JSON.stringify({
        status: report.status,
        emulated: offline,
        model: JEV_LIVE_MODEL,
        cases: report.cases.map((item) => ({
          id: item.id,
          passed: item.passed,
          elapsedMs: item.elapsedMs,
          inputTokens: item.receipt.usage?.inputTokens ?? null,
          outputTokens: item.receipt.usage?.outputTokens ?? null,
          costUsd: item.receipt.usage?.costUsd ?? null,
        })),
        modelDispatchAttempts: report.modelDispatchAttempts,
        actualPaidCalls: offline ? 0 : report.modelDispatchAttempts,
        actualCostUsd: offline ? null : report.actualCostUsd,
      }),
    );
  } catch (error) {
    report.status = "FAIL";
    report.failure = {
      stage,
      name: error?.name,
      code: /^P\d{4}$/.test(error?.code ?? "") ? error.code : null,
      ...(offline ? { offlineError: String(error) } : {}),
    };
    throw new Error("Live qualification failed; evidence retained");
  } finally {
    report.finishedAt = new Date().toISOString();
    await save();
    await host?.stop().catch(() => undefined);
    await jobs.close().catch(() => undefined);
    await secretStore.close();
    await db.prisma.$disconnect();
    await db.pool.end();
  }
}
