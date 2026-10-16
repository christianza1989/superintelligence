import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateSprintDesk, parseSprintDeskAcceptance, snapshotSprintDesk, SPRINTDESK_IMAGE } from "./zero-lab-evaluate.mjs";

const fixture = fileURLToPath(new URL("../packages/testkit/fixtures/zero-lab/sprintdesk", import.meta.url));
const tap = "TAP version 13\n# tests 8\n# suites 0\n# pass 8\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n";
async function temporary(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "zero-evaluator-unit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, "source"), target = path.join(directory, "target");
  await cp(fixture, source, { recursive: true });
  await mkdir(target);
  return { source, target, directory };
}
function fakeDocker({ failApi = false, failRestart = false, failSqlite = false, badIsolation = false, failCleanup = false } = {}) {
  const calls = [];
  let seed, scratch;
  return {
    calls,
    async runDocker(args, options) {
      calls.push({ args, options }); scratch = options.cwd;
      const ok = stdout => ({ stdout: stdout ?? "", exitCode: 0 });
      if (args[0] === "volume" && args[1] === "inspect") return ok(JSON.stringify([{
        Driver: "local", Options: { type: "tmpfs", device: "tmpfs", o: "size=67108864,uid=1000,gid=1000,mode=0700" },
      }]));
      if (args[0] === "inspect") return ok(JSON.stringify([{
        Config: { User: "1000:1000" },
        HostConfig: { NetworkMode: badIsolation ? "bridge" : "none", ReadonlyRootfs: true, Privileged: false,
          CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges=true"], PidsLimit: 128, Memory: 268435456, NanoCpus: 1e9 },
        Mounts: [{ Type: "bind", Destination: "/candidate", RW: false }, { Type: "volume", Name: `${args[1]}-data`, Destination: "/data", RW: true }],
      }]));
      if (args[0] === "run") {
        if (args.includes("--test")) return failApi ? { stdout: "untrusted secret log", exitCode: 1 } : ok(tap);
        if (args.includes("seed")) {
          const index = args.indexOf("seed");
          seed = { id: "synthetic-task", title: args[index + 1], description: "Restart persistence control", status: "doing", priority: "high", dueDate: "2028-02-29" };
          return ok(JSON.stringify(seed));
        }
        if (args.includes("verify")) {
          assert.ok(calls.some(c => c.args[0] === "restart"), "must actually restart before verifying");
          assert.deepEqual(JSON.parse(args.at(-1)), seed);
          return ok('{"preserved":true}');
        }
        return failSqlite ? { exitCode: 1 } : ok('{"sqliteHeader":true,"quickCheck":"ok","sqliteTaskStored":true,"sqliteProbeCopy":true}');
      }
      if (args[0] === "restart" && failRestart) return { exitCode: 1 };
      if (args[0] === "rm" && failCleanup) return { exitCode: 1 };
      return ok();
    },
    get scratch() { return scratch; },
  };
}

test("requires an explicit controlled trust profile before Docker access", async () => {
  let accessed = false;
  const result = await evaluateSprintDesk({ candidatePath: fixture }, { runDocker: async () => { accessed = true; } });
  assert.equal(result.status, "unsupported"); assert.equal(accessed, false);
  assert.equal(result.reason, "explicit_controlled_trust_profile_required");
});
test("rejects a relative source path and declared dependencies without running installs", async t => {
  const { source, target } = await temporary(t);
  await assert.rejects(snapshotSprintDesk("relative", target), /candidate_path_must_be_absolute/);
  const manifest = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
  manifest.dependencies = { imaginary: "1.0.0" };
  await writeFile(path.join(source, "package.json"), JSON.stringify(manifest));
  await assert.rejects(snapshotSprintDesk(source, target), /external_dependencies_need_separate_offline_build_profile/);
});
test("rejects source links and private config rather than exposing them to the candidate", async t => {
  const { source, target } = await temporary(t);
  await symlink("server.mjs", path.join(source, "linked.mjs"));
  await assert.rejects(snapshotSprintDesk(source, target), /candidate_contains_link_or_special_file/);
  await rm(path.join(source, "linked.mjs"));
  await writeFile(path.join(source, ".env.local"), "SYNTHETIC_KEY=never-export");
  await assert.rejects(snapshotSprintDesk(source, target), /candidate_contains_private_configuration/);
});
test("snapshots source with stable content digests and ignores git metadata", async t => {
  const { source, target, directory } = await temporary(t);
  await mkdir(path.join(source, ".git"));
  await writeFile(path.join(source, ".git/config"), "not copied");
  const first = await snapshotSprintDesk(source, target);
  const other = path.join(directory, "other"); await mkdir(other);
  const second = await snapshotSprintDesk(source, other);
  assert.deepEqual(first, second); assert.equal(first.sourceFiles, 4);
  await assert.rejects(lstat(path.join(target, ".git")), { code: "ENOENT" });
  await writeFile(path.join(source, "server.mjs"), "changed");
  const third = await snapshotSprintDesk(source, other);
  assert.notEqual(first.sourceDigest, third.sourceDigest);
});
test("requires complete unchanged API counts including no skips", () => {
  assert.equal(parseSprintDeskAcceptance(tap)?.subtests, 7);
  for (const modified of [tap.replace("# pass 8", "# pass 7"), tap.replace("# skipped 0", "# skipped 1"), tap + "# pass 8\n", ""])
    assert.equal(parseSprintDeskAcceptance(modified), null);
});
test("functional success remains partial with browser quality explicitly incomplete", async () => {
  const docker = fakeDocker();
  const result = await evaluateSprintDesk({ candidatePath: fixture, trustProfile: "controlled_synthetic" }, docker);
  assert.equal(result.status, "partial"); assert.equal(result.functionalStatus, "passed");
  assert.equal(result.api.passed, 8); assert.equal(result.persistence.coldContainerRestart, true);
  assert.equal(result.ui.status, "not_run"); assert.equal(result.qualityComplete, false);
  assert.equal(result.paidModelCalls, 0); assert.equal(result.cleanup, "passed");
  assert.equal(result.isolation.dataLimitBytes, 67108864);
  const sqliteGrade = docker.calls.find(c => c.args.includes("/sqlite-probe:rw,nosuid,nodev,size=68m,uid=1000,gid=1000,mode=0700"));
  assert.ok(sqliteGrade.args.some(a => a.includes("target=/data,readonly,volume-nocopy")));
  assert.ok(sqliteGrade.args.includes("none"));
  await assert.rejects(lstat(docker.scratch), { code: "ENOENT" });
  for (const { args, options } of docker.calls) {
    assert.deepEqual(Object.keys(options.env).sort(), ["DOCKER_CONFIG", "DOCKER_HOST", "HOME", "PATH"]);
    assert.equal(options.env.DOCKER_HOST, "unix:///var/run/docker.sock");
    assert.ok(options.timeoutMs > 0 && options.timeoutMs <= 120_000);
    if (["create", "run"].includes(args[0])) {
      assert.ok(args.includes(SPRINTDESK_IMAGE)); assert.ok(args.includes("--read-only"));
      assert.ok(args.includes("1000:1000")); assert.ok(args.includes("no-new-privileges=true"));
      assert.ok(args.includes("--log-driver")); assert.ok(!args.some(a => a.includes("docker.sock")));
      assert.ok(!args.includes("--privileged")); assert.ok(!args.includes("--publish"));
    }
  }
  const removed = docker.calls.filter(c => c.args[0] === "rm").map(c => c.args.at(-1));
  assert.equal(removed.length, 6); assert.equal(new Set(removed).size, 6);
  assert.ok(removed.every(name => /^repositoryzero-lab-[a-f0-9]{16}(?:-grade-\d|-anchor)?$/.test(name)));
  const volumeRemoval = docker.calls.find(c => c.args[0] === "volume" && c.args[1] === "rm");
  assert.ok(volumeRemoval); assert.match(volumeRemoval.args[2], /^repositoryzero-lab-[a-f0-9]{16}-data$/);
  assert.equal(docker.calls.at(-1), volumeRemoval, "all containers must be removed before the data volume");
});
test("API failure is not hidden by restart success and candidate logs stay out of report", async () => {
  const docker = fakeDocker({ failApi: true });
  const result = await evaluateSprintDesk({ candidatePath: fixture, trustProfile: "controlled_local_candidate" }, docker);
  assert.equal(result.status, "failed"); assert.equal(result.api.status, "failed");
  assert.equal(result.reason, "independent_api_acceptance_failed"); assert.equal(result.cleanup, "passed");
  assert.equal(docker.calls.some(c => c.args[0] === "restart"), false);
  assert.equal(JSON.stringify(result).includes("untrusted secret log"), false);
});
test("a process restart or non-SQLite persistence regression fails independently of API success", async () => {
  for (const failure of [{ failRestart: true }, { failSqlite: true }]) {
    const docker = fakeDocker(failure);
    const result = await evaluateSprintDesk({ candidatePath: fixture, trustProfile: "controlled_synthetic" }, docker);
    assert.equal(result.status, "failed"); assert.equal(result.api.status, "passed");
    assert.equal(result.persistence.status, "failed"); assert.equal(result.cleanup, "passed");
  }
});
test("rejects a mismatched isolation profile before starting the candidate", async () => {
  const docker = fakeDocker({ badIsolation: true });
  const result = await evaluateSprintDesk({ candidatePath: fixture, trustProfile: "controlled_synthetic" }, docker);
  assert.equal(result.status, "error"); assert.equal(result.reason, "isolation_profile_mismatch");
  assert.equal(docker.calls.some(c => c.args[0] === "start" && !c.args[1].endsWith("-anchor")), false);
  assert.equal(result.cleanup, "passed");
});
test("an unavailable pinned image is unsupported without pulling or starting code", async () => {
  const calls = [];
  const result = await evaluateSprintDesk({ candidatePath: fixture, trustProfile: "controlled_synthetic" }, {
    async runDocker(args) { calls.push(args); return { exitCode: 1 }; },
  });
  assert.equal(result.status, "unsupported"); assert.equal(result.reason, "pinned_image_unavailable_no_automatic_pull");
  assert.equal(calls.length, 1); assert.deepEqual(calls[0].slice(0, 2), ["image", "inspect"]);
});
test("a cancelled evaluation never starts candidate code", async () => {
  let called = false; const controller = new AbortController(); controller.abort();
  const result = await evaluateSprintDesk({ candidatePath: fixture, trustProfile: "controlled_synthetic", signal: controller.signal }, {
    async runDocker() { called = true; },
  });
  assert.equal(result.status, "cancelled"); assert.equal(called, false);
});
test("cancellation during a grader run still cleans only this invocation's containers", async () => {
  const controller = new AbortController(), docker = fakeDocker();
  const result = await evaluateSprintDesk({ candidatePath: fixture, trustProfile: "controlled_synthetic", signal: controller.signal }, {
    async runDocker(args, options) {
      if (args.includes("--test")) { controller.abort(); return { exitCode: -1, interrupted: true }; }
      if (args[0] === "rm") assert.equal(options.signal, undefined, "cleanup must survive caller cancellation");
      return docker.runDocker(args, options);
    },
  });
  assert.equal(result.status, "cancelled"); assert.equal(result.cleanup, "passed");
  assert.equal(docker.calls.filter(c => c.args[0] === "rm").length, 4);
});
test("cleanup failure cannot be reported as a clean partial result", async t => {
  const docker = fakeDocker({ failCleanup: true });
  const result = await evaluateSprintDesk({ candidatePath: fixture, trustProfile: "controlled_synthetic" }, docker);
  t.after(() => rm(docker.scratch, { recursive: true, force: true }));
  assert.equal(result.status, "error"); assert.equal(result.cleanup, "failed_owned_resources_retained_for_operator");
});

test("real isolated SQLite fixture passes while the in-memory regression fails after restart", {
  skip: process.env.ZERO_LAB_DOCKER_TESTS !== "1", timeout: 180_000,
}, async t => {
  const { source, directory } = await temporary(t);
  const manifest = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
  manifest.scripts.start = "node broken-server.mjs";
  await writeFile(path.join(source, "package.json"), JSON.stringify(manifest));
  const positive = await evaluateSprintDesk({ candidatePath: fixture, trustProfile: "controlled_synthetic", signal: t.signal });
  const wal = path.join(directory, "wal"); await cp(fixture, wal, { recursive: true });
  const server = await readFile(path.join(wal, "server.mjs"), "utf8");
  assert.ok(server.includes('database.exec("CREATE TABLE'));
  await writeFile(path.join(wal, "server.mjs"), server.replace('database.exec("CREATE TABLE', 'database.exec("PRAGMA journal_mode=WAL");\ndatabase.exec("CREATE TABLE'));
  const walPositive = await evaluateSprintDesk({ candidatePath: wal, trustProfile: "controlled_synthetic", signal: t.signal });
  const regression = await evaluateSprintDesk({ candidatePath: source, trustProfile: "controlled_synthetic", signal: t.signal });
  assert.equal(positive.status, "partial"); assert.equal(positive.api.passed, 8);
  assert.equal(positive.persistence.status, "passed"); assert.equal(positive.isolation.dataLimitBytes, 67108864);
  assert.equal(positive.persistence.sqliteTaskStored, true);
  assert.equal(walPositive.status, "partial", JSON.stringify(walPositive));
  assert.equal(walPositive.api.passed, 8); assert.equal(walPositive.persistence.sqliteProbeCopy, true);
  assert.equal(regression.status, "failed"); assert.equal(regression.api.passed, 8);
  assert.equal(regression.persistence.status, "failed"); assert.equal(regression.reason, "restart_or_sqlite_persistence_failed");
  for (const result of [positive, walPositive, regression]) {
    assert.equal(result.ui.status, "not_run"); assert.equal(result.qualityComplete, false);
    assert.equal(result.cleanup, "passed"); assert.equal(result.paidModelCalls, 0);
  }
  const evaluatorBytes = await readFile(new URL("./zero-lab-evaluate.mjs", import.meta.url));
  await writeFile(path.join(tmpdir(), "repositoryzero-lab-evaluator-evidence.json"), JSON.stringify({
    kind: "controlled_fixture_evaluator_conformance_not_generated_app_benchmark",
    checkedAtUtc: new Date().toISOString(),
    evaluatorSourceDigest: createHash("sha256").update(evaluatorBytes).digest("hex"),
    positive, walPositive, persistenceRegression: regression,
  }, null, 2) + "\n", { mode: 0o600 });
});
