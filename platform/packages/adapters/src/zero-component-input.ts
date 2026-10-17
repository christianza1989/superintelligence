import { chmod, lstat, mkdir, opendir, readFile, realpath, rm } from "node:fs/promises";
import path from "node:path";
import type { ArtifactStore } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { IsolationError, Prisma } from "@rakazo/db";
import type { ZeroComponentAuthorize, ZeroComponentPrincipal } from "./zero-component-jobs.js";
import {
  authorizeZeroComponent,
  zeroComponentContext,
  zeroComponentHash,
} from "./zero-component-jobs.js";
import { createProjectSnapshotter } from "./zero-project-snapshot.js";

export interface ZeroComponentInputBinding {
  snapshot: { projectRoot: string; stagingRoot: string };
  files: readonly { fileId: string; path: string; sha256: string }[];
}
export interface ZeroComponentInputRef {
  artifactId: string;
  sha256: string;
  bytes: number;
}
type Family = "pdf" | "browser";
// Includes the filename. Snapshot wrapper directories and manifest entries must
// fit inside reserve()'s unchanged depth-16 / entry-64 cleanup walk.
export const ZERO_COMPONENT_INPUT_MAX_PATH_SEGMENTS = 12;
type Dependencies = {
  prisma: PrismaClient;
  artifacts: ArtifactStore;
  authorize: ZeroComponentAuthorize;
};
const bounds = { pdf: 1_048_576, browser: 16_384 } as const;
const names = { pdf: "zero-pdf-input.pdf", browser: "zero-browser-input.html" } as const;
const mime = { pdf: "application/pdf", browser: "text/html" } as const;

/** Four bounded snapshot slots; crash orphans require explicit operator recovery. */
async function reserve(binding: ZeroComponentInputBinding, principal: ZeroComponentPrincipal) {
  const bad = () => new Error("component_input_cleanup_required");
  const base = binding.snapshot.stagingRoot;
  if (!path.isAbsolute(base) || (await realpath(base)) !== base) throw bad();
  const baseInfo = await lstat(base);
  if (
    !baseInfo.isDirectory() ||
    baseInfo.isSymbolicLink() ||
    baseInfo.uid !== process.getuid?.() ||
    (baseInfo.mode & 0o777) !== 0o700
  )
    throw bad();
  const scope = path.join(
    base,
    `zero-input-${zeroComponentHash(JSON.stringify([principal.spaceId, principal.userId, principal.scopeId]))}`,
  );
  await mkdir(scope, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  const info = await lstat(scope);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid?.() ||
    (info.mode & 0o777) !== 0o700 ||
    (await realpath(scope)) !== scope
  )
    throw bad();
  const scan = async (directory: string, writable = false) => {
    let bytes = 0,
      entries = 0;
    const walk = async (current: string, depth: number) => {
      if (depth > 16 || ++entries > 64) throw bad();
      const item = await lstat(current);
      if (item.uid !== process.getuid?.() || item.isSymbolicLink()) throw bad();
      if (item.isDirectory()) {
        if (writable) await chmod(current, 0o700);
        for await (const entry of await opendir(current))
          await walk(path.join(current, entry.name), depth + 1);
      } else {
        bytes += item.size;
        if (!item.isFile() || item.nlink !== 1 || bytes > 2_097_152) throw bad();
      }
    };
    await walk(directory, 0);
  };
  for await (const item of await opendir(scope)) {
    if (!/^slot-[0-3]$/u.test(item.name) || !item.isDirectory()) throw bad();
    await scan(path.join(scope, item.name));
  }
  for (let slot = 0; slot < 4; slot++) {
    const directory = path.join(scope, `slot-${slot}`);
    try {
      await mkdir(directory, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
    const identity = await lstat(directory);
    return {
      directory,
      async release() {
        const current = await lstat(directory);
        if (
          !current.isDirectory() ||
          current.isSymbolicLink() ||
          current.dev !== identity.dev ||
          current.ino !== identity.ino
        )
          throw bad();
        await scan(directory, true);
        await rm(directory, { recursive: true });
      },
    };
  }
  throw bad();
}
function selected(binding: ZeroComponentInputBinding, fileId: string) {
  if (
    !binding.files.length ||
    binding.files.length > 10 ||
    new Set(binding.files.map((file) => file.fileId)).size !== binding.files.length
  )
    throw new IsolationError();
  const file = binding.files.find((entry) => entry.fileId === fileId);
  if (
    !file ||
    !/^[a-f0-9]{64}$/u.test(file.sha256) ||
    file.path.split("/").length > ZERO_COMPONENT_INPUT_MAX_PATH_SEGMENTS
  )
    throw new IsolationError();
  return file;
}
/** Validate owned input metadata before the worker reads any private source bytes. */
export async function loadZeroComponentInput(
  deps: Dependencies,
  family: Family,
  principal: ZeroComponentPrincipal,
  fileId: string,
  source: ZeroComponentInputRef,
  binding: ZeroComponentInputBinding,
  recheck: () => Promise<void>,
) {
  const expected = selected(binding, fileId);
  if (expected.sha256 !== source.sha256 || source.bytes < 1 || source.bytes > bounds[family])
    throw new IsolationError();
  const row = await deps.prisma.artifact.findFirst({
    where: {
      id: source.artifactId,
      spaceId: principal.spaceId,
      userId: principal.userId,
      name: names[family],
    },
  });
  if (
    row?.version !== 1 ||
    row.mimeType !== mime[family] ||
    row.hash !== source.sha256 ||
    row.size !== source.bytes
  )
    throw new IsolationError();
  const metadata = JSON.parse(row.description ?? "null");
  if (
    metadata?.scopeId !== principal.scopeId ||
    metadata?.fileId !== fileId ||
    metadata?.sha256 !== source.sha256
  )
    throw new IsolationError();
  await authorizeZeroComponent(deps, principal);
  await recheck();
  const bytes = await deps.artifacts.get(
    row.storageKey,
    zeroComponentContext(principal, row.id, family),
  );
  if (bytes.byteLength !== row.size || zeroComponentHash(bytes) !== row.hash)
    throw new Error("component_input_integrity_failed");
  await recheck();
  return bytes;
}
/** Only trusted file IDs select an operator allowlist; the request never supplies a path. */
export async function captureZeroComponentInput(
  deps: Dependencies,
  family: Family,
  principal: ZeroComponentPrincipal,
  fileId: string,
  binding: ZeroComponentInputBinding,
  recheck: () => Promise<void>,
): Promise<ZeroComponentInputRef> {
  const file = selected(binding, fileId);
  const nonce = `zero.${family}.input:${zeroComponentHash(JSON.stringify([principal.scopeId, fileId, file.sha256]))}`;
  const identity = {
    spaceId_userId_clientNonce: {
      spaceId: principal.spaceId,
      userId: principal.userId,
      clientNonce: nonce,
    },
  };
  const existing = await deps.prisma.artifact.findUnique({ where: identity });
  if (existing) {
    const source = { artifactId: existing.id, sha256: existing.hash, bytes: existing.size };
    await loadZeroComponentInput(deps, family, principal, fileId, source, binding, recheck);
    return source;
  }
  await authorizeZeroComponent(deps, principal);
  await recheck();
  const slot = await reserve(binding, principal);
  try {
    const snapshotter = await createProjectSnapshotter({
      scopeId: principal.scopeId,
      projectRoot: binding.snapshot.projectRoot,
      stagingRoot: slot.directory,
      allowedFiles: [file.path],
      limits: { maxFiles: 1, maxFileBytes: bounds[family], maxTotalBytes: bounds[family] },
    });
    await recheck();
    const snapshot = await snapshotter.snapshot({ scopeId: principal.scopeId, files: [file.path] });
    if (snapshot.manifest.files.length !== 1 || snapshot.manifest.files[0]?.sha256 !== file.sha256)
      throw new Error("component_input_integrity_failed");
    await recheck();
    const bytes = await readFile(path.join(snapshot.directory, "files", file.path));
    if (
      bytes.length > bounds[family] ||
      zeroComponentHash(bytes) !== file.sha256 ||
      (family === "pdf" && bytes.subarray(0, 5).toString("ascii") !== "%PDF-")
    )
      throw new Error("component_input_integrity_failed");
    if (family === "browser") new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    await recheck();
    const context = zeroComponentContext(principal, nonce, family);
    const stored = await deps.artifacts.put(
      { name: names[family], mimeType: mime[family], bytes },
      context,
    );
    let committed = false;
    try {
      await recheck();
      const row = await deps.prisma.artifact.create({
        data: {
          spaceId: principal.spaceId,
          userId: principal.userId,
          name: names[family],
          mimeType: mime[family],
          description: JSON.stringify({ scopeId: principal.scopeId, fileId, sha256: file.sha256 }),
          size: bytes.length,
          hash: file.sha256,
          storageKey: stored.id,
          version: 1,
          clientNonce: nonce,
        },
      });
      committed = true;
      return { artifactId: row.id, sha256: row.hash, bytes: row.size };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
        throw error;
      const row = await deps.prisma.artifact.findUniqueOrThrow({ where: identity });
      const source = { artifactId: row.id, sha256: row.hash, bytes: row.size };
      await loadZeroComponentInput(deps, family, principal, fileId, source, binding, recheck);
      return source;
    } finally {
      if (!committed) await deps.artifacts.remove(stored.id, context).catch(() => undefined);
    }
  } finally {
    await slot.release();
  }
}
