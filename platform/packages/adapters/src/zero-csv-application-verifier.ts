import { randomUUID } from "node:crypto";
import { lstat, opendir, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  ZERO_CSV_APPLICATION_LIMITS,
  ZERO_CSV_APPLICATION_PROFILE,
} from "./zero-csv-application-contract.js";
import { ZERO_CSV_APPLICATION_HARNESS } from "./zero-csv-application-harness.js";
import type { ZeroCsvApplicationWorkspace } from "./zero-csv-application.js";
import { createZeroCsvApplicationWorkspace } from "./zero-csv-application.js";
import { prepareZeroCsvComponent, zeroCsvHash } from "./zero-csv-profile.js";
import { zeroBrowserDockerRunArguments } from "./zero-browser-docker.js";
import { captureZeroDockerProcess } from "./zero-docker-process.js";

export interface ZeroCsvApplicationVerifierConfig {
  dockerExecutable: string;
  /** Empty operator-owned mode-0700 directory; never inherited Docker credentials. */
  dockerConfigDirectory: string;
  imageId: string;
  buildInputLockSha256: string;
  /** Exact repository attribution loaded by the trusted composition root. */
  attribution: { license: string; notice: string };
  beforeDispatch?: () => Promise<void>;
}
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const resultSchema = z
  .object({
    nonce: z.string().uuid(),
    manifestSha256: digest,
    inputSha256: digest,
    build: z
      .object({
        kind: z.literal("native-esm-no-install"),
        modules: z.literal(4),
        outcome: z.literal("pass"),
      })
      .strict(),
    checks: z
      .array(z.object({ name: z.string().max(80), passed: z.literal(true) }).strict())
      .min(20)
      .max(64),
    screenshots: z
      .array(
        z
          .object({
            viewport: z.enum(["desktop", "mobile"]),
            mimeType: z.literal("image/png"),
            bytes: z.number().int().min(8).max(ZERO_CSV_APPLICATION_LIMITS.screenshotBytes),
            sha256: digest,
            contentBase64: z.string().max(1_398_104),
          })
          .strict(),
      )
      .length(2),
    actualUse: z
      .object({
        scope: z.literal("fixed-source-module-import-boundary"),
        entrypoint: z.literal("csvParseRows"),
        calls: z.array(z.object({ inputSha256: digest, outputSha256: digest }).strict()).length(4),
      })
      .strict(),
    runtime: z
      .object({
        node: z.string().regex(/^\d+\.\d+\.\d+$/u),
        chromium: z.string().max(64),
        networkAttempts: z.literal(0),
        pageErrors: z.literal(0),
      })
      .strict(),
    limitations: z.array(z.string().max(256)).max(4),
  })
  .strict();
export type ZeroCsvApplicationVerification =
  | {
      profile: typeof ZERO_CSV_APPLICATION_PROFILE;
      outcome: "pass";
      imageId: string;
      buildInputLockSha256: string;
      harnessSha256: string;
      workspaceManifestSha256: string;
      evidence: z.infer<typeof resultSchema>;
      cleanup: "confirmed_absent";
      paidModelCalls: 0;
    }
  | {
      profile: typeof ZERO_CSV_APPLICATION_PROFILE;
      outcome: "fail" | "cancelled" | "unknown";
      reason:
        | "APPLICATION_RUNTIME_FAILED"
        | "APPLICATION_CANCELLED"
        | "APPLICATION_CLEANUP_UNKNOWN";
      cleanup: "not_started" | "confirmed_absent" | "unknown";
      paidModelCalls: 0;
    };

/**
 * Fixed source build + browser checks in the existing pinned browser image.
 * No host mounts, installation, source URLs, arbitrary argv or network access.
 * Source generation alone never manufactures a successful verification receipt.
 */
async function verifyCapturedCsvApplication(
  config: ZeroCsvApplicationVerifierConfig,
  input: { csv: string; workspace: ZeroCsvApplicationWorkspace },
  signal: AbortSignal,
): Promise<ZeroCsvApplicationVerification> {
  const began = Date.now();
  if (
    process.platform !== "linux" ||
    !process.getuid ||
    process.getuid() === 0 ||
    !path.isAbsolute(config.dockerExecutable) ||
    !path.isAbsolute(config.dockerConfigDirectory) ||
    !/^sha256:[a-f0-9]{64}$/u.test(config.imageId) ||
    !/^[a-f0-9]{64}$/u.test(config.buildInputLockSha256)
  )
    throw new Error("application_verifier_config_rejected");
  const directory = await realpath(config.dockerConfigDirectory);
  const info = await lstat(directory);
  if (
    directory !== config.dockerConfigDirectory ||
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid() ||
    (info.mode & 0o777) !== 0o700
  )
    throw new Error("application_verifier_config_rejected");
  for await (const _entry of await opendir(directory))
    throw new Error("application_verifier_config_rejected");

  // Recreate exact approved bytes before dispatch; a rehashed caller-crafted tree is not a recipe.
  const expected = createZeroCsvApplicationWorkspace(
    input.csv,
    await prepareZeroCsvComponent(),
    config.attribution,
  );
  if (JSON.stringify(expected) !== JSON.stringify(input.workspace))
    throw new Error("application_workspace_integrity_failed");
  signal.throwIfAborted();
  const active = AbortSignal.any([
    signal,
    AbortSignal.timeout(ZERO_CSV_APPLICATION_LIMITS.runtimeMs),
  ]);
  const name = "zero-browser-" + randomUUID();
  const operation = zeroCsvHash(
    JSON.stringify([ZERO_CSV_APPLICATION_PROFILE, expected.manifestSha256]),
  );
  const capture = (args: string[], runSignal = active, timeoutMs = 3000, cap = 4096, stdin = "") =>
    captureZeroDockerProcess(
      config.dockerExecutable,
      args,
      directory,
      stdin,
      runSignal,
      timeoutMs,
      cap,
    );
  let attempted = false;
  let result: ZeroCsvApplicationVerification = {
    profile: ZERO_CSV_APPLICATION_PROFILE,
    outcome: "fail",
    reason: "APPLICATION_RUNTIME_FAILED",
    cleanup: "not_started",
    paidModelCalls: 0,
  };
  try {
    const image = await capture(
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
      image.code !== 0 ||
      image.reason ||
      image.stdout.trim() !== config.imageId + " " + config.buildInputLockSha256
    )
      throw new Error("application_image_rejected");
    await config.beforeDispatch?.();
    active.throwIfAborted();
    const nonce = randomUUID();
    const args = zeroBrowserDockerRunArguments(config.imageId, name, operation);
    args[args.indexOf("--cpus=2")] = "--cpus=1";
    const runArgs = [
      ...args.slice(0, -1),
      "--entrypoint=/usr/local/bin/node",
      config.imageId,
      "--experimental-vm-modules",
      "--max-old-space-size=128",
      "--input-type=module",
      "-e",
      ZERO_CSV_APPLICATION_HARNESS,
    ];
    const payload = JSON.stringify({
      files: expected.files,
      manifestSha256: expected.manifestSha256,
      inputSha256: expected.manifest.inputSha256,
      nonce,
    });
    if (Buffer.byteLength(payload) > ZERO_CSV_APPLICATION_LIMITS.capsuleBytes)
      throw new Error("application_capsule_rejected");
    attempted = true;
    const run = await capture(
      runArgs,
      active,
      ZERO_CSV_APPLICATION_LIMITS.browserMs,
      ZERO_CSV_APPLICATION_LIMITS.artifactBytes,
      payload,
    );
    if (run.code !== 0 || run.reason || active.aborted)
      throw new Error("application_execution_rejected");
    const evidence = resultSchema.parse(JSON.parse(run.stdout));
    if (
      evidence.nonce !== nonce ||
      evidence.manifestSha256 !== expected.manifestSha256 ||
      evidence.inputSha256 !== expected.manifest.inputSha256 ||
      new Set(evidence.screenshots.map((image) => image.viewport)).size !== 2 ||
      evidence.screenshots.reduce((sum, image) => sum + image.bytes, 0) >
        ZERO_CSV_APPLICATION_LIMITS.screenshotBytes
    )
      throw new Error("application_evidence_rejected");
    for (const image of evidence.screenshots) {
      const bytes = Buffer.from(image.contentBase64, "base64");
      if (
        bytes.length !== image.bytes ||
        zeroCsvHash(bytes) !== image.sha256 ||
        bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
      )
        throw new Error("application_evidence_rejected");
    }
    result = {
      profile: ZERO_CSV_APPLICATION_PROFILE,
      outcome: "pass",
      imageId: config.imageId,
      buildInputLockSha256: config.buildInputLockSha256,
      harnessSha256: zeroCsvHash(ZERO_CSV_APPLICATION_HARNESS),
      workspaceManifestSha256: expected.manifestSha256,
      evidence,
      cleanup: "confirmed_absent",
      paidModelCalls: 0,
    };
  } catch {
    result = {
      profile: ZERO_CSV_APPLICATION_PROFILE,
      outcome: signal.aborted ? "cancelled" : "fail",
      reason: signal.aborted ? "APPLICATION_CANCELLED" : "APPLICATION_RUNTIME_FAILED",
      cleanup: attempted ? "unknown" : "not_started",
      paidModelCalls: 0,
    };
  } finally {
    if (attempted) {
      const cleanup = AbortSignal.timeout(3000);
      await capture(["container", "rm", "--force", name], cleanup, 1500, 4096).catch(
        () => undefined,
      );
      const absent = await capture(
        ["container", "ls", "--all", "--quiet", "--filter", "name=^/" + name + "$"],
        cleanup,
        1500,
        4096,
      ).catch(() => null);
      if (absent?.code !== 0 || absent.reason || absent.stdout.trim())
        result = {
          profile: ZERO_CSV_APPLICATION_PROFILE,
          outcome: "unknown",
          reason: "APPLICATION_CLEANUP_UNKNOWN",
          cleanup: "unknown",
          paidModelCalls: 0,
        };
      else result.cleanup = "confirmed_absent";
    }
  }
  if (
    result.outcome === "pass" &&
    (signal.aborted || Date.now() - began >= ZERO_CSV_APPLICATION_LIMITS.runtimeMs)
  )
    return {
      profile: ZERO_CSV_APPLICATION_PROFILE,
      outcome: "cancelled",
      reason: "APPLICATION_CANCELLED",
      cleanup: result.cleanup,
      paidModelCalls: 0,
    };
  return result;
}

/** Redact pre-dispatch filesystem/package diagnostics as well as container errors. */
export async function verifyZeroCsvApplication(
  config: ZeroCsvApplicationVerifierConfig,
  input: { csv: string; workspace: ZeroCsvApplicationWorkspace },
  signal: AbortSignal,
): Promise<ZeroCsvApplicationVerification> {
  try {
    return await verifyCapturedCsvApplication(config, input, signal);
  } catch {
    return {
      profile: ZERO_CSV_APPLICATION_PROFILE,
      outcome: signal.aborted ? "cancelled" : "fail",
      reason: signal.aborted ? "APPLICATION_CANCELLED" : "APPLICATION_RUNTIME_FAILED",
      cleanup: "not_started",
      paidModelCalls: 0,
    };
  }
}
