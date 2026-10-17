import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectRuntimePackageClosure } from "./lib/runtime-package-closure.mjs";

// This bounded offline source inventory deliberately does not install, bundle,
// copy a production runtime, contact Docker, or claim physical/deduplicated disk.
const workspace = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = path.dirname(workspace);
if (process.argv.length !== 2)
  throw new Error("This source inventory takes no arguments");
const packages = new Map();
for (const base of ["apps", "packages"]) {
  for (const directory of (await readdir(path.join(workspace, base))).sort()) {
    const file = path.join(workspace, base, directory, "package.json");
    try {
      const data = JSON.parse(await readFile(file, "utf8"));
      if (typeof data.name !== "string")
        throw new Error("Invalid workspace package");
      packages.set(data.name, { file, data });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
const selected = new Map();
function visit(name) {
  if (selected.has(name)) return;
  const pkg = packages.get(name);
  if (!pkg) throw new Error("Missing required workspace package");
  selected.set(name, pkg);
  for (const [dependency, version] of Object.entries(
    pkg.data.dependencies ?? {},
  ))
    if (version.startsWith("workspace:")) visit(dependency);
}
visit("@rakazo/api");
visit("@rakazo/worker");
const requests = [...selected].flatMap(([name, pkg]) => {
  const roots = Object.entries(pkg.data.dependencies ?? {})
    .filter(([, version]) => !version.startsWith("workspace:"))
    .map(([dependency]) => dependency);
  return roots.length ? [{ name, file: pkg.file, roots }] : [];
});
// Existing upstream launch and migration commands require these tools.
// A future compiled profile must account for its own actual replacement payload.
requests.push(
  {
    name: "source-runtime-loader",
    file: path.join(workspace, "package.json"),
    roots: ["tsx"],
  },
  {
    name: "canonical-migrations",
    file: packages.get("@rakazo/db").file,
    roots: ["prisma"],
  },
);
const runs = [];
for (const request of requests) {
  try {
    const report = await inspectRuntimePackageClosure({
      workspaceRoot: workspace,
      importers: [{ file: request.file, packages: request.roots }],
      maxBytes: 1_500_000_000,
    });
    runs.push({ name: request.name, report });
    console.log(
      request.name +
        ": " +
        report.packages.length +
        " package instances, " +
        report.fileBytes +
        " source file bytes",
    );
  } catch (error) {
    // Reports are portable and public-safe; filesystem exceptions can contain
    // private host paths, so retain their code without exporting their message.
    const failure = error.code
      ? "Filesystem failure (" + error.code + ")"
      : error.message;
    runs.push({ name: request.name, failure });
    console.log(request.name + ": incomplete (" + failure + ")");
  }
}
const instances = new Map();
for (const run of runs) {
  for (const pkg of run.report?.packages ?? []) {
    const previous = instances.get(pkg.instance);
    if (previous && previous.treeSha256 !== pkg.treeSha256)
      throw new Error("Installed source package changed during inventory");
    instances.set(pkg.instance, pkg);
  }
}
const report = {
  schemaVersion: 1,
  measurement: "source-inventory-not-installed-production",
  sourceDirtyPaths: [...new Set([
    ...execFileSync("git", ["diff", "--name-only", "-z", "HEAD"], { cwd: root, encoding: "utf8" }).split("\0"),
    ...execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0"),
  ].filter(Boolean))].sort(),
  sourceHelperSha256: createHash("sha256").update(await readFile(fileURLToPath(import.meta.url))).digest("hex"),
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  measuredAt: new Date().toISOString(),
  complete: runs.every((run) => !run.failure),
  workspacePackages: [...selected.keys()].sort(),
  runs,
  uniquePackageInstances: instances.size,
  uniqueSourceFileBytes: [...instances.values()].reduce(
    (sum, pkg) => sum + pkg.fileBytes,
    0,
  ),
  largestPackages: [...instances.values()]
    .sort((a, b) => b.fileBytes - a.fileBytes)
    .slice(0, 20),
  installedProductionBytes: null,
  physicalDedupBytes: null,
  excludedFromThisSourceMeasurement: [
    "application workspace source and generated Prisma client",
    "compiled shared web assets",
    "Node and operating-system runtime",
    "PostgreSQL image and initialized data",
    "PDF, browser and CSV verifier images",
    "Docker engine/CLI/Compose and storage metadata",
    "private configuration, artifacts, logs, backups and temporary build cache",
  ],
};
const directory = path.join(
  root,
  ".artifacts",
  "g0-source-inventory-" + randomUUID(),
);
await mkdir(directory, { recursive: true });
const file = path.join(directory, "inventory.json");
await writeFile(file + ".tmp", JSON.stringify(report, null, 2) + "\n", {
  flag: "wx",
});
await rename(file + ".tmp", file);
console.log(path.relative(root, file));
if (!report.complete) process.exitCode = 1;
