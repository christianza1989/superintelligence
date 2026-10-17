import { createHash, randomUUID } from "node:crypto";
import { lstat, opendir, realpath } from "node:fs/promises";
import path from "node:path";
import type { AdapterContext, ArtifactStore } from "@rakazo/adapter-kit";
import { z } from "zod";
import type { ZeroBrowserResearchReceipt } from "./zero-browser-research.js";
import { isZeroBrowserFixtureUrl, ZERO_BROWSER_RESEARCH_LIMITS } from "./zero-browser-research.js";
import {
  ZERO_BROWSER_FIXTURES,
  ZERO_BROWSER_RESEARCH_PROFILE,
  ZERO_BROWSER_RESEARCH_TASKS,
} from "./zero-browser-research-profile.js";
import { captureZeroDockerProcess } from "./zero-docker-process.js";

export const ZERO_BROWSER_DOCKER_PROFILE = "zero-browser-docker-v1";
export const ZERO_BROWSER_DOCKER_LIMITS = Object.freeze({
  cpus: 2,
  memoryBytes: 536_870_912,
  pids: 128,
  tmpfsBytes: 134_217_728,
  wallMs: 15_000,
  cleanupMs: 3000,
  outputBytes: 4_194_304,
  imageBytes: 943_718_400,
});
const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const fixtureUrl = z
  .string()
  .max(256)
  .refine((value) => isZeroBrowserFixtureUrl(value));
const artifactSchema = z.object({
  storageKey: z.string().uuid(),
  sha256: digest,
  bytes: z.number().int().min(1).max(1_048_576),
});
const receiptSchema = z
  .object({
    profile: z.literal(ZERO_BROWSER_RESEARCH_PROFILE),
    taskId: z.string().max(64),
    outcome: z.enum(["pass", "fail", "blocked", "cancelled", "unknown"]),
    reason: z
      .string()
      .max(128)
      .regex(/^(?:browser_|fixed_dom_assertion_|principal_)[a-z_]+$/u),
    assertion: z
      .object({ expected: z.string().max(4096), actual: z.string().max(4096), passed: z.boolean() })
      .strict()
      .optional(),
    sourceSetSha256: digest,
    taskSha256: digest,
    pages: z
      .array(
        z.object({ url: fixtureUrl, title: z.string().max(512), sourceSha256: digest }).strict(),
      )
      .max(4),
    sources: z
      .array(
        z
          .object({ url: fixtureUrl, sha256: digest, bytes: z.number().int().min(0).max(16_384) })
          .strict(),
      )
      .max(16),
    events: z
      .array(
        z
          .object({ kind: z.enum(["resource", "navigate", "act"]), value: z.string().max(256) })
          .strict(),
      )
      .max(64),
    actualUse: z
      .object({
        provider: z.literal("computer"),
        navigate: z.number().int().min(0).max(1),
        snapshot: z.number().int().min(0).max(4),
        act: z.number().int().min(0).max(4),
      })
      .strict(),
    runtime: z
      .object({
        playwright: z.literal("1.63.0"),
        chromium: z.literal("153.0.8010.12").nullable(),
        cleanup: z.enum(["not_started", "closed", "force_killed", "unknown"]),
      })
      .strict(),
    screenshotArtifact: artifactSchema
      .extend({ mimeType: z.literal("image/png") })
      .strict()
      .optional(),
    traceArtifact: artifactSchema
      .extend({ mimeType: z.literal("application/zip") })
      .strict()
      .optional(),
    limits: z.custom<typeof ZERO_BROWSER_RESEARCH_LIMITS>(
      (value) => JSON.stringify(value) === JSON.stringify(ZERO_BROWSER_RESEARCH_LIMITS),
    ),
    paidModelCalls: z.literal(0),
    limitations: z.array(z.string().max(512)).max(8),
  })
  .strict();
const capsuleSchema = z
  .object({
    nodeVersion: z.literal("24.22.0"),
    receipt: receiptSchema,
    artifacts: z
      .array(z.object({ id: z.string().uuid(), base64: z.string().max(1_398_104) }).strict())
      .max(2),
  })
  .strict();

export interface ZeroBrowserDockerConfig {
  dockerExecutable: string;
  /** Empty canonical mode-0700 operator-owned directory; no inherited Docker credentials. */
  dockerConfigDirectory: string;
  imageId: string;
  buildInputLockSha256: string;
  authorize: (context: AdapterContext) => Promise<void>;
}
export interface ZeroBrowserDockerReceipt {
  profile: typeof ZERO_BROWSER_DOCKER_PROFILE;
  imageId: string;
  buildInputLockSha256: string;
  outcome: "pass" | "fail" | "blocked" | "cancelled" | "unknown";
  reason: string;
  runtime: {
    nodeVersion: string | null;
    cleanup: "not_started" | "container_exited" | "force_removed" | "unknown";
  };
  research?: ZeroBrowserResearchReceipt;
  limits: typeof ZERO_BROWSER_DOCKER_LIMITS;
  limitations: string[];
  paidModelCalls: 0;
}

/** Fixed operator profile, also used by the gated resource-enforcement qualification. */
export function zeroBrowserDockerRunArguments(imageId: string, name: string, operationTag: string) {
  if (
    !/^sha256:[a-f0-9]{64}$/u.test(imageId) ||
    !/^zero-browser-[a-f0-9-]{36}$/u.test(name) ||
    !/^[a-f0-9]{64}$/u.test(operationTag)
  )
    throw new Error("browser_operator_config_rejected");
  return [
    "run",
    "--pull=never",
    "--rm",
    "--init",
    "--name",
    name,
    `--label=org.repositoryzero.browser.operation=${operationTag}`,
    "--network=none",
    "--ipc=none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--user=1000:1000",
    "--memory=512m",
    "--memory-swap=512m",
    "--cpus=2",
    "--pids-limit=128",
    "--ulimit=nofile=256:256",
    "--ulimit=cpu=20:20",
    "--ulimit=fsize=4194304:4194304",
    "--log-driver=none",
    "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=134217728",
    "-i",
    imageId,
  ];
}

async function validate(config: ZeroBrowserDockerConfig) {
  if (
    process.platform !== "linux" ||
    !process.getuid ||
    process.getuid() === 0 ||
    !path.isAbsolute(config.dockerExecutable) ||
    [...config.dockerExecutable].some((character) => character.charCodeAt(0) < 32) ||
    !/^sha256:[a-f0-9]{64}$/u.test(config.imageId) ||
    !/^[a-f0-9]{64}$/u.test(config.buildInputLockSha256) ||
    !path.isAbsolute(config.dockerConfigDirectory) ||
    (await realpath(config.dockerConfigDirectory)) !== config.dockerConfigDirectory
  )
    throw new Error("browser_operator_config_rejected");
  const directory = await lstat(config.dockerConfigDirectory);
  if (
    !directory.isDirectory() ||
    directory.uid !== process.getuid() ||
    (directory.mode & 0o777) !== 0o700
  )
    throw new Error("browser_operator_config_rejected");
  for await (const _entry of await opendir(config.dockerConfigDirectory))
    throw new Error("browser_operator_config_rejected");
}

/** One fixed image invocation. Grant checks and artifact publication remain host-owned. */
export async function runZeroBrowserDocker(
  supplied: ZeroBrowserDockerConfig,
  input: unknown,
  context: AdapterContext,
  artifacts: ArtifactStore,
): Promise<ZeroBrowserDockerReceipt> {
  const taskInput = z
    .object({ taskId: z.enum(ZERO_BROWSER_RESEARCH_TASKS.map((task) => task.id)) })
    .strict()
    .safeParse(input);
  if (!taskInput.success) throw new Error("browser_request_rejected");
  const config = Object.freeze({ ...supplied });
  const result: ZeroBrowserDockerReceipt = {
    profile: ZERO_BROWSER_DOCKER_PROFILE,
    imageId: config.imageId,
    buildInputLockSha256: config.buildInputLockSha256,
    outcome: "unknown",
    reason: "browser_not_started",
    runtime: { nodeVersion: null, cleanup: "not_started" },
    limits: ZERO_BROWSER_DOCKER_LIMITS,
    paidModelCalls: 0,
    limitations: [
      "Fixed synthetic development fixtures and grader; no independent holdout or general research-quality guarantee",
      "Container CPU/RAM/PID/tmpfs limits apply; Docker daemon and pinned image remain trusted",
      "The contained adapter's local-only limitations do not describe the outer Docker resource enforcement",
      "Screenshot appearance and deterministic DOM assertions are distinct evidence",
      "Host grant/filesystem checks remain cooperative; durable publication and lifetime storage admission belong to the application service",
    ],
  };
  const signal = AbortSignal.any([
    context.signal,
    AbortSignal.timeout(ZERO_BROWSER_DOCKER_LIMITS.wallMs),
  ]);
  const scoped = { ...context, signal };
  const name = `zero-browser-${randomUUID()}`;
  let started = false;
  let denied = false;
  const stored: string[] = [];
  const authorized = async () => {
    signal.throwIfAborted();
    try {
      await config.authorize(scoped);
    } catch {
      denied = true;
      throw new Error("browser_scope_rejected");
    }
    signal.throwIfAborted();
  };
  const invoke = (
    args: string[],
    request = "",
    active = signal,
    timeout: number = ZERO_BROWSER_DOCKER_LIMITS.wallMs,
  ) =>
    captureZeroDockerProcess(
      config.dockerExecutable,
      ["--host", "unix:///var/run/docker.sock", ...args],
      config.dockerConfigDirectory,
      request,
      active,
      timeout,
      ZERO_BROWSER_DOCKER_LIMITS.outputBytes,
    );
  const discard = async () => {
    const cleanupContext = {
      ...context,
      signal: AbortSignal.timeout(ZERO_BROWSER_DOCKER_LIMITS.cleanupMs),
    };
    await Promise.all(
      stored.map((id) => artifacts.remove(id, cleanupContext).catch(() => undefined)),
    );
    delete result.research;
  };
  try {
    await authorized();
    await validate(config);
    const inspected = await invoke(["image", "inspect", config.imageId]);
    if (inspected.code !== 0 || inspected.reason) throw new Error("browser_image_unavailable");
    const [image] = JSON.parse(inspected.stdout);
    if (
      image.Id !== config.imageId ||
      !Number.isSafeInteger(image.Size) ||
      image.Size <= 0 ||
      image.Size > ZERO_BROWSER_DOCKER_LIMITS.imageBytes ||
      image.Config?.User !== "1000:1000" ||
      image.Config?.Labels?.["org.repositoryzero.browser.profile"] !==
        "zero-browser-shell-image-v1" ||
      image.Config?.Labels?.["org.repositoryzero.browser.input-lock-sha256"] !==
        config.buildInputLockSha256
    )
      throw new Error("browser_image_binding_mismatch");
    await authorized();
    started = true;
    result.runtime.cleanup = "unknown";
    const execution = await invoke(
      zeroBrowserDockerRunArguments(config.imageId, name, hash(context.operationId)),
      JSON.stringify(taskInput.data),
    );
    if (execution.code === 0) result.runtime.cleanup = "container_exited";
    if (execution.reason || execution.code !== 0) throw new Error("browser_container_failed");
    const decoded = capsuleSchema.parse(JSON.parse(execution.stdout));
    const task = ZERO_BROWSER_RESEARCH_TASKS.find(
      (candidate) => candidate.id === taskInput.data.taskId,
    )!;
    const research = decoded.receipt;
    const sourceSetSha256 = hash(
      JSON.stringify(
        Object.entries(ZERO_BROWSER_FIXTURES)
          .map(([url, html]) => [url, hash(html)])
          .sort(),
      ),
    );
    if (
      research.taskId !== task.id ||
      research.taskSha256 !== hash(JSON.stringify(task)) ||
      research.sourceSetSha256 !== sourceSetSha256
    )
      throw new Error("browser_fixture_binding_mismatch");
    if (
      (research.outcome === "pass" || research.outcome === "fail") &&
      (!research.assertion ||
        research.assertion.expected !== task.expected ||
        research.assertion.passed !== (research.assertion.actual === task.expected) ||
        (research.outcome === "pass") !== research.assertion.passed ||
        research.actualUse.navigate !== 1 ||
        research.actualUse.snapshot !== task.actions.length ||
        research.actualUse.act !== task.actions.length ||
        research.runtime.cleanup !== "closed" ||
        !research.screenshotArtifact ||
        !research.traceArtifact)
    )
      throw new Error("browser_result_binding_mismatch");
    const expected = [research.screenshotArtifact, research.traceArtifact].filter(
      (entry) => entry !== undefined,
    );
    if (
      expected.length !== decoded.artifacts.length ||
      new Set(decoded.artifacts.map((entry) => entry.id)).size !== decoded.artifacts.length
    )
      throw new Error("browser_artifact_binding_mismatch");
    for (const artifact of expected) {
      const encoded = decoded.artifacts.find((entry) => entry.id === artifact.storageKey)?.base64;
      if (!encoded) throw new Error("browser_artifact_binding_mismatch");
      const bytes = Buffer.from(encoded, "base64");
      if (
        bytes.toString("base64") !== encoded ||
        bytes.length !== artifact.bytes ||
        hash(bytes) !== artifact.sha256 ||
        (artifact.mimeType === "image/png"
          ? !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : bytes.subarray(0, 2).toString() !== "PK")
      )
        throw new Error("browser_artifact_binding_mismatch");
      await authorized();
      const saved = await artifacts.put(
        {
          name: artifact.mimeType === "image/png" ? "browser-screenshot.png" : "browser-trace.zip",
          mimeType: artifact.mimeType,
          bytes,
        },
        scoped,
      );
      stored.push(saved.id);
      artifact.storageKey = saved.id;
    }
    await authorized();
    result.research = research;
    result.runtime.nodeVersion = decoded.nodeVersion;
    result.outcome = research.outcome;
    result.reason = research.reason;
  } catch (error) {
    await discard();
    result.outcome = context.signal.aborted ? "cancelled" : signal.aborted ? "unknown" : "blocked";
    result.reason = context.signal.aborted
      ? "principal_cancelled"
      : signal.aborted
        ? "browser_wall_limit_exceeded"
        : error instanceof Error && /^browser_[a-z_]+$/u.test(error.message)
          ? error.message
          : "browser_boundary_rejected";
  } finally {
    if (started) {
      const cleanup = await invoke(
        ["rm", "--force", name],
        "",
        AbortSignal.timeout(ZERO_BROWSER_DOCKER_LIMITS.cleanupMs),
        ZERO_BROWSER_DOCKER_LIMITS.cleanupMs,
      );
      if (cleanup.code === 0) result.runtime.cleanup = "force_removed";
      if (result.runtime.cleanup === "unknown") {
        await discard();
        result.outcome = "unknown";
        result.reason = "browser_cleanup_unconfirmed";
      }
    }
  }
  if (!denied && (result.outcome === "pass" || result.outcome === "fail")) {
    try {
      await authorized();
    } catch {
      await discard();
      result.outcome = context.signal.aborted ? "cancelled" : "blocked";
      result.reason = "browser_scope_rejected";
    }
  }
  return result;
}
