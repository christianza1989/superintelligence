import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as handlePaths from "./file-handle-path.js";
import type { ProjectSnapshotConfig } from "./zero-project-snapshot.js";
import { createProjectSnapshotter, ProjectSnapshotError } from "./zero-project-snapshot.js";

describe.skipIf(process.platform !== "linux")("bounded project snapshots", () => {
  let base: string;
  let root: string;
  let staging: string;
  let config: ProjectSnapshotConfig;
  beforeEach(async () => {
    base = await mkdtemp(path.join(tmpdir(), "zero-scope-test-"));
    root = path.join(base, "project");
    staging = path.join(base, "staging");
    await mkdir(root);
    await mkdir(staging);
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src/index.ts"), "export const value = 1;\n");
    await writeFile(path.join(root, "package.json"), "{}");
    config = {
      scopeId: "project-one",
      projectRoot: root,
      stagingRoot: staging,
      allowedFiles: ["src/index.ts", "package.json"],
      limits: { maxFiles: 2, maxFileBytes: 64, maxTotalBytes: 128 },
    };
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    async function writable(directory: string) {
      await chmod(directory, 0o700);
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.isDirectory()) await writable(path.join(directory, entry.name));
      }
    }
    await writable(base);
    await rm(base, { recursive: true, force: true });
  });
  const request = { scopeId: "project-one", files: ["src/index.ts", "package.json"] };

  it("copies only selected files and binds a stable sorted manifest to exact bytes", async () => {
    await writeFile(path.join(root, ".env"), "FAKE_TEST_SECRET=hidden");
    const snapshotter = await createProjectSnapshotter(config);
    const snapshot = await snapshotter.snapshot(request);
    const second = await snapshotter.snapshot({ ...request, files: [...request.files].reverse() });
    expect(snapshot.sha256).toBe(second.sha256);
    expect(snapshot.sha256).toBe(
      createHash("sha256").update(JSON.stringify(snapshot.manifest)).digest("hex"),
    );
    expect(
      JSON.parse(await readFile(path.join(snapshot.directory, "manifest.json"), "utf8")),
    ).toEqual(snapshot.manifest);
    expect(snapshot.manifest.files.map((file) => file.path)).toEqual([
      "package.json",
      "src/index.ts",
    ]);
    for (const file of snapshot.manifest.files) {
      const bytes = await readFile(path.join(snapshot.directory, "files", file.path));
      expect(file.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(file.bytes).toBe(bytes.length);
      expect((await stat(path.join(snapshot.directory, "files", file.path))).mode & 0o777).toBe(
        0o400,
      );
    }
    expect((await stat(snapshot.directory)).mode & 0o777).toBe(0o500);
    await writeFile(path.join(root, "src/index.ts"), "changed live source");
    expect(await readFile(path.join(snapshot.directory, "files/src/index.ts"), "utf8")).toBe(
      "export const value = 1;\n",
    );
    expect((await snapshotter.snapshot(request)).sha256).not.toBe(snapshot.sha256);
    expect(JSON.stringify(snapshot.manifest)).not.toContain(base);
  });

  it.each([
    "../outside",
    "/etc/passwd",
    "src/../../outside",
    "src//index.ts",
    "src/./index.ts",
    "C:\\secret",
    "C:/secret",
    "//host/share",
    "%2e%2e/outside",
    "src/%252e%252e/outside",
    "src/evil\u0000file",
  ])("rejects noncanonical or foreign request path %j", async (file) => {
    const snapshotter = await createProjectSnapshotter(config);
    await expect(snapshotter.snapshot({ ...request, files: [file] })).rejects.toMatchObject({
      code: "path_denied",
    });
    expect(await readdir(staging)).toEqual([]);
  });

  it.each([
    ".env",
    ".ENV.local",
    "src/.env.production",
    ".git/config",
    "node_modules/tool.js",
    ".aws/credentials",
    ".ssh/id_ed25519",
    ".git-credentials",
    "credentials.json",
    "secrets.json",
    "auth.json",
    "private.pem",
    ".npmrc",
  ])("cannot allowlist default private path %j", async (file) => {
    await expect(
      createProjectSnapshotter({ ...config, allowedFiles: [file] }),
    ).rejects.toMatchObject({ code: "invalid_config" });
  });

  it("denies unknown scopes, unapproved files, duplicate paths and model-supplied policy", async () => {
    const snapshotter = await createProjectSnapshotter(config);
    await expect(snapshotter.snapshot({ ...request, scopeId: "other" })).rejects.toMatchObject({
      code: "scope_denied",
    });
    await expect(snapshotter.snapshot({ ...request, files: ["README.md"] })).rejects.toMatchObject({
      code: "path_denied",
    });
    await expect(
      snapshotter.snapshot({ ...request, files: ["package.json", "package.json"] }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      snapshotter.snapshot({ ...request, projectRoot: "/" } as typeof request),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("copies operator policy before awaiting and does not accept later widening", async () => {
    const creating = createProjectSnapshotter(config);
    config.allowedFiles = ["package.json", "not-allowed.txt"];
    config.limits.maxFileBytes = 1_000;
    const snapshotter = await creating;
    await expect(
      snapshotter.snapshot({ ...request, files: ["not-allowed.txt"] }),
    ).rejects.toMatchObject({ code: "path_denied" });
    await writeFile(path.join(root, "package.json"), "x".repeat(65));
    await expect(snapshotter.snapshot(request)).rejects.toMatchObject({ code: "limit_exceeded" });
  });

  it.each([0, -1, Infinity, NaN, 0.5, Number.MAX_SAFE_INTEGER])(
    "requires explicit bounded positive integer limits (%j)",
    async (maxFiles) => {
      await expect(
        createProjectSnapshotter({ ...config, limits: { ...config.limits, maxFiles } }),
      ).rejects.toMatchObject({ code: "invalid_config" });
    },
  );

  it("enforces file count, individual bytes and total bytes before releasing output", async () => {
    const snapshotter = await createProjectSnapshotter(config);
    await expect(
      snapshotter.snapshot({ ...request, files: ["package.json", "src/index.ts", "extra"] }),
    ).rejects.toMatchObject({ code: "limit_exceeded" });
    await writeFile(path.join(root, "src/index.ts"), "x".repeat(65));
    await expect(snapshotter.snapshot(request)).rejects.toMatchObject({ code: "limit_exceeded" });
    expect(await readdir(staging)).toEqual([]);
    await writeFile(path.join(root, "src/index.ts"), "x".repeat(63));
    const smaller = await createProjectSnapshotter({
      ...config,
      limits: { ...config.limits, maxTotalBytes: 64 },
    });
    await expect(smaller.snapshot(request)).rejects.toMatchObject({ code: "limit_exceeded" });
    expect(await readdir(staging)).toEqual([]);
  });

  it.each(["file", "directory", "hardlink", "fifo"])(
    "rejects %s indirection/special files without disclosing errors",
    async (kind) => {
      const outside = path.join(base, "outside");
      await mkdir(outside);
      await writeFile(path.join(outside, "index.ts"), "FAKE_PRIVATE_CONTENT");
      if (kind === "directory") {
        await rm(path.join(root, "src"), { recursive: true });
        await symlink(outside, path.join(root, "src"));
      } else {
        await rm(path.join(root, "src/index.ts"));
        if (kind === "file")
          await symlink(path.join(outside, "index.ts"), path.join(root, "src/index.ts"));
        if (kind === "hardlink")
          await link(path.join(outside, "index.ts"), path.join(root, "src/index.ts"));
        if (kind === "fifo") execFileSync("mkfifo", [path.join(root, "src/index.ts")]);
      }
      const snapshotter = await createProjectSnapshotter(config);
      const error = await snapshotter.snapshot(request).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(ProjectSnapshotError);
      expect(String(error)).not.toContain(base);
      expect(String(error)).not.toContain("FAKE_PRIVATE_CONTENT");
      expect(await readdir(staging)).toEqual([]);
    },
  );

  it("rejects a root directory swapped after operator binding", async () => {
    const snapshotter = await createProjectSnapshotter(config);
    await rename(root, path.join(base, "old-project"));
    await mkdir(root);
    await writeFile(path.join(root, "package.json"), "{}");
    await expect(
      snapshotter.snapshot({ ...request, files: ["package.json"] }),
    ).rejects.toMatchObject({ code: "source_changed" });
  });

  it("fails closed when a checked parent is replaced between validation and file open", async () => {
    const snapshotter = await createProjectSnapshotter(config);
    const original = handlePaths.fileHandlePath;
    const outside = path.join(base, "outside");
    await mkdir(outside);
    await writeFile(path.join(outside, "index.ts"), "FAKE_PRIVATE_CONTENT");
    let swapped = false;
    vi.spyOn(handlePaths, "fileHandlePath").mockImplementation(async (fd) => {
      const heldPath = await original(fd);
      if (!swapped && heldPath === path.join(root, "src")) {
        swapped = true;
        await rename(path.join(root, "src"), path.join(base, "moved-src"));
        await symlink(outside, path.join(root, "src"));
      }
      return heldPath;
    });
    await expect(snapshotter.snapshot(request)).rejects.toMatchObject({ code: "source_changed" });
    expect(swapped).toBe(true);
    expect(await readdir(staging)).toEqual([]);
  });

  it("requires canonical disjoint operator roots and rejects Windows/mounted roots", async () => {
    await expect(createProjectSnapshotter({ ...config, projectRoot: "/" })).rejects.toMatchObject({
      code: "invalid_config",
    });
    await expect(
      createProjectSnapshotter({ ...config, projectRoot: "C:\\project" }),
    ).rejects.toMatchObject({ code: "invalid_config" });
    await expect(
      createProjectSnapshotter({ ...config, projectRoot: "/mnt/c/project" }),
    ).rejects.toMatchObject({ code: "invalid_config" });
    await expect(
      createProjectSnapshotter({ ...config, stagingRoot: path.join(root, "src") }),
    ).rejects.toMatchObject({ code: "invalid_config" });
    await symlink(root, path.join(base, "alias"));
    await expect(
      createProjectSnapshotter({ ...config, projectRoot: path.join(base, "alias") }),
    ).rejects.toMatchObject({ code: "invalid_config" });
  });
});
