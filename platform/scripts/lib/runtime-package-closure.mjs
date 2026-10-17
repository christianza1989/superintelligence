import { constants, createReadStream } from "node:fs";
import {
  chmod,
  copyFile,
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  symlink,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const within = (root, file) => {
  const rel = path.relative(root, file);
  return (
    rel === "" ||
    (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel))
  );
};
const packageName = (value) =>
  typeof value === "string" &&
  /^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/iu.test(value) &&
  value.split("/").every((part) => part !== "." && part !== "..");
async function resolveInstalled(from, name, workspace) {
  if (!packageName(name)) throw new Error("Invalid runtime package name");
  let directory = from;
  while (within(workspace, directory)) {
    const candidate = path.join(directory, "node_modules", name);
    try {
      return await realpath(candidate);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
    if (directory === workspace) break;
    directory = path.dirname(directory);
  }
  return null;
}
async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

/** Copy a bounded, already-installed third-party closure; never install or resolve versions. */
export async function copyRuntimePackageClosure(options) {
  return runtimePackageClosure(options, false);
}

/** Read installed source payloads only; this is not an installed production disk measurement. */
export async function inspectRuntimePackageClosure(options) {
  return runtimePackageClosure(options, true);
}

async function runtimePackageClosure(
  { workspaceRoot, importers, outputDirectory, maxBytes = 1_000_000_000 },
  inspectOnly,
) {
  const workspace = await realpath(workspaceRoot),
    store = await realpath(path.join(workspace, "node_modules/.pnpm"));
  const output = inspectOnly
    ? path.join(workspace, ".runtime-inventory-unused")
    : path.resolve(outputDirectory);
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 2_000_000_000 ||
    within(store, output)
  )
    throw new Error("Invalid runtime closure bounds");
  if (!Array.isArray(importers) || !importers.length || importers.length > 64)
    throw new Error("Runtime closure requires explicit importers");
  const nodes = new Map(),
    roots = new Map(),
    missingOptional = new Set();
  let copiedBytes = 0,
    fileCount = 0;
  const visit = async (source) => {
    if (!within(store, source) || source === store)
      throw new Error(
        "Runtime dependency escapes the installed third-party store",
      );
    if (nodes.has(source)) return nodes.get(source);
    if (nodes.size >= 4096)
      throw new Error("Runtime package count exceeds its bound");
    const data = JSON.parse(
      await readFile(path.join(source, "package.json"), "utf8"),
    );
    if (!packageName(data.name) || typeof data.version !== "string")
      throw new Error("Invalid installed package metadata");
    const relative = path.relative(store, source),
      target = path.join(output, "node_modules/.pnpm", relative);
    const node = { source, target, data, relative, dependencies: new Map() };
    nodes.set(source, node);
    const dependencies = { ...data.dependencies, ...data.optionalDependencies };
    for (const [name] of Object.entries(dependencies).sort()) {
      const resolved = await resolveInstalled(source, name, workspace);
      if (!resolved) {
        if (name in (data.optionalDependencies ?? {})) {
          missingOptional.add(name);
          continue;
        }
        throw new Error(
          "Required runtime dependency is not installed: " + name,
        );
      }
      node.dependencies.set(name, await visit(resolved));
    }
    // Preserve installed peer resolution, without inventing absent optional peers.
    for (const name of Object.keys(data.peerDependencies ?? {}).sort()) {
      if (node.dependencies.has(name)) continue;
      const resolved = await resolveInstalled(source, name, workspace);
      if (resolved) node.dependencies.set(name, await visit(resolved));
      else if (data.peerDependenciesMeta?.[name]?.optional)
        missingOptional.add(name);
      else throw new Error("Required runtime peer is not installed: " + name);
    }
    return node;
  };
  for (const importer of importers) {
    const file = await realpath(importer.file);
    if (
      !within(workspace, file) ||
      !Array.isArray(importer.packages) ||
      !importer.packages.length ||
      importer.packages.length > 512
    )
      throw new Error("Invalid runtime importer");
    for (const name of importer.packages) {
      const resolved = await resolveInstalled(
        path.dirname(file),
        name,
        workspace,
      );
      if (!resolved) throw new Error("Runtime root is not installed: " + name);
      const node = await visit(resolved);
      if (roots.has(name) && roots.get(name) !== node)
        throw new Error("Runtime roots require conflicting package versions");
      roots.set(name, node);
    }
  }
  // Caller supplies an existing staging parent. Existing outputs are never overwritten.
  if (!inspectOnly) await mkdir(output);
  const copiedInodes = new Map(),
    manifests = [];
  const copyPackage = async (node) => {
    let packageBytes = 0,
      packageFiles = 0;
    const treeHash = createHash("sha256");
    const walk = async (source, target, relative = "") => {
      if (!inspectOnly) await mkdir(target, { recursive: true });
      for (const entry of (await readdir(source, { withFileTypes: true })).sort(
        (a, b) => a.name.localeCompare(b.name),
      )) {
        if (entry.name === "node_modules") continue;
        const input = path.join(source, entry.name),
          out = path.join(target, entry.name),
          rel = path.join(relative, entry.name),
          info = await lstat(input, { bigint: true });
        const bytes = Number(info.size);
        if (info.isDirectory()) {
          await walk(input, out, rel);
          continue;
        }
        if (info.isSymbolicLink()) {
          const resolved = await realpath(input);
          if (!within(node.source, resolved))
            throw new Error(
              "Runtime package asset symlink escapes its package",
            );
          const dest = path.join(
            node.target,
            path.relative(node.source, resolved),
          );
          if (!inspectOnly)
            await symlink(path.relative(path.dirname(out), dest), out);
          treeHash.update(
            JSON.stringify([
              rel,
              "symlink",
              path.relative(node.source, resolved),
            ]),
          );
          continue;
        }
        if (!info.isFile())
          throw new Error("Unsupported runtime package asset");
        copiedBytes += bytes;
        packageBytes += bytes;
        fileCount++;
        packageFiles++;
        if (copiedBytes > maxBytes || fileCount > 200000)
          throw new Error("Runtime closure exceeds byte or file bound");
        const identity = info.dev + ":" + info.ino,
          prior = copiedInodes.get(identity);
        if (!inspectOnly && prior) await link(prior, out);
        else if (!inspectOnly) {
          await copyFile(input, out, constants.COPYFILE_FICLONE);
          copiedInodes.set(identity, out);
          await chmod(out, Number(info.mode & 0o777n));
        }
        treeHash.update(
          JSON.stringify([
            rel,
            Number(info.mode & 0o777n),
            bytes,
            await hashFile(inspectOnly ? input : out),
          ]),
        );
      }
    };
    await walk(node.source, node.target);
    manifests.push({
      name: node.data.name,
      version: node.data.version,
      instance: node.relative.split(path.sep).join("/"),
      license:
        typeof node.data.license === "string" ? node.data.license : "unknown",
      files: packageFiles,
      fileBytes: packageBytes,
      treeSha256: treeHash.digest("hex"),
      dependencies: Object.fromEntries(
        [...node.dependencies]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, dependency]) => [
            name,
            dependency.relative.split(path.sep).join("/"),
          ]),
      ),
    });
  };
  for (const node of nodes.values()) await copyPackage(node);
  const alias = async (file, target) => {
    if (inspectOnly || file === target) return;
    await mkdir(path.dirname(file), { recursive: true });
    try {
      await symlink(path.relative(path.dirname(file), target), file);
    } catch (error) {
      if (
        error.code !== "EEXIST" ||
        (await realpath(file)) !== (await realpath(target))
      )
        throw error;
    }
  };
  for (const node of nodes.values())
    for (const [name, dependency] of node.dependencies)
      await alias(
        path.join(node.target, "node_modules", name),
        dependency.target,
      );
  for (const [name, node] of roots)
    await alias(path.join(output, "node_modules", name), node.target);
  let apparentBytes = 0,
    allocatedBytes = 0,
    uniqueInodes = 0;
  const measured = new Set();
  const measure = async (directory) => {
    for (const entry of await readdir(directory)) {
      const file = path.join(directory, entry),
        info = await lstat(file, { bigint: true });
      apparentBytes += Number(info.size);
      const id = info.dev + ":" + info.ino;
      if (!measured.has(id)) {
        measured.add(id);
        allocatedBytes += Number(info.blocks) * 512;
        uniqueInodes++;
      }
      if (info.isDirectory()) await measure(file);
    }
  };
  if (!inspectOnly) {
    const rootInfo = await lstat(output);
    apparentBytes += rootInfo.size;
    allocatedBytes += rootInfo.blocks * 512;
    uniqueInodes++;
    await measure(output);
  }
  if (apparentBytes > maxBytes)
    throw new Error("Runtime closure exceeds its total disk bound");
  return {
    schemaVersion: 1,
    measurement: inspectOnly ? "source-inventory" : "copied-runtime",
    packages: manifests.sort((a, b) => a.instance.localeCompare(b.instance)),
    roots: [...roots.keys()].sort(),
    rootBindings: Object.fromEntries(
      [...roots]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, node]) => [name, node.relative.split(path.sep).join("/")]),
    ),
    missingOptional: [...missingOptional].sort(),
    fileCount,
    fileBytes: copiedBytes,
    apparentBytes: inspectOnly ? null : apparentBytes,
    allocatedBytes: inspectOnly ? null : allocatedBytes,
    uniqueInodes: inspectOnly ? null : uniqueInodes,
    physicalSharedExtentDedup: null,
  };
}
