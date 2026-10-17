import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gradePdfFixture } from "../packages/adapters/docling/grade.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cache = resolve(root, ".cache/zero-docling-v1");
const fixtures = resolve(root, "platform/packages/testkit/fixtures/pdf-born-digital-v1");
const moduleDir = resolve(root, "platform/packages/adapters/docling");
const profile = JSON.parse(await readFile(resolve(moduleDir, "profile.json")));
if (process.argv.length !== 3 || process.argv[2] !== "--run") {
  process.stdout.write(
    `${JSON.stringify({ state: "blocked", code: "EXPLICIT_SPIKE_REQUIRED", defaultDownloads: 0 })}\n`,
  );
  process.exit(2);
}
const manifestBytes = await readFile(resolve(fixtures, "manifest.json"));
if (createHash("sha256").update(manifestBytes).digest("hex") !== profile.fixtureManifestSha256)
  throw new Error("FROZEN_MANIFEST_CHANGED");
const manifest = JSON.parse(manifestBytes);
const report = {
  version: 1,
  profile: profile.id,
  state: "not_run",
  fixtureManifestSha256: profile.fixtureManifestSha256,
  runnerSha256: createHash("sha256")
    .update(await readFile(resolve(moduleDir, "runner.py")))
    .digest("hex"),
  graderSha256: createHash("sha256")
    .update(await readFile(resolve(moduleDir, "grade.mjs")))
    .digest("hex"),
  paidModelCalls: 0,
  network: "none",
  runtimeLimits: profile.limits,
  results: [],
  warmRepeat: null,
  processExit: null,
  processPeakRssBytes: null,
  containerPeakMemoryBytes: null,
  note: "Controlled synthetic development corpus; not independent holdout or durable worker acceptance.",
};
let preparation;
try {
  preparation = JSON.parse(await readFile(resolve(cache, "preparation.json")));
} catch {}
if (
  preparation?.state !== "prepared" ||
  preparation.profileSha256 !==
    createHash("sha256")
      .update(await readFile(resolve(moduleDir, "profile.json")))
      .digest("hex") ||
  !/^sha256:[a-f0-9]{64}$/.test(preparation.imageId)
) {
  report.state = "blocked";
  report.code = "PROFILE_NOT_PREPARED";
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exit(2);
}
for (const fixture of manifest.fixtures) {
  const data = await readFile(resolve(fixtures, `${fixture.id}.pdf`));
  if (
    data.length !== fixture.bytes ||
    createHash("sha256").update(data).digest("hex") !== fixture.sha256
  )
    throw new Error("FROZEN_FIXTURE_CHANGED");
}
await mkdir(cache, { recursive: true, mode: 0o700 });
const name = `zero-docling-spike-${randomUUID()}`;
let interrupted = null,
  current = 0,
  timer,
  pending = "",
  total = 0,
  stderr = "";
const output = new Map();
const startedSequences = new Set();
function terminate(code) {
  if (interrupted) return;
  interrupted = code;
  // Kill only this owned container; killing the docker client alone is insufficient.
  const killed = spawnSync("docker", ["kill", name], { stdio: "ignore", timeout: 10000 });
  if (killed.status !== 0) report.cancellationUnknown = true;
  child.kill("SIGKILL");
}
function arm() {
  clearTimeout(timer);
  timer = setTimeout(() => terminate("PDF_RUNTIME_TIMEOUT"), profile.limits.runtimeMs);
}
const start = Date.now();
const child = spawn(
  "docker",
  [
    "run",
    "--name",
    name,
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--memory",
    String(profile.limits.memoryBytes),
    "--memory-swap",
    String(profile.limits.memoryBytes),
    "--cpus",
    String(profile.limits.threads),
    "--pids-limit",
    "128",
    "--user",
    `${process.getuid()}:${process.getgid()}`,
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,size=128m,mode=1777",
    "--env",
    "HOME=/tmp",
    "--env",
    "PYTHONDONTWRITEBYTECODE=1",
    "--mount",
    `type=bind,src=${fixtures},dst=/input,readonly`,
    "--mount",
    `type=bind,src=${resolve(cache, "models")},dst=/models,readonly`,
    "--mount",
    `type=bind,src=${moduleDir},dst=/profile,readonly`,
    preparation.imageId,
    "python",
    "/profile/runner.py",
    "--suite",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
arm();
child.stdout.on("data", (part) => {
  total += part.length;
  if (total > profile.limits.outputBytes * 11) {
    terminate("PDF_OUTPUT_LIMIT");
    return;
  }
  pending += part.toString("utf8");
  if (Buffer.byteLength(pending) > profile.limits.outputBytes && !pending.includes("\n")) {
    terminate("PDF_OUTPUT_LIMIT");
    return;
  }
  while (pending.includes("\n")) {
    const end = pending.indexOf("\n"),
      line = pending.slice(0, end);
    pending = pending.slice(end + 1);
    try {
      if (Buffer.byteLength(line) > profile.limits.outputBytes) throw new Error();
      const value = JSON.parse(line);
      if (value.event === "started") {
        if (
          startedSequences.has(value.sequence) ||
          value.sequence !== current ||
          (current > 0 && !output.has(current - 1))
        )
          throw new Error();
        startedSequences.add(value.sequence);
        // First watchdog already includes container startup + model initialization.
        if (current > 0) arm();
      } else if (value.sequence === current && !output.has(current) && current <= 10) {
        output.set(current, value);
        current++;
      } else {
        throw new Error();
      }
    } catch {
      terminate("PDF_PROTOCOL_FAILED");
    }
  }
});
child.stderr.on("data", (part) => {
  if (Buffer.byteLength(stderr) + part.length <= 262144) stderr += part.toString("utf8");
  else terminate("PDF_STDERR_LIMIT");
});
child.on("error", () => terminate("PDF_PROCESS_UNAVAILABLE"));
const exit = await new Promise((resolve) => child.once("close", resolve));
clearTimeout(timer);
report.processExit = exit;
report.elapsedMs = Date.now() - start;
await writeFile(resolve(cache, "runtime.stderr.log"), stderr);
const inspect = spawnSync("docker", ["inspect", name], {
  encoding: "utf8",
  timeout: 10000,
  maxBuffer: 1048576,
});
if (inspect.status === 0) {
  const state = JSON.parse(inspect.stdout)[0].State;
  report.oomKilled = state.OOMKilled;
  if (state.OOMKilled) interrupted = "PDF_MEMORY_LIMIT";
}
const cleaned = spawnSync("docker", ["rm", "--force", name], { stdio: "ignore", timeout: 10000 });
report.cleanupConfirmed = cleaned.status === 0;
for (let index = 0; index < 10; index++) {
  const fixture = manifest.fixtures[index],
    actual = output.get(index);
  const grade = actual
    ? gradePdfFixture(fixture, actual)
    : { pass: false, errors: [interrupted ?? "runtime_result_missing"], numericCells: 0 };
  report.results.push({
    id: fixture.id,
    state: actual?.state ?? "not_run",
    pass: grade.pass,
    errors: grade.errors,
    numericCells: grade.numericCells,
    elapsedMs: actual?.elapsedMs ?? null,
    initializationMs: actual?.initializationMs ?? null,
    peakRssBytes: actual?.peakRssBytes ?? null,
  });
}
if (output.has(10)) {
  const actual = output.get(10);
  report.warmRepeat = {
    ...gradePdfFixture(manifest.fixtures[0], actual),
    elapsedMs: actual.elapsedMs,
    peakRssBytes: actual.peakRssBytes,
  };
}
const rss = [...output.values()].map((v) => v.peakRssBytes).filter(Number.isFinite);
report.processPeakRssBytes = rss.length ? Math.max(...rss) : null;
const memory = [...output.values()].map((v) => v.containerPeakMemoryBytes).filter(Number.isFinite);
report.containerPeakMemoryBytes = memory.length ? Math.max(...memory) : null;
report.state =
  report.results.every((r) => r.pass) &&
  report.warmRepeat?.pass &&
  exit === 0 &&
  report.cleanupConfirmed
    ? "completed"
    : "failed";
report.code = interrupted;
report.preparation = preparation;
for (const [sequence, actual] of output)
  await writeFile(
    resolve(cache, `result-${sequence}.json`),
    `${JSON.stringify(actual, null, 2)}\n`,
  );
await writeFile(resolve(cache, "spike.json.tmp"), `${JSON.stringify(report, null, 2)}\n`);
await rename(resolve(cache, "spike.json.tmp"), resolve(cache, "spike.json"));
process.stdout.write(`${JSON.stringify(report)}\n`);
if (report.state !== "completed") process.exitCode = 1;
