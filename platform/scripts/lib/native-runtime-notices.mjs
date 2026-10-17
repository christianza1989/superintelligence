import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const noticeName = name => /^(?:(?:un)?licen[cs]es?|copying|notice)([._-]|$)/i.test(name);
const within = (root, file) => {
  const relative = path.relative(root, file);
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
};

/** Use the installed package root, never an internal format-only package.json. */
export async function bundledRuntimePackages(workspace, inputs) {
  const store = await realpath(path.join(workspace, "node_modules/.pnpm"));
  const packages = new Map();
  const folders = new Set();
  for (const input of inputs) {
    if (!input.includes("node_modules/")) continue;
    const file = await realpath(path.resolve(workspace, input));
    if (!within(store, file)) throw new Error("Bundled dependency escapes installed store");
    const parts = path.relative(store, file).split(path.sep);
    if (parts[1] !== "node_modules" || !parts[2]) throw new Error("Unsupported bundled package layout");
    const length = parts[2].startsWith("@") ? 4 : 3;
    if (parts.length <= length) throw new Error("Bundled dependency is not a package file");
    const folder = path.join(store, ...parts.slice(0, length));
    if (folders.has(folder)) continue;
    const bytes = await readFile(path.join(folder, "package.json"));
    const data = JSON.parse(bytes);
    const expectedName = parts.slice(2, length).join("/");
    if (data.name !== expectedName || typeof data.version !== "string") throw new Error("Bundled package identity mismatch");
    const id = data.name + "@" + data.version;
    const previous = packages.get(id);
    if (previous && previous.packageJsonSha256 !== hash(bytes)) throw new Error("Conflicting bundled package metadata");
    if (!previous) packages.set(id, { folder, data, packageJsonSha256: hash(bytes) });
    folders.add(folder);
  }
  return packages;
}

/** Preserve original bytes. Supplemental evidence must match an exact package. */
export async function copyBundledRuntimeNotices({ packages, output, evidenceRoot, evidence = [] }) {
  const notices = [];
  let copiedBytes = 0, copiedFiles = 0;
  const preserve = async (relative, bytes) => {
    copiedBytes += bytes.length;
    if (bytes.length > 2_000_000 || copiedBytes > 16_000_000 || ++copiedFiles > 10_000) throw new Error("Native license assets exceed their byte or file bound");
    await mkdir(path.dirname(path.join(output, relative)), { recursive: true });
    await writeFile(path.join(output, relative), bytes, { flag: "wx" });
  };
  for (const [id, pkg] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
    const destination = path.join("third-party", id.replace(/[^a-zA-Z0-9._-]/g, "_"));
    const files = [];
    await mkdir(path.join(output, destination), { recursive: true });
    const copyNotice = async (name) => {
      const source = path.join(pkg.folder, name);
      const info = await lstat(source);
      if (info.isDirectory()) {
        for (const child of (await readdir(source)).sort()) await copyNotice(path.join(name, child));
        return;
      }
      if (!info.isFile()) throw new Error("Unsupported installed license asset");
      if (info.size > 2_000_000) throw new Error("Installed license asset exceeds its byte bound");
      const relative = path.join(destination, name);
      const bytes = await readFile(source);
      await preserve(relative, bytes);
      files.push({ path: relative, evidenceKind: "installed-license-file", sha256: hash(bytes) });
    };
    for (const name of (await readdir(pkg.folder)).sort()) {
      if (noticeName(name)) await copyNotice(name);
    }
    for (const entry of evidence.filter(item => item.package === pkg.data.name && item.version === pkg.data.version)) {
      if (entry.packageJsonSha256 !== pkg.packageJsonSha256 || !Array.isArray(entry.files) || !entry.files.length) throw new Error("Supplemental license identity mismatch");
      for (const file of entry.files) {
        const sourceRoot = file.evidenceKind === "installed-readme-full-license" ? pkg.folder : evidenceRoot;
        if (!sourceRoot || !["installed-readme-full-license", "official-exact-commit-license"].includes(file.evidenceKind)) throw new Error("Unsupported supplemental license evidence");
        const source = await realpath(path.resolve(sourceRoot, file.file));
        if (!within(await realpath(sourceRoot), source)) throw new Error("Supplemental license source escapes its root");
        const bytes = await readFile(source);
        if (bytes.length > 65_536 || hash(bytes) !== file.sha256) throw new Error("Supplemental license content mismatch");
        if (!/^[a-zA-Z0-9._-]+$/.test(file.outputName)) throw new Error("Invalid supplemental license filename");
        const relative = path.join(destination, file.outputName);
        await preserve(relative, bytes);
        files.push({ path: relative, sha256: file.sha256, evidenceKind: file.evidenceKind, source: file.source ?? null });
      }
    }
    const metadataFile = path.join(destination, "package.json");
    const metadataBytes = await readFile(path.join(pkg.folder, "package.json"));
    if (hash(metadataBytes) !== pkg.packageJsonSha256) throw new Error("Bundled package metadata changed during staging");
    await preserve(metadataFile, metadataBytes);
    notices.push({ package: pkg.data.name, version: pkg.data.version, license: pkg.data.license ?? "unknown", licenseApproval: "unknown", metadataFile, metadataSha256: pkg.packageJsonSha256, files });
  }
  return notices;
}

/** instance already includes node_modules/<name>; never append it a second time. */
export async function validateCopiedRuntimePackageMetadata({ output, closure, packages }) {
  const root = await realpath(output);
  for (const entry of closure.packages) {
    if (typeof entry.instance !== "string" || entry.instance.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Invalid copied package instance");
    const folder = await realpath(path.join(root, "node_modules/.pnpm", entry.instance));
    if (!within(root, folder)) throw new Error("Copied package escapes runtime");
    const bytes = await readFile(path.join(folder, "package.json"));
    const data = JSON.parse(bytes);
    const pkg = packages.get(entry.name + "@" + entry.version);
    if (!pkg || data.name !== entry.name || data.version !== entry.version || hash(bytes) !== pkg.packageJsonSha256) throw new Error("Copied runtime package identity mismatch");
  }
}
