import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { prepareZeroCsvComponent, validateZeroCsv, zeroCsvHash } from "./zero-csv-profile.js";
import type { ProjectSnapshotConfig, ProjectSnapshotManifest } from "./zero-project-snapshot.js";
import { createProjectSnapshotter } from "./zero-project-snapshot.js";

const vendor = "vendor/d3-dsv/";
export const ZERO_CSV_PROJECT_FILES = [
  "app.mjs",
  `${vendor}src/csv.js`,
  `${vendor}src/dsv.js`,
  `${vendor}LICENSE`,
  `${vendor}package.json`,
] as const;
export const ZERO_CSV_PROJECT_CASES = [
  "name,value\none,2\n",
  'name,note\r\n"A,B","line\r\nnext"\r\n',
  'žodis,note\n値,"escaped ""quote"""\n',
] as const;
export const ZERO_CSV_PROJECT_LIMITS = Object.freeze({
  memoryMiB: 128,
  cpus: 1,
  pids: 32,
  outputBytes: 65_536,
  wallMs: 10_000,
  sourceBytes: 262_144,
  cleanupMs: 3000,
});

/** Trusted operator-only settings. No request may supply roots, commands, mounts or images. */
export interface ZeroCsvProjectVerifierConfig {
  snapshot: ProjectSnapshotConfig;
  dockerExecutable: string;
  /** Exact local Docker image ID, never a mutable tag; image must contain Node >=22.15. */
  imageId: string;
}

export interface ZeroCsvProjectReceipt {
  schemaVersion: 1;
  profile: "zero-csv-project-v1";
  outcome: "pass" | "fail" | "unknown";
  reason: string;
  snapshot: { sha256: string; manifest: ProjectSnapshotManifest };
  imageId: string;
  harnessSha256: string;
  execution: {
    nodeVersion: string | null;
    cleanup: "not_started" | "container_exited" | "force_removed" | "unknown";
  };
  component: {
    name: string;
    version: string;
    license: string;
    profile: string;
    lockfileSha256: string;
    files: { path: string; sha256: string }[];
  };
  cases: {
    inputSha256: string;
    appOutputSha256: string;
    actualUse: { calls: number; outputSha256: string };
  }[];
  limits: typeof ZERO_CSV_PROJECT_LIMITS;
  limitations: readonly string[];
}

/**
 * Fixed development harness. Source hooks wrap only the already hash-verified vendor
 * export; the private recorder is captured and removed before host code is imported.
 * This is useful invocation evidence, not an adversarially unforgeable same-VM proof.
 * Exported only so offline tests can run this exact harness on trusted fixture code.
 */
export const ZERO_CSV_PROJECT_HARNESS = String.raw`
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const { root, inputs, nonce } = JSON.parse(raw);
const stringify = JSON.stringify.bind(JSON);
const clone = structuredClone;
const output = process.stdout.write.bind(process.stdout);
const nodeVersion = process.versions.node;
const calls = [];
const append = Array.prototype.push.bind(calls);
const key = '__zero_' + nonce;
const target = pathToFileURL(path.join(root, 'vendor/d3-dsv/src/csv.js')).href;
globalThis[key] = (input, rows) => append({ input, rows: clone(rows) });
const hooks = registerHooks({ load(url, context, next) {
  const loaded = next(url, context);
  if (url !== target) return loaded;
  const source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString('utf8');
  const declaration = 'export var csvParseRows = csv.parseRows;';
  if (source.split(declaration).length !== 2) throw Error('instrumentation_mismatch');
  return { ...loaded, source: 'const record = globalThis[' + stringify(key) + ']; delete globalThis[' + stringify(key) + '];\n' + source.replace(declaration,
    'export var csvParseRows = function(input) { if (arguments.length !== 1) throw Error("unsupported_call"); const result = csv.parseRows(input); record(input, result); return result; };') };
}});
try {
  await import(target);
  const app = await import(pathToFileURL(path.join(root, 'app.mjs')).href);
  if (typeof app.parseCsv !== 'function') throw Error('missing_entrypoint');
  const cases = [];
  for (const input of inputs) {
    const before = calls.length;
    const actual = clone(await app.parseCsv(input));
    cases.push({ actual, calls: calls.slice(before) });
  }
  output(stringify({ nonce, nodeVersion, cases }));
} catch {
  output(stringify({ nonce, error: 'application_failed' }));
} finally {
  hooks.deregister();
}
`;

function invalidConfig(): never {
  throw new Error("invalid_csv_project_verifier_config");
}
function validateConfig(config: ZeroCsvProjectVerifierConfig) {
  if (
    process.platform !== "linux" ||
    typeof process.getuid !== "function" ||
    process.getuid() === 0 ||
    !/^sha256:[a-f0-9]{64}$/u.test(config.imageId) ||
    !path.isAbsolute(config.dockerExecutable) ||
    [...config.dockerExecutable].some((character) => character.charCodeAt(0) < 32) ||
    /[,\r\n]/u.test(config.snapshot.stagingRoot) ||
    config.snapshot.allowedFiles.length !== ZERO_CSV_PROJECT_FILES.length ||
    !ZERO_CSV_PROJECT_FILES.every((file) => config.snapshot.allowedFiles.includes(file)) ||
    config.snapshot.limits.maxTotalBytes > ZERO_CSV_PROJECT_LIMITS.sourceBytes
  )
    invalidConfig();
}

function frozenConfig(config: ZeroCsvProjectVerifierConfig): ZeroCsvProjectVerifierConfig {
  const trusted = {
    ...config,
    snapshot: {
      ...config.snapshot,
      allowedFiles: [...config.snapshot.allowedFiles],
      limits: { ...config.snapshot.limits },
    },
  };
  validateConfig(trusted);
  return trusted;
}

async function capture(
  executable: string,
  args: string[],
  configDir: string,
  input: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; reason?: string }> {
  if (signal.aborted) return { code: null, stdout: "", reason: "aborted" };
  return new Promise((resolve) => {
    const output: Buffer[] = [];
    let bytes = 0;
    let reason: string | undefined;
    let settled = false;
    const child = spawn(executable, args, {
      env: { PATH: "/usr/bin:/bin", DOCKER_CONFIG: configDir },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      resolve({
        code,
        stdout: Buffer.concat(output).toString("utf8"),
        ...(reason ? { reason } : {}),
      });
    };
    const stop = (why: string) => {
      reason ??= why;
      child.kill("SIGKILL");
    };
    const abort = () => stop("aborted");
    const timer = setTimeout(() => stop("execution_timeout"), timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    child.on("error", () => {
      reason ??= "runtime_unavailable";
      finish(null);
    });
    for (const [stream, keep] of [
      [child.stdout, true],
      [child.stderr, false],
    ] as const) {
      stream.on("data", (chunk: Buffer) => {
        bytes += chunk.byteLength;
        if (bytes > ZERO_CSV_PROJECT_LIMITS.outputBytes) return stop("output_limit_exceeded");
        if (keep) output.push(Buffer.from(chunk));
      });
      stream.on("error", () => stop("runtime_unavailable"));
    }
    child.stdin.on("error", () => undefined);
    child.once("close", (code) => finish(code));
    child.stdin.end(input);
    if (signal.aborted) abort();
  });
}

function sourceBinding(manifest: ProjectSnapshotManifest) {
  return zeroCsvHash(JSON.stringify(manifest));
}

/** Current bytes check only: an old PASS always describes its original snapshot. */
export async function checkZeroCsvProjectFreshness(
  config: ZeroCsvProjectVerifierConfig,
  sha256: string,
  signal: AbortSignal,
) {
  return boundedErrors(signal, async () => {
    const trusted = frozenConfig(config);
    signal.throwIfAborted();
    const snapshotter = await createProjectSnapshotter(trusted.snapshot);
    const current = await snapshotter.snapshot({
      scopeId: trusted.snapshot.scopeId,
      files: ZERO_CSV_PROJECT_FILES,
    });
    signal.throwIfAborted();
    return {
      state: current.sha256 === sha256 ? ("unchanged" as const) : ("changed" as const),
      sha256: current.sha256,
      directory: current.directory,
    };
  });
}

async function boundedErrors<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (signal.aborted) throw new Error("csv_project_verifier_aborted");
    if (error instanceof Error && error.message === "invalid_csv_project_verifier_config")
      throw error;
    // Keep OS paths, Docker diagnostics and application content out of caller-facing errors.
    throw new Error("csv_project_verifier_unavailable");
  }
}

/**
 * One fixed Docker run, without a scheduler or execution grant. The caller owns grant
 * checks, retained snapshots and receipts. Docker daemon/selected image are trusted.
 */
export async function verifyZeroCsvProject(
  config: ZeroCsvProjectVerifierConfig,
  signal: AbortSignal,
) {
  return boundedErrors(signal, () => verifyCapturedProject(config, signal));
}

async function verifyCapturedProject(config: ZeroCsvProjectVerifierConfig, signal: AbortSignal) {
  const trusted = frozenConfig(config);
  signal.throwIfAborted();
  const snapshotter = await createProjectSnapshotter(trusted.snapshot);
  const snapshot = await snapshotter.snapshot({
    scopeId: trusted.snapshot.scopeId,
    files: ZERO_CSV_PROJECT_FILES,
  });
  const prepared = await prepareZeroCsvComponent();
  signal.throwIfAborted();
  const receipt: ZeroCsvProjectReceipt = {
    schemaVersion: 1,
    profile: "zero-csv-project-v1",
    outcome: "unknown",
    reason: "not_run",
    snapshot: { sha256: snapshot.sha256, manifest: snapshot.manifest },
    imageId: trusted.imageId,
    harnessSha256: zeroCsvHash(ZERO_CSV_PROJECT_HARNESS),
    execution: { nodeVersion: null, cleanup: "not_started" },
    component: {
      name: prepared.name,
      version: prepared.version,
      license: prepared.license,
      profile: prepared.profile,
      lockfileSha256: prepared.lockfileSha256,
      files: prepared.files.map(({ path: file, sha256 }) => ({ path: `${vendor}${file}`, sha256 })),
    },
    cases: [],
    limits: ZERO_CSV_PROJECT_LIMITS,
    limitations: [
      "Fixed deterministic development conformance; no independent holdout or general CSV application guarantee",
      "Closure invocation trace is not an adversarially unforgeable same-VM actual-use guarantee",
      "Read-only snapshots and Docker mounts do not protect against a hostile host user or Docker daemon",
      "Only the captured snapshot is verified; host edits require a separate freshness check",
    ],
  };
  const result = () => ({ receipt, snapshotDirectory: snapshot.directory });
  if (sourceBinding(snapshot.manifest) !== snapshot.sha256)
    throw new Error("snapshot_digest_mismatch");
  for (const file of prepared.files) {
    const captured = snapshot.manifest.files.find(
      (entry) => entry.path === `${vendor}${file.path}`,
    );
    if (!captured || captured.sha256 !== file.sha256) {
      receipt.outcome = "fail";
      receipt.reason = "component_source_mismatch";
      return result();
    }
  }
  // Recheck every retained file as well as its manifest before mounting it.
  for (const captured of snapshot.manifest.files) {
    if (
      zeroCsvHash(await readFile(path.join(snapshot.directory, "files", captured.path))) !==
      captured.sha256
    )
      throw new Error("snapshot_content_mismatch");
  }
  const control = await mkdtemp(path.join(trusted.snapshot.stagingRoot, "zero-csv-control-"));
  const name = `zero-csv-${randomUUID()}`;
  try {
    const runner = path.join(control, "runner.mjs");
    await writeFile(runner, ZERO_CSV_PROJECT_HARNESS, { mode: 0o400, flag: "wx" });
    const uid = process.getuid!();
    const gid = process.getgid!();
    const nonce = randomUUID();
    const payload = JSON.stringify({ root: "/project", inputs: ZERO_CSV_PROJECT_CASES, nonce });
    receipt.execution.cleanup = "unknown";
    const run = await capture(
      trusted.dockerExecutable,
      [
        "--host",
        "unix:///var/run/docker.sock",
        "run",
        "--pull=never",
        "--rm",
        "--name",
        name,
        "--network=none",
        "--ipc=none",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        `--user=${uid}:${gid}`,
        `--memory=${ZERO_CSV_PROJECT_LIMITS.memoryMiB}m`,
        `--memory-swap=${ZERO_CSV_PROJECT_LIMITS.memoryMiB}m`,
        `--cpus=${ZERO_CSV_PROJECT_LIMITS.cpus}`,
        `--pids-limit=${ZERO_CSV_PROJECT_LIMITS.pids}`,
        "--ulimit=nofile=64:64",
        "--ulimit=cpu=5:5",
        "--log-driver=none",
        "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=8388608",
        "--workdir=/project",
        "--mount",
        `type=bind,source=${path.join(snapshot.directory, "files")},target=/project,readonly`,
        "--mount",
        `type=bind,source=${runner},target=/zero-runner.mjs,readonly`,
        "--entrypoint=/usr/local/bin/node",
        "-i",
        trusted.imageId,
        "--max-old-space-size=64",
        "/zero-runner.mjs",
      ],
      control,
      payload,
      signal,
      ZERO_CSV_PROJECT_LIMITS.wallMs,
    );
    if (run.code === 0) receipt.execution.cleanup = "container_exited";
    if (run.reason || run.code !== 0) {
      receipt.reason = run.reason ?? "execution_failed";
      return result();
    }
    let decoded: {
      nonce?: unknown;
      nodeVersion?: unknown;
      error?: unknown;
      cases?: { actual: unknown; calls: { input: unknown; rows: unknown }[] }[];
    };
    try {
      decoded = JSON.parse(run.stdout);
    } catch {
      receipt.outcome = "fail";
      receipt.reason = "invalid_execution_output";
      return result();
    }
    if (
      decoded.nonce !== nonce ||
      typeof decoded.nodeVersion !== "string" ||
      !/^\d+\.\d+\.\d+$/u.test(decoded.nodeVersion) ||
      decoded.error ||
      !Array.isArray(decoded.cases) ||
      decoded.cases.length !== ZERO_CSV_PROJECT_CASES.length
    ) {
      receipt.outcome = "fail";
      receipt.reason = "application_failed";
      return result();
    }
    receipt.execution.nodeVersion = decoded.nodeVersion;
    for (let i = 0; i < ZERO_CSV_PROJECT_CASES.length; i++) {
      const input = ZERO_CSV_PROJECT_CASES[i]!;
      const actual = decoded.cases[i]!;
      const expected = JSON.stringify(validateZeroCsv(input));
      if (
        !actual ||
        typeof actual !== "object" ||
        !Array.isArray(actual.calls) ||
        !actual.calls.length ||
        actual.calls.length > 8 ||
        actual.calls.some(
          (call) =>
            !call ||
            typeof call !== "object" ||
            call.input !== input ||
            JSON.stringify(call.rows) !== expected,
        )
      ) {
        receipt.outcome = "fail";
        receipt.reason = "component_not_used";
        return result();
      }
      receipt.cases.push({
        inputSha256: zeroCsvHash(input),
        appOutputSha256: zeroCsvHash(JSON.stringify(actual.actual) ?? "undefined"),
        actualUse: { calls: actual.calls.length, outputSha256: zeroCsvHash(expected) },
      });
      if (JSON.stringify(actual.actual) !== expected) {
        receipt.outcome = "fail";
        receipt.reason = "app_output_mismatch";
        return result();
      }
    }
    receipt.outcome = "pass";
    receipt.reason = "fixed_suite_passed";
    return result();
  } finally {
    const cleanup = await capture(
      trusted.dockerExecutable,
      ["--host", "unix:///var/run/docker.sock", "rm", "--force", name],
      control,
      "",
      AbortSignal.timeout(ZERO_CSV_PROJECT_LIMITS.cleanupMs),
      ZERO_CSV_PROJECT_LIMITS.cleanupMs,
    );
    if (cleanup.code === 0) receipt.execution.cleanup = "force_removed";
    await chmod(control, 0o700);
    await rm(control, { recursive: true, force: true });
  }
}
