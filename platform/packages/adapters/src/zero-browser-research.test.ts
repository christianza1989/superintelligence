import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AdapterContext } from "@rakazo/adapter-kit";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalArtifactStore } from "./artifacts.js";
import { ComputerBrowserProvider } from "./computer-browser.js";
import {
  isZeroBrowserFixtureUrl,
  runZeroBrowserResearch as executeResearch,
  ZERO_BROWSER_RESEARCH_LIMITS,
} from "./zero-browser-research.js";
import {
  ZERO_BROWSER_FIXTURE_ORIGIN,
  ZERO_BROWSER_FIXTURES,
  ZERO_BROWSER_RESEARCH_TASKS,
} from "./zero-browser-research-profile.js";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
// Explicit local proof output preserves real receipts and synthetic screenshot/trace bytes.
async function runZeroBrowserResearch(...args: Parameters<typeof executeResearch>) {
  const receipt = await executeResearch(...args);
  const proofRoot = process.env.ZERO_BROWSER_EVIDENCE_DIR;
  if (proofRoot) {
    const directory = path.join(proofRoot, `${receipt.taskId}-${randomUUID()}`);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(path.join(directory, "receipt.json"), JSON.stringify(receipt, null, 2));
    for (const [name, artifact] of [
      ["screenshot.png", receipt.screenshotArtifact],
      ["trace.zip", receipt.traceArtifact],
    ] as const) {
      if (artifact)
        await writeFile(
          path.join(directory, name),
          await args[3].get(artifact.storageKey, args[2]),
        );
    }
  }
  return receipt;
}
const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture() {
  const stagingRoot = await mkdtemp(path.join(tmpdir(), "zero-browser-stage-"));
  const dataRoot = await mkdtemp(path.join(tmpdir(), "zero-browser-artifacts-"));
  directories.push(stagingRoot, dataRoot);
  const context: AdapterContext = {
    operationId: randomUUID(),
    traceId: randomUUID(),
    spaceId: "synthetic-space",
    userId: "synthetic-user",
    signal: new AbortController().signal,
  };
  const artifacts = new LocalArtifactStore(dataRoot);
  const authorize = vi.fn(async () => undefined);
  const config = {
    executablePath: process.env.ZERO_BROWSER_EXECUTABLE ?? "/usr/bin/chromium",
    stagingRoot,
    authorize,
  };
  return { config, context, artifacts };
}

describe("bounded browser fixture request boundary (offline)", () => {
  it.each([
    "file:///etc/passwd",
    "data:text/html,private",
    "javascript:alert(1)",
    "http://127.0.0.1/private",
    "http://169.254.169.254/latest/meta-data/",
    "https://example.invalid/",
    `${ZERO_BROWSER_FIXTURE_ORIGIN}/unknown`,
    `${ZERO_BROWSER_FIXTURE_ORIGIN}/article?private=1`,
    `${ZERO_BROWSER_FIXTURE_ORIGIN}/article#fragment`,
    `https://user:secret@zero-browser-fixture.test/article`,
    `${ZERO_BROWSER_FIXTURE_ORIGIN}/../article`,
    `${ZERO_BROWSER_FIXTURE_ORIGIN}/%61rticle`,
  ])("rejects URL outside the exact fixture set: %s", (url) => {
    expect(isZeroBrowserFixtureUrl(url)).toBe(false);
  });
  it("accepts only exact declared source URLs", () => {
    for (const resource of Object.keys(ZERO_BROWSER_FIXTURES))
      expect(isZeroBrowserFixtureUrl(ZERO_BROWSER_FIXTURE_ORIGIN + resource)).toBe(true);
  });
  it.each([
    { taskId: "article-fact", url: "file:///private" },
    { taskId: "article-fact", executablePath: "/bin/sh" },
    { taskId: "article-fact", userId: "foreign" },
    { taskId: "unknown-task" },
  ])("rejects tool-provided authority before authorization or dispatch", async (input) => {
    const f = await fixture();
    await expect(runZeroBrowserResearch(f.config, input, f.context, f.artifacts)).rejects.toThrow(
      "browser_request_rejected",
    );
    expect(f.config.authorize).not.toHaveBeenCalled();
    expect(await readdir(f.config.stagingRoot)).toEqual([]);
  });
  it("rejects unbounded fixture bytes before dispatch", async () => {
    const f = await fixture();
    await expect(
      runZeroBrowserResearch(
        {
          ...f.config,
          fixtures: { "/article": "x".repeat(ZERO_BROWSER_RESEARCH_LIMITS.resourceBytes + 1) },
        },
        { taskId: "article-fact" },
        f.context,
        f.artifacts,
      ),
    ).rejects.toThrow("browser_fixture_limit_exceeded");
    expect(f.config.authorize).not.toHaveBeenCalled();
  });
  it("keeps authorizer failures bounded and does not launch a browser", async () => {
    const f = await fixture();
    f.config.authorize.mockRejectedValueOnce(new Error("synthetic-private-marker-do-not-print"));
    const receipt = await runZeroBrowserResearch(
      f.config,
      { taskId: "article-fact" },
      f.context,
      f.artifacts,
    );
    expect(receipt).toMatchObject({
      outcome: "blocked",
      reason: "browser_scope_rejected",
      runtime: { chromium: null, cleanup: "not_started" },
    });
    expect(JSON.stringify(receipt)).not.toContain("synthetic-private-marker");
    expect(await readdir(f.config.stagingRoot)).toEqual([]);
  });
});

const real =
  process.env.VERIFY_ZERO_BROWSER === "1" && process.env.ZERO_BROWSER_EXECUTABLE
    ? describe.sequential
    : describe.skip;
real("fixed offline browser research tasks (real headless Chromium)", () => {
  it.each(ZERO_BROWSER_RESEARCH_TASKS)(
    "runs frozen task $id with independent DOM assertion and screenshot provenance",
    async (task) => {
      const f = await fixture();
      const receipt = await runZeroBrowserResearch(
        f.config,
        { taskId: task.id },
        f.context,
        f.artifacts,
      );
      expect(receipt).toMatchObject({
        outcome: "pass",
        paidModelCalls: 0,
        assertion: { expected: task.expected, actual: task.expected, passed: true },
        actualUse: {
          provider: "computer",
          navigate: 1,
          snapshot: task.actions.length,
          act: task.actions.length,
        },
        runtime: { playwright: "1.63.0", cleanup: "closed" },
      });
      expect(receipt.runtime.chromium).toBeTruthy();
      expect(receipt.sources.length).toBeGreaterThan(0);
      expect(receipt.sources.every((source) => isZeroBrowserFixtureUrl(source.url))).toBe(true);
      const screenshot = await f.artifacts.get(receipt.screenshotArtifact!.storageKey, f.context);
      expect(hash(screenshot)).toBe(receipt.screenshotArtifact!.sha256);
      expect(await sharp(screenshot).metadata()).toMatchObject({
        format: "png",
        width: 800,
        height: 600,
      });
      const trace = await f.artifacts.get(receipt.traceArtifact!.storageKey, f.context);
      expect(hash(trace)).toBe(receipt.traceArtifact!.sha256);
      expect(Buffer.from(trace).subarray(0, 2).toString()).toBe("PK");
      expect(await readdir(f.config.stagingRoot)).toEqual([]);
      await expect(
        f.artifacts.get(receipt.screenshotArtifact!.storageKey, {
          ...f.context,
          spaceId: "foreign",
        }),
      ).rejects.toThrow();
    },
  );

  it("keeps wrong DOM output as a failed assertion with real evidence", async () => {
    const f = await fixture();
    const fixtures = {
      ...ZERO_BROWSER_FIXTURES,
      "/article":
        '<html><head><title>Wrong result</title></head><body><p id="fact">999</p></body></html>',
    };
    const receipt = await runZeroBrowserResearch(
      { ...f.config, fixtures },
      { taskId: "article-fact" },
      f.context,
      f.artifacts,
    );
    expect(receipt).toMatchObject({ outcome: "fail", assertion: { actual: "999", passed: false } });
    expect(receipt.screenshotArtifact).toBeDefined();
  });
  it("cannot pass when the existing provider navigate component is bypassed", async () => {
    const f = await fixture();
    vi.spyOn(ComputerBrowserProvider.prototype, "navigate").mockResolvedValue({
      url: ZERO_BROWSER_FIXTURE_ORIGIN + "/article",
      title: "copied claim",
    });
    const receipt = await runZeroBrowserResearch(
      f.config,
      { taskId: "article-fact" },
      f.context,
      f.artifacts,
    );
    expect(receipt.outcome).not.toBe("pass");
    expect(receipt.actualUse.navigate).toBe(0);
    expect(receipt.screenshotArtifact).toBeUndefined();
  });
  it.each(["script", "redirect"])(
    "denies injected %s navigation before a loopback canary receives any request",
    async (kind) => {
      const f = await fixture();
      let hits = 0;
      const canary = createServer((_request, response) => {
        hits++;
        response.end("synthetic forbidden source");
      });
      await new Promise<void>((resolve) => canary.listen(0, "127.0.0.1", resolve));
      const address = canary.address();
      if (!address || typeof address === "string") throw new Error("Fixture listener missing");
      const forbidden = `http://127.0.0.1:${address.port}/private`;
      const navigation =
        kind === "script"
          ? `<script nonce="zero-fixture-v1">location.href=${JSON.stringify(forbidden)}</script>`
          : `<meta http-equiv="refresh" content="0; url=${forbidden}">`;
      try {
        const receipt = await runZeroBrowserResearch(
          {
            ...f.config,
            fixtures: {
              ...ZERO_BROWSER_FIXTURES,
              "/article": `<html><body><p id="fact">The Aurora observatory opened in 1974.</p>${navigation}</body></html>`,
            },
          },
          { taskId: "article-fact" },
          f.context,
          f.artifacts,
        );
        expect(receipt.outcome).toBe("blocked");
        expect(receipt.reason).toMatch(/^browser_(network|navigation)_denied$/u);
        expect(hits).toBe(0);
        expect(receipt.sources.every((source) => isZeroBrowserFixtureUrl(source.url))).toBe(true);
        expect(await readdir(f.config.stagingRoot)).toEqual([]);
      } finally {
        await new Promise<void>((resolve, reject) =>
          canary.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  );
  it.each(["file", "download"])("denies a %s action before dispatch", async (kind) => {
    const f = await fixture();
    const link =
      kind === "file"
        ? '<a href="file:///synthetic-private-file">Primary source</a>'
        : '<a download href="/citation-source">Primary source</a>';
    const receipt = await runZeroBrowserResearch(
      {
        ...f.config,
        fixtures: { ...ZERO_BROWSER_FIXTURES, "/citation": `<html><body>${link}</body></html>` },
      },
      { taskId: "primary-citation" },
      f.context,
      f.artifacts,
    );
    expect(receipt).toMatchObject({
      outcome: "blocked",
      reason: kind === "file" ? "browser_navigation_denied" : "browser_download_denied",
    });
    expect(receipt.sources).toHaveLength(1);
    expect(receipt.screenshotArtifact).toBeUndefined();
  });
  it("cancels an actual active renderer and removes transient slots without publishing evidence", async () => {
    const f = await fixture();
    const controller = new AbortController();
    let checks = 0;
    f.config.authorize.mockImplementation(async () => {
      if (++checks === 3) setTimeout(() => controller.abort(), 100);
    });
    const receipt = await runZeroBrowserResearch(
      {
        ...f.config,
        fixtures: {
          ...ZERO_BROWSER_FIXTURES,
          "/article":
            '<html><body><p id="fact" style="display:none">never visible</p></body></html>',
        },
      },
      { taskId: "article-fact" },
      { ...f.context, signal: controller.signal },
      f.artifacts,
    );
    expect(receipt).toMatchObject({
      outcome: "cancelled",
      reason: "principal_cancelled",
      actualUse: { navigate: 1 },
    });
    expect(receipt.runtime.chromium).toBeTruthy();
    expect(receipt.runtime.cleanup).not.toBe("unknown");
    expect(receipt.screenshotArtifact).toBeUndefined();
    expect(await readdir(f.config.stagingRoot)).toEqual([]);
  });
  it("enforces the request count before serving an unbounded allowed-resource loop", async () => {
    const f = await fixture();
    const body = `<html><body><p id="fact" style="display:none">not reached</p><script nonce="zero-fixture-v1">(async()=>{for(let i=0;i<24;i++)await new Promise(resolve=>{let s=document.createElement('script');s.nonce='zero-fixture-v1';s.src='/unicode';s.onload=s.onerror=resolve;document.body.append(s)})})()</script></body></html>`;
    const receipt = await runZeroBrowserResearch(
      { ...f.config, fixtures: { ...ZERO_BROWSER_FIXTURES, "/article": body } },
      { taskId: "article-fact" },
      f.context,
      f.artifacts,
    );
    expect(receipt).toMatchObject({ outcome: "blocked", reason: "browser_request_limit_exceeded" });
    expect(receipt.sources.length).toBeLessThanOrEqual(ZERO_BROWSER_RESEARCH_LIMITS.requests);
    expect(receipt.screenshotArtifact).toBeUndefined();
    expect(await readdir(f.config.stagingRoot)).toEqual([]);
  });
  it("does not publish artifact bytes after observing grant revocation", async () => {
    const f = await fixture();
    const put = vi.spyOn(f.artifacts, "put");
    let checks = 0;
    f.config.authorize.mockImplementation(async () => {
      if (++checks >= 5) throw new Error("fixture grant revoked");
    });
    const receipt = await runZeroBrowserResearch(
      f.config,
      { taskId: "article-fact" },
      f.context,
      f.artifacts,
    );
    expect(receipt.outcome).toBe("blocked");
    expect(put).not.toHaveBeenCalled();
    expect(receipt.screenshotArtifact).toBeUndefined();
  });
});
