/** Explicit local conformance against a disposable test database. No model/provider dispatch. */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createApp } from "../apps/api/src/app.ts";
import { createDb } from "../packages/db/src/index.ts";
import { LocalArtifactStore } from "../packages/adapters/src/artifacts.ts";
import { createBackgroundJobHandlers } from "../packages/adapters/src/background-job-handlers.ts";
import { GraphileJobWorkerHost } from "../packages/adapters/src/wakeup.ts";
import { createZeroProjectPolicy } from "../packages/adapters/src/zero-project-policy.ts";

const platform = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = path.dirname(platform);
const databaseUrl = process.env.ZERO_CSV_TEST_DATABASE_URL;
assert.equal(process.env.VERIFY_ZERO_CSV_DATABASE, "1", "Explicit test database gate required");
assert.ok(databaseUrl && new URL(databaseUrl).pathname.startsWith("/zero_csv_test"), "Dedicated fixture database required");
const requireApi = createRequire(path.join(platform, "apps/api/package.json"));
const requireAdapters = createRequire(path.join(platform, "packages/adapters/package.json"));
const { serve } = await import(pathToFileURL(requireApi.resolve("@hono/node-server")));
const { Client } = await import(pathToFileURL(requireAdapters.resolve("@modelcontextprotocol/sdk/client/index.js")));
const { StdioClientTransport } = await import(pathToFileURL(requireAdapters.resolve("@modelcontextprotocol/sdk/client/stdio.js")));
const scratch = await mkdtemp(path.join(tmpdir(), "zero-native-preparation-proof-"));
const dataDir = path.join(scratch, "data");
const policyFile = path.join(scratch, "project-policy.json");
const bindingFile = path.join(scratch, "application-binding.json");
const origin = "http://127.0.0.1:5173";
const secret = () => randomBytes(32).toString("hex");
Object.assign(process.env, {
  NODE_ENV: "test", DATABASE_URL: databaseUrl, REALTIME_DATABASE_URL: databaseUrl,
  BETTER_AUTH_SECRET: secret(), ENCRYPTION_KEY: secret(), SCREEN_PROXY_SECRET: secret(),
  SANDBOX_SUPERVISOR_TOKEN: secret(), OPENROUTER_API_KEY: "", ANTHROPIC_API_KEY: "",
  MODEL_API_KEY: "", TYPESAFE_API_KEY: "", AXIOM_TOKEN: "", RAKAZO_AUTO_REVIEW: "false",
});
const workerDb = createDb(databaseUrl, { poolMax: 4 });
let handles, server, worker, client;
let stage = "startup";
let succeeded = false;
let modelDispatches = 0;
const forbiddenModel = () => { modelDispatches++; throw new Error("Model dispatch forbidden in this profile"); };
const api = async () => {
  handles = await createApp({
    databaseUrl, dataDir, sandboxProvider: "fake", agentRuntime: "scripted",
    wakeupDriver: "graphile", signupsEnabled: "true", webOrigin: origin,
    authUrl: origin, apiUrl: origin, zeroCsvScopes: createZeroProjectPolicy(policyFile),
  });
  const port = await new Promise((resolve) => {
    server = serve({ fetch: handles.app.fetch, hostname: "127.0.0.1", port: 0 }, (info) => resolve(info.port));
  });
  return `http://127.0.0.1:${port}`;
};
const stopApi = async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    server = undefined;
  }
  if (handles) { await handles.stop(); handles = undefined; }
};
const connect = async () => {
  const transport = new StdioClientTransport({
    command: process.execPath, args: [path.join(root, "scripts/zero-mcp.mjs")],
    cwd: tmpdir(), stderr: "pipe",
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", ZERO_MCP_BINDING_FILE: bindingFile },
  });
  client = new Client({ name: "zero-process-preparation-proof", version: "1" });
  let diagnostics = "";
  transport.stderr.on("data", (chunk) => { diagnostics += chunk; });
  await client.connect(transport);
  assert.equal(diagnostics, "", "No startup path or credential diagnostic expected");
};
const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(result.isError, true, "Tool call must succeed");
  return result.structuredContent;
};
try {
  const firstUrl = await api();
  stage = "session";
  const signup = await fetch(firstUrl + "/api/auth/sign-up/email", {
    method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ name: "Local fixture", email: `fixture-${randomUUID()}@fixture.invalid`, password: secret() }),
  });
  assert.ok(signup.ok, "Fixture signup must succeed");
  const cookie = signup.headers.getSetCookie().map((value) => value.split(";")[0]).find((value) => value.startsWith("better-auth.session_token="));
  assert.ok(cookie, "Signed Zero session cookie required");
  const me = await fetch(firstUrl + "/rpc/me", { method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ json: {} }) });
  assert.equal(me.status, 200);
  const { json: actor } = await me.json();
  const grant = { spaceId: actor.spaceId, userId: actor.userId, scopeId: "csv-process-fixture", policyRevision: "fixture-v1", expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
  const policy = { version: 1, grants: [grant] };
  await writeFile(policyFile, JSON.stringify(policy), { mode: 0o600 });
  const binding = { apiUrl: firstUrl, spaceId: actor.spaceId, scopeId: grant.scopeId, sessionToken: cookie.slice(cookie.indexOf("=") + 1), expiresAt: grant.expiresAt };
  await writeFile(bindingFile, JSON.stringify(binding), { mode: 0o600 });
  stage = "submit";
  await connect();
  const status = await call("zero_status", { nonce: "process-before-restart" });
  assert.equal(status.backend, "available");
  assert.equal(status.profile, "csv-preparation-only");
  assert.equal((await client.listTools()).tools.length, 7);
  const input = { profile: "d3-dsv-3.0.1/strict-table-v1", csv: 'name,value\n"one,two",3\n', idempotencyKey: randomUUID(), deadline: new Date(Date.now() + 60_000).toISOString() };
  const submitted = await call("zero_prepare", input);
  assert.equal((await call("zero_job", { jobId: submitted.jobId })).job.state, "queued");
  await client.close(); client = undefined;
  stage = "restart";
  await stopApi();
  binding.apiUrl = await api();
  await writeFile(bindingFile, JSON.stringify(binding), { mode: 0o600 });
  const policyGuard = createZeroProjectPolicy(policyFile);
  worker = new GraphileJobWorkerHost(workerDb.pool, { concurrency: 1, pollInterval: 25, noHandleSignals: true });
  await worker.start(createBackgroundJobHandlers({
    prisma: workerDb.prisma, artifacts: new LocalArtifactStore(dataDir), jobs: handles.jobs,
    authorizeZeroCsv: policyGuard.authorize, workerId: "mcp-process-fixture-worker",
    executor: { continueRun: forbiddenModel }, runtime: { run: forbiddenModel },
  }));
  await connect();
  const deadline = Date.now() + 15_000;
  let job;
  do {
    job = (await call("zero_job", { jobId: submitted.jobId })).job;
    if (["succeeded", "failed", "blocked", "cancelled"].includes(job.state)) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < deadline);
  assert.equal(job.state, "succeeded", "Restarted client/application must recover durable preparation");
  stage = "artifact";
  const chunks = [];
  let offset = 0;
  let pages = 0;
  for (;;) {
    const page = await call("zero_artifact", { jobId: submitted.jobId, offset, limit: 8192 });
    assert.equal(page.sha256, job.sha256);
    assert.equal(page.artifactId, job.artifactId);
    assert.equal(page.offset, offset);
    chunks.push(Buffer.from(page.contentBase64, "base64"));
    pages++;
    if (page.nextOffset === null) break;
    offset = page.nextOffset;
    assert.ok(pages < 16, "Bounded artifact pagination required");
  }
  const bytes = Buffer.concat(chunks);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), job.sha256);
  const receipt = JSON.parse(bytes);
  assert.equal(receipt.state, "succeeded");
  assert.equal(receipt.result.verification.outcome, "pass");
  assert.deepEqual(receipt.result.rows, [["name", "value"], ["one,two", "3"]]);
  assert.equal(receipt.component.version, "3.0.1");
  assert.equal(receipt.paidModelCalls, 0);
  assert.equal((await call("zero_prepare", input)).jobId, submitted.jobId);
  assert.equal((await call("zero_cancel", { jobId: submitted.jobId })).state, "succeeded");
  assert.equal(await workerDb.prisma.artifact.count({ where: { rootArtifactId: submitted.jobId, name: "zero-csv-receipt.json" } }), 1);
  assert.equal(await workerDb.prisma.usageRecord.count({ where: { spaceId: actor.spaceId } }), 0);
  assert.equal(modelDispatches, 0);
  stage = "revocation";
  await writeFile(policyFile, JSON.stringify({ version: 1, grants: [] }), { mode: 0o600 });
  assert.equal((await call("zero_status", { nonce: "after-revocation" })).backend, "blocked");
  assert.equal((await client.callTool({ name: "zero_job", arguments: { jobId: submitted.jobId } })).isError, true);
  succeeded = true;
  console.log(JSON.stringify({ status: "PASS", profile: "csv-preparation-only", processTransport: true, apiRestart: true, clientRestart: true, graphile: true, artifactHashVerified: true, pages, singleReceipt: true, revocation: "blocked", paidModelCalls: 0, limitations: "No host-project integration/verify, native-host tool event or independent holdout proof" }));
} catch {
  console.error(`MCP preparation proof failed at ${stage}; private fixture retained.`);
  process.exitCode = 1;
} finally {
  await client?.close().catch(() => undefined);
  await worker?.stop().catch(() => undefined);
  await stopApi().catch(() => undefined);
  await workerDb.prisma.$disconnect().catch(() => undefined);
  await workerDb.pool.end().catch(() => undefined);
  if (succeeded) await rm(scratch, { recursive: true, force: true });
}
