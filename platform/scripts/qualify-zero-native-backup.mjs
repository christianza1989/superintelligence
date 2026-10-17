/** Explicit disposable PostgreSQL/Compose qualification. Never touches an existing project. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { backupNativeProfile, restoreNativeProfile } from "./zero-native-backup.mjs";

assert.equal(process.platform, "linux");
assert.deepEqual(process.argv.slice(2), ["--run"], "Explicit --run required; no default activation");
const image = process.env.ZERO_NATIVE_BACKUP_POSTGRES_IMAGE_ID;
assert.match(image ?? "", /^sha256:[a-f0-9]{64}$/u, "Explicit already-installed PostgreSQL image ID required");
const root = fileURLToPath(new URL("../../", import.meta.url));
const platform = path.join(root, "platform");
const suffix = randomBytes(6).toString("hex");
const project = `zero-backup-proof-${suffix}`;
const database = `zero_native_backup_test_${suffix}`;
const user = "zero_fixture";
const scratch = await mkdtemp("/tmp/zero-native-backup-proof-");
const data = path.join(scratch, "data");
const config = path.join(scratch, "compose.yml");
const envFile = path.join(scratch, "compose.env");
const evidence = path.join(platform, ".local/native-backup-qualification", suffix);
await mkdir(evidence, { recursive: true, mode: 0o700 });
await mkdir(data, { mode: 0o700 });
await mkdir(path.join(scratch, "docker"), { mode: 0o700 });
const active = AbortSignal.timeout(240000);
const started = performance.now();
const report = {
  version: 1, status: "NOT_RUN", stage: "startup", postgresImageId: image,
  sourceSha256: Object.fromEntries(await Promise.all(["zero-native-backup.mjs", "qualify-zero-native-backup.mjs"].map(async (name) => [name, createHash("sha256").update(await readFile(new URL(name, import.meta.url))).digest("hex")]))),
  scenarios: [], modelDispatches: 0,
  limitations: ["Owned synthetic service fixtures, not a production native-profile installation", "Requires pre-quiesced writers; no external-writer or mutable-home consistency claim", "Private backup state retained; no automatic retention or hard filesystem-IO preemption claim"],
};
let created = false;
let postgres;
async function command(executable, args, { input = "", env = {}, signal = active } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: platform, env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME, ...env },
      stdio: ["pipe", "pipe", "pipe"], signal,
    });
    const parts = []; let bytes = 0;
    child.stdout.on("data", (part) => { bytes += part.length; if (bytes > 1048576) child.kill("SIGKILL"); else parts.push(part); });
    child.stderr.on("data", (part) => { bytes += part.length; if (bytes > 1048576) child.kill("SIGKILL"); });
    child.stdin.on("error", () => undefined);
    child.once("error", reject);
    child.once("close", (code) => code === 0 && bytes <= 1048576 ? resolve(Buffer.concat(parts).toString("utf8")) : reject(new Error("QUALIFICATION_PROCESS_FAILED")));
    child.stdin.end(input);
  });
}
const docker = (args, options = {}) => command("/usr/bin/docker", ["--host", "unix:///var/run/docker.sock", "--config", path.join(scratch, "docker"), ...args], options);
const composeArgs = ["compose", "--project-name", project, "--file", config, "--env-file", envFile];
const compose = (args, options) => docker([...composeArgs, ...args], options);
const sql = (query, db = database) => docker(["exec", "-i", postgres, "psql", "-X", "-A", "-t", "-U", user, "-d", db, "--set=ON_ERROR_STOP=on", "--command", query]);
const scenario = (name) => report.scenarios.push({ name, status: "PASS" });
async function ownsContainers(options, complete = true) {
  const ids = (await compose(["ps", "--all", "--quiet"], options)).trim().split(/\s+/).filter(Boolean);
  assert.ok(ids.length <= 3); assert.equal(new Set(ids).size, ids.length);
  if (complete) assert.equal(ids.length, 3);
  const services = new Set();
  for (const id of ids) {
    assert.match(id, /^[a-f0-9]{64}$/u);
    const [item] = JSON.parse(await docker(["inspect", id], options));
    assert.equal(item.Config.Labels["com.docker.compose.project"], project);
    assert.equal(item.Config.Labels["repositoryzero.owner"], suffix);
    assert.equal(item.Config.Labels["repositoryzero.profile"], "native-mcp-local-v1");
    assert.equal(item.Config.Labels["com.docker.compose.project.config_files"], config);
    assert.equal(item.Config.Labels["com.docker.compose.oneoff"], "False");
    const service = item.Config.Labels["com.docker.compose.service"];
    assert.ok(["api", "worker", "postgres"].includes(service)); assert.ok(!services.has(service)); services.add(service);
  }
}
try {
  const [installed] = JSON.parse(await docker(["image", "inspect", image]));
  assert.equal(installed.Id, image); assert.equal(installed.Architecture, "amd64"); assert.equal(installed.Os, "linux");
  const labels = { "repositoryzero.owner": suffix, "repositoryzero.profile": "native-mcp-local-v1" };
  const idle = { image, pull_policy: "never", entrypoint: ["/bin/sleep"], command: ["600"], labels, volumes: [{ type: "bind", source: data, target: "/var/lib/repositoryzero" }] };
  await writeFile(config, JSON.stringify({ services: {
    postgres: { image, pull_policy: "never", labels, environment: { POSTGRES_USER: user, POSTGRES_PASSWORD: randomBytes(24).toString("hex"), POSTGRES_DB: database }, ports: ["127.0.0.1::5432"] }, api: idle, worker: idle,
  } }), { mode: 0o600 });
  await writeFile(envFile, "", { mode: 0o600 });
  created = true;
  await compose(["up", "--detach", "postgres"]);
  await compose(["create", "api", "worker"]);
  postgres = (await compose(["ps", "--all", "--quiet", "postgres"])).trim();
  await ownsContainers();
  report.stage = "database-ready";
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await sql("SELECT 1"); ready = true; break; } catch { if (active.aborted) throw new Error("DEADLINE"); await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  assert.ok(ready); assert.equal((await sql("SHOW server_version_num")).trim(), "180006");
  const port = (await compose(["port", "postgres", "5432"])).trim().split(":").at(-1);
  assert.match(port, /^\d{1,5}$/u);
  const url = `postgresql://${user}:${JSON.parse(await readFile(config, "utf8")).services.postgres.environment.POSTGRES_PASSWORD}@127.0.0.1:${port}/${database}`;
  const requireDb = createRequire(path.join(platform, "packages/db/package.json"));
  const prismaConfig = pathToFileURL(requireDb.resolve("prisma/config")).href;
  const migrationConfig = path.join(scratch, "prisma.config.mjs");
  await writeFile(migrationConfig, `import {defineConfig} from ${JSON.stringify(prismaConfig)}; export default defineConfig({schema:${JSON.stringify(path.join(platform, "packages/db/prisma/schema.prisma"))},migrations:{path:${JSON.stringify(path.join(platform, "packages/db/prisma/migrations"))}},datasource:{url:process.env.DATABASE_URL}});\n`, { mode: 0o600 });
  report.stage = "canonical-migrations";
  await command(process.execPath, [requireDb.resolve("prisma/build/index.js"), "migrate", "deploy", "--config", migrationConfig], { env: { DATABASE_URL: url, NODE_ENV: "test" } });
  report.migrations = Number((await sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).trim());
  assert.ok(report.migrations >= 103);
  const bytes = Buffer.from("synthetic immutable backup bytes\n");
  const digest = createHash("sha256").update(bytes).digest("hex");
  await mkdir(path.join(data, "artifacts/fixture-space"), { recursive: true, mode: 0o700 });
  const blob = path.join(data, "artifacts/fixture-space/fixture-blob");
  await writeFile(blob, bytes, { mode: 0o600 });
  await sql(`INSERT INTO "user"(id,name,email,"updatedAt") VALUES('fixture-user','Fixture','fixture@fixture.invalid',now()); INSERT INTO organization(id,name,slug,"createdAt") VALUES('fixture-org','Fixture','fixture-${suffix}',now()); INSERT INTO spaces(id,"organizationId",name) VALUES('fixture-space','fixture-org','Fixture'); INSERT INTO artifacts(id,"spaceId","userId",name,"mimeType",size,hash,"storageKey") VALUES('fixture-artifact','fixture-space','fixture-user','fixture.txt','text/plain',${bytes.length},'${digest}','fixture-blob');`);
  const binding = { profile: "native-mcp-local-v1", projectName: project, composeFile: config, envFile, dataDirectory: data, postgresContainerId: postgres, databaseUser: user, databaseName: database };
  report.stage = "running-writer-denial";
  await compose(["start", "api"]);
  await assert.rejects(backupNativeProfile(binding, path.join(scratch, "denied-running"), { signal: active }), /NATIVE_WRITERS_NOT_QUIESCED/);
  await compose(["stop", "--timeout", "2", "api"]); scenario("running-writer-denied");
  report.stage = "backup";
  const backup = path.join(scratch, "snapshot");
  const saved = await backupNativeProfile(binding, backup, { signal: active });
  assert.equal(saved.state, "verified"); assert.equal(saved.artifactRows, 1); report.manifestSha256 = saved.manifestSha256;
  scenario("canonical-database-and-artifact-backup");
  await assert.rejects(backupNativeProfile({ ...binding, projectName: `${project}-foreign` }, path.join(scratch, "denied-project"), { signal: active }), /NATIVE_COMPOSE_OWNERSHIP/);
  scenario("foreign-compose-project-denied");
  await assert.rejects(restoreNativeProfile(binding, backup, saved.manifestSha256, { signal: active }), /NATIVE_RESTORE_TARGET_NOT_EMPTY/);
  scenario("nonempty-data-denied-before-restore");
  // Only this labeled disposable fixture may be reset; original state and snapshot are retained.
  await ownsContainers(); assert.ok(database.startsWith("zero_native_backup_test_"));
  await rename(data, path.join(scratch, "original-data-retained")); await mkdir(data, { mode: 0o700 });
  await sql(`DROP DATABASE "${database}"`, "postgres"); await sql(`CREATE DATABASE "${database}"`, "postgres");
  report.stage = "restore-prevalidation";
  await assert.rejects(restoreNativeProfile({ ...binding, databaseName: `${database}_foreign` }, backup, saved.manifestSha256, { signal: active }), /NATIVE_MANIFEST_SCOPE/);
  assert.equal((await sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'")).trim(), "0"); scenario("foreign-database-scope-denied-before-database-mutation");
  const damaged = path.join(scratch, "damaged-snapshot");
  await cp(backup, damaged, { recursive: true, errorOnExist: true, force: false });
  await writeFile(path.join(damaged, "artifacts/fixture-space/fixture-blob"), "tampered", { mode: 0o600 });
  await assert.rejects(restoreNativeProfile(binding, damaged, saved.manifestSha256, { signal: active }), /NATIVE_ARTIFACT_INTEGRITY/);
  assert.equal((await sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'")).trim(), "0"); scenario("changed-blob-denied-before-database-mutation");
  await assert.rejects(restoreNativeProfile(binding, backup, "0".repeat(64), { signal: active }), /NATIVE_MANIFEST_INTEGRITY/);
  assert.equal((await sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'")).trim(), "0"); scenario("untrusted-manifest-denied-before-database-mutation");
  report.stage = "restore";
  const restored = await restoreNativeProfile(binding, backup, saved.manifestSha256, { signal: active });
  assert.equal(restored.state, "verified"); assert.equal(restored.writers, "stopped");
  assert.ok((await readFile(blob)).equals(bytes));
  assert.equal((await sql("SELECT hash FROM artifacts WHERE id='fixture-artifact'")).trim(), digest);
  assert.equal(Number((await sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).trim()), report.migrations);
  await ownsContainers(); scenario("full-schema-artifact-round-trip");
  report.status = "PASS";
} catch (error) {
  report.status = "FAIL"; report.failureKind = error?.code === "ERR_ASSERTION" ? "assertion" : "runtime";
  // Error text is private: it may contain paths or fixture database credentials.
  await writeFile(path.join(scratch, "failure.txt"), String(error?.stack ?? error), { mode: 0o600 });
  process.exitCode = 1;
} finally {
  if (created) {
    const cleanup = { signal: AbortSignal.timeout(15000) };
    try { await ownsContainers(cleanup, false); await compose(["down", "--volumes", "--remove-orphans"], cleanup); report.containerCleanup = "removed-owned-project"; }
    catch { report.containerCleanup = "unknown"; report.status = "FAIL"; process.exitCode = 1; }
  }
  report.finishedAt = new Date().toISOString();
  report.elapsedMs = Math.round(performance.now() - started);
  await writeFile(path.join(evidence, "qualification.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify(report));
}
