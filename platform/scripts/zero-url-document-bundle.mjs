#!/usr/bin/env node
/** Explicit offline release preparation. Never called by a request, never builds/pulls an image. */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const platform = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.dirname(platform);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const output = process.argv[2];
if (
  process.argv.length !== 3 ||
  process.platform !== "linux" ||
  !process.getuid ||
  process.getuid() === 0 ||
  !output ||
  !path.isAbsolute(output)
)
  throw new Error("Explicit new absolute release directory required on nonroot Linux");
const require = createRequire(path.join(platform, "packages/adapters/package.json"));
const esbuild = require("esbuild");
if (esbuild.version !== "0.28.2") throw new Error("Pinned bundler required");
const build = await esbuild.build({
  absWorkingDir: platform,
  entryPoints: ["packages/adapters/src/zero-url-document-entry.ts"],
  bundle: true,
  write: false,
  minify: true,
  platform: "node",
  format: "iife",
  globalName: "zeroCapturedDocumentEntry",
  target: "node24",
  metafile: true,
  external: ["playwright-core", "jsdom"],
  legalComments: "inline",
  logLevel: "silent",
});
if (build.outputFiles.length !== 1 || build.outputFiles[0].contents.length > 2_097_152)
  throw new Error("Bounded single fixed runner required");
const sourcePins = [];
const packages = new Map();
for (const input of Object.keys(build.metafile.inputs).sort()) {
  const absolute = path.resolve(platform, input);
  const bytes = await readFile(absolute);
  let directory = path.dirname(absolute),
    metadata;
  while (directory !== path.dirname(directory)) {
    try {
      const candidate = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
      // Subpath package.json files may declare only type/exports; find the owning package.
      if (typeof candidate.name === "string" && typeof candidate.version === "string") {
        metadata = candidate;
        break;
      }
    } catch {
      // A source directory need not itself contain package metadata.
    }
    directory = path.dirname(directory);
  }
  if (!metadata?.name || !metadata?.version) throw new Error("Source metadata required");
  sourcePins.push({
    package: metadata.name,
    version: metadata.version,
    file: path.relative(directory, absolute).split(path.sep).join("/"),
    sha256: hash(bytes),
  });
  if (!packages.has(directory)) packages.set(directory, metadata);
}
if (packages.size > 32 || sourcePins.length > 512) throw new Error("Bundle closure cap");
const notices = [];
for (const [directory, metadata] of packages) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/^(licen[cs]e|notice|copying)(?:[-_.].*)?$/iu.test(entry.name))
      continue;
    const bytes = await readFile(path.join(directory, entry.name));
    if (bytes.length > 262_144) throw new Error("Notice cap");
    const name = `${metadata.name}-${metadata.version}-${entry.name}`.replace(
      /[^a-z0-9._-]/giu,
      "_",
    );
    notices.push({ name, bytes });
    files.push(name);
  }
  if (!files.length && !metadata.name.startsWith("@rakazo/"))
    throw new Error("Bundled package notices missing");
}
if (notices.reduce((sum, file) => sum + file.bytes.length, 0) > 2_097_152)
  throw new Error("Notice closure cap");
await mkdir(output, { mode: 0o700 }); // Exclusive; an existing release is never overwritten.
await mkdir(path.join(output, "notices"), { mode: 0o700 });
const runner = build.outputFiles[0].contents;
await writeFile(path.join(output, "runner.js"), runner, { mode: 0o400, flag: "wx" });
for (const file of notices)
  await writeFile(path.join(output, "notices", file.name), file.bytes, { mode: 0o400, flag: "wx" });
for (const name of ["LICENSE", "NOTICE"])
  await writeFile(
    path.join(output, "notices", `repository-${name}`),
    await readFile(path.join(root, name)),
    { mode: 0o400, flag: "wx" },
  );
const manifest = {
  profile: "zero-url-captured-document-v1",
  bundler: { name: "esbuild", version: esbuild.version },
  runner: { name: "runner.js", bytes: runner.length, sha256: hash(runner) },
  sourcePins,
  dependencyNotices: [...packages.values()].map(({ name, version, license }) => ({
    name,
    version,
    license,
  })),
  limitations: [
    "Explicit source preparation only; no build/type/browser/runtime qualification is implied",
    "Pinned existing browser image and separate current-scope authorization are required at execution",
  ],
};
await writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
  mode: 0o400,
  flag: "wx",
});
console.log(
  JSON.stringify({
    profile: manifest.profile,
    runnerSha256: manifest.runner.sha256,
    bytes: runner.length,
    status: "prepared_not_qualified",
  }),
);
