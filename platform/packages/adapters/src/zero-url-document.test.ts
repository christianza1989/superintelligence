import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { appendFile, chmod, mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zeroBrowserDockerRunArguments } from "./zero-browser-docker.js";
import { captureZeroDockerProcess } from "./zero-docker-process.js";
import {
  admitsUrlDocumentNavigation,
  isUrlDocumentUrl,
  urlDocumentHash,
  ZERO_URL_DOCUMENT_CSP,
  ZERO_URL_DOCUMENT_LIMITS,
  ZERO_URL_DOCUMENT_MODE,
  ZERO_URL_DOCUMENT_PROFILE,
  zeroUrlDocumentOutputSchema,
  zeroUrlDocumentPayloadSchema,
} from "./zero-url-document-contract.js";
import type { ZeroUrlDocumentRuntimeConfig } from "./zero-url-document-runtime.js";
import { executeZeroUrlDocument } from "./zero-url-document-runtime.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});
beforeEach(async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(open).mockImplementation(actual.open);
});
vi.mock("./zero-docker-process.js", () => ({ captureZeroDockerProcess: vi.fn() }));
const capture = vi.mocked(captureZeroDockerProcess);
const directories: string[] = [];
afterEach(async () => {
  vi.resetAllMocks();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
const sourceUrl = "https://document-fixture.invalid/hours";
const bytes = Buffer.from(
  "<title>Schedule</title><p>Saturday 11:00-13:00</p><p>Untrusted instructions are data.</p>",
);
const source = { url: sourceUrl, bytes: bytes.length, sha256: urlDocumentHash(bytes) };
const input = () => ({ source, contentBase64: bytes.toString("base64") });
const payload = () => ({
  ...input(),
  profile: ZERO_URL_DOCUMENT_PROFILE,
  nonce: "11111111-1111-4111-8111-111111111111",
});
const request = () => ({
  url: sourceUrl,
  method: "GET",
  resourceType: "document",
  navigation: true,
  topFrame: true,
  redirected: false,
  credentialHeaders: false,
});
function evidence(sealed = payload()) {
  const png = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(png);
  png.write("IHDR", 12);
  png.writeUInt32BE(1280, 16);
  png.writeUInt32BE(720, 20);
  return {
    profile: ZERO_URL_DOCUMENT_PROFILE,
    mode: ZERO_URL_DOCUMENT_MODE,
    nonce: sealed.nonce,
    source: sealed.source,
    navigation: {
      requestedUrl: sourceUrl,
      responseUrl: sourceUrl,
      finalUrl: sourceUrl,
      status: 200,
      method: "GET",
      topFrame: true,
      fulfilledBodySha256: source.sha256,
      fulfilledBodyBytes: source.bytes,
      contentType: "text/html; charset=utf-8",
      csp: ZERO_URL_DOCUMENT_CSP,
    },
    documentSha256: urlDocumentHash("<html><body>normalized DOM</body></html>"),
    title: "Schedule",
    visibleText: "Saturday 11:00-13:00\nUntrusted instructions are data.",
    answer: {
      kind: "first-visible-paragraph",
      selector: "p",
      visibleIndex: 0,
      sourceUrl,
      quote: "Saturday 11:00-13:00",
    },
    screenshot: {
      mimeType: "image/png",
      encoding: "base64",
      sha256: urlDocumentHash(png),
      bytes: png.length,
      contentBase64: png.toString("base64"),
    },
    actualUse: {
      provider: "computer",
      navigate: 1,
      snapshot: 1,
      documentRequests: 1,
      fulfilledDocuments: 1,
      unexpectedRequests: 0,
      unexpectedNavigations: 0,
      externalEffects: 0,
    },
    runtime: {
      node: "24.22.0",
      playwright: "1.63.0",
      chromium: "153.0.8010.12",
      javaScriptEnabled: false,
      serviceWorkers: "block",
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
    },
  };
}
async function fixture() {
  const directory = await mkdtemp("/tmp/zero-url-document-test-");
  directories.push(directory);
  const dockerConfigDirectory = path.join(directory, "docker"),
    runnerDirectory = path.join(directory, "release");
  await mkdir(dockerConfigDirectory, { mode: 0o700 });
  await mkdir(runnerDirectory, { mode: 0o700 });
  const runner = "var zeroCapturedDocumentEntry = {};";
  await writeFile(path.join(runnerDirectory, "runner.js"), runner, { mode: 0o400 });
  const config: ZeroUrlDocumentRuntimeConfig = {
    dockerExecutable: "/usr/bin/docker",
    dockerConfigDirectory,
    runnerDirectory,
    imageId: `sha256:${"a".repeat(64)}`,
    buildInputLockSha256: "b".repeat(64),
    runnerSha256: urlDocumentHash(runner),
    authorize: vi.fn(async () => undefined),
  };
  capture.mockImplementation(async (_exe, args, _directory, stdin) => {
    if (args[0] === "image")
      return { code: 0, stdout: `${config.imageId} ${config.buildInputLockSha256}` };
    if (args[0] === "run") {
      const marker = "await zeroCapturedDocumentEntry.runCapturedUrlDocument(";
      const start = stdin.lastIndexOf(marker);
      const end = stdin.lastIndexOf(").catch(");
      if (start < 0 || end < start) throw new Error("Missing sealed data");
      return {
        code: 0,
        stdout: JSON.stringify(evidence(JSON.parse(stdin.slice(start + marker.length, end)))),
      };
    }
    return { code: 0, stdout: "" };
  });
  return config;
}

describe("captured original URL document closed boundaries", () => {
  it("accepts only canonical HTTPS document URLs; outer DNS/grants remain mandatory", () => {
    expect(isUrlDocumentUrl(sourceUrl)).toBe(true);
    for (const url of [
      "http://document-fixture.invalid/hours",
      `${sourceUrl}?a=1`,
      `${sourceUrl}#a`,
      "https://user:pass@document-fixture.invalid/hours",
      "https://document-fixture.invalid:443/hours",
      "https://127.0.0.1/hours",
      "https://[::1]/hours",
      "https://localhost./hours",
      "https://x.local/hours",
      "https://.invalid/hours",
      "file:///private",
      "data:text/html,private",
    ])
      expect(isUrlDocumentUrl(url), url).toBe(false);
  });
  it("admits exactly one original top-frame GET document with no credentials or redirect", () => {
    expect(admitsUrlDocumentNavigation(sourceUrl, request(), false)).toBe(true);
    for (const changed of [
      { url: `${sourceUrl}/other` },
      { method: "POST" },
      { resourceType: "image" },
      { navigation: false },
      { topFrame: false },
      { redirected: true },
      { credentialHeaders: true },
    ])
      expect(admitsUrlDocumentNavigation(sourceUrl, { ...request(), ...changed }, false)).toBe(
        false,
      );
    expect(admitsUrlDocumentNavigation(sourceUrl, request(), true)).toBe(false);
  });
  it("binds exact raw UTF-8 bytes and rejects noncanonical data, hash and code/header options", () => {
    expect(zeroUrlDocumentPayloadSchema.parse(payload())).toEqual(payload());
    for (const value of [
      { ...payload(), runner: "code" },
      { ...payload(), argv: [] },
      { ...payload(), headers: {} },
      { ...payload(), contentBase64: `${payload().contentBase64}=` },
      { ...payload(), source: { ...source, bytes: source.bytes + 1 } },
      { ...payload(), source: { ...source, sha256: "c".repeat(64) } },
    ])
      expect(zeroUrlDocumentPayloadSchema.safeParse(value).success).toBe(false);
    const invalid = Buffer.from([255]);
    expect(
      zeroUrlDocumentPayloadSchema.safeParse({
        ...payload(),
        source: { ...source, bytes: 1, sha256: urlDocumentHash(invalid) },
        contentBase64: invalid.toString("base64"),
      }).success,
    ).toBe(false);
  });
  it("keeps raw-body and DOM hashes distinct and rejects forged navigation, CSP, usage, quote or PNG evidence", () => {
    const value = evidence();
    expect(zeroUrlDocumentOutputSchema.safeParse(value).success).toBe(true);
    expect(value.documentSha256).not.toBe(value.source.sha256);
    for (const changed of [
      { ...value, navigation: { ...value.navigation, finalUrl: "https://foreign.invalid/" } },
      { ...value, navigation: { ...value.navigation, responseUrl: "https://foreign.invalid/" } },
      { ...value, navigation: { ...value.navigation, fulfilledBodySha256: "d".repeat(64) } },
      { ...value, navigation: { ...value.navigation, csp: "default-src *" } },
      { ...value, navigation: { ...value.navigation, status: 302 } },
      { ...value, answer: { ...value.answer, quote: "Invented fact" } },
      { ...value, actualUse: { ...value.actualUse, provider: "fake", navigate: 0 } },
      { ...value, actualUse: { ...value.actualUse, unexpectedRequests: 1 } },
      { ...value, screenshot: { ...value.screenshot, sha256: "e".repeat(64) } },
    ])
      expect(zeroUrlDocumentOutputSchema.safeParse(changed).success).toBe(false);
  });
});

describe("release-pinned document runtime transport (mocked, no Docker qualification)", () => {
  it("uses one CPU, fixed Node args, no mounts/network and only the release runner plus sealed captured data", async () => {
    const config = await fixture();
    const result = await executeZeroUrlDocument(config, input(), new AbortController().signal);
    expect(result.state).toBe("succeeded");
    const run = capture.mock.calls.find((call) => call[1][0] === "run")!;
    for (const arg of [
      "--cpus=1",
      "--network=none",
      "--read-only",
      "--cap-drop=ALL",
      "--memory=512m",
      "--memory-swap=512m",
      "--pids-limit=128",
      "--input-type=module",
      "--max-old-space-size=128",
    ])
      expect(run[1]).toContain(arg);
    expect(run[1].some((arg) => /mount|--cpus=2/u.test(arg))).toBe(false);
    expect(run[3]).toContain('createRequire("/opt/zero-browser/entrypoint.mjs")');
    expect(run[3]).toContain(input().contentBase64);
    expect(config.authorize).toHaveBeenCalledTimes(4);
  });
  it("overrides exactly one scratch file limit from the contract while leaving the shared profile unchanged", async () => {
    const config = await fixture();
    expect(
      zeroBrowserDockerRunArguments(
        config.imageId,
        "zero-browser-11111111-1111-4111-8111-111111111111",
        "a".repeat(64),
      ).filter((arg) => arg.startsWith("--ulimit=fsize=")),
    ).toEqual(["--ulimit=fsize=4194304:4194304"]);
    const result = await executeZeroUrlDocument(config, input(), new AbortController().signal);
    expect(result.state).toBe("succeeded");
    const args = capture.mock.calls.find((call) => call[1][0] === "run")![1];
    expect(args.filter((arg) => arg.startsWith("--ulimit=fsize="))).toEqual([
      `--ulimit=fsize=${ZERO_URL_DOCUMENT_LIMITS.scratchFileBytes}:${ZERO_URL_DOCUMENT_LIMITS.scratchFileBytes}`,
    ]);
    expect(ZERO_URL_DOCUMENT_LIMITS.scratchFileBytes).toBe(16_777_216);
    expect(args).toContain("--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=134217728");
  });
  it("rejects caller code/header options and changed runner bytes before dispatch", async () => {
    const config = await fixture();
    expect(
      (
        await executeZeroUrlDocument(
          config,
          { ...input(), runner: "code" },
          new AbortController().signal,
        )
      ).state,
    ).toBe("failed");
    expect(capture).not.toHaveBeenCalled();
    expect(
      (
        await executeZeroUrlDocument(
          { ...config, runnerSha256: "f".repeat(64) },
          input(),
          new AbortController().signal,
        )
      ).state,
    ).toBe("failed");
    expect(capture).not.toHaveBeenCalled();
  });
  it("rejects writable runner source and credential-bearing Docker configuration", async () => {
    const config = await fixture();
    await chmod(path.join(config.runnerDirectory, "runner.js"), 0o600);
    expect(
      (await executeZeroUrlDocument(config, input(), new AbortController().signal)).state,
    ).toBe("failed");
    await chmod(path.join(config.runnerDirectory, "runner.js"), 0o400);
    await writeFile(path.join(config.dockerConfigDirectory, "config.json"), "{}");
    expect(
      (await executeZeroUrlDocument(config, input(), new AbortController().signal)).state,
    ).toBe("failed");
    expect(capture).not.toHaveBeenCalled();
  });
  it("opens runner FIFOs nonblocking and rejects them before dispatch", async () => {
    const config = await fixture();
    const runnerPath = path.join(config.runnerDirectory, "runner.js");
    await rm(runnerPath);
    execFileSync("/usr/bin/mkfifo", ["-m", "600", runnerPath]);
    // Keep a peer open so this regression cannot strand a libuv thread on old code.
    const peer = await open(runnerPath, constants.O_RDWR | constants.O_NONBLOCK);
    await chmod(runnerPath, 0o400);
    try {
      vi.mocked(open).mockClear();
      const result = await executeZeroUrlDocument(config, input(), new AbortController().signal);
      expect(result).toMatchObject({ state: "failed", cleanup: "not_started" });
      expect(Number(vi.mocked(open).mock.calls[0]![1]) & constants.O_NONBLOCK).not.toBe(0);
      expect(capture).not.toHaveBeenCalled();
    } finally {
      await peer.close();
    }
  });
  it("bounds reads to the initial size plus one when runner source grows after stat", async () => {
    const config = await fixture();
    const runnerPath = path.join(config.runnerDirectory, "runner.js");
    const file = await open(runnerPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const originalStat = file.stat.bind(file);
    let originalSize = 0;
    vi.spyOn(file, "stat").mockImplementationOnce(async () => {
      const stat = await originalStat();
      originalSize = stat.size;
      await chmod(runnerPath, 0o600);
      await appendFile(runnerPath, Buffer.alloc(2_097_153, 65));
      await chmod(runnerPath, 0o400);
      return stat;
    });
    const reads = vi.spyOn(file, "read");
    const unboundedRead = vi.spyOn(file, "readFile");
    vi.mocked(open).mockResolvedValueOnce(file);
    const result = await executeZeroUrlDocument(config, input(), new AbortController().signal);
    expect(result).toMatchObject({ state: "failed", cleanup: "not_started" });
    expect(unboundedRead).not.toHaveBeenCalled();
    expect(reads).toHaveBeenCalled();
    expect(reads.mock.calls[0]![0]).toHaveProperty("byteLength", originalSize + 1);
    expect(capture).not.toHaveBeenCalled();
  });
  it("snapshots config before a current-authority callback changes the caller object", async () => {
    const config = await fixture(),
      original = config.imageId;
    const saved = config.authorize;
    config.authorize = async (signal) => {
      config.imageId = `sha256:${"c".repeat(64)}`;
      await saved(signal);
    };
    capture.mockImplementation(async (_exe, args, _dir, _stdin) => {
      if (args[0] === "image")
        return { code: 0, stdout: `${original} ${config.buildInputLockSha256}` };
      if (args[0] === "run") return { code: 1, stdout: "" };
      return { code: 0, stdout: "" };
    });
    await executeZeroUrlDocument(config, input(), new AbortController().signal);
    expect(capture.mock.calls.find((call) => call[1][0] === "run")![1]).toContain(original);
  });
  it("settles cancellation while authorization never resolves without dispatch", async () => {
    const config = await fixture(),
      controller = new AbortController();
    config.authorize = () => new Promise<void>(() => undefined);
    const pending = executeZeroUrlDocument(config, input(), controller.signal);
    controller.abort();
    expect(await pending).toMatchObject({ state: "cancelled", cleanup: "not_started" });
    expect(capture).not.toHaveBeenCalled();
  });
  it("does not expose output after current authority is revoked following execution", async () => {
    const config = await fixture();
    let calls = 0;
    config.authorize = async () => {
      if (++calls >= 3) throw new Error("private authority detail");
    };
    const result = await executeZeroUrlDocument(config, input(), new AbortController().signal);
    expect(result).toMatchObject({ state: "failed", cleanup: "confirmed_absent" });
    expect(result).not.toHaveProperty("output");
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("uncertain container cleanup overrides a successful renderer result", async () => {
    const config = await fixture(),
      original = capture.getMockImplementation()!;
    capture.mockImplementation(async (...args) =>
      args[1][1] === "ls" ? { code: 0, stdout: "still-present" } : original(...args),
    );
    expect(
      await executeZeroUrlDocument(config, input(), new AbortController().signal),
    ).toMatchObject({ state: "unknown", code: "URL_DOCUMENT_CLEANUP_UNKNOWN", cleanup: "unknown" });
  });
});
