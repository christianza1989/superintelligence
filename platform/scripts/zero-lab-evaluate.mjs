/** Explicitly authorized controlled local artifacts only; not hostile-code isolation. */
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmod, copyFile, lstat, mkdir, mkdtemp, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { STOCKDESK_PROBE_CODE } from './zero-stockdesk-contract.mjs';

export const SPRINTDESK_IMAGE = "node@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f";
export const SPRINTDESK_PROFILE = Object.freeze({
  id: "sprintdesk-node24-prebuilt-linux-x64-v2",
  image: SPRINTDESK_IMAGE,
  nodeVersion: "24",
  platform: "linux",
  arch: "x64",
  dependencyMode: "prebuilt_no_declared_external_npm_dependencies_no_install",
  startCommand: "npm --ignore-scripts start",
  network: "none",
  dataLimitBytes: 67108864,
  persistenceBoundary: "application_container_restart_not_daemon_or_host_restart",
  sqliteRecordProbe: "task_id_and_title_in_one_regular_table_row_including_json_cells_max32tables_512rows",
  sqliteProbeMode: "bounded_writable_db_wal_journal_copy_original_volume_readonly",
  sqliteProbeLimitBytes: 67108864,
  uiImplemented: false,
});
const root = fileURLToPath(new URL("../../", import.meta.url));
const acceptancePath = path.join(root, "benchmarks/sprintdesk-v1/acceptance.mjs");
const execFileAsync = promisify(execFile);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const maxSourceBytes = 16 * 1024 * 1024;
const port = 38641;

class EvaluationError extends Error {
  constructor(code, status = "failed") { super(code); this.code = code; this.status = status; }
}

async function dockerCommand(args, options) {
  try {
    const result = await execFileAsync("docker", args, {
      env: options.env, cwd: options.cwd, timeout: options.timeoutMs,
      signal: options.signal, killSignal: "SIGKILL", maxBuffer: 256 * 1024,
      encoding: "utf8", windowsHide: true,
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (error) {
    // Candidate logs and tool errors are untrusted and may contain sensitive text.
    return { stdout: args.includes("/grader/acceptance.mjs") && args.includes("--test") && typeof error.stdout === "string" ? error.stdout : "", stderr: "", exitCode: -1, interrupted: options.signal?.aborted === true };
  }
}

/** Snapshot source as data. No candidate modules, lifecycle hooks or installs run on the host. */
export async function snapshotSprintDesk(candidatePath, target) {
  if (typeof candidatePath !== "string" || !path.isAbsolute(candidatePath))
    throw new EvaluationError("candidate_path_must_be_absolute", "unsupported");
  const sourceInfo = await lstat(candidatePath);
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink())
    throw new EvaluationError("candidate_must_be_regular_directory", "unsupported");
  const files = [];
  let bytes = 0, entries = 0;
  const walk = async (directory, relative = "", depth = 0) => {
    if (depth > 8) throw new EvaluationError("candidate_source_depth_exceeded", "unsupported");
    for (const name of (await readdir(directory)).sort()) {
      if (++entries > 1024) throw new EvaluationError("candidate_entry_bound_exceeded", "unsupported");
      if ([".git", "node_modules", ".artifacts"].includes(name)) continue;
      if (/^(\.env(?:\..*)?|\.npmrc|\.yarnrc(?:\.yml)?|auth\.json|credentials\.json|id_rsa|id_ed25519)$/i.test(name))
        throw new EvaluationError("candidate_contains_private_configuration", "unsupported");
      const source = path.join(directory, name);
      const relativeName = path.join(relative, name);
      const info = await lstat(source);
      if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()))
        throw new EvaluationError("candidate_contains_link_or_special_file", "unsupported");
      if (info.isDirectory()) { await walk(source, relativeName, depth + 1); continue; }
      bytes += info.size;
      if (bytes > maxSourceBytes || files.length >= 512)
        throw new EvaluationError("candidate_source_bound_exceeded", "unsupported");
      const handle = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
      let body;
      try {
        const current = await handle.stat();
        if (!current.isFile() || current.size !== info.size)
          throw new EvaluationError("candidate_changed_during_snapshot", "unsupported");
        const buffer = Buffer.alloc(info.size + 1);
        let length = 0;
        while (length < buffer.length) {
          const part = await handle.read(buffer, length, buffer.length - length, length);
          if (!part.bytesRead) break;
          length += part.bytesRead;
        }
        body = buffer.subarray(0, length);
      } finally { await handle.close(); }
      // Read length is checked again in case the caller has not quiesced its workspace.
      if (body.length !== info.size || bytes - info.size + body.length > maxSourceBytes)
        throw new EvaluationError("candidate_changed_during_snapshot", "unsupported");
      const destination = path.join(target, relativeName);
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o755 });
      await writeFile(destination, body, { mode: 0o644 });
      files.push({ path: relativeName.split(path.sep).join("/"), bytes: body.length, sha256: sha256(body) });
    }
  };
  await walk(candidatePath);
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(target, "package.json"), "utf8")); }
  catch { throw new EvaluationError("candidate_package_manifest_missing_or_invalid", "unsupported"); }
  if (typeof manifest?.scripts?.start !== "string" || !manifest.scripts.start.trim() || manifest.scripts.start.length > 512)
    throw new EvaluationError("candidate_npm_start_missing", "unsupported");
  for (const key of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    if (manifest[key] !== undefined && (typeof manifest[key] !== "object" || manifest[key] === null || Array.isArray(manifest[key]) || Object.keys(manifest[key]).length))
      throw new EvaluationError("external_dependencies_need_separate_offline_build_profile", "unsupported");
  }
  return { sourceDigest: sha256(JSON.stringify(files)), sourceFiles: files.length, sourceBytes: bytes };
}

export function parseSprintDeskAcceptance(tap, expectedTests = 8) {
  if (typeof tap !== "string") return null;
  const count = (field) => {
    const found = [...tap.matchAll(new RegExp(`^# ${field} (\\d+)$`, "gm"))];
    return found.length === 1 ? Number(found[0][1]) : null;
  };
  const tests = count("tests"), passed = count("pass"), failed = count("fail");
  // Seven independent subtests plus their parent test, with no skipped cases.
  if (tests !== expectedTests || passed !== expectedTests || failed !== 0 || count("cancelled") !== 0 || count("skipped") !== 0)
    return null;
  return { status: "passed", tests, passed, failed, subtests: expectedTests - 1, outputSha256: sha256(tap) };
}

const probeCode = `
const assert = require('node:assert/strict');
const origin = 'http://127.0.0.1:${port}';
async function req(route, options) {
  const r = await fetch(origin + route, { ...options, redirect: 'error', signal: AbortSignal.timeout(1500) });
  const text = await r.text(); if (text.length > 65536) throw Error('response_bound');
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
async function ready() {
  const end = Date.now() + 10000;
  do { try { const r = await req('/api/health'); if (r.status === 200 && r.body?.ok === true) return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  } while (Date.now() < end); throw Error('health_deadline');
}
(async () => {
  await ready();
  const stage = process.argv[1], marker = process.argv[2];
  if (stage === 'seed') {
    const expected = { title: marker, description: 'Restart persistence control', status: 'doing', priority: 'high', dueDate: '2028-02-29' };
    const r = await req('/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(expected) });
    assert.equal(r.status, 201); assert.equal(typeof r.body.id, 'string');
    for (const [k,v] of Object.entries(expected)) assert.equal(r.body[k], v);
    process.stdout.write(JSON.stringify({ id: r.body.id, ...expected }));
  } else if (stage === 'verify') {
    const expected = JSON.parse(process.argv[3]);
    const r = await req('/api/tasks?q=' + encodeURIComponent(marker)); assert.equal(r.status, 200);
    const actual = r.body.tasks.find(t => t.id === expected.id); assert.ok(actual);
    for (const [k,v] of Object.entries(expected)) assert.equal(actual[k], v);
    const exported = await req('/api/export'); assert.equal(exported.status, 200);
    assert.ok(exported.body.tasks.some(t => t.id === expected.id));
    process.stdout.write(JSON.stringify({ preserved: true }));
  } else throw Error('unsupported_probe');
})().catch(() => { process.exitCode = 1; });
`;
const sqliteCode = `
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const name = '/data/sprintdesk.sqlite';
const info = fs.lstatSync(name); assert.ok(info.isFile() && !info.isSymbolicLink());
const fd = fs.openSync(name, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
const header = Buffer.alloc(16); fs.readSync(fd, header, 0, 16, 0); fs.closeSync(fd);
assert.equal(header.toString(), 'SQLite format 3\\u0000');
// A read-only WAL database can require recovery or a new shared-memory index.
// Recover only a bounded private copy, preserving the original read-only volume.
let copied = 0;
for (const suffix of ['', '-wal', '-journal']) {
  let entry;
  try { entry = fs.lstatSync(name + suffix); } catch (error) { if (suffix && error.code === 'ENOENT') continue; throw error; }
  assert.ok(entry.isFile() && !entry.isSymbolicLink());
  copied += entry.size; assert.ok(copied <= 67108864);
  const input = fs.openSync(name + suffix, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    assert.equal(fs.fstatSync(input).size, entry.size);
    const body = fs.readFileSync(input); assert.equal(body.length, entry.size);
    fs.writeFileSync('/sqlite-probe/sprintdesk.sqlite' + suffix, body, { flag: 'wx', mode: 0o600 });
  } finally { fs.closeSync(input); }
}
const db = new DatabaseSync('/sqlite-probe/sprintdesk.sqlite');
assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
const expected = JSON.parse(process.argv[1]);
const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 33").all();
assert.ok(tables.length <= 32);
let scanned = 0, stored = false;
const groups = expected.requiredRows ?? [[expected.id,expected.title]];
const found = groups.map(() => false);
function strings(value, out, depth = 0) {
  if (depth > 8 || out.size > 256) return;
  if (typeof value === 'string') {
    out.add(value);
    if (value.length <= 32768 && (value.startsWith('{') || value.startsWith('['))) {
      try { strings(JSON.parse(value), out, depth + 1); } catch {}
    }
  } else if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    for (const item of Object.values(value).slice(0, 128)) strings(item, out, depth + 1);
  }
}
for (const table of tables) {
  const quoted = '"' + table.name.replaceAll('"', '""') + '"';
  const rows = db.prepare('SELECT * FROM ' + quoted + ' LIMIT 513').all();
  scanned += rows.length; assert.ok(scanned <= 512);
  for (const row of rows) {
    const values = new Set(); strings(row, values);
    groups.forEach((group,index) => { if (group.every(value => values.has(value))) found[index] = true; });
    stored = found.every(Boolean); if (stored) break;
  }
  if (stored) break;
}
assert.ok(stored, 'created task must actually be present in SQLite'); db.close();
process.stdout.write(JSON.stringify({ sqliteHeader: true, quickCheck: 'ok', sqliteTaskStored: true, sqliteProbeCopy: true }));
`;

/** No model dispatch. Caller must explicitly authorize this controlled local code profile. */
export async function evaluateSprintDesk(options, deps = {}) {
  if (options?.suite !== undefined && !["sprintdesk-v1", "stockdesk-v1"].includes(options.suite)) throw new Error("Unsupported evaluator suite.");
  const stockdesk = options?.suite === "stockdesk-v1";
  const selectedAcceptance = stockdesk ? path.join(root, "benchmarks/stockdesk-v1/acceptance.mjs") : acceptancePath;
  const selectedProbe = stockdesk ? STOCKDESK_PROBE_CODE : probeCode;
  const report = {
    version: 1, suite: stockdesk ? "stockdesk-v1" : "sprintdesk-v1", status: "error", functionalStatus: "not_run",
    qualityComplete: false, trustProfile: options?.trustProfile ?? null,
    api: { status: "not_run" }, persistence: { status: "not_run" },
    ui: { status: "not_run", reason: "desktop_mobile_keyboard_browser_profile_not_implemented" },
    image: SPRINTDESK_IMAGE, profile: stockdesk ? { ...SPRINTDESK_PROFILE, id: "stockdesk-node24-prebuilt-linux-x64-v1", sqliteRecordProbe: "product_and_each_seed_movement_real_rows" } : SPRINTDESK_PROFILE, paidModelCalls: 0, cleanup: "not_needed",
    limitations: [
      "Linux x64, prebuilt Node24 builtins-only artifacts; no dependency installation",
      "Explicit controlled local code grant, not a human audit claim or hostile upstream PR sandbox",
      "API and persistence success does not establish full UI or benchmark quality",
      "Bounded tmpfs verifies SQLite across app restart, not disk durability across host or Docker daemon restart",
    ],
  };
  let scratch;
  const owned = new Set();
  let ownedVolume;
  const started = performance.now();
  const runDocker = deps.runDocker ?? dockerCommand;
  const timeoutMs = options?.timeoutMs ?? 120_000;
  let dockerEnv;
  const call = async (args, limit = 30_000, cleanup = false, captureFailure = false) => {
    if (!cleanup && options?.signal?.aborted) throw new EvaluationError("evaluation_cancelled", "cancelled");
    const remaining = timeoutMs - (performance.now() - started);
    if (!cleanup && remaining <= 0) throw new EvaluationError("evaluation_deadline", "failed");
    const result = await runDocker(args, {
      env: dockerEnv, cwd: scratch, timeoutMs: cleanup ? 5_000 : Math.max(1, Math.min(limit, remaining)),
      signal: cleanup ? undefined : options?.signal,
    });
    if (captureFailure) return result;
    if (result.exitCode !== 0) {
      if (options?.signal?.aborted && !cleanup) throw new EvaluationError("evaluation_cancelled", "cancelled");
      throw new EvaluationError(cleanup ? "owned_container_cleanup_failed" : "docker_stage_failed");
    }
    return result.stdout;
  };
  try {
    if (!options || !["controlled_synthetic", "controlled_local_candidate"].includes(options.trustProfile))
      throw new EvaluationError("explicit_controlled_trust_profile_required", "unsupported");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10_000 || timeoutMs > 180_000)
      throw new EvaluationError("invalid_evaluation_deadline", "unsupported");
    if (process.platform !== "linux" || process.arch !== "x64")
      throw new EvaluationError("linux_x64_only", "unsupported");
    if (options.signal?.aborted) throw new EvaluationError("evaluation_cancelled", "cancelled");
    scratch = await mkdtemp(path.join(tmpdir(), "repositoryzero-lab-eval-"));
    const input = path.join(scratch, "input"), grader = path.join(scratch, "grader");
    for (const directory of [input, grader, path.join(scratch, "docker-config")])
      await mkdir(directory, { mode: 0o755 });
    Object.assign(report, await snapshotSprintDesk(options.candidatePath, input));
    await copyFile(selectedAcceptance, path.join(grader, "acceptance.mjs"));
    await chmod(path.join(grader, "acceptance.mjs"), 0o444);
    report.acceptanceDigest = sha256(await readFile(path.join(grader, "acceptance.mjs")));
    if (stockdesk) {
      await copyFile(path.join(root,"benchmarks/stockdesk-v1/csv-export.mjs"),path.join(grader,"csv-export.mjs"));
      report.acceptanceSupportDigest=sha256(await readFile(path.join(grader,"csv-export.mjs")));
      report.acceptanceDigest=sha256(JSON.stringify([report.acceptanceDigest,report.acceptanceSupportDigest]));
    }
    dockerEnv = {
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      HOME: scratch, DOCKER_CONFIG: path.join(scratch, "docker-config"),
      DOCKER_HOST: "unix:///var/run/docker.sock",
    };
    try { await call(["image", "inspect", SPRINTDESK_IMAGE], 10_000); }
    catch (error) {
      if (error.status === "cancelled") throw error;
      throw new EvaluationError("pinned_image_unavailable_no_automatic_pull", "unsupported");
    }
    const id = randomBytes(8).toString("hex");
    const app = `repositoryzero-lab-${id}`;
    ownedVolume = `${app}-data`;
    const volumeOptions = "size=67108864,uid=1000,gid=1000,mode=0700";
    await call(["volume", "create", "--driver", "local", "--opt", "type=tmpfs", "--opt", "device=tmpfs", "--opt", `o=${volumeOptions}`, ownedVolume]);
    const volume = JSON.parse(await call(["volume", "inspect", ownedVolume]))[0];
    if (volume.Driver !== "local" || volume.Options?.type !== "tmpfs" || volume.Options?.device !== "tmpfs" || volume.Options?.o !== volumeOptions)
      throw new EvaluationError("data_volume_profile_mismatch", "error");
    const restrictions = [
      "--user", "1000:1000", "--read-only", "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges=true", "--pids-limit", "128",
      "--memory", "256m", "--cpus", "1", "--log-driver", "none",
      "--tmpfs", "/tmp:rw,nosuid,nodev,size=32m,mode=1777",
    ];
    // The anchor keeps the bounded tmpfs volume mounted across a cold app restart.
    // No host directory, socket or credential store is writable from any container.
    const anchor = `${app}-anchor`, anchorRestrictions = [...restrictions];
    anchorRestrictions[anchorRestrictions.indexOf("--memory") + 1] = "64m";
    owned.add(anchor);
    await call([
      "create", "--name", anchor, ...anchorRestrictions, "--network", "none",
      "--mount", `type=volume,source=${ownedVolume},target=/data,volume-nocopy`,
      "--entrypoint", "node", SPRINTDESK_IMAGE, "-e", "setInterval(() => {}, 1000)",
    ]);
    await call(["start", anchor]);
    owned.add(app); // A timed-out create may still have created this invocation's name.
    await call([
      "create", "--name", app, ...restrictions, "--network", "none",
      "--mount", `type=bind,source=${input},target=/candidate,readonly`,
      "--mount", `type=volume,source=${ownedVolume},target=/data,volume-nocopy`,
      "--workdir", "/candidate", "--env", `PORT=${port}`, "--env", "DB_PATH=/data/sprintdesk.sqlite",
      "--env", "HOME=/tmp", "--env", "NODE_ENV=production", "--env", "npm_config_cache=/tmp/npm-cache",
      "--entrypoint", "npm", SPRINTDESK_IMAGE, "--ignore-scripts", "start",
    ]);
    const settings = JSON.parse(await call(["inspect", app]))[0];
    const hosts = settings.HostConfig;
    const binds = settings.Mounts.filter((mount) => mount.Type === "bind");
    if (hosts.NetworkMode !== "none" || !hosts.ReadonlyRootfs || hosts.Privileged ||
      settings.Config.User !== "1000:1000" || !hosts.CapDrop?.includes("ALL") ||
      !hosts.SecurityOpt?.includes("no-new-privileges=true") || hosts.PidsLimit !== 128 ||
      hosts.Memory !== 268435456 || hosts.NanoCpus !== 1_000_000_000 || binds.length !== 1 ||
      !binds.some((mount) => mount.Destination === "/candidate" && !mount.RW) ||
      !settings.Mounts.some((mount) => mount.Type === "volume" && mount.Name === ownedVolume && mount.Destination === "/data" && mount.RW) ||
      binds.some((mount) => mount.RW))
      throw new EvaluationError("isolation_profile_mismatch", "error");
    report.isolation = {
      network: "none", user: "1000:1000", readOnlySource: true, readOnlyRoot: true,
      writableData: "invocation_owned_tmpfs_volume", dataLimitBytes: 67108864,
      anchorKeepsDataMountedAcrossRestart: true, memoryBytes: hosts.Memory,
      pids: hosts.PidsLimit, nanoCpus: hosts.NanoCpus, graderSeparateContainer: true,
      inheritedSecretEnvironment: false, hostSocketMountedInContainer: false,
    };
    await call(["start", app]);
    let sequence = 0;
    const grade = async (nodeArgs, { database = false, limit = 30_000, captureFailure = false } = {}) => {
      const name = `${app}-grade-${++sequence}`;
      owned.add(name);
      const out = await call([
        "run", "--name", name, ...restrictions,
        "--network", database ? "none" : `container:${app}`,
        "--mount", `type=bind,source=${grader},target=/grader,readonly`,
        ...(database ? ["--mount", `type=volume,source=${ownedVolume},target=/data,readonly,volume-nocopy`] : []),
        ...(database ? ["--tmpfs", "/sqlite-probe:rw,nosuid,nodev,size=68m,uid=1000,gid=1000,mode=0700"] : []),
        "--env", `BENCHMARK_ORIGIN=http://127.0.0.1:${port}`, "--env", "HOME=/tmp",
        "--entrypoint", "node", SPRINTDESK_IMAGE, ...nodeArgs,
      ], limit, false, captureFailure);
      return out;
    };
    const marker = `restart-${id}`;
    let expected;
    try {
      expected = JSON.parse(await grade(["-e", selectedProbe, "seed", marker]));
      if (typeof expected?.id !== "string" || expected.id.length > 256 || expected.title !== marker)
        throw new Error("invalid_seed_result");
    } catch (error) {
      if (error.status === "cancelled") throw error;
      throw new EvaluationError("startup_or_persistence_seed_failed");
    }
    try {
      const graded = await grade(["--test", "--test-reporter=tap", "/grader/acceptance.mjs"], { limit: 60_000, captureFailure: stockdesk });
      const tap = stockdesk ? graded.stdout : graded;
      if (stockdesk) {
        const trustedNames = [...(await readFile(selectedAcceptance,"utf8")).matchAll(/t\.test\('([^']+)'/g)].map(m=>m[1]);
        const count = field => { const m = new RegExp("^# " + field + " (\\d+)$", "m").exec(tap); return m ? Number(m[1]) : null; };
        report.api = { status: "failed", tests: count("tests"), passed: count("pass"), failed: count("fail"), failedCases: [...tap.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map(m=>m[1]).filter(name=>trustedNames.includes(name)), outputSha256: sha256(tap) };
        if(options.artifactDirectory) {
          if (!path.isAbsolute(options.artifactDirectory)) throw new EvaluationError("invalid_artifact_directory", "error");
          await mkdir(options.artifactDirectory,{recursive:true,mode:0o700});
          const info = await lstat(options.artifactDirectory); if(!info.isDirectory()||info.isSymbolicLink()) throw new EvaluationError("invalid_artifact_directory", "error");
          await writeFile(path.join(options.artifactDirectory,"api.tap.txt"),tap,{flag:"wx",mode:0o600});
        }
        if(graded.exitCode !== 0) throw new Error("failed_acceptance");
      }
      const api = parseSprintDeskAcceptance(tap, stockdesk ? 13 : 8);
      if (!api) throw new Error("incomplete_acceptance");
      report.api = api;
    } catch (error) {
      if (report.api.status !== "failed") report.api = { status: "failed" };
      if (error.status === "cancelled") throw error;
      throw new EvaluationError("independent_api_acceptance_failed");
    }
    try {
      await call(["restart", "--time", "2", app], 15_000);
      const preserved = JSON.parse(await grade(["-e", selectedProbe, "verify", marker, JSON.stringify(expected)]));
      if (preserved.preserved !== true) throw new Error("missing_persistence");
      await call(["stop", "--time", "2", app], 10_000);
      const integrity = JSON.parse(await grade(["-e", sqliteCode, JSON.stringify(expected)], { database: true }));
      if (integrity.sqliteHeader !== true || integrity.quickCheck !== "ok" || integrity.sqliteTaskStored !== true || integrity.sqliteProbeCopy !== true)
        throw new Error("invalid_sqlite_or_missing_task");
      report.persistence = { status: "passed", coldContainerRestart: true, fieldsPreserved: true, sqliteHeader: true, quickCheck: "ok", sqliteTaskStored: true, sqliteProbeCopy: true };
    } catch (error) {
      report.persistence = { status: "failed" };
      if (error.status === "cancelled") throw error;
      throw new EvaluationError("restart_or_sqlite_persistence_failed");
    }
    report.functionalStatus = "passed";
    report.status = "partial";
  } catch (error) {
    report.status = error instanceof EvaluationError ? error.status : "error";
    report.reason = error instanceof EvaluationError ? error.code : "evaluation_failed_without_exposing_tool_output";
    if (report.status === "failed") report.functionalStatus = "failed";
  } finally {
    let cleanupFailed = false;
    for (const name of [...owned].reverse()) {
      try { await call(["rm", "--force", name], 5_000, true); }
      catch { cleanupFailed = true; }
    }
    if (ownedVolume) {
      try { await call(["volume", "rm", ownedVolume], 5_000, true); }
      catch { cleanupFailed = true; }
    }
    if (scratch && !cleanupFailed) {
      try { await rm(scratch, { recursive: true, force: true }); }
      catch { cleanupFailed = true; }
    }
    report.cleanup = cleanupFailed ? "failed_owned_resources_retained_for_operator" : scratch ? "passed" : "not_needed";
    if (cleanupFailed) { report.status = "error"; report.reason = "owned_resource_cleanup_failed"; }
    report.elapsedMs = Math.round(performance.now() - started);
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== "--candidate" || args[2] !== "--trusted-synthetic") {
    console.error("Usage: node zero-lab-evaluate.mjs --candidate /absolute/controlled-fixture --trusted-synthetic");
    process.exitCode = 2;
  } else {
    const result = await evaluateSprintDesk({ candidatePath: args[1], trustProfile: "controlled_synthetic" });
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "partial") process.exitCode = 1;
  }
}
