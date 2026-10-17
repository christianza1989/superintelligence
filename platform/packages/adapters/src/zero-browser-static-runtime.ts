import { randomUUID } from "node:crypto";
import { lstat, opendir, realpath } from "node:fs/promises";
import path from "node:path";
import type { ZeroBrowserExtraction } from "./zero-browser-contract.js";
import {
  ZERO_BROWSER_STATIC_LIMITS,
  zeroBrowserExtractionSchema,
  zeroBrowserHash,
  zeroBrowserRequestSchema,
} from "./zero-browser-contract.js";
import { zeroBrowserDockerRunArguments } from "./zero-browser-docker.js";
import { captureZeroDockerProcess } from "./zero-docker-process.js";

export interface ZeroBrowserRuntimeConfig {
  dockerExecutable: string;
  dockerConfigDirectory: string;
  imageId: string;
  buildInputLockSha256: string;
  beforeDispatch?: () => Promise<void>;
}
export type ZeroBrowserRuntimeResult =
  | { state: "succeeded"; output: ZeroBrowserExtraction }
  | { state: "failed" | "cancelled"; code: string }
  | { state: "unknown"; code: "BROWSER_CLEANUP_UNKNOWN"; quarantineId: string };

/** Pinned image, sealed stdin bytes and fixed argv. No host files are mounted. */
export async function executeZeroBrowser(
  config: ZeroBrowserRuntimeConfig,
  input: { request: unknown; requestDigest: string; bytes: Uint8Array },
  signal: AbortSignal,
): Promise<ZeroBrowserRuntimeResult> {
  const began = Date.now();
  if (input.bytes.byteLength > ZERO_BROWSER_STATIC_LIMITS.inputBytes)
    throw new Error("component_browser_request_rejected");
  const request = zeroBrowserRequestSchema.parse(input.request);
  const bytes = Buffer.from(input.bytes);
  if (
    process.platform !== "linux" ||
    !process.getuid ||
    process.getuid() === 0 ||
    !path.isAbsolute(config.dockerExecutable) ||
    !path.isAbsolute(config.dockerConfigDirectory) ||
    request.imageId !== config.imageId ||
    request.buildInputLockSha256 !== config.buildInputLockSha256 ||
    zeroBrowserHash(JSON.stringify(request)) !== input.requestDigest ||
    bytes.length !== request.source.bytes ||
    bytes.length > ZERO_BROWSER_STATIC_LIMITS.inputBytes ||
    zeroBrowserHash(bytes) !== request.source.sha256 ||
    Date.parse(request.deadline) <= began ||
    Date.parse(request.deadline) - began > 600_000 ||
    Date.parse(request.deadline) > Date.parse(request.principal.expiresAt) ||
    Date.parse(request.principal.expiresAt) <= began
  )
    throw new Error("component_browser_request_rejected");
  const directory = await realpath(config.dockerConfigDirectory);
  const info = await lstat(directory);
  if (
    directory !== config.dockerConfigDirectory ||
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid() ||
    (info.mode & 0o777) !== 0o700
  )
    throw new Error("component_browser_config_rejected");
  for await (const _entry of await opendir(directory))
    throw new Error("component_browser_config_rejected");
  const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const name = `zero-browser-${randomUUID()}`;
  const operation = zeroBrowserHash(JSON.stringify([request.source.sha256, input.requestDigest]));
  const active = AbortSignal.any([
    signal,
    AbortSignal.timeout(
      Math.max(
        1,
        Math.min(
          15_000,
          Date.parse(request.deadline) - began,
          Date.parse(request.principal.expiresAt) - began,
        ),
      ),
    ),
  ]);
  const capture = (
    args: string[],
    operationSignal = active,
    timeout = 15_000,
    cap: number = ZERO_BROWSER_STATIC_LIMITS.artifactBytes,
    stdin = "",
  ) =>
    captureZeroDockerProcess(
      config.dockerExecutable,
      args,
      directory,
      stdin,
      operationSignal,
      timeout,
      cap,
    );
  let attempted = false;
  let result: ZeroBrowserRuntimeResult = { state: "failed", code: "BROWSER_RUNTIME_FAILED" };
  try {
    const image = await capture(
      ["image", "inspect", "--format", "{{.Id}}", config.imageId],
      active,
      3000,
      256,
    );
    if (image.code !== 0 || image.reason || image.stdout.trim() !== config.imageId)
      throw new Error("image");
    await config.beforeDispatch?.();
    active.throwIfAborted();
    attempted = true;
    const run = await capture(
      zeroBrowserDockerRunArguments(config.imageId, name, operation),
      active,
      15_000,
      ZERO_BROWSER_STATIC_LIMITS.artifactBytes,
      JSON.stringify({ html, sourceSha256: request.source.sha256 }),
    );
    if (run.code !== 0 || run.reason || active.aborted) throw new Error("execution");
    const output = zeroBrowserExtractionSchema.parse(JSON.parse(run.stdout));
    if (output.sourceSha256 !== request.source.sha256) throw new Error("output");
    result = { state: "succeeded", output };
  } catch {
    result = signal.aborted
      ? { state: "cancelled", code: "BROWSER_CANCELLED" }
      : {
          state: "failed",
          code: active.aborted ? "BROWSER_RUNTIME_TIMEOUT" : "BROWSER_RUNTIME_FAILED",
        };
  } finally {
    if (attempted) {
      const cleanup = AbortSignal.timeout(3000);
      await capture(["container", "rm", "--force", name], cleanup, 1500, 4096).catch(
        () => undefined,
      );
      const absent = await capture(
        ["container", "ls", "--all", "--quiet", "--filter", `name=^/${name}$`],
        cleanup,
        1500,
        4096,
      ).catch(() => null);
      if (absent?.code !== 0 || absent.reason || absent.stdout.trim())
        result = { state: "unknown", code: "BROWSER_CLEANUP_UNKNOWN", quarantineId: name };
    }
  }
  if (
    result.state === "succeeded" &&
    (signal.aborted ||
      Date.now() - began >= ZERO_BROWSER_STATIC_LIMITS.runtimeMs ||
      Date.now() >= Date.parse(request.deadline) ||
      Date.now() >= Date.parse(request.principal.expiresAt))
  )
    return { state: "failed", code: "BROWSER_RUNTIME_TIMEOUT" };
  return result;
}
