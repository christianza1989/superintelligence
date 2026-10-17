import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyRuntimePackageClosure } from "./lib/runtime-package-closure.mjs";

// Source-built staging only. Uses existing entries/installed versions; never
// installs, starts services, downloads, runs migrations or claims qualification.
if (process.argv.length !== 2) throw new Error("This packager takes no arguments");
if (process.platform !== "linux" || process.arch !== "x64")
  throw new Error("The first staged native runtime profile requires Linux x64");
const workspace = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = path.dirname(workspace);
const require = createRequire(path.join(workspace, "package.json"));
const tsxRequire = createRequire(require.resolve("tsx/package.json"));
const { build, version: esbuildVersion } = await import(tsxRequire.resolve("esbuild"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const attempt = path.join(root, ".artifacts", "native-runtime-" + randomUUID());
const output = path.join(attempt, "runtime");
await mkdir(attempt, { recursive: true });
const report = {
  schemaVersion: 1, profile: "native-mcp-local-v1", sourceRevision:
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceDirtyPaths: [...new Set([
    ...execFileSync("git", ["diff", "--name-only", "-z", "HEAD"], { cwd: root, encoding: "utf8" }).split("\0"),
    ...execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0"),
  ].filter(Boolean))].sort(),
  sourceHelperSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  measuredAt: new Date().toISOString(), esbuildVersion,
  measurement: "staged-application-payload-not-whole-installed-production",
  runtimeQualified: false, wholeInstallBytes: null, physicalDedupBytes: null,
  status: "building", requiredServices: ["api", "worker", "postgres"],
  composeIdentity: { label: "repositoryzero.profile=native-mcp-local-v1", configured: false },
  data: { containerDestination: "/var/lib/repositoryzero", requiredExplicitSharedHostBind: true },
  externalRuntime: { node: "24.x Linux x64 glibc", includedInPayloadMeasurement: false },
  requirementsNotQualifiedByPackaging: [
    "actual package-only API/worker startup and model/auth isolation",
    "existing PostgreSQL/Graphile authority, jobs, restart and recovery",
    "shared compiled web UI plus serving; no web output included yet",
    "pinned verifier image and actual CSV/browser/PDF qualifications",
    "explicit native Compose profile and external private operator configuration",
    "whole install including images, Docker, initialized PG/WAL and bounded data",
  ],
};
try {
  // Filesystem-relative/native modules stay as their actual installed package
  // closures. This first stage retains the full canonical Prisma CLI closure.
  const external = ["graphile-worker", "jsdom", "sharp", "koffi", "d3-dsv"];
  report.closure = await copyRuntimePackageClosure({
    workspaceRoot: workspace, outputDirectory: output, maxBytes: 1_000_000_000,
    importers: [
      { file: path.join(workspace, "packages/adapters/package.json"), packages: external },
      { file: path.join(workspace, "packages/db/package.json"), packages: ["prisma"] },
    ],
  });
  const exports = new Map();
  for (const base of ["apps", "packages"]) {
    for (const name of (await readdir(path.join(workspace, base))).sort()) {
      const folder = path.join(workspace, base, name);
      let metadata;
      try { metadata = JSON.parse(await readFile(path.join(folder, "package.json"), "utf8")); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      if (!metadata.name?.startsWith("@rakazo/")) continue;
      for (const [subpath, declaration] of Object.entries(metadata.exports ?? {})) {
        const target = typeof declaration === "string" ? declaration : declaration.development ?? declaration.default;
        if (typeof target !== "string" || !target.startsWith("./")) throw new Error("Unsupported workspace export");
        const file = path.resolve(folder, target);
        if (!file.startsWith(folder + path.sep)) throw new Error("Workspace export escapes package");
        exports.set(metadata.name + (subpath === "." ? "" : subpath.slice(1)), file);
      }
    }
  }
  const result = await build({
    absWorkingDir: workspace, entryPoints: { api: "apps/api/src/index.ts", worker: "apps/worker/src/index.ts" },
    outdir: path.join(output, "app"), outExtension: { ".js": ".mjs" },
    bundle: true, splitting: true, format: "esm", platform: "node", target: "node24",
    write: false, treeShaking: true, metafile: true, sourcemap: false,
    legalComments: "inline", logLevel: "silent", external,
    define: { ZERO_RUNTIME_BUNDLED: "true", ZERO_OPERATOR_BUNDLED: "false" },
    banner: { js: 'import { createRequire as zeroRuntimeRequire } from "node:module"; const require = zeroRuntimeRequire(import.meta.url);' },
    plugins: [{ name: "declared-workspace-source-exports", setup(build) {
      build.onResolve({ filter: /^@rakazo\// }, args => {
        const file = exports.get(args.path);
        return file ? { path: file } : { errors: [{ text: "Missing workspace source export: " + args.path }] };
      });
    } }],
  });
  const bundleBytes = result.outputFiles.reduce((sum, file) => sum + file.contents.byteLength, 0);
  if (bundleBytes > 64_000_000) throw new Error("Runtime bundle exceeds 64 MB bound");
  await mkdir(path.join(output, "app"));
  for (const file of result.outputFiles) {
    await writeFile(file.path, file.contents, { flag: "wx" });
  }
  report.bundleFileBytes = bundleBytes;
  report.bundleInputFiles = Object.keys(result.metafile.inputs).length;
  report.warnings = result.warnings;
  // Retain the completed resolver inventory even if later asset/license work
  // fails; inspection must not require another memory-intensive bundle.
  await writeFile(path.join(attempt, "bundle-metafile.json"), JSON.stringify(result.metafile, null, 2) + "\n", { flag: "wx" });
  report.bundleFiles = result.outputFiles.map(file => ({
    path: path.relative(output, file.path), bytes: file.contents.byteLength,
    sha256: hash(file.contents),
  }));
  await cp(path.join(workspace, "pnpm-lock.yaml"), path.join(output, "pnpm-lock.yaml"), { errorOnExist: true });
  await mkdir(path.join(output, "db"));
  await cp(path.join(workspace, "packages/db/prisma"), path.join(output, "db/prisma"), { recursive: true, errorOnExist: true });
  for (const name of ["LICENSE", "NOTICE"]) await cp(path.join(root, name), path.join(output, name), { errorOnExist: true });
  // Explicit URL, fixed source schema/migrations, no developer dotenv loader.
  await writeFile(path.join(output, "db/prisma.config.mjs"), [
    'import { defineConfig } from "prisma/config";',
    'import { fileURLToPath } from "node:url";',
    'const url = process.env.DATABASE_URL;',
    'if (!url) throw new Error("DATABASE_URL is required");',
    'const parsed = new URL(url);',
    'if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || parsed.pathname.length <= 1) throw new Error("Invalid DATABASE_URL");',
    'export default defineConfig({ schema: fileURLToPath(new URL("./prisma/schema.prisma", import.meta.url)), migrations: { path: fileURLToPath(new URL("./prisma/migrations", import.meta.url)) }, datasource: { url } });',
    "",
  ].join("\n"), { flag: "wx" });
  await writeFile(path.join(output, "migrate.mjs"), [
    'import { spawn } from "node:child_process";',
    'import { fileURLToPath } from "node:url";',
    'if (process.argv.length !== 2) throw new Error("Migration launcher takes no arguments");',
    'const url = process.env.DATABASE_URL;',
    'if (!url) throw new Error("DATABASE_URL is required");',
    'const parsed = new URL(url);',
    'if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || parsed.pathname.length <= 1) throw new Error("Invalid DATABASE_URL");',
    'const child = spawn(process.execPath, [fileURLToPath(new URL("./node_modules/prisma/build/index.js", import.meta.url)), "migrate", "deploy", "--config", fileURLToPath(new URL("./db/prisma.config.mjs", import.meta.url))], { cwd: fileURLToPath(new URL("./db/", import.meta.url)), env: { DATABASE_URL: url, CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1", NODE_ENV: "production" }, stdio: "inherit" });',
    'child.once("error", () => { process.exitCode = 1; });',
    'child.once("exit", (code) => { process.exitCode = code ?? 1; });',
    'for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));',
    "",
  ].join("\n"), { flag: "wx" });
  // Preserve licenses for every bundled package, in addition to full external
  // closures. Do not infer license approval from successful package copying.
  const packages = new Map();
  for (const input of Object.keys(result.metafile.inputs)) {
    if (!input.includes("node_modules/")) continue;
    let folder = path.dirname(path.resolve(workspace, input));
    while (folder !== path.dirname(folder)) {
      try {
        const data = JSON.parse(await readFile(path.join(folder, "package.json"), "utf8"));
        if (typeof data.name === "string" && typeof data.version === "string") {
          packages.set(data.name + "@" + data.version, { folder, data }); break;
        }
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      folder = path.dirname(folder);
    }
  }
  const notices = [];
  for (const [id, { folder, data }] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
    const files = [];
    for (const name of (await readdir(folder)).sort()) {
      if (!/^(licen[cs]e|copying|notice)([._-]|$)/i.test(name) || !(await lstat(path.join(folder, name))).isFile()) continue;
      const relative = path.join("third-party", id.replace(/[^a-zA-Z0-9._-]/g, "_"), name);
      await mkdir(path.dirname(path.join(output, relative)), { recursive: true });
      await cp(path.join(folder, name), path.join(output, relative), { errorOnExist: true });
      files.push(relative);
    }
    const metadataFile = path.join("third-party", id.replace(/[^a-zA-Z0-9._-]/g, "_"), "package.json");
    await mkdir(path.dirname(path.join(output, metadataFile)), { recursive: true });
    await cp(path.join(folder, "package.json"), path.join(output, metadataFile), { errorOnExist: true });
    notices.push({ package: data.name, version: data.version, license: data.license ?? "unknown", metadataFile, files });
  }
  await writeFile(path.join(output, "THIRD-PARTY-NOTICES.json"), JSON.stringify(notices, null, 2) + "\n", { flag: "wx" });
  report.missingBundledLicenseFiles = notices.filter(notice => !notice.files.length).map(notice => ({
    package: notice.package, version: notice.version, declaredLicense: notice.license,
  }));
  if (report.missingBundledLicenseFiles.length) {
    throw new Error("Bundled dependencies lack license files; see missingBundledLicenseFiles");
  }
  await writeFile(path.join(output, "package.json"), JSON.stringify({
    name: "repositoryzero-native-runtime-stage", private: true, type: "module",
    engines: { node: ">=24 <25" },
  }, null, 2) + "\n", { flag: "wx" });
  // Full logical file inventory, including every copied native/CLI asset.
  const files = [];
  let bytes = 0;
  async function walk(folder) {
    for (const item of (await readdir(folder, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      const file = path.join(folder, item.name), rel = path.relative(output, file);
      if (item.isDirectory()) { await walk(file); continue; }
      const stat = await lstat(file);
      if (stat.isSymbolicLink()) {
        const resolved = await realpath(file);
        if (!resolved.startsWith(output + path.sep)) throw new Error("Staged symlink escapes package");
        files.push({ path: rel, symlink: path.relative(output, resolved) }); continue;
      }
      if (!stat.isFile()) throw new Error("Unsupported staged runtime file");
      bytes += stat.size;
      if (bytes > 1_200_000_000 || files.length >= 200000) throw new Error("Staged runtime exceeds file or byte bound");
      files.push({ path: rel, bytes: stat.size, sha256: hash(await readFile(file)) });
    }
  }
  await walk(output);
  report.files = files;
  report.payloadFileBytesExcludingBuildManifest = bytes;
  report.status = "staged-not-runtime-qualified";
  await writeFile(path.join(output, "BUILD.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ status: report.status, bundleFileBytes: bundleBytes, payloadFileBytesExcludingBuildManifest: bytes, buildManifestBytes: (await lstat(path.join(output, "BUILD.json"))).size, output: path.relative(root, output) }));
} catch (error) {
  report.status = "failed";
  report.failure = { name: error.name, code: error.code ?? null, message: error.message };
  await writeFile(path.join(attempt, "FAILED.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.error(JSON.stringify({ status: report.status, error: error.code ?? error.name, report: path.relative(root, path.join(attempt, "FAILED.json")) }));
  process.exitCode = 1;
}
