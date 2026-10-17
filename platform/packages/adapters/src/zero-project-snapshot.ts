import { createHash } from "node:crypto";
import { constants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { chmod, mkdir, mkdtemp, open, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileHandlePath } from "./file-handle-path.js";

export type ProjectSnapshotLimits = {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
};

/** Operator configuration, never a tool input. This does not grant backend job access. */
export type ProjectSnapshotConfig = {
  scopeId: string;
  projectRoot: string;
  stagingRoot: string;
  allowedFiles: readonly string[];
  limits: ProjectSnapshotLimits;
};

export type ProjectSnapshotManifest = {
  schemaVersion: 1;
  scopeId: string;
  files: { path: string; bytes: number; sha256: string }[];
  totalBytes: number;
};

export class ProjectSnapshotError extends Error {
  constructor(
    public readonly code:
      | "unsupported_platform"
      | "invalid_config"
      | "invalid_request"
      | "scope_denied"
      | "path_denied"
      | "limit_exceeded"
      | "source_changed"
      | "snapshot_unavailable",
  ) {
    super(`Project snapshot rejected: ${code}`);
    this.name = "ProjectSnapshotError";
  }
}

const deny = (code: ProjectSnapshotError["code"]): never => {
  throw new ProjectSnapshotError(code);
};

function safeRelative(value: unknown): value is string {
  if (typeof value !== "string" || Buffer.byteLength(value) > 1024) return false;
  // V1 accepts Linux relative paths only; no decoding or Windows/WSL conversion.
  if (
    !value ||
    /[\\:%]/u.test(value) ||
    path.isAbsolute(value) ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    return false;
  return value.split("/").every((segment) => {
    const name = segment.toLowerCase();
    return (
      segment !== "" &&
      segment !== "." &&
      segment !== ".." &&
      !name.startsWith(".env") &&
      !name.startsWith(".git") &&
      ![
        ".git",
        "node_modules",
        ".ssh",
        ".aws",
        ".azure",
        ".config",
        ".local",
        ".gnupg",
        ".docker",
        ".kube",
        ".npmrc",
        ".pypirc",
        ".netrc",
        ".vault-token",
      ].includes(name) &&
      !/^\.?(?:credentials?|secrets?|tokens?|auth|service[._-]account)(?:[._-]|$)/u.test(name) &&
      !/^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/u.test(name) &&
      !/\.(?:pem|key|p12|pfx|keystore)$/u.test(name)
    );
  });
}

function contains(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

async function canonicalDirectory(value: string) {
  if (!path.isAbsolute(value) || value === "/" || value === "/mnt" || value.startsWith("/mnt/"))
    deny("invalid_config");
  const canonical = await realpath(value);
  if (canonical !== value || canonical === "/") deny("invalid_config");
  const handle = await open(
    value,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    if ((await fileHandlePath(handle.fd)) !== canonical) deny("invalid_config");
    const stat = await handle.stat({ bigint: true });
    return { path: canonical, device: stat.dev, inode: stat.ino };
  } finally {
    await handle.close();
  }
}

/**
 * Bounded local snapshot foundation for Linux/WSL. Requires a trusted, quiescent staging
 * directory. Read-only modes protect against accidental edits, not the same OS user or
 * hostile code; execution still requires the existing grant/worker/sandbox boundary.
 * Each digest binds the bytes copied, not a transactional view of a live project tree.
 */
export async function createProjectSnapshotter(config: ProjectSnapshotConfig) {
  if (process.platform !== "linux") deny("unsupported_platform");
  // Copy operator policy before the first await, so later caller mutation cannot widen it.
  const scopeId = config.scopeId;
  const rootInput = config.projectRoot;
  const stagingInput = config.stagingRoot;
  const limits = { ...config.limits };
  if (
    typeof scopeId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,128}$/u.test(scopeId) ||
    typeof rootInput !== "string" ||
    typeof stagingInput !== "string" ||
    !Array.isArray(config.allowedFiles) ||
    ![limits.maxFiles, limits.maxFileBytes, limits.maxTotalBytes].every(
      (value) => Number.isSafeInteger(value) && value > 0,
    ) ||
    Object.keys(limits).length !== 3 ||
    limits.maxFiles > 10_000 ||
    limits.maxFileBytes > 64 * 1024 * 1024 ||
    limits.maxTotalBytes > 256 * 1024 * 1024 ||
    config.allowedFiles.length === 0 ||
    config.allowedFiles.length > limits.maxFiles ||
    !config.allowedFiles.every(safeRelative)
  )
    deny("invalid_config");
  const allowed = new Set(config.allowedFiles);
  if (allowed.size !== config.allowedFiles.length) deny("invalid_config");
  let rootBinding: Awaited<ReturnType<typeof canonicalDirectory>>;
  let stagingBinding: Awaited<ReturnType<typeof canonicalDirectory>>;
  try {
    rootBinding = await canonicalDirectory(rootInput);
    stagingBinding = await canonicalDirectory(stagingInput);
    if (
      contains(rootBinding.path, stagingBinding.path) ||
      contains(stagingBinding.path, rootBinding.path)
    )
      deny("invalid_config");
  } catch (error) {
    if (error instanceof ProjectSnapshotError) throw error;
    return deny("invalid_config");
  }
  const root = rootBinding.path;
  const staging = stagingBinding.path;

  return {
    async snapshot(input: { scopeId: string; files: readonly string[] }) {
      if (!input || Object.keys(input).some((key) => !["scopeId", "files"].includes(key)))
        deny("invalid_request");
      if (input.scopeId !== scopeId) deny("scope_denied");
      if (!Array.isArray(input.files) || input.files.length === 0) deny("invalid_request");
      if (input.files.length > limits.maxFiles) deny("limit_exceeded");
      const files = [...input.files];
      if (!files.every((file) => safeRelative(file) && allowed.has(file))) deny("path_denied");
      if (new Set(files).size !== files.length) deny("invalid_request");
      files.sort();
      let destination: string | undefined;
      let rootHandle: FileHandle | undefined;
      try {
        rootHandle = await open(
          root,
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
        );
        if ((await fileHandlePath(rootHandle.fd)) !== root) deny("source_changed");
        const rootStat = await rootHandle.stat({ bigint: true });
        if (rootStat.dev !== rootBinding.device || rootStat.ino !== rootBinding.inode)
          deny("source_changed");
        // Staging is operator-owned and outside the live project. No requested destination.
        const currentStaging = await canonicalDirectory(staging);
        if (
          currentStaging.device !== stagingBinding.device ||
          currentStaging.inode !== stagingBinding.inode
        )
          deny("snapshot_unavailable");
        destination = await mkdtemp(path.join(staging, "zero-snapshot-"));
        await chmod(destination, 0o700);
        const manifest: ProjectSnapshotManifest = {
          schemaVersion: 1,
          scopeId,
          files: [],
          totalBytes: 0,
        };
        const directories = new Set<string>();
        for (const file of files) {
          const handles: FileHandle[] = [];
          try {
            let parent = rootHandle;
            let expected = root;
            const segments = file.split("/");
            for (const segment of segments.slice(0, -1)) {
              expected = path.join(expected, segment);
              const child = await open(
                `/proc/self/fd/${parent.fd}/${segment}`,
                constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
              );
              handles.push(child);
              if ((await fileHandlePath(child.fd)) !== expected) deny("source_changed");
              parent = child;
            }
            const source = await open(
              `/proc/self/fd/${parent.fd}/${segments.at(-1)!}`,
              constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
            );
            handles.push(source);
            const expectedFile = path.join(root, file);
            if ((await fileHandlePath(source.fd)) !== expectedFile) deny("source_changed");
            const before = await source.stat({ bigint: true });
            // Hard links could expose data originating outside the approved project.
            if (!before.isFile() || before.nlink !== 1n) deny("path_denied");
            if (
              before.size > BigInt(limits.maxFileBytes) ||
              before.size + BigInt(manifest.totalBytes) > BigInt(limits.maxTotalBytes)
            )
              deny("limit_exceeded");
            const chunks: Buffer[] = [];
            let bytes = 0;
            for (;;) {
              const buffer = Buffer.alloc(Math.min(64 * 1024, limits.maxFileBytes - bytes + 1));
              const read = await source.read(buffer, 0, buffer.length, null);
              if (read.bytesRead === 0) break;
              bytes += read.bytesRead;
              if (bytes > limits.maxFileBytes || bytes + manifest.totalBytes > limits.maxTotalBytes)
                deny("limit_exceeded");
              chunks.push(buffer.subarray(0, read.bytesRead));
            }
            const after = await source.stat({ bigint: true });
            if (
              before.size !== BigInt(bytes) ||
              before.size !== after.size ||
              before.mtimeNs !== after.mtimeNs ||
              before.ctimeNs !== after.ctimeNs ||
              (await fileHandlePath(source.fd)) !== expectedFile
            )
              deny("source_changed");
            const content = Buffer.concat(chunks);
            const output = path.join(destination, "files", file);
            await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
            let directory = path.dirname(output);
            while (directory !== destination) {
              directories.add(directory);
              directory = path.dirname(directory);
            }
            await writeFile(output, content, { flag: "wx", mode: 0o400 });
            manifest.files.push({
              path: file,
              bytes,
              sha256: createHash("sha256").update(content).digest("hex"),
            });
            manifest.totalBytes += bytes;
          } finally {
            for (const handle of handles.reverse()) await handle.close();
          }
        }
        const serialized = JSON.stringify(manifest);
        const sha256 = createHash("sha256").update(serialized).digest("hex");
        await writeFile(path.join(destination, "manifest.json"), serialized, {
          flag: "wx",
          mode: 0o400,
        });
        for (const directory of [...directories].sort().reverse()) await chmod(directory, 0o500);
        await chmod(destination, 0o500);
        return { directory: destination, manifest, sha256 };
      } catch (error) {
        if (destination) {
          // Failed outputs are private staging only; restore modes before cleanup.
          await chmod(destination, 0o700).catch(() => undefined);
          await rm(destination, { recursive: true, force: true }).catch(() => undefined);
        }
        if (error instanceof ProjectSnapshotError) throw error;
        // Never return raw OS errors: they contain trusted absolute paths.
        return deny("snapshot_unavailable");
      } finally {
        await rootHandle?.close();
      }
    },
  };
}
