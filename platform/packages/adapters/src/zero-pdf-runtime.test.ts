import { randomUUID } from "node:crypto";
import { lstat, readdir, readFile, symlink, unlink } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureZeroDockerProcess } from "./zero-docker-process.js";
import { readZeroOperatorFile } from "./zero-operator-file.js";
import {
  ZERO_PDF_BUNDLE,
  ZERO_PDF_BUNDLE_SHA256,
  ZERO_PDF_IMAGE,
  ZERO_PDF_PROFILE,
  zeroPdfExtractionSchema,
  zeroPdfHash,
  zeroPdfRequestDigest,
  zeroPdfSubmitSchema,
} from "./zero-pdf-contract.js";
import { executeZeroPdf, parseZeroPdfOutput, reconcileZeroPdfRuntime } from "./zero-pdf-runtime.js";

vi.mock("./zero-docker-process.js", () => ({ captureZeroDockerProcess: vi.fn() }));
vi.mock("./zero-operator-file.js", () => ({ readZeroOperatorFile: vi.fn() }));
const capture = vi.mocked(captureZeroDockerProcess);
const reader = vi.mocked(readZeroOperatorFile);
const bytes = Buffer.from("%PDF-synthetic");
const config = { bundleDirectory: "/synthetic-private-profile" };
const makeRequest = () => ({
  kind: "zero.pdf.request.v1" as const,
  principal: {
    spaceId: "space",
    userId: "user",
    scopeId: "scope",
    policyRevision: "policy",
    expiresAt: new Date(Date.now() + 120000).toISOString(),
  },
  fileId: "file",
  source: { artifactId: "owned", bytes: bytes.length, sha256: zeroPdfHash(bytes) },
  profile: ZERO_PDF_PROFILE,
  imageId: ZERO_PDF_IMAGE,
  bundleSha256: ZERO_PDF_BUNDLE_SHA256,
  deadline: new Date(Date.now() + 60000).toISOString(),
});
const input = () => {
  const request = makeRequest();
  return { request, requestDigest: zeroPdfRequestDigest(request, Date.now()), bytes };
};
const rawOutput = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ event: "started", sequence: 0 }) +
  "\n" +
  JSON.stringify({
    file: "input.pdf",
    state: "completed",
    inputSha256: zeroPdfHash(bytes),
    pages: 1,
    tables: [],
    elapsedMs: 1,
    peakRssBytes: 100,
    containerPeakMemoryBytes: null,
    sequence: 0,
    initializationMs: 0,
    warmRepeat: false,
    ...extra,
  }) +
  "\n";
let staging: string | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  staging = undefined;
  reader.mockImplementation(async (file) =>
    Buffer.from(
      (
        await readFile(new URL(`../pdfplumber/${path.basename(file)}`, import.meta.url), "utf8")
      ).replace(/\r\n/g, "\n"),
    ),
  );
  capture.mockImplementation(async (_exe, args) => {
    if (args[0] === "image") return { code: 0, stdout: `${ZERO_PDF_IMAGE}\n` };
    if (args[0] === "run") {
      const mount = args.find(
        (arg) => arg.startsWith("type=bind,src=") && arg.includes("dst=/input"),
      )!;
      staging = path.dirname(mount.split(",")[1]!.slice(4));
      expect(await readFile(path.join(staging!, "input/input.pdf"))).toEqual(bytes);
      expect(await readdir(path.join(staging!, "input"))).toEqual(["input.pdf"]);
      return { code: 0, stdout: rawOutput() };
    }
    return { code: 0, stdout: "" };
  });
});

describe("PDF contract and fixed runner boundary", () => {
  it("accepts only file ID, idempotency key and finite deadline as MCP input", () => {
    const valid = { fileId: "file", idempotencyKey: "key", deadline: new Date().toISOString() };
    expect(zeroPdfSubmitSchema.parse(valid)).toEqual(valid);
    for (const extra of [
      { path: "/private/input.pdf" },
      { url: "https://example.invalid/input.pdf" },
      { base64: "abc" },
      { model: "paid" },
      { scopeId: "foreign" },
    ])
      expect(zeroPdfSubmitSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
  });
  it("binds every principal, artifact, profile and deadline field", () => {
    const original = makeRequest();
    const digest = zeroPdfRequestDigest(original, Date.now());
    for (const change of [
      { fileId: "other" },
      { principal: { ...original.principal, scopeId: "other" } },
      { source: { ...original.source, artifactId: "other" } },
      { source: { ...original.source, sha256: "a".repeat(64) } },
      { source: { ...original.source, bytes: bytes.length + 1 } },
      { deadline: new Date(Date.now() + 30000).toISOString() },
    ])
      expect(zeroPdfRequestDigest({ ...original, ...change }, Date.now())).not.toBe(digest);
    for (const change of [
      { imageId: "other" },
      { bundleSha256: "a".repeat(64) },
      { profile: "other" },
      { hostPath: "/private" },
    ])
      expect(() => zeroPdfRequestDigest({ ...original, ...change }, Date.now())).toThrow();
  });
  it("rejects expired, overlong or scope-exceeding deadlines and nonfinite clocks", () => {
    const request = makeRequest();
    for (const offset of [-1, 600001])
      expect(() =>
        zeroPdfRequestDigest(
          { ...request, deadline: new Date(Date.now() + offset).toISOString() },
          Date.now(),
        ),
      ).toThrow();
    expect(() =>
      zeroPdfRequestDigest(
        { ...request, principal: { ...request.principal, expiresAt: new Date().toISOString() } },
        Date.now(),
      ),
    ).toThrow();
    expect(() => zeroPdfRequestDigest(request, NaN)).toThrow();
  });
  it("pins the canonical LF bundle bytes and explicit manifest serialization", async () => {
    for (const entry of ZERO_PDF_BUNDLE) {
      const data = await reader(`${config.bundleDirectory}/${entry.name}`);
      expect(data.byteLength).toBe(entry.bytes);
      expect(zeroPdfHash(data)).toBe(entry.sha256);
    }
    expect(zeroPdfHash(JSON.stringify(ZERO_PDF_BUNDLE))).toBe(ZERO_PDF_BUNDLE_SHA256);
  });
  it("requires a complete rectangular cell grid with bounded source provenance", () => {
    const bbox = { l: 1, t: 1, r: 3, b: 3, coord_origin: "TOPLEFT" };
    const cell = {
      text: "17",
      start_row_offset_idx: 0,
      end_row_offset_idx: 1,
      start_col_offset_idx: 0,
      end_col_offset_idx: 1,
      bbox,
    };
    const table = {
      data: { num_rows: 1, num_cols: 1, table_cells: [cell] },
      provenance: [{ page_no: 1, bbox }],
    };
    const extraction = {
      profile: ZERO_PDF_PROFILE,
      sourceSha256: zeroPdfHash(bytes),
      pages: 1,
      tables: [table],
    };
    expect(zeroPdfExtractionSchema.safeParse(extraction).success).toBe(true);
    for (const bad of [
      { ...table, provenance: [{ page_no: 2, bbox }] },
      { ...table, data: { ...table.data, table_cells: [] } },
      { ...table, data: { ...table.data, table_cells: [cell, cell] } },
      { ...table, data: { ...table.data, table_cells: [{ ...cell, bbox: { ...bbox, r: 4 } }] } },
      { ...table, data: { ...table.data, table_cells: [{ ...cell, end_row_offset_idx: 2 }] } },
    ])
      expect(zeroPdfExtractionSchema.safeParse({ ...extraction, tables: [bad] }).success).toBe(
        false,
      );
  });
  it("rejects foreign input, malformed protocols, forged output and unbounded metrics", () => {
    expect(parseZeroPdfOutput(rawOutput(), zeroPdfHash(bytes)).tables).toEqual([]);
    for (const output of [
      rawOutput({ inputSha256: "a".repeat(64) }),
      rawOutput({ state: "failed" }),
      rawOutput({ pages: 6 }),
      rawOutput({ sequence: 1 }),
      rawOutput({ elapsedMs: 30001 }),
      rawOutput({ hostPath: "/private" }),
      "{}\n",
      `${rawOutput()}{}\n`,
      "x".repeat(1048577),
    ])
      expect(() => parseZeroPdfOutput(output, zeroPdfHash(bytes))).toThrow();
  });
});

describe("PDF runtime orchestration (offline transport double; no container acceptance)", () => {
  it("copies only immutable bound bytes, fixes every runtime flag, and verifies cleanup", async () => {
    const result = await executeZeroPdf(config, input(), new AbortController().signal);
    expect(result.state).toBe("succeeded");
    const run = capture.mock.calls.find((call) => call[1][0] === "run")!;
    expect(run[0]).toBe("/usr/bin/docker");
    expect(run[1]).toEqual(
      expect.arrayContaining([
        "--pull=never",
        "--network=none",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--user=65534:65534",
        "--memory=536870912",
        "--memory-swap=536870912",
        "--cpus=2",
        "--pids-limit=64",
        "--ipc=none",
        "--log-driver=none",
        ZERO_PDF_IMAGE,
      ]),
    );
    expect(run[1].filter((arg) => arg.startsWith("type=bind,"))).toHaveLength(2);
    expect(run[1].slice(-3)).toEqual([ZERO_PDF_IMAGE, "/profile/runner.py", "input.pdf"]);
    expect(run[3]).toBe("");
    expect(capture.mock.calls.some((call) => call[1].includes("--force"))).toBe(true);
    expect(capture.mock.calls.at(-1)![1]).toContain("--quiet");
    await expect(lstat(staging!)).rejects.toHaveProperty("code", "ENOENT");
  });
  it.each(["digest", "hash", "size", "magic", "oversize"])(
    "denies %s mismatch before bundle or Docker access",
    async (kind) => {
      const value = input();
      if (kind === "digest") value.requestDigest = "a".repeat(64);
      if (kind === "hash") value.bytes = Buffer.from("%PDF-different");
      if (kind === "size") value.request.source.bytes++;
      if (kind === "magic") {
        value.bytes = Buffer.from("not-pdf");
        value.request.source.bytes = value.bytes.length;
        value.request.source.sha256 = zeroPdfHash(value.bytes);
        value.requestDigest = zeroPdfRequestDigest(value.request, Date.now());
      }
      if (kind === "oversize") value.bytes = Buffer.alloc(1048577);
      expect(await executeZeroPdf(config, value, new AbortController().signal)).toEqual({
        state: "blocked",
        code: "PDF_REQUEST_DENIED",
      });
      expect(reader).not.toHaveBeenCalled();
      expect(capture).not.toHaveBeenCalled();
    },
  );
  it("refuses an altered private bundle before Docker starts", async () => {
    reader.mockResolvedValue(Buffer.from("altered"));
    expect((await executeZeroPdf(config, input(), new AbortController().signal)).state).toBe(
      "failed",
    );
    expect(capture).not.toHaveBeenCalled();
  });
  it("does not pull or run a missing or mismatched fixed image", async () => {
    capture.mockResolvedValue({ code: 0, stdout: "sha256:foreign" });
    expect((await executeZeroPdf(config, input(), new AbortController().signal)).state).toBe(
      "failed",
    );
    expect(capture.mock.calls.every((call) => call[1][0] === "image")).toBe(true);
  });
  it("does not start an already cancelled job", async () => {
    expect(await executeZeroPdf(config, input(), AbortSignal.abort())).toEqual({
      state: "cancelled",
      code: "PDF_CANCELLED",
    });
    expect(capture).not.toHaveBeenCalled();
    expect(reader).not.toHaveBeenCalled();
  });
  it("cleans a failed or cancelled running container with a separate live signal", async () => {
    const controller = new AbortController();
    capture.mockImplementation(async (_exe, args, _config, _input, signal) => {
      if (args[0] === "image") return { code: 0, stdout: ZERO_PDF_IMAGE };
      if (args[0] === "run") {
        controller.abort();
        return { code: null, stdout: "", reason: "aborted" };
      }
      expect(signal.aborted).toBe(false);
      return { code: 0, stdout: "" };
    });
    expect(await executeZeroPdf(config, input(), controller.signal)).toEqual({
      state: "cancelled",
      code: "PDF_CANCELLED",
    });
    expect(capture.mock.calls.at(-1)![1][1]).toBe("ls");
  });
  it("refuses path-shaped or unrelated reconciliation IDs without filesystem/Docker use", async () => {
    for (const id of ["../private", "/tmp/private", "foreign", "zero-pdf-invalid"])
      expect(await reconcileZeroPdfRuntime(id)).toBe("unknown");
    expect(capture).not.toHaveBeenCalled();
  });
  it("takes an immutable copy before the first asynchronous read", async () => {
    const value = input();
    value.bytes = Buffer.from(value.bytes);
    const normalReader = reader.getMockImplementation()!;
    reader.mockImplementation(async (...args) => {
      value.bytes.fill(0);
      return normalReader(...args);
    });
    expect((await executeZeroPdf(config, value, new AbortController().signal)).state).toBe(
      "succeeded",
    );
  });
  it("refuses a linked quarantine directory before Docker or removal", async () => {
    const id = `zero-pdf-${randomUUID()}`;
    const directory = `/tmp/${id}`;
    await symlink("/tmp", directory);
    try {
      expect(await reconcileZeroPdfRuntime(id)).toBe("unknown");
      expect((await lstat(directory)).isSymbolicLink()).toBe(true);
      expect(capture).not.toHaveBeenCalled();
    } finally {
      await unlink(directory);
    }
  });
  it("quarantines successful extraction when container absence cannot be proven", async () => {
    const normal = capture.getMockImplementation()!;
    capture.mockImplementation(async (...args) =>
      args[1][1] === "ls" ? { code: 1, stdout: "" } : normal(...args),
    );
    const result = await executeZeroPdf(config, input(), new AbortController().signal);
    expect(result).toMatchObject({
      state: "unknown",
      code: "PDF_CLEANUP_UNKNOWN",
      quarantineId: expect.stringMatching(/^zero-pdf-/),
    });
    expect((await lstat(staging!)).isDirectory()).toBe(true);
    capture.mockImplementation(normal);
    if (result.state !== "unknown") throw new Error("Expected quarantine");
    expect(await reconcileZeroPdfRuntime(result.quarantineId)).toBe("cleaned");
    await expect(lstat(staging!)).rejects.toHaveProperty("code", "ENOENT");
  });
});
