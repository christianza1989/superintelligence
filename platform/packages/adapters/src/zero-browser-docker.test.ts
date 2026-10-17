import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AdapterContext } from "@rakazo/adapter-kit";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalArtifactStore } from "./artifacts.js";
import {
  runZeroBrowserDocker,
  ZERO_BROWSER_DOCKER_LIMITS,
  zeroBrowserDockerRunArguments,
} from "./zero-browser-docker.js";
import { ZERO_BROWSER_RESEARCH_TASKS } from "./zero-browser-research-profile.js";
import { captureZeroDockerProcess } from "./zero-docker-process.js";

const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "zero-browser-docker-"));
  directories.push(root);
  const dockerConfigDirectory = path.join(root, "docker");
  await mkdir(dockerConfigDirectory, { mode: 0o700 });
  const context: AdapterContext = {
    operationId: randomUUID(),
    traceId: randomUUID(),
    spaceId: "synthetic-space",
    userId: "synthetic-user",
    signal: new AbortController().signal,
  };
  return {
    root,
    context,
    artifacts: new LocalArtifactStore(path.join(root, "artifacts")),
    config: {
      dockerExecutable: "/usr/bin/docker",
      dockerConfigDirectory,
      imageId: process.env.ZERO_BROWSER_IMAGE_ID ?? `sha256:${"0".repeat(64)}`,
      buildInputLockSha256: process.env.ZERO_BROWSER_INPUT_LOCK_SHA256 ?? "0".repeat(64),
      authorize: vi.fn(async (_context: AdapterContext) => undefined),
    },
  };
}
async function save(label: string, value: unknown) {
  const root = process.env.ZERO_BROWSER_DOCKER_EVIDENCE_DIR;
  if (!root) return;
  await mkdir(root, { recursive: true, mode: 0o700 });
  await writeFile(path.join(root, `${label}.json`), JSON.stringify(value, null, 2), { flag: "wx" });
}

describe("sealed browser boundary (offline)", () => {
  it.each([
    { taskId: "article-fact", url: "file:///private" },
    { taskId: "article-fact", command: "sh" },
    { taskId: "article-fact", imageId: "foreign" },
    { taskId: "article-fact", userId: "foreign" },
    { taskId: "unknown" },
  ])("rejects caller authority and unrecognized task before dispatch", async (input) => {
    const f = await fixture();
    await expect(runZeroBrowserDocker(f.config, input, f.context, f.artifacts)).rejects.toThrow(
      "browser_request_rejected",
    );
    expect(f.config.authorize).not.toHaveBeenCalled();
  });
  it("keeps authorizer failures bounded and never starts", async () => {
    const f = await fixture();
    f.config.authorize.mockRejectedValueOnce(new Error("synthetic-private-marker"));
    const result = await runZeroBrowserDocker(
      f.config,
      { taskId: "article-fact" },
      f.context,
      f.artifacts,
    );
    expect(result).toMatchObject({
      outcome: "blocked",
      reason: "browser_scope_rejected",
      runtime: { cleanup: "not_started" },
    });
    expect(JSON.stringify(result)).not.toContain("synthetic-private-marker");
  });
  it("rejects writable inherited Docker configuration before image dispatch", async () => {
    const f = await fixture();
    await chmod(f.config.dockerConfigDirectory, 0o755);
    expect(
      await runZeroBrowserDocker(f.config, { taskId: "article-fact" }, f.context, f.artifacts),
    ).toMatchObject({
      outcome: "blocked",
      reason: "browser_operator_config_rejected",
      runtime: { cleanup: "not_started" },
    });
  });
  it("pins the finite launch policy and rejects interpolated operator arguments", () => {
    const args = zeroBrowserDockerRunArguments(
      `sha256:${"a".repeat(64)}`,
      `zero-browser-${randomUUID()}`,
      "b".repeat(64),
    );
    for (const flag of [
      "--network=none",
      "--read-only",
      "--cap-drop=ALL",
      "--memory=512m",
      "--pids-limit=128",
      "--cpus=2",
      "--user=1000:1000",
    ])
      expect(args).toContain(flag);
    expect(() => zeroBrowserDockerRunArguments("image;bad", "x", "x")).toThrow(
      "browser_operator_config_rejected",
    );
  });
});

const real = process.env.VERIFY_ZERO_BROWSER_DOCKER === "1" ? describe.sequential : describe.skip;
real("frozen sealed Chromium shell qualification", () => {
  it("binds the exact preparation image/input lock before frozen tasks", async () => {
    const profilePath = process.env.ZERO_BROWSER_IMAGE_PROFILE;
    const lockPath = process.env.ZERO_BROWSER_INPUT_LOCK;
    expect(profilePath).toBeTruthy();
    expect(lockPath).toBeTruthy();
    const profile = JSON.parse(await readFile(profilePath!, "utf8"));
    const lock = await readFile(lockPath!);
    expect(profile.image.id).toBe(process.env.ZERO_BROWSER_IMAGE_ID);
    expect(hash(lock)).toBe(process.env.ZERO_BROWSER_INPUT_LOCK_SHA256);
    expect(profile.buildInputLockSha256).toBe(hash(lock));
    expect(profile).toMatchObject({
      playwright: "1.63.0",
      browserVersion: "153.0.8010.12",
      browserRevision: "1243",
    });
    expect(profile.image.bytes).toBeLessThanOrEqual(ZERO_BROWSER_DOCKER_LIMITS.imageBytes);
    await save("frozen-preparation-profile", profile);
  });
  it.each(ZERO_BROWSER_RESEARCH_TASKS)(
    "runs frozen task $id with separate component and assertion evidence",
    async (task) => {
      const f = await fixture();
      const result = await runZeroBrowserDocker(
        f.config,
        { taskId: task.id },
        f.context,
        f.artifacts,
      );
      await save(task.id, result);
      expect(result).toMatchObject({
        outcome: "pass",
        runtime: { nodeVersion: "24.22.0", cleanup: "container_exited" },
        research: {
          outcome: "pass",
          assertion: { actual: task.expected, expected: task.expected, passed: true },
          actualUse: { navigate: 1, snapshot: task.actions.length, act: task.actions.length },
          runtime: { playwright: "1.63.0", chromium: "153.0.8010.12", cleanup: "closed" },
        },
      });
      const research = result.research!;
      const screenshot = await f.artifacts.get(research.screenshotArtifact!.storageKey, f.context);
      const trace = await f.artifacts.get(research.traceArtifact!.storageKey, f.context);
      expect(hash(screenshot)).toBe(research.screenshotArtifact!.sha256);
      expect(hash(trace)).toBe(research.traceArtifact!.sha256);
      expect(await sharp(screenshot).metadata()).toMatchObject({
        width: 800,
        height: 600,
        format: "png",
      });
      const evidence = process.env.ZERO_BROWSER_DOCKER_EVIDENCE_DIR;
      if (evidence) {
        await writeFile(path.join(evidence, `${task.id}.png`), screenshot, { flag: "wx" });
        await writeFile(path.join(evidence, `${task.id}.zip`), trace, { flag: "wx" });
      }
      await expect(
        f.artifacts.get(research.screenshotArtifact!.storageKey, {
          ...f.context,
          spaceId: "foreign",
        }),
      ).rejects.toThrow();
    },
    25000,
  );
  it.each([
    ["wrong-output", "article-fact", "fail"],
    ["unused-provider", "article-fact", "blocked"],
    ["foreign-navigation", "article-fact", "blocked"],
    ["download", "primary-citation", "blocked"],
    ["request-limit", "article-fact", "blocked"],
  ])(
    "preserves sealed negative control %s",
    async (control, taskId, outcome) => {
      const f = await fixture();
      const result = await raw(f, { control, input: JSON.stringify({ taskId }) });
      const decoded = JSON.parse(result.stdout);
      await save(`control-${control}`, decoded);
      expect(result.code).toBe(0);
      expect(decoded.receipt.outcome).toBe(outcome);
      expect(decoded.receipt.runtime.cleanup).toBe("closed");
      if (control === "wrong-output")
        expect(decoded.receipt.assertion).toMatchObject({ actual: "999", passed: false });
      if (control === "unused-provider") expect(decoded.receipt.actualUse.navigate).toBe(0);
    },
    25000,
  );
  it("enforces nonroot/read-only/network isolation and measured cgroup caps", async () => {
    const f = await fixture();
    const code = `const fs=require("fs");const net=require("net");
const read=p=>fs.readFileSync("/sys/fs/cgroup/"+p,"utf8").trim();
const r={uid:process.getuid(),memory:read("memory.max"),pids:read("pids.max"),cpu:read("cpu.max")};
try{fs.writeFileSync("/opt/forbidden","x");r.readonly="failed"}catch(e){r.readonly=e.code}
const s=net.createConnection({host:"192.0.2.1",port:9});s.on("error",e=>{r.network=e.code;console.log(JSON.stringify(r))});setTimeout(()=>process.exit(2),3000).unref();`;
    const result = await raw(f, { code });
    expect(result.code).toBe(0);
    const decoded = JSON.parse(result.stdout);
    await save("resource-policy", decoded);
    expect(decoded).toMatchObject({
      uid: 1000,
      memory: "536870912",
      pids: "128",
      cpu: "200000 100000",
      readonly: "EROFS",
    });
    expect(["ENETUNREACH", "EHOSTUNREACH"]).toContain(decoded.network);
  }, 10000);
  it("actually exhausts bounded tmpfs without growing writable image layers", async () => {
    const f = await fixture();
    const result = await raw(f, {
      code: `const fs=require("fs");let bytes=0;const fd=fs.openSync("/tmp/fill","w");try{for(let i=0;i<140;i++){fs.writeSync(fd,Buffer.alloc(1048576));bytes+=1048576}}catch(e){console.log(JSON.stringify({reason:e.code,bytes}))}finally{fs.closeSync(fd)}`,
    });
    await save("resource-tmpfs", result);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ reason: "ENOSPC", bytes: 134217728 });
  }, 10000);
  it("kills allocation above the finite memory cgroup", async () => {
    const f = await fixture();
    const result = await raw(f, {
      code: "const keep=[];for(let i=0;i<32;i++)keep.push(Buffer.alloc(32*1024*1024,1));console.log('unexpected-allocation-success')",
    });
    await save("resource-memory", result);
    expect(result.code).toBe(137);
    expect(result.stdout).not.toContain("unexpected-allocation-success");
  }, 15000);
  it("bounds PID creation and reaps the owned container", async () => {
    const f = await fixture();
    const result = await raw(f, {
      code: `const {spawn}=require("child_process");const children=[];let pending=0;let failure;for(let i=0;i<150;i++){const c=spawn("/bin/sleep",["2"]);children.push(c);pending++;c.on("error",e=>{failure=e.code;if(--pending===0)end()});c.on("exit",()=>{if(--pending===0)end()})}function end(){console.log(JSON.stringify({failure,children:children.length}))}`,
    });
    await save("resource-pids", result);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).failure).toBe("EAGAIN");
  }, 15000);
  it("kills a bounded running child on wall limit and confirms named-container cleanup", async () => {
    const f = await fixture();
    const result = await raw(f, { code: "setInterval(()=>{},1000)", timeout: 700 });
    await save("resource-wall", result);
    expect(result.reason).toBe("execution_timeout");
  }, 10000);
  it("does not publish after authorization is revoked at artifact publication", async () => {
    const f = await fixture();
    let calls = 0;
    f.config.authorize.mockImplementation(async () => {
      if (++calls >= 3) throw new Error("revoked");
    });
    const result = await runZeroBrowserDocker(
      f.config,
      { taskId: "article-fact" },
      f.context,
      f.artifacts,
    );
    await save("revoked", result);
    expect(result).toMatchObject({ outcome: "blocked", reason: "browser_scope_rejected" });
    expect(result.research).toBeUndefined();
  }, 25000);
  it("cancels a launched container and preserves finite cleanup evidence", async () => {
    const f = await fixture();
    const controller = new AbortController();
    f.context.signal = controller.signal;
    f.config.authorize.mockImplementation(async () => {
      if (f.config.authorize.mock.calls.length === 2) setTimeout(() => controller.abort(), 700);
    });
    const result = await runZeroBrowserDocker(
      f.config,
      { taskId: "form-filter" },
      f.context,
      f.artifacts,
    );
    await save("cancelled", result);
    expect(result.outcome).toBe("cancelled");
    expect(["container_exited", "force_removed"]).toContain(result.runtime.cleanup);
    expect(result.research).toBeUndefined();
  }, 10000);
  it("rejects an image binding mismatch without starting a container", async () => {
    const f = await fixture();
    const result = await runZeroBrowserDocker(
      { ...f.config, buildInputLockSha256: "0".repeat(64) },
      { taskId: "article-fact" },
      f.context,
      f.artifacts,
    );
    await save("image-binding", result);
    expect(result).toMatchObject({
      outcome: "blocked",
      reason: "browser_image_binding_mismatch",
      runtime: { cleanup: "not_started" },
    });
  });
});

async function raw(
  f: Awaited<ReturnType<typeof fixture>>,
  options: { control?: string; code?: string; input?: string; timeout?: number },
) {
  const name = `zero-browser-${randomUUID()}`;
  const args = zeroBrowserDockerRunArguments(f.config.imageId, name, hash(f.context.operationId));
  if (options.code) args.splice(args.length - 1, 0, "--entrypoint=/usr/local/bin/node");
  if (options.control) args.push(options.control);
  if (options.code) args.push("-e", options.code);
  const invoke = (command: string[], timeout = 15000, input = "") =>
    captureZeroDockerProcess(
      f.config.dockerExecutable,
      ["--host", "unix:///var/run/docker.sock", ...command],
      f.config.dockerConfigDirectory,
      input,
      new AbortController().signal,
      timeout,
      4194304,
    );
  let result: Awaited<ReturnType<typeof invoke>>;
  try {
    result = await invoke(args, options.timeout, options.input);
  } finally {
    await invoke(["rm", "--force", name], 3000);
    const inspect = await invoke(["inspect", name], 3000);
    expect(inspect.code).not.toBe(0);
  }
  return result!;
}
