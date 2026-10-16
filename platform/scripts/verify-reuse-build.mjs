/** One owned synthetic app fixture; not the production hostile-code sandbox. */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repositorySearchFromTool } from "../packages/adapters/src/zero-repository-tools.ts";

const platform = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = path.dirname(platform);
const IMAGE = "node@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f";
const container = `repositoryzero-reuse-${randomBytes(8).toString("hex")}`;
const scratch = mkdtempSync(path.join(tmpdir(), "repositoryzero-reuse-"));
const input = path.join(scratch, "input");
const output = path.join(root, ".artifacts/reuse-build");
let created = false;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const run = (command, args, timeout = 30_000) =>
  execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
    maxBuffer: 1_048_576,
  });

function copyPackage(source, target) {
  let size = 0;
  const inspect = (entry) => {
    const stat = lstatSync(entry);
    if (stat.isSymbolicLink()) throw new Error("Unexpected package symlink");
    if (stat.isDirectory()) for (const name of readdirSync(entry)) inspect(path.join(entry, name));
    else if (stat.isFile()) size += stat.size;
    else throw new Error("Unexpected special package file");
    if (size > 64 * 1024 * 1024) throw new Error("Package exceeds fixture size bound");
  };
  inspect(source);
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}

try {
  if (process.platform !== "linux" || process.arch !== "x64")
    throw new Error("This first fixture profile is Linux x64 only");
  mkdirSync(input);
  chmodSync(input, 0o755);
  mkdirSync(output, { recursive: true });
  const found = repositorySearchFromTool({ query: "honojs/hono" });
  const candidate = found.candidates?.find((entry) => entry.repository === "honojs/hono");
  if (!candidate?.sourceRevision || !/^[a-f0-9]{40}$/.test(candidate.sourceRevision))
    throw new Error("Missing pinned source candidate");
  const sourceEvidence = [];
  for (const file of ["README.md", "LICENSE"]) {
    const url = `https://raw.githubusercontent.com/honojs/hono/${candidate.sourceRevision}/${file}`;
    const body = run("curl", [
      "--fail",
      "--silent",
      "--show-error",
      "--location",
      "--max-redirs",
      "2",
      "--proto",
      "=https",
      "--proto-redir",
      "=https",
      "--max-time",
      "20",
      "--max-filesize",
      "262144",
      url,
    ]);
    if (file === "LICENSE" && !body.includes("MIT"))
      throw new Error("Expected reviewed license source");
    writeFileSync(path.join(output, `upstream-${file}`), body);
    sourceEvidence.push({
      url,
      revision: candidate.sourceRevision,
      bytes: Buffer.byteLength(body),
      sha256: hash(body),
    });
  }
  const hono = realpathSync(path.join(platform, "apps/api/node_modules/hono"));
  const tsxRequire = createRequire(
    realpathSync(path.join(platform, "node_modules/tsx/package.json")),
  );
  const esbuild = path.dirname(tsxRequire.resolve("esbuild/package.json"));
  const esbuildRequire = createRequire(path.join(esbuild, "package.json"));
  const binary = path.dirname(esbuildRequire.resolve("@esbuild/linux-x64/package.json"));
  copyPackage(hono, path.join(input, "node_modules/hono"));
  copyPackage(esbuild, path.join(input, "deps/esbuild"));
  copyPackage(binary, path.join(input, "deps/esbuild/node_modules/@esbuild/linux-x64"));
  for (const file of ["app.fixture.ts", "app.acceptance.mjs", "build.mjs"])
    cpSync(path.join(platform, "packages/testkit/fixtures/zero-reuse", file), path.join(input, file));
  const packageInfo = JSON.parse(readFileSync(path.join(hono, "package.json"), "utf8"));
  if (packageInfo.version !== "4.13.7")
    throw new Error("Fixture Hono package changed; review its new pin first");
  const lock = readFileSync(path.join(platform, "pnpm-lock.yaml"));
  if (!lock.toString().includes(`hono@${packageInfo.version}:`))
    throw new Error("Package is absent from the lockfile");
  if (spawnSync("docker", ["image", "inspect", IMAGE], { stdio: "ignore" }).status !== 0)
    run("docker", ["pull", IMAGE], 120_000);
  run("docker", [
    "create",
    "--name",
    container,
    "--user",
    "1000:1000",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges=true",
    "--pids-limit",
    "128",
    "--memory",
    "512m",
    "--cpus",
    "1",
    "--env",
    "GOMAXPROCS=2",
    "--tmpfs",
    "/work:rw,nosuid,nodev,size=64m,mode=1777",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,size=16m,mode=1777",
    "--mount",
    `type=bind,source=${input},target=/input,readonly`,
    "--workdir",
    "/work",
    "--entrypoint",
    "node",
    IMAGE,
    "-e",
    "setInterval(() => {}, 1000)",
  ]);
  created = true;
  run("docker", ["start", container]);
  const settings = JSON.parse(run("docker", ["inspect", container]))[0];
  if (
    settings.HostConfig.NetworkMode !== "none" ||
    !settings.HostConfig.ReadonlyRootfs ||
    settings.HostConfig.Privileged ||
    settings.Config.User !== "1000:1000" ||
    settings.Mounts.some((mount) => mount.Type === "bind" && mount.RW)
  )
    throw new Error("Unexpected fixture isolation profile");
  run("docker", ["exec", container, "node", "/input/build.mjs"], 60_000);
  const positive = run(
    "docker",
    ["exec", container, "node", "--test", "--test-reporter=tap", "/input/app.acceptance.mjs"],
    60_000,
  );
  if (!/# tests 6\b/.test(positive) || !/# pass 6\b/.test(positive) || !/# fail 0\b/.test(positive))
    throw new Error("Expected exactly six successful acceptance cases");
  writeFileSync(path.join(output, "acceptance.tap"), positive);
  const negative = spawnSync(
    "docker",
    [
      "exec",
      "--env",
      "REUSE_APP_PATH=/work/dist/broken.mjs",
      container,
      "node",
      "--test",
      "--test-reporter=tap",
      "/input/app.acceptance.mjs",
    ],
    { encoding: "utf8", timeout: 60_000, maxBuffer: 1_048_576 },
  );
  if (
    negative.status !== 1 ||
    !/not ok .*created task is present/.test(negative.stdout) ||
    !/# fail [1-9]/.test(negative.stdout)
  )
    throw new Error("Negative control did not detect the broken implementation");
  writeFileSync(path.join(output, "negative-control.tap"), negative.stdout);
  // Docker's archive endpoint does not expose this tmpfs mount. Read only the
  // known UTF-8 build artifact through exec while the isolated container runs.
  const artifact = run("docker", [
    "exec",
    container,
    "node",
    "-e",
    "process.stdout.write(require('node:fs').readFileSync('/work/dist/app.mjs'))",
  ]);
  writeFileSync(path.join(output, "app.mjs"), artifact);
  cpSync(path.join(input, "app.fixture.ts"), path.join(output, "app.fixture.ts"));
  if (existsSync(path.join(hono, "LICENSE")))
    cpSync(path.join(hono, "LICENSE"), path.join(output, "LICENSE.hono"));
  const report = {
    checkedAtUtc: new Date().toISOString(),
    stage: "scripted_agent_assisted_reuse_fixture_not_full_mvp",
    selection: "actual local repository_search; human-directed fixture and independent assertions",
    sourceEvidence,
    runtimePackage: {
      name: packageInfo.name,
      version: packageInfo.version,
      lockfileSha256: hash(lock),
      note: "README Git revision and installed package version are distinct references, not asserted identical commits",
    },
    image: IMAGE,
    profile: {
      network: "none",
      user: "1000:1000",
      readOnlyRoot: true,
      inputReadOnly: true,
      memoryBytes: settings.HostConfig.Memory,
      nanoCpus: settings.HostConfig.NanoCpus,
      pids: settings.HostConfig.PidsLimit,
    },
    build: "PASS_esbuild_bundle",
    acceptance: { passed: 6, failed: 0 },
    negativeControl: "EXPECTED_FAILURE_detected_list_regression",
    artifact: {
      path: ".artifacts/reuse-build/app.mjs",
      bytes: statSync(path.join(output, "app.mjs")).size,
      sha256: hash(readFileSync(path.join(output, "app.mjs"))),
    },
    paidModelCalls: 0,
    limitations: [
      "No autonomous Jev/main-model planner in this fixture",
      "Owned synthetic source; not production hostile-code isolation acceptance",
      "In-memory task API; no persistent DB or generated UI",
      "Not browser/PDF/coding thirty-task MVP acceptance",
    ],
  };
  writeFileSync(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    "[reuse-build] PASS: pinned source reference, existing package, isolated bundle and 6/6 actual application cases.",
  );
  console.log(
    "[reuse-build] PASS: deliberately broken listing fails the unchanged acceptance suite.",
  );
  console.log("[reuse-build] Artifact and evidence: .artifacts/reuse-build; no paid model calls.");
} catch (error) {
  console.error("[reuse-build] " + (error instanceof Error ? error.message : "Fixture failed"));
  process.exitCode = 1;
} finally {
  if (created) {
    try {
      run("docker", ["rm", "--force", container]);
    } catch {
      console.error("[reuse-build] This invocation's container cleanup failed");
      process.exitCode = 1;
    }
  }
  rmSync(scratch, { recursive: true, force: true });
}
