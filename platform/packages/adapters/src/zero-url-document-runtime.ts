import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { zeroBrowserDockerRunArguments } from "./zero-browser-docker.js";
import { captureZeroDockerProcess } from "./zero-docker-process.js";
import type { ZeroUrlDocumentOutput } from "./zero-url-document-contract.js";
import {
  urlDocumentHash,
  ZERO_URL_DOCUMENT_LIMITS,
  ZERO_URL_DOCUMENT_PROFILE,
  zeroUrlDocumentOutputSchema,
  zeroUrlDocumentPayloadSchema,
} from "./zero-url-document-contract.js";

export interface ZeroUrlDocumentRuntimeConfig {
  dockerExecutable: string;
  dockerConfigDirectory: string;
  imageId: string;
  buildInputLockSha256: string;
  /** Release-owned canonical directory, mode0700, containing read-only runner.js. */
  runnerDirectory: string;
  /** Release/operator pin; never accepted from a job/tool request. */
  runnerSha256: string;
  /** Current scoped authority, including during result delivery. No optional bypass. */
  authorize: (signal: AbortSignal) => Promise<void>;
}
export type ZeroUrlDocumentRuntimeResult =
  | {
      state: "succeeded";
      output: ZeroUrlDocumentOutput;
      imageId: string;
      runnerSha256: string;
      buildInputLockSha256: string;
      cleanup: "confirmed_absent";
      paidModelCalls: 0;
      limitations: readonly string[];
    }
  | {
      state: "failed" | "cancelled";
      code: "URL_DOCUMENT_REJECTED" | "URL_DOCUMENT_CANCELLED";
      cleanup: "not_started" | "confirmed_absent";
      paidModelCalls: 0;
    }
  | {
      state: "unknown";
      code: "URL_DOCUMENT_CLEANUP_UNKNOWN";
      quarantineId: string;
      cleanup: "unknown";
      paidModelCalls: 0;
    };
const publicInput = z
  .object({
    source: z.object({ url: z.string(), sha256: z.string(), bytes: z.number() }).strict(),
    contentBase64: z.string().max(4 * Math.ceil(ZERO_URL_DOCUMENT_LIMITS.sourceBytes / 3)),
  })
  .strict();
const digest = /^[a-f0-9]{64}$/u;

/** Cancellation must settle even when a cooperating grant callback is slow or stalled. */
async function guarded<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error("document_aborted"));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return operation();
      })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
}
async function ownedDirectory(directory: string) {
  if (!path.isAbsolute(directory) || (await realpath(directory)) !== directory)
    throw new Error("directory");
  const stat = await lstat(directory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid!() ||
    (stat.mode & 0o777) !== 0o700
  )
    throw new Error("directory");
}
async function loadRunner(directory: string, expected: string) {
  await ownedDirectory(directory);
  const file = await open(
    path.join(directory, "runner.js"),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.uid !== process.getuid!() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o777) !== 0o400 ||
      stat.size < 1 ||
      stat.size > ZERO_URL_DOCUMENT_LIMITS.runnerBytes
    )
      throw new Error("runner");
    // Snapshot-sized allocation and reads stay bounded even if the owner grows the file.
    // The extra byte proves EOF at the original size; never follow a moving EOF.
    const buffer = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    const bytes = buffer.subarray(0, length);
    const after = await file.stat();
    if (
      bytes.length !== stat.size ||
      !after.isFile() ||
      after.uid !== stat.uid ||
      after.nlink !== stat.nlink ||
      after.mode !== stat.mode ||
      after.dev !== stat.dev ||
      after.ino !== stat.ino ||
      after.size !== stat.size ||
      after.mtimeMs !== stat.mtimeMs ||
      after.ctimeMs !== stat.ctimeMs ||
      urlDocumentHash(bytes) !== expected
    )
      throw new Error("runner");
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally {
    await file.close();
  }
}

/** Existing isolated image, fixed Node argv, release-pinned code and captured HTML data only. */
export async function executeZeroUrlDocument(
  supplied: ZeroUrlDocumentRuntimeConfig,
  input: unknown,
  signal: AbortSignal,
): Promise<ZeroUrlDocumentRuntimeResult> {
  const config = Object.freeze({ ...supplied });
  const active = AbortSignal.any([signal, AbortSignal.timeout(ZERO_URL_DOCUMENT_LIMITS.runtimeMs)]);
  const name = `zero-browser-${randomUUID()}`;
  let attempted = false;
  let result: ZeroUrlDocumentRuntimeResult = {
    state: "failed",
    code: "URL_DOCUMENT_REJECTED",
    cleanup: "not_started",
    paidModelCalls: 0,
  };
  const capture = (
    args: string[],
    operationSignal = active,
    timeout = 3000,
    cap = 4096,
    stdin = "",
  ) =>
    captureZeroDockerProcess(
      config.dockerExecutable,
      args,
      config.dockerConfigDirectory,
      stdin,
      operationSignal,
      timeout,
      cap,
    );
  const authorize = () => guarded(() => config.authorize(active), active);
  try {
    if (
      process.platform !== "linux" ||
      !process.getuid ||
      process.getuid() === 0 ||
      !path.isAbsolute(config.dockerExecutable) ||
      [...config.dockerExecutable].some(
        (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
      ) ||
      !/^sha256:[a-f0-9]{64}$/u.test(config.imageId) ||
      !digest.test(config.buildInputLockSha256) ||
      !digest.test(config.runnerSha256) ||
      typeof config.authorize !== "function"
    )
      throw new Error("config");
    const parsed = publicInput.parse(input);
    const payload = zeroUrlDocumentPayloadSchema.parse({
      ...parsed,
      profile: ZERO_URL_DOCUMENT_PROFILE,
      nonce: randomUUID(),
    });
    await authorize();
    await guarded(() => ownedDirectory(config.dockerConfigDirectory), active);
    for await (const _entry of await opendir(config.dockerConfigDirectory))
      throw new Error("docker_config");
    const runner = await guarded(
      () => loadRunner(config.runnerDirectory, config.runnerSha256),
      active,
    );
    const inspected = await capture(
      [
        "image",
        "inspect",
        "--format",
        '{{.Id}} {{index .Config.Labels "org.repositoryzero.browser.input-lock-sha256"}}',
        config.imageId,
      ],
      active,
      3000,
      256,
    );
    if (
      inspected.code !== 0 ||
      inspected.reason ||
      inspected.stdout.trim() !== `${config.imageId} ${config.buildInputLockSha256}`
    )
      throw new Error("image");
    await authorize();
    const base = zeroBrowserDockerRunArguments(
      config.imageId,
      name,
      urlDocumentHash(JSON.stringify(payload)),
    );
    const cpu = base.indexOf("--cpus=2");
    if (cpu < 0 || base.lastIndexOf("--cpus=2") !== cpu) throw new Error("cpu");
    base[cpu] = "--cpus=1";
    const scratch = base.indexOf("--ulimit=fsize=4194304:4194304");
    if (scratch < 0 || base.filter((arg) => arg.startsWith("--ulimit=fsize=")).length !== 1)
      throw new Error("scratch_file_limit");
    base[scratch] =
      `--ulimit=fsize=${ZERO_URL_DOCUMENT_LIMITS.scratchFileBytes}:${ZERO_URL_DOCUMENT_LIMITS.scratchFileBytes}`;
    const script =
      'import { createRequire } from "node:module"; const require = createRequire("/opt/zero-browser/entrypoint.mjs");\n' +
      runner +
      "\nawait zeroCapturedDocumentEntry.runCapturedUrlDocument(" +
      JSON.stringify(payload) +
      ').catch(() => { process.stderr.write("url_document_failed\\n"); process.exitCode = 1; });\n';
    if (Buffer.byteLength(script) > ZERO_URL_DOCUMENT_LIMITS.capsuleBytes)
      throw new Error("capsule");
    active.throwIfAborted();
    attempted = true;
    const run = await capture(
      [
        ...base.slice(0, -1),
        "--entrypoint=/usr/local/bin/node",
        config.imageId,
        "--max-old-space-size=128",
        "--input-type=module",
        "-",
      ],
      active,
      ZERO_URL_DOCUMENT_LIMITS.browserMs,
      ZERO_URL_DOCUMENT_LIMITS.outputBytes,
      script,
    );
    if (run.code !== 0 || run.reason) throw new Error("execution");
    await authorize();
    const output = zeroUrlDocumentOutputSchema.parse(JSON.parse(run.stdout));
    if (
      output.nonce !== payload.nonce ||
      JSON.stringify(output.source) !== JSON.stringify(payload.source)
    )
      throw new Error("binding");
    result = {
      state: "succeeded",
      output,
      imageId: config.imageId,
      runnerSha256: config.runnerSha256,
      buildInputLockSha256: config.buildInputLockSha256,
      cleanup: "confirmed_absent",
      paidModelCalls: 0,
      limitations: [
        "Original-URL captured-response replay; no browser live TLS fetch or interactive browsing",
        "No original-page fidelity; scripts and resources are disabled",
        "First visible paragraph is an observed source quote, not general semantic reasoning",
      ],
    };
  } catch {
    result = {
      state: signal.aborted ? "cancelled" : "failed",
      code: signal.aborted ? "URL_DOCUMENT_CANCELLED" : "URL_DOCUMENT_REJECTED",
      cleanup: "not_started",
      paidModelCalls: 0,
    };
  } finally {
    if (attempted) {
      const cleanup = AbortSignal.timeout(ZERO_URL_DOCUMENT_LIMITS.cleanupMs);
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
        result = {
          state: "unknown",
          code: "URL_DOCUMENT_CLEANUP_UNKNOWN",
          quarantineId: name,
          cleanup: "unknown",
          paidModelCalls: 0,
        };
      else result.cleanup = "confirmed_absent";
    }
  }
  if (result.state === "succeeded") {
    try {
      await authorize();
    } catch {
      return {
        state: signal.aborted ? "cancelled" : "failed",
        code: signal.aborted ? "URL_DOCUMENT_CANCELLED" : "URL_DOCUMENT_REJECTED",
        cleanup: "confirmed_absent",
        paidModelCalls: 0,
      };
    }
  }
  return result;
}
