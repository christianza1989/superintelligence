import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { captureZeroDockerProcess } from "./zero-docker-process.js";
import { readZeroOperatorFile } from "./zero-operator-file.js";
import type { ZeroPdfExtraction, ZeroPdfRequest } from "./zero-pdf-contract.js";
import {
  ZERO_PDF_BUNDLE,
  ZERO_PDF_BUNDLE_SHA256,
  ZERO_PDF_IMAGE,
  ZERO_PDF_LIMITS,
  ZERO_PDF_PROFILE,
  zeroPdfExtractionSchema,
  zeroPdfHash,
  zeroPdfRequestDigest,
  zeroPdfRequestSchema,
} from "./zero-pdf-contract.js";

export type ZeroPdfRuntimeResult =
  | { state: "succeeded"; output: ZeroPdfExtraction }
  | { state: "blocked" | "failed" | "cancelled"; code: string }
  | { state: "unknown"; code: "PDF_CLEANUP_UNKNOWN"; quarantineId: string };
/** Private operator-created 0600 bundle files outside every Git checkout. Never tool arguments. */
export interface ZeroPdfRuntimeConfig {
  bundleDirectory: string;
  /** Trusted worker gate, rechecked after all staging and image inspection. */
  beforeDispatch?: () => Promise<void>;
}
const metrics = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const completed = z
  .object({
    file: z.literal("input.pdf"),
    state: z.literal("completed"),
    inputSha256: z.string(),
    pages: z.number(),
    tables: z.array(z.unknown()),
    elapsedMs: metrics,
    peakRssBytes: metrics,
    containerPeakMemoryBytes: metrics.nullable(),
    sequence: z.literal(0),
    initializationMs: z.literal(0),
    warmRepeat: z.literal(false),
  })
  .strict();
const started = z.object({ event: z.literal("started"), sequence: z.literal(0) }).strict();

/** Validate the exact frozen single-input runner protocol, then the bounded provenance schema. */
export function parseZeroPdfOutput(stdout: string, sourceSha256: string): ZeroPdfExtraction {
  if (Buffer.byteLength(stdout) > ZERO_PDF_LIMITS.outputBytes) throw new Error("PDF_OUTPUT_DENIED");
  const lines = stdout.trimEnd().split("\n");
  if (lines.length !== 2) throw new Error("PDF_OUTPUT_DENIED");
  started.parse(JSON.parse(lines[0]!));
  const result = completed.parse(JSON.parse(lines[1]!));
  if (result.inputSha256 !== sourceSha256 || result.elapsedMs > ZERO_PDF_LIMITS.runtimeMs)
    throw new Error("PDF_OUTPUT_DENIED");
  return zeroPdfExtractionSchema.parse({
    profile: ZERO_PDF_PROFILE,
    sourceSha256,
    pages: result.pages,
    tables: result.tables,
  });
}

async function cleanupZeroPdf(
  name: string,
  directory: string,
  attempted: boolean,
): Promise<boolean> {
  try {
    // A quarantine ID never authorizes deleting a foreign or linked directory.
    const info = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (
      info &&
      (!info.isDirectory() ||
        info.isSymbolicLink() ||
        info.uid !== process.getuid?.() ||
        (info.mode & 0o7777) !== 0o700)
    )
      return false;
    if (attempted) {
      // Never reuse the cancelled execution signal. Prove absence even if rm returns an error.
      const signal = AbortSignal.timeout(5000);
      const capture = (args: string[]) =>
        captureZeroDockerProcess(
          "/usr/bin/docker",
          args,
          path.join(directory, "docker"),
          "",
          signal,
          2500,
          4096,
        );
      await capture(["container", "rm", "--force", name]).catch(() => undefined);
      const check = await capture([
        "container",
        "ls",
        "--all",
        "--quiet",
        "--filter",
        `name=^/${name}$`,
      ]).catch(() => null);
      if (check?.code !== 0 || check.reason || check.stdout.trim() !== "") return false;
    }
    if (info) {
      for (const part of ["input", "profile"])
        await chmod(path.join(directory, part), 0o700).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      await rm(directory, { recursive: true, force: true });
    }
    try {
      await lstat(directory);
      return false;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT";
    }
  } catch {
    return false;
  }
}

/** Trusted worker/operator recovery only. This reports cleanup, never extraction success or TTL. */
export async function reconcileZeroPdfRuntime(
  quarantineId: string,
): Promise<"cleaned" | "unknown"> {
  if (
    process.platform !== "linux" ||
    !/^zero-pdf-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(quarantineId)
  )
    return "unknown";
  return (await cleanupZeroPdf(quarantineId, `/tmp/${quarantineId}`, true)) ? "cleaned" : "unknown";
}
/** Artifact bytes are loaded by the authorized worker, never supplied through MCP or a host path. */
export async function executeZeroPdf(
  config: ZeroPdfRuntimeConfig,
  input: { request: unknown; requestDigest: string; bytes: Uint8Array },
  signal: AbortSignal,
): Promise<ZeroPdfRuntimeResult> {
  if (process.platform !== "linux") return { state: "blocked", code: "PDF_PLATFORM_UNSUPPORTED" };
  if (signal.aborted) return { state: "cancelled", code: "PDF_CANCELLED" };
  const began = Date.now();
  let request: ZeroPdfRequest;
  // Copy immediately: a caller cannot mutate the input while asynchronous staging runs.
  if (input.bytes.byteLength > ZERO_PDF_LIMITS.inputBytes)
    return { state: "blocked", code: "PDF_REQUEST_DENIED" };
  const bytes = Buffer.from(input.bytes);
  try {
    request = zeroPdfRequestSchema.parse(input.request);
    if (
      zeroPdfRequestDigest(request, began) !== input.requestDigest ||
      bytes.byteLength !== request.source.bytes ||
      zeroPdfHash(bytes) !== request.source.sha256 ||
      bytes.subarray(0, 5).toString("ascii") !== "%PDF-"
    )
      throw new Error("denied");
  } catch {
    return { state: "blocked", code: "PDF_REQUEST_DENIED" };
  }
  const duration = Math.min(ZERO_PDF_LIMITS.runtimeMs, Date.parse(request.deadline) - began);
  const active = AbortSignal.any([signal, AbortSignal.timeout(duration)]);
  const name = `zero-pdf-${randomUUID()}`;
  let directory: string | undefined;
  let attempted = false;
  let result: ZeroPdfRuntimeResult = { state: "failed", code: "PDF_RUNTIME_FAILED" };
  const capture = (
    args: string[],
    operationSignal = active,
    timeout = duration,
    cap: number = ZERO_PDF_LIMITS.outputBytes,
  ) =>
    captureZeroDockerProcess(
      "/usr/bin/docker",
      args,
      path.join(directory!, "docker"),
      "",
      operationSignal,
      timeout,
      cap,
    );
  try {
    // Read and verify the whole fixed bundle before any container or input mount exists.
    const bundle = await Promise.all(
      ZERO_PDF_BUNDLE.map(async (entry) => {
        const data = await readZeroOperatorFile(
          path.join(config.bundleDirectory, entry.name),
          entry.bytes,
        );
        if (data.byteLength !== entry.bytes || zeroPdfHash(data) !== entry.sha256)
          throw new Error("bundle");
        return { entry, data };
      }),
    );
    if (zeroPdfHash(JSON.stringify(ZERO_PDF_BUNDLE)) !== ZERO_PDF_BUNDLE_SHA256)
      throw new Error("bundle");
    if (active.aborted) throw new Error("aborted");
    const target = `/tmp/${name}`;
    await mkdir(target, { mode: 0o700 });
    directory = target;
    await Promise.all(
      ["input", "profile", "docker"].map((part) =>
        mkdir(path.join(directory!, part), { mode: 0o700 }),
      ),
    );
    await writeFile(path.join(directory, "input/input.pdf"), bytes, { mode: 0o444, flag: "wx" });
    for (const { entry, data } of bundle)
      await writeFile(path.join(directory, "profile", entry.name), data, {
        mode: 0o444,
        flag: "wx",
      });
    await Promise.all(
      ["input", "profile"].map((part) => chmod(path.join(directory!, part), 0o555)),
    );
    const image = await capture(
      ["image", "inspect", "--format", "{{.Id}}", ZERO_PDF_IMAGE],
      active,
      duration,
      256,
    );
    if (image.code !== 0 || image.reason || image.stdout.trim() !== ZERO_PDF_IMAGE)
      throw new Error("image");
    if (active.aborted) throw new Error("aborted");
    await config.beforeDispatch?.();
    if (active.aborted) throw new Error("aborted");
    attempted = true;
    const execution = await capture([
      "run",
      "--pull=never",
      "--platform=linux/amd64",
      "--name",
      name,
      "--network=none",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--user=65534:65534",
      "--pids-limit=64",
      `--memory=${ZERO_PDF_LIMITS.memoryBytes}`,
      `--memory-swap=${ZERO_PDF_LIMITS.memoryBytes}`,
      `--cpus=${ZERO_PDF_LIMITS.threads}`,
      "--ipc=none",
      "--log-driver=none",
      "--ulimit",
      "nofile=128:128",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,nodev,size=16777216,mode=1777",
      "--mount",
      `type=bind,src=${path.join(directory, "input")},dst=/input,readonly`,
      "--mount",
      `type=bind,src=${path.join(directory, "profile")},dst=/profile,readonly`,
      "--env",
      "HOME=/tmp",
      "--env",
      "PYTHONDONTWRITEBYTECODE=1",
      "--env",
      "OMP_NUM_THREADS=2",
      "--env",
      "OPENBLAS_NUM_THREADS=2",
      "--entrypoint",
      "python",
      ZERO_PDF_IMAGE,
      "/profile/runner.py",
      "input.pdf",
    ]);
    if (execution.code !== 0 || execution.reason || active.aborted) throw new Error("execution");
    result = {
      state: "succeeded",
      output: parseZeroPdfOutput(execution.stdout, request.source.sha256),
    };
  } catch {
    result = signal.aborted
      ? { state: "cancelled", code: "PDF_CANCELLED" }
      : { state: "failed", code: active.aborted ? "PDF_RUNTIME_TIMEOUT" : "PDF_RUNTIME_FAILED" };
  } finally {
    const cleaned = !directory || (await cleanupZeroPdf(name, directory, attempted));
    // Preserve staging for operator reconciliation when container/staging absence is unknown.
    if (!cleaned) result = { state: "unknown", code: "PDF_CLEANUP_UNKNOWN", quarantineId: name };
  }
  if (
    result.state === "succeeded" &&
    (signal.aborted ||
      Date.now() - began >= ZERO_PDF_LIMITS.runtimeMs ||
      Date.now() >= Date.parse(request.deadline) ||
      Date.now() >= Date.parse(request.principal.expiresAt))
  )
    return signal.aborted
      ? { state: "cancelled", code: "PDF_CANCELLED" }
      : { state: "failed", code: "PDF_RUNTIME_TIMEOUT" };
  return result;
}
