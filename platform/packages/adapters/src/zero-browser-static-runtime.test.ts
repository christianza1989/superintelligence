import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ZERO_BROWSER_STATIC_PROFILE,
  ZERO_BROWSER_STATIC_URL,
  zeroBrowserHash,
  zeroBrowserRequestSchema,
} from "./zero-browser-contract.js";
import { executeZeroBrowser } from "./zero-browser-static-runtime.js";
import { captureZeroDockerProcess } from "./zero-docker-process.js";

vi.mock("./zero-docker-process.js", () => ({ captureZeroDockerProcess: vi.fn() }));
const capture = vi.mocked(captureZeroDockerProcess);
const directories: string[] = [];
afterEach(async () => {
  vi.resetAllMocks();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
});
async function fixture() {
  const directory = await mkdtemp("/tmp/zero-static-runtime-");
  directories.push(directory);
  const bytes = Buffer.from("<title>Example</title><h1>Header</h1>");
  const imageId = `sha256:${"a".repeat(64)}`,
    lock = "b".repeat(64);
  const request = {
    kind: "zero.browser.request.v1",
    principal: {
      userId: "user",
      spaceId: "space",
      scopeId: "scope",
      policyRevision: "revision",
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    },
    fileId: "operator-page",
    source: { artifactId: randomUUID(), sha256: zeroBrowserHash(bytes), bytes: bytes.length },
    profile: ZERO_BROWSER_STATIC_PROFILE,
    imageId,
    buildInputLockSha256: lock,
    deadline: new Date(Date.now() + 60_000).toISOString(),
  };
  const png = Buffer.from("89504e470d0a1a0a", "hex");
  const output = {
    profile: ZERO_BROWSER_STATIC_PROFILE,
    sourceSha256: request.source.sha256,
    renderedSha256: request.source.sha256,
    rendering: {
      policy: "inert-static-v1",
      removedElements: 0,
      removedAttributes: 0,
      inertLinks: 0,
    },
    url: ZERO_BROWSER_STATIC_URL,
    title: "Example",
    headings: [{ level: 1, text: "Header" }],
    links: [],
    visibleText: "Header",
    screenshot: {
      mimeType: "image/png",
      encoding: "base64",
      sha256: zeroBrowserHash(png),
      bytes: png.length,
      contentBase64: png.toString("base64"),
    },
    actualUse: { provider: "computer", navigate: 1, snapshot: 1 },
    runtime: { nodeVersion: "24.22.0", playwright: "1.63.0", chromium: "153.0.8010.12" },
  };
  capture.mockImplementation(async (_exe, args) => ({
    code: 0,
    stdout: args[0] === "image" ? `${imageId}\n` : args[0] === "run" ? JSON.stringify(output) : "",
  }));
  return {
    directory,
    bytes,
    request,
    output,
    config: {
      dockerExecutable: "/usr/bin/docker",
      dockerConfigDirectory: directory,
      imageId,
      buildInputLockSha256: lock,
    },
    input: () => ({
      request: zeroBrowserRequestSchema.parse(request),
      requestDigest: zeroBrowserHash(JSON.stringify(zeroBrowserRequestSchema.parse(request))),
      bytes,
    }),
  };
}
describe("sealed static browser runtime boundary", () => {
  it("uses fixed isolated argv and forwards only immutable HTML and its hash", async () => {
    const f = await fixture();
    expect(
      (await executeZeroBrowser(f.config, f.input(), new AbortController().signal)).state,
    ).toBe("succeeded");
    const run = capture.mock.calls.find((call) => call[1][0] === "run")!;
    for (const arg of [
      "--network=none",
      "--read-only",
      "--cap-drop=ALL",
      "--pids-limit=128",
      "--memory=512m",
      "--memory-swap=512m",
    ])
      expect(run[1]).toContain(arg);
    expect(JSON.parse(run[3])).toEqual({
      html: f.bytes.toString(),
      sourceSha256: f.request.source.sha256,
    });
    expect(run[1].some((arg) => arg.includes("mount"))).toBe(false);
  });
  it("rejects altered input bytes before Docker", async () => {
    const f = await fixture();
    await expect(
      executeZeroBrowser(
        f.config,
        { ...f.input(), bytes: Buffer.from("changed") },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(capture).not.toHaveBeenCalled();
  });
  it("rejects an image or lock that is outside the current operator binding", async () => {
    const f = await fixture();
    await expect(
      executeZeroBrowser(
        { ...f.config, imageId: `sha256:${"c".repeat(64)}` },
        f.input(),
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(capture).not.toHaveBeenCalled();
  });
  it("refuses a Docker config directory containing credentials", async () => {
    const f = await fixture();
    await writeFile(`${f.directory}/config.json`, "{}");
    await expect(
      executeZeroBrowser(f.config, f.input(), new AbortController().signal),
    ).rejects.toThrow();
    expect(capture).not.toHaveBeenCalled();
  });
  it("calls the current worker grant immediately before dispatch", async () => {
    const f = await fixture();
    const gate = vi.fn(async () => {
      throw new Error("revoked");
    });
    expect(
      (
        await executeZeroBrowser(
          { ...f.config, beforeDispatch: gate },
          f.input(),
          new AbortController().signal,
        )
      ).state,
    ).toBe("failed");
    expect(gate).toHaveBeenCalledOnce();
    expect(capture.mock.calls.some((call) => call[1][0] === "run")).toBe(false);
  });
  it("rejects forged screenshot and source provenance", async () => {
    const f = await fixture();
    f.output.sourceSha256 = "c".repeat(64);
    expect(
      (await executeZeroBrowser(f.config, f.input(), new AbortController().signal)).state,
    ).toBe("failed");
  });
  it("reports unknown when cleanup cannot prove exact container absence", async () => {
    const f = await fixture();
    capture.mockImplementation(async (_exe, args) => ({
      code: 0,
      stdout:
        args[0] === "image"
          ? `${f.config.imageId}\n`
          : args[0] === "run"
            ? JSON.stringify(f.output)
            : args[1] === "ls"
              ? "still-present"
              : "",
    }));
    expect(
      await executeZeroBrowser(f.config, f.input(), new AbortController().signal),
    ).toMatchObject({ state: "unknown", code: "BROWSER_CLEANUP_UNKNOWN" });
  });
});
