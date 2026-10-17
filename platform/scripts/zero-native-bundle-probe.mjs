import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Offline source feasibility only: no install, services or runnable outputs.
if (process.argv.length !== 2) throw new Error("This probe takes no arguments");
const workspace = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = path.dirname(workspace);
const require = createRequire(path.join(workspace, "package.json"));
// Resolve only the already-installed build tool, without network/store fallback.
const tsxRequire = createRequire(require.resolve("tsx/package.json"));
const esbuild = await import(tsxRequire.resolve("esbuild"));
const exports = new Map();
for (const base of ["apps", "packages"]) {
  for (const directory of (await readdir(path.join(workspace, base))).sort()) {
    const folder = path.join(workspace, base, directory);
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
const directory = path.join(root, ".artifacts", "g0-source-bundle-probe-" + randomUUID());
await mkdir(directory, { recursive: true });
const report = {
  schemaVersion: 1, measurement: "source-bundle-feasibility-not-installed-production",
  sourceDirtyPaths: [...new Set([
    ...execFileSync("git", ["diff", "--name-only", "-z", "HEAD"], { cwd: root, encoding: "utf8" }).split("\0"),
    ...execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0"),
  ].filter(Boolean))].sort(),
  sourceHelperSha256: createHash("sha256").update(await readFile(fileURLToPath(import.meta.url))).digest("hex"),
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  measuredAt: new Date().toISOString(),
  entryPoints: ["apps/api/src/index.ts", "apps/worker/src/index.ts"],
  resolver: "workspace source exports; exact installed third-party dependencies",
  buildToolVersion: esbuild.version, runtimeQualified: false,
  installedProductionBytes: null, physicalDedupBytes: null,
  outstandingRuntimeRequirements: [
    "required direct imports resolve without unrelated store fallback",
    "preserve graphile-worker migrations and native/dynamic package closures",
    "preserve generated Prisma runtime/WASM and canonical migrations",
    "preserve reviewed d3-dsv source and pinned lock at qualified runtime paths",
    "bundled operator policy protects actual package root",
    "explicit private environment/configuration policy outside package",
    "compile and serve existing shared web UI",
    "qualify API/worker startup, existing-authority jobs, verifier use and restart",
    "measure whole install including images, Docker, initialized DB/WAL and bounded data",
  ],
};
try {
  const result = await esbuild.build({
    absWorkingDir: workspace, entryPoints: { api: report.entryPoints[0], worker: report.entryPoints[1] },
    outdir: "source-bundle-probe", bundle: true, splitting: true, format: "esm", platform: "node",
    target: "node24", treeShaking: true, write: false, metafile: true, sourcemap: false, logLevel: "silent",
    plugins: [{ name: "declared-workspace-source-exports", setup(build) {
      build.onResolve({ filter: /^@rakazo\// }, args => {
        const file = exports.get(args.path);
        return file ? { path: file } : { errors: [{ text: "Missing workspace source export: " + args.path }] };
      });
    } }],
  });
  report.bundleFileBytes = result.outputFiles.reduce((sum, file) => sum + file.contents.byteLength, 0);
  if (report.bundleFileBytes > 64_000_000) throw new Error("Probe output exceeds 64 MB bound");
  report.status = "bundle-generated-not-runtime-qualified";
  report.metafile = result.metafile;
  report.warnings = result.warnings;
  report.outputHashes = result.outputFiles.map(file => ({
    path: path.relative(workspace, file.path), bytes: file.contents.byteLength,
    sha256: createHash("sha256").update(file.contents).digest("hex"),
  }));
} catch (error) {
  report.status = "failed"; report.errors = error.errors ?? [{ text: error.message }];
  report.warnings = error.warnings ?? []; process.exitCode = 1;
}
await writeFile(path.join(directory, "probe.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({
  status: report.status, buildToolVersion: report.buildToolVersion, bundleFileBytes: report.bundleFileBytes ?? null,
  inputFiles: report.metafile ? Object.keys(report.metafile.inputs).length : null,
  errors: (report.errors ?? []).map(error => ({ text: error.text, file: error.location?.file, line: error.location?.line })),
  warnings: report.warnings.length, report: path.relative(root, path.join(directory, "probe.json")),
}));
