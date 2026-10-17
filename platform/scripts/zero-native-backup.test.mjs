import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, truncate, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, test } from "node:test";
import { backupNativeProfile, nativeBackupMain, NATIVE_BACKUP_PROFILE, restoreNativeProfile } from "./zero-native-backup.mjs";
const roots = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const content = Buffer.from("synthetic immutable artifact\n");
async function fixture() {
  const root = await mkdtemp("/tmp/zero-native-backup-test-"); roots.push(root);
  const data = path.join(root, "data");
  await mkdir(data, { mode: 0o700 });
  await mkdir(path.join(data, "artifacts"), { mode: 0o700 });
  await mkdir(path.join(data, "artifacts/space"), { mode: 0o700 });
  await writeFile(path.join(data, "artifacts/space/blob"), content, { mode: 0o600 });
  await writeFile(path.join(data, "host-token-not-backed-up"), "synthetic private operator marker", { mode: 0o600 });
  const binding = { profile: NATIVE_BACKUP_PROFILE, projectName: "fixture", composeFile: path.join(root, "native-compose.yml"), envFile: path.join(root, "operator.env"), dataDirectory: data, postgresContainerId: "c".repeat(64), databaseUser: "fixture", databaseName: "fixture" };
  const rows = [{ id: "artifact", spaceId: "space", userId: "user", storageKey: "blob", size: content.length, hash: hash(content) }];
  const calls = [];
  const containers = ["api", "worker", "postgres"].map((service, index) => ({
    id: ["a", "b", "c"][index].repeat(64),
    labels: { "com.docker.compose.project": "fixture", "com.docker.compose.project.config_files": binding.composeFile, "com.docker.compose.oneoff": "False", "com.docker.compose.service": service, "repositoryzero.profile": NATIVE_BACKUP_PROFILE },
    state: service === "postgres" ? "running" : "exited",
    mounts: service === "postgres" ? [] : [{ Type: "bind", Source: data, Destination: "/var/lib/repositoryzero", RW: true }],
  }));
  let restored = false;
  let empty = true;
  let changedRows;
  const docker = async (args, options) => {
    calls.push(args);
    assert.equal(options.signal.aborted, false);
    if (args[0] === "compose") return Buffer.from(containers.map((row) => row.id).join("\n"));
    if (args[0] === "inspect") return Buffer.from(containers.map((row) => JSON.stringify(row)).join("\n"));
    if (args.includes("pg_dump")) {
      assert.equal(options.outputLimit, 268435456);
      await writeFile(options.outputPath, "-- synthetic SQL dump\n", { flag: "wx", mode: 0o600 });
      return Buffer.alloc(0);
    }
    if (args.includes("--file=-")) {
      assert.equal((await readFile(options.inputPath, "utf8")), "-- synthetic SQL dump\n");
      restored = true; return Buffer.alloc(0);
    }
    const query = args.at(-1);
    if (query.includes("pg_control_system")) return Buffer.from(JSON.stringify({ database: "fixture", user: "fixture", cluster: "123456789" }));
    if (query.includes("pg_class")) return Buffer.from(empty ? "0\n" : "1\n");
    if (query.includes("FROM artifacts")) return Buffer.from(JSON.stringify(restored && changedRows ? changedRows : rows));
    throw new Error("Unexpected command");
  };
  const output = path.join(root, "snapshot");
  return { root, data, rows, binding, calls, containers, docker, output, setNonempty() { empty = false; }, changeRestoredRows(value) { changedRows = value; }, async emptyData() { await rm(data, { recursive: true }); await mkdir(data, { mode: 0o700 }); }, async backup() { return backupNativeProfile(binding, output, { docker }); } };
}
async function mutateManifest(f, change) {
  const file = path.join(f.output, "manifest.json");
  const manifest = JSON.parse(await readFile(file, "utf8")); change(manifest);
  const bytes = Buffer.from(JSON.stringify(manifest)); await writeFile(file, bytes);
  return hash(bytes);
}
const mutates = (f) => f.calls.some((args) => args.includes("--file=-"));

test("private artifact-only backup and restore bind metadata and keep writers stopped", async () => {
  const f = await fixture();
  const result = await f.backup();
  assert.equal(result.state, "verified");
  assert.deepEqual((await readdir(f.output)).sort(), ["artifacts", "database.sql", "manifest.json"]);
  for (const relative of ["database.sql", "manifest.json", "artifacts/space/blob"]) assert.equal((await lstat(path.join(f.output, relative))).mode & 0o7777, 0o600);
  const manifest = JSON.parse(await readFile(path.join(f.output, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.artifacts, f.rows);
  assert.equal(JSON.stringify(manifest).includes(f.root), false);
  assert.equal(JSON.stringify(manifest).includes("synthetic private operator marker"), false);
  await f.emptyData();
  const recovered = await restoreNativeProfile(f.binding, f.output, result.manifestSha256, { docker: f.docker });
  assert.equal(recovered.state, "verified");
  assert.equal(recovered.writers, "stopped");
  assert.deepEqual(await readFile(path.join(f.data, "artifacts/space/blob")), content);
  assert.equal(f.calls.some((args) => args.some((arg) => ["up", "start", "stop", "down", "rm"].includes(arg))), false);
});
for (const cut of ["running-api", "foreign-project", "foreign-profile", "wrong-compose", "wrong-bind", "wrong-postgres", "extra-service"]) test(`refuses ${cut} before database export`, async () => {
  const f = await fixture();
  if (cut === "running-api") f.containers[0].state = "running";
  if (cut === "foreign-project") f.containers[0].labels["com.docker.compose.project"] = "foreign";
  if (cut === "foreign-profile") f.containers[0].labels["repositoryzero.profile"] = "other";
  if (cut === "wrong-compose") f.containers[0].labels["com.docker.compose.project.config_files"] = "/foreign/compose.yml";
  if (cut === "wrong-bind") f.containers[1].mounts[0].Source = "/foreign/data";
  if (cut === "wrong-postgres") f.binding.postgresContainerId = "d".repeat(64);
  if (cut === "extra-service") f.containers.push({ ...f.containers[0], id: "d".repeat(64) });
  await assert.rejects(f.backup());
  assert.equal(f.calls.some((args) => args.includes("pg_dump")), false);
});
for (const cut of ["missing", "changed", "symlink", "hardlink", "public-mode", "linked-parent"]) test(`backup rejects ${cut} blob`, async () => {
  const f = await fixture(); const file = path.join(f.data, "artifacts/space/blob");
  if (cut === "missing") await rm(file);
  if (cut === "changed") await writeFile(file, "changed");
  if (cut === "symlink") { await rm(file); await symlink(path.join(f.data, "host-token-not-backed-up"), file); }
  if (cut === "hardlink") await link(file, path.join(f.root, "second-name"));
  if (cut === "public-mode") await chmod(file, 0o644);
  if (cut === "linked-parent") { await rm(path.join(f.data, "artifacts/space"), { recursive: true }); await symlink(f.root, path.join(f.data, "artifacts/space")); }
  await assert.rejects(f.backup());
  await assert.rejects(lstat(f.output), { code: "ENOENT" });
});
for (const cut of ["missing", "changed", "extra", "link", "scope", "path", "sql", "untrusted-digest", "nonempty-data", "nonempty-db"]) test(`restore prevalidation rejects ${cut} before SQL mutation`, async () => {
  const f = await fixture(); const backup = await f.backup(); await f.emptyData();
  let digest = backup.manifestSha256;
  const file = path.join(f.output, "artifacts/space/blob");
  if (cut === "missing") await rm(file);
  if (cut === "changed") await writeFile(file, "changed");
  if (cut === "extra") await writeFile(path.join(f.output, "operator.env"), "not allowed", { mode: 0o600 });
  if (cut === "link") { await rm(file); await symlink("/etc/passwd", file); }
  if (cut === "scope") digest = await mutateManifest(f, (manifest) => { manifest.scope.projectName = "foreign"; });
  if (cut === "path") digest = await mutateManifest(f, (manifest) => { manifest.artifacts[0].spaceId = "../foreign"; });
  if (cut === "sql") await writeFile(path.join(f.output, "database.sql"), "changed SQL");
  if (cut === "untrusted-digest") digest = "0".repeat(64);
  if (cut === "nonempty-data") await writeFile(path.join(f.data, "existing"), "keep", { mode: 0o600 });
  if (cut === "nonempty-db") f.setNonempty();
  await assert.rejects(restoreNativeProfile(f.binding, f.output, digest, { docker: f.docker }));
  assert.equal(mutates(f), false);
});
test("restored foreign-scope metadata cannot publish data or start writers", async () => {
  const f = await fixture(); const backup = await f.backup(); await f.emptyData();
  f.changeRestoredRows([{ ...f.rows[0], userId: "foreign" }]);
  await assert.rejects(restoreNativeProfile(f.binding, f.output, backup.manifestSha256, { docker: f.docker }), /NATIVE_RESTORE_METADATA/);
  assert.equal(mutates(f), true);
  assert.deepEqual(await readdir(f.data), []);
});
test("changed metadata while backing up blocks publication", async () => {
  const f = await fixture(); let reads = 0;
  const docker = async (args, options) => {
    if (args.at(-1).includes("FROM artifacts") && ++reads === 2) return Buffer.from(JSON.stringify([{ ...f.rows[0], userId: "changed" }]));
    return f.docker(args, options);
  };
  await assert.rejects(backupNativeProfile(f.binding, f.output, { docker }), /NATIVE_SNAPSHOT_CHANGED/);
  await assert.rejects(lstat(f.output), { code: "ENOENT" });
});
test("existing backup is never overwritten or removed", async () => {
  const f = await fixture(); const backup = await f.backup();
  await assert.rejects(f.backup(), /NATIVE_TARGET_EXISTS/);
  assert.equal(hash(await readFile(path.join(f.output, "manifest.json"))), backup.manifestSha256);
});
test("row and aggregate artifact limits fail before pg_dump", async () => {
  for (const cut of ["count", "bytes"]) {
    const f = await fixture();
    if (cut === "count") f.rows.push(...Array.from({ length: 512 }, (_, index) => ({ ...f.rows[0], id: `row-${index}` })));
    else f.rows[0].size = 67108865;
    await assert.rejects(f.backup(), /NATIVE_BACKUP_LIMIT/);
    assert.equal(f.calls.some((args) => args.includes("pg_dump")), false);
  }
});
test("no default CLI action or untrusted configuration path can start Docker", async () => {
  for (const args of [[], ["backup"], ["restore", "/private/config", "/private/backup"], ["help"]]) await assert.rejects(nativeBackupMain(args), /NATIVE_EXPLICIT_ARGUMENTS_REQUIRED/);
  const f = await fixture(); const config = path.join(f.root, "config.json");
  await writeFile(config, JSON.stringify(f.binding), { mode: 0o644 });
  await assert.rejects(nativeBackupMain(["backup", config, f.output]));
  await chmod(config, 0o600); await mkdir(path.join(f.root, ".git"));
  await assert.rejects(nativeBackupMain(["backup", config, f.output]));
});

test("oversized dump and empty successful stdout cannot become verified backups", async () => {
  for (const size of [0, 268435457]) {
    const f = await fixture();
    const docker = async (args, options) => {
      if (args.includes("pg_dump")) {
        await writeFile(options.outputPath, "", { flag: "wx", mode: 0o600 });
        await truncate(options.outputPath, size); return Buffer.alloc(0);
      }
      return f.docker(args, options);
    };
    await assert.rejects(backupNativeProfile(f.binding, f.output, { docker }));
    await assert.rejects(lstat(f.output), { code: "ENOENT" });
  }
});
test("pre-cancelled operations cannot invoke Docker or change database/files", async () => {
  const f = await fixture();
  await assert.rejects(backupNativeProfile(f.binding, f.output, { signal: AbortSignal.abort(), docker: f.docker }), /NATIVE_BACKUP_TIMEOUT/);
  await assert.rejects(restoreNativeProfile(f.binding, f.output, "0".repeat(64), { signal: AbortSignal.abort(), docker: f.docker }), /NATIVE_BACKUP_TIMEOUT/);
  assert.deepEqual(f.calls, []);
});