/** Explicit package-only host feasibility; never a clean-container/G0 acceptance. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNativeQualificationProcessAlive, cleanupNativeQualificationProcess, nativeQualificationArguments, nativeQualificationEnvironment, prepareNativeQualificationDirectories, relocateNativeQualificationPackage, qualifyNativeSharedWeb, stopNativeQualificationProcess } from "./lib/native-runtime-qualification.mjs";

const options = nativeQualificationArguments(process.argv.slice(2));
if (options.plan) {
  console.log(await readFile(new URL("../runtime/native-runtime-runplan.json", import.meta.url), "utf8"));
} else {
  assert.equal(process.platform, "linux"); assert.equal(process.arch, "x64");
  assert.match(process.version, /^v24\./);
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const nonce = randomBytes(8).toString("hex");
  const evidence = path.join(root, "platform/.local/native-runtime-qualification", nonce);
  const scratch = await mkdtemp(path.join(os.tmpdir(), "zero-native-package-proof-"));
  await mkdir(evidence, { recursive: true, mode: 0o700 });
  await prepareNativeQualificationDirectories(scratch);
  await writeFile(path.join(evidence, "private-scratch-path.txt"), scratch + "\n", { mode: 0o600 });
  const cwd = path.join(scratch, "cwd/child"), relocated = path.join(scratch, "runtime");
  const owner = "zero-native-runtime-proof-" + nonce, database = "zero_native_runtime_test_" + nonce, user = "zero_fixture";
  const policyFile = path.join(scratch, "operator/project-policy.json");
  const started = performance.now(), active = AbortSignal.timeout(240_000), children = [];
  const report = {
    schemaVersion: 1, measurement: "relocated-host-node-package-feasibility", status: "RUNNING", stage: "package-validation",
    sourceRevision: options.expectedSource, buildSha256: options.buildSha256, postgresImageId: options.postgresImage,
    localOnly: true, doNotPublish: true, distributionReady: false, runtimeQualified: false, g0Qualified: false,
    cleanContainerQualified: false, scenarios: [], packageBytes: null, installedProductionBytes: null, physicalDedupBytes: null,
    limitations: ["Host Node and a reusable Docker daemon; not a clean-host installation measurement", "Preload guards constrain normal Node module/file/network paths; they are qualification instrumentation, not an OS sandbox", "No full UI, verifier image, native-host/plugin or three-family qualification", "Direct process RSS excludes unmeasured native descendants; complete peak RAM remains unknown", "Filesystem operations have finite file/byte cardinality but no claim of hard kernel-IO preemption"],
  };
  let postgres, databaseUrl, verified, postgresAttempted = false;
  await writeFile(path.join(evidence, "qualification.json"), JSON.stringify({ ...report, interruptionIfNoFinalRecord: "unknown; inspect private owned-state record" }, null, 2) + "\n", { mode: 0o600 });
  await writeFile(path.join(evidence, "private-owned-state.json"), JSON.stringify({ owner, containerName: owner, imageId: options.postgresImage, pgDataDirectory: path.join(scratch, "pg-data") }) + "\n", { mode: 0o600 });
  const scenario = name => report.scenarios.push({ name, status: "PASS" });
  const minimal = { PATH: "/usr/bin:/bin", HOME: path.join(scratch, "home"), TMPDIR: path.join(scratch, "tmp"), LANG: "C.UTF-8", TZ: "UTC" };
  function start(executable, args, { name, env = minimal, signal = active, processCwd = cwd, input = "" } = {}) {
    const child = spawn(executable, args, { cwd: processCwd, env, signal, detached: true, stdio: ["pipe", "pipe", "pipe"] });
    const record = { child, name, stdout: [], stderr: [], bytes: 0, overflow: false, exited: false };
    children.push(record);
    for (const [stream, target] of [[child.stdout, record.stdout], [child.stderr, record.stderr]]) stream.on("data", bytes => {
      record.bytes += bytes.length;
      if (record.bytes > 1_048_576) { record.overflow = true; child.kill("SIGKILL"); } else target.push(bytes);
    });
    child.stdin.on("error", () => undefined); child.stdin.end(input);
    child.on("error", error => { record.error = error.code ?? "PROCESS_ERROR"; });
    record.closed = new Promise(resolve => child.once("close", async (code, signalName) => {
      record.exited = true; record.code = code; record.signal = signalName;
      try {
        await writeFile(path.join(evidence, name + ".stdout.log"), Buffer.concat(record.stdout), { mode: 0o600 });
        await writeFile(path.join(evidence, name + ".stderr.log"), Buffer.concat(record.stderr), { mode: 0o600 });
      } catch { record.error = "LOG_WRITE_FAILED"; }
      resolve(record);
    }));
    return record;
  }
  let commandNumber = 0;
  async function command(executable, args, settings = {}) {
    const record = start(executable, args, { name: "command-" + ++commandNumber, signal: AbortSignal.any([settings.signal ?? active, AbortSignal.timeout(20_000)]), ...settings });
    await record.closed;
    if (record.code !== 0 || record.error || record.overflow) throw new Error("NATIVE_QUALIFICATION_PROCESS_FAILED");
    return Buffer.concat(record.stdout).toString("utf8");
  }
  const docker = (args, settings) => command("/usr/bin/docker", ["--host", "unix:///var/run/docker.sock", "--config", path.join(scratch, "docker"), ...args], settings);
  const sql = query => docker(["exec", "-i", postgres, "psql", "-X", "-A", "-t", "-U", user, "-d", database, "--set=ON_ERROR_STOP=on", "--command", query]);
  async function ownsPostgres(id, signal = active) {
    assert.match(id, /^[a-f0-9]{64}$/);
    const [item] = JSON.parse(await docker(["inspect", id], { signal }));
    assert.equal(item.Config.Labels["repositoryzero.owner"], owner);
    assert.equal(item.Config.Labels["repositoryzero.profile"], "native-mcp-local-v1");
    assert.equal(item.Name, "/" + owner); assert.equal(item.Image, options.postgresImage);
    const mount = item.Mounts.find(value => value.Destination === "/var/lib/postgresql");
    assert.equal(mount?.Type, "bind"); assert.equal(mount?.Source, path.join(scratch, "pg-data"));
    assert.equal(item.HostConfig.PortBindings["5432/tcp"][0].HostIp, "127.0.0.1");
    return item;
  }
  try {
    verified = await relocateNativeQualificationPackage(options.packageDirectory, relocated, options);
    report.packageBytes = verified.bytes + verified.manifestBytes;
    report.releaseLicenseEvidenceGate = verified.build.releaseLicenseEvidenceGate;
    report.unresolvedLicenseEvidence = verified.build.unresolvedLicenseEvidence;
    scenario("pinned-package-inventory-relocates-without-source-links");
    await writeFile(path.join(cwd, ".env"), "SENDBLUE_API_KEY_ID=forbidden-cwd-dotenv-canary\n", { mode: 0o600 });
    await writeFile(path.join(scratch, "cwd/.env"), "SENDBLUE_API_SECRET=forbidden-parent-dotenv-canary\n", { mode: 0o600 });
    await writeFile(policyFile, JSON.stringify({ version: 1, grants: [] }), { mode: 0o600 });
    report.stage = "owned-postgres";
    const [image] = JSON.parse(await docker(["image", "inspect", options.postgresImage]));
    assert.equal(image.Id, options.postgresImage); assert.equal(image.Os, "linux"); assert.equal(image.Architecture, "amd64");
    report.postgresImageBytes = image.Size;
    const password = randomBytes(24).toString("hex");
    postgresAttempted = true;
    postgres = (await docker(["run", "--pull=never", "--detach", "--name", owner, "--label", "repositoryzero.owner=" + owner, "--label", "repositoryzero.profile=native-mcp-local-v1", "--memory", "512m", "--cpus", "1", "--pids-limit", "128", "--mount", "type=bind,src=" + path.join(scratch, "pg-data") + ",dst=/var/lib/postgresql", "--publish", "127.0.0.1::5432", "--env", "POSTGRES_USER=" + user, "--env", "POSTGRES_PASSWORD=" + password, "--env", "POSTGRES_DB=" + database, options.postgresImage])).trim();
    const owned = await ownsPostgres(postgres);
    const port = Number(owned.NetworkSettings.Ports["5432/tcp"][0].HostPort); assert.ok(port > 0 && port <= 65535);
    databaseUrl = `postgresql://${user}:${password}@127.0.0.1:${port}/${database}`;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { await sql("SELECT 1"); ready = true; break; } catch { active.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    assert.ok(ready); assert.equal((await sql("SHOW server_version_num")).trim(), "180006");
    assert.ok((await sql("SHOW data_directory")).trim().startsWith("/var/lib/postgresql/18/"));
    scenario("owned-installed-postgres-18-6-correct-data-parent");
    const apiPort = await new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); }); });
    const secrets = { auth: randomBytes(32).toString("hex"), encryption: randomBytes(32).toString("hex"), screen: randomBytes(32).toString("hex") };
    const environment = nativeQualificationEnvironment({ scratch, databaseUrl, apiPort, policyFile, secrets });
    const guard = fileURLToPath(new URL("./runtime/native-package-qualification-guard.mjs", import.meta.url));
    const guardConfig = name => path.join(scratch, "operator", name + "-guard.json");
    async function guarded(entry, name) {
      const auditFile = path.join(evidence, name + "-guard-audit");
      await writeFile(guardConfig(name), JSON.stringify({ packageRoot: relocated, auditFile, allowedPorts: [port, apiPort], deniedRoots: [root, ...(process.env.HOME ? [process.env.HOME] : [])], deniedFiles: [path.join(cwd, ".env"), path.join(scratch, "cwd/.env")] }), { mode: 0o600 });
      return start(process.execPath, ["--max-old-space-size=512", "--import", guard, path.join(relocated, entry)], { name, env: { ...environment, ZERO_NATIVE_QUALIFICATION_GUARD: guardConfig(name) } });
    }
    report.stage = "canonical-package-migrations";
    const migration = await guarded("migrate.mjs", "migration"); await migration.closed;
    assert.equal(migration.code, 0); assert.ok(!migration.error && !migration.overflow);
    const expectedMigrations = verified.build.files.filter(file => /^db\/prisma\/migrations\/[^/]+\/migration\.sql$/.test(file.path)).map(file => file.path.split("/")[3]).sort();
    const actualMigrations = (await sql('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name')).trim().split(/\s+/).filter(Boolean);
    assert.deepEqual(actualMigrations, expectedMigrations); assert.ok(actualMigrations.length >= 103);
    report.canonicalMigrations = actualMigrations.length; scenario("relocated-canonical-prisma-migrate-deploy");
    report.stage = "actual-api-worker-startup";
    const api = await guarded("app/api.mjs", "api"), worker = await guarded("app/worker.mjs", "worker");
    const assertRuntimeAlive = () => { assertNativeQualificationProcessAlive(api); assertNativeQualificationProcessAlive(worker); };
    const apiUrl = `http://127.0.0.1:${apiPort}`;
    const fetchJson = async (suffix, { body, headers = {}, expected = 200 } = {}) => {
      assertRuntimeAlive();
      const response = await fetch(apiUrl + suffix, { method: body === undefined ? "GET" : "POST", headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "error", signal: AbortSignal.any([active, AbortSignal.timeout(5_000)]) });
      const reader = response.body.getReader(), chunks = []; let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          length += value.byteLength; assert.ok(length <= 65_536); chunks.push(Buffer.from(value));
        }
      } finally { await reader.cancel(); }
      assertRuntimeAlive();
      const bytes = Buffer.concat(chunks); assert.equal(response.status, expected);
      return { response, json: JSON.parse(bytes) };
    };
    ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      assertRuntimeAlive();
      try { await fetchJson("/ready"); ready = true; break; } catch { active.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 200)); }
    }
    assertRuntimeAlive(); assert.ok(ready); scenario("real-package-api-worker-readiness");
    report.stage = "shared-built-web-smoke";
    report.sharedWeb = await qualifyNativeSharedWeb({ apiUrl, build: verified.build, signal: active, assertAlive: assertRuntimeAlive });
    scenario("actual-package-shared-web-index-asset-and-reserved-route-smoke");
    report.stage = "real-api-session-and-private-scope";
    const signup = await fetchJson("/api/auth/sign-up/email", { body: { name: "Package fixture", email: `fixture-${nonce}@fixture.invalid`, password: randomBytes(24).toString("hex") }, headers: { origin: apiUrl } });
    const cookie = signup.response.headers.getSetCookie().map(value => value.split(";")[0]).find(value => /(?:^|-)better-auth\.session_token=/.test(value)); assert.ok(cookie);
    const actor = (await fetchJson("/rpc/me", { body: { json: {} }, headers: { cookie, origin: apiUrl } })).json.json;
    assert.match(actor.userId, /^[A-Za-z0-9_-]{1,128}$/); assert.match(actor.spaceId, /^[A-Za-z0-9_-]{1,128}$/);
    const scopeId = "native-package-csv-fixture", grant = { spaceId: actor.spaceId, userId: actor.userId, scopeId, policyRevision: "package-fixture-v1", expiresAt: new Date(Date.now() + 120_000).toISOString() };
    await writeFile(policyFile, JSON.stringify({ version: 1, grants: [grant] }), { mode: 0o600 });
    const headers = { cookie, "x-rakazo-space-id": actor.spaceId }, prefix = "/api/zero/csv/scopes/" + scopeId;
    assert.equal((await fetchJson(prefix + "/status", { headers })).json.paidModelCalls, 0);
    scenario("real-session-external-private-scope-policy");
    report.stage = "durable-csv-job";
    const body = { csv: 'name,value\n"one,two",3\n', idempotencyKey: randomUUID(), deadline: new Date(Date.now() + 60_000).toISOString() };
    const submitted = (await fetchJson(prefix + "/prepare", { body, headers, expected: 202 })).json;
    assert.match(submitted.jobId, /^[a-f0-9-]{36}$/);
    assert.equal((await fetchJson(prefix + "/prepare", { body, headers, expected: 202 })).json.jobId, submitted.jobId);
    let job;
    for (let attempt = 0; attempt < 200; attempt++) {
      assertRuntimeAlive(); job = (await fetchJson(prefix + "/jobs/" + submitted.jobId, { headers })).json;
      if (["succeeded", "failed", "blocked", "cancelled"].includes(job.state)) break;
      active.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(job.state, "succeeded");
    const parts = []; let offset = 0, complete = false;
    for (let pageNumber = 0; pageNumber < 16; pageNumber++) {
      const page = (await fetchJson(prefix + "/jobs/" + submitted.jobId + "/artifact?offset=" + offset + "&limit=8192", { headers })).json;
      assert.equal(page.sha256, job.sha256); assert.equal(page.offset, offset); parts.push(Buffer.from(page.contentBase64, "base64"));
      if (page.nextOffset === null) { complete = true; break; }
      assert.ok(Number.isSafeInteger(page.nextOffset) && page.nextOffset > offset); offset = page.nextOffset;
    }
    const receiptBytes = Buffer.concat(parts); assert.ok(complete && receiptBytes.length <= 98_304);
    assert.equal(createHash("sha256").update(receiptBytes).digest("hex"), job.sha256);
    const receipt = JSON.parse(receiptBytes); assert.equal(receipt.paidModelCalls, 0);
    assert.equal(receipt.result.verification.outcome, "pass"); assert.deepEqual(receipt.result.rows, [["name", "value"], ["one,two", "3"]]);
    assert.equal(Number((await sql(`SELECT count(*) FROM usage_records WHERE "spaceId"='${actor.spaceId}'`)).trim()), 0);
    assertRuntimeAlive();
    report.receiptSha256 = job.sha256; report.observedUsageRows = 0; scenario("actual-package-api-graphile-worker-csv-receipt-and-idempotency");
    report.stage = "measurement-and-graceful-stop";
    report.postgresDataApparentBytes = Number((await docker(["exec", postgres, "du", "-sb", "/var/lib/postgresql"])).trim().split(/\s+/)[0]);
    report.postgresWalBytes = Number((await sql("SELECT COALESCE(sum(size),0)::bigint FROM pg_ls_waldir()")).trim());
    assertRuntimeAlive();
    await stopNativeQualificationProcess(api); await stopNativeQualificationProcess(worker); scenario("actual-package-process-graceful-stop");
    for (const name of ["migration", "api", "worker"]) {
      const auditFiles = (await readdir(evidence)).filter(file => file.startsWith(name + "-guard-audit.") && file.endsWith(".json"));
      assert.ok(auditFiles.length >= (name === "migration" ? 2 : 1));
      const audits = await Promise.all(auditFiles.map(async file => JSON.parse(await readFile(path.join(evidence, file), "utf8"))));
      for (const audit of audits) { assert.equal(audit.deniedModules, 0); assert.equal(audit.deniedFilesystem, 0); assert.equal(audit.deniedNetwork, 0); assert.ok(audit.moduleResolutions > 0); }
      report.processAudits ??= {}; report.processAudits[name] = audits;
    }
    scenario("closed-package-modules-no-ambient-files-or-nonfixture-node-network");
    report.status = "PASS_HOST_PACKAGE_FEASIBILITY_ONLY";
  } catch (error) {
    report.status = "FAIL"; report.failureKind = error.code === "ERR_ASSERTION" ? "assertion" : "runtime";
    await writeFile(path.join(evidence, "private-failure.txt"), String(error.stack ?? error), { mode: 0o600 }); process.exitCode = 1;
  } finally {
    report.stageAtCompletion = report.stage;
    const stopped = await Promise.allSettled(children.map(record => cleanupNativeQualificationProcess(record)));
    if (stopped.some(result => result.status === "rejected")) { report.processCleanup = "unknown"; report.status = "FAIL"; process.exitCode = 1; } else report.processCleanup = "owned-children-stopped";
    const cleanup = AbortSignal.timeout(15_000);
    try {
      if (!postgresAttempted) { report.containerCleanup = "no-fixture-start-attempted"; }
      else {
      const ids = (await docker(["ps", "--all", "--quiet", "--no-trunc", "--filter", "label=repositoryzero.owner=" + owner], { signal: cleanup })).trim().split(/\s+/).filter(Boolean);
      assert.ok(ids.length <= 1);
      for (const id of ids) {
        await ownsPostgres(id, cleanup);
        // Preserve the real server diagnostic before removing our fixture.
        // A log retrieval failure must never prevent owned-container cleanup.
        try { await docker(["logs", "--tail", "100", id], { signal: cleanup }); }
        catch { report.postgresLogCapture = "unavailable"; }
        await docker(["rm", "--force", id], { signal: cleanup });
      }
      report.containerCleanup = "owned-fixture-removed-bind-data-retained";
      }
    } catch { report.containerCleanup = "unknown"; report.status = "FAIL"; process.exitCode = 1; }
    report.elapsedMs = Math.round(performance.now() - started); report.finishedAt = new Date().toISOString();
    report.privateStateRetained = true;
    await writeFile(path.join(evidence, "qualification.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
    console.log(JSON.stringify({ status: report.status, g0Qualified: false, runtimeQualified: false, distributionReady: false, evidence: path.relative(root, evidence) }));
  }
}
