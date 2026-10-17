#!/usr/bin/env node
/** Explicit, offline COPY-only derivation. The frozen research image is never modified. */
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const platform = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.dirname(platform);
const baseId = "sha256:24b0beed3d8a4f70d3daeae8c27c4bb4efe32526abada6ebb210b7bd6996eb63";
const baseRef = `zero-browser-shell@${baseId}`;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const cap = 2 * 1024 * 1024;
async function command(args, log) {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/docker", args, {
      env: { PATH: "/usr/local/bin:/usr/bin:/bin", DOCKER_BUILDKIT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (chunk) => {
        output += chunk.toString();
        if (Buffer.byteLength(output) > 1_048_576) child.kill("SIGKILL");
      });
    child.once("error", reject);
    child.once("close", async (code) => {
      clearTimeout(timer);
      if (log) await writeFile(log, output);
      code === 0 ? resolve(output.trim()) : reject(new Error("static_image_operation_failed"));
    });
  });
}
async function main() {
  if (
    process.argv.length !== 3 ||
    process.argv[2] !== "--prepare" ||
    process.platform !== "linux" ||
    !process.getuid ||
    process.getuid() === 0
  )
    throw new Error("explicit_linux_preparation_required");
  const base = JSON.parse(await command(["image", "inspect", baseRef]))[0];
  if (base.Id !== baseId || base.Size !== 865_014_333) throw new Error("frozen_base_changed");
  await mkdir(path.join(root, ".local"), { recursive: true, mode: 0o700 });
  const output = await mkdtemp(path.join(root, ".local/browser-static-image-"));
  const app = path.join(output, "app");
  await mkdir(app);
  const require = createRequire(path.join(platform, "packages/adapters/package.json"));
  const bundler = require("esbuild");
  if (bundler.version !== "0.28.2") throw new Error("static_bundler_changed");
  const built = await bundler.build({
    absWorkingDir: platform,
    entryPoints: ["packages/adapters/src/zero-browser-static-entry.ts"],
    outfile: path.join(app, "static-entrypoint.mjs"),
    bundle: true,
    minify: true,
    platform: "node",
    format: "esm",
    target: "node24",
    external: ["playwright-core", "jsdom"],
    metafile: true,
    legalComments: "external",
    banner: {
      js: "import {createRequire as zeroCreateRequire} from 'node:module';const require=zeroCreateRequire(import.meta.url);",
    },
  });
  await mkdir(path.join(app, "static-notices"));
  for (const name of ["LICENSE", "NOTICE"])
    await cp(path.join(root, name), path.join(app, "static-notices", `repository-${name}`));
  const packages = new Set();
  const notices = [];
  for (const input of Object.keys(built.metafile.inputs)) {
    let directory = path.dirname(path.resolve(platform, input));
    while (directory.startsWith(`${platform}/`)) {
      let metadata;
      try {
        metadata = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
      } catch {
        directory = path.dirname(directory);
        continue;
      }
      if (packages.has(directory)) break;
      packages.add(directory);
      if (packages.size > 32) throw new Error("static_notice_cap");
      const prefix = `${metadata.name}-${metadata.version}`.replace(/[^a-z0-9._-]/giu, "_");
      const files = [];
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (!entry.isFile() || !/^(licen[cs]e|notice|copying)(?:[-_.].*)?$/iu.test(entry.name))
          continue;
        const file = path.join(directory, entry.name);
        if ((await lstat(file)).size > 262_144) throw new Error("static_notice_cap");
        const name = `${prefix}-${entry.name}`;
        await cp(file, path.join(app, "static-notices", name));
        files.push(name);
      }
      notices.push({
        name: metadata.name,
        version: metadata.version,
        license: metadata.license,
        files,
      });
      break;
    }
  }
  const inventory = [];
  const walk = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) {
        const bytes = await readFile(file);
        inventory.push({
          path: path.relative(app, file).split(path.sep).join("/"),
          bytes: bytes.length,
          sha256: hash(bytes),
        });
      } else throw new Error("static_layer_special_file");
    }
  };
  await walk(app);
  inventory.sort((a, b) => a.path.localeCompare(b.path));
  const source = [];
  for (const input of Object.keys(built.metafile.inputs).sort())
    source.push({ path: input, sha256: hash(await readFile(path.resolve(platform, input))) });
  const lock = {
    profile: "zero-browser-static-v1",
    baseId,
    baseBytes: base.Size,
    source,
    notices,
    layer: inventory,
    caps: {
      layerBytes: cap,
      imageBytes: 900 * 1024 * 1024,
      downloads: 0,
      runtimeMs: 15_000,
      jobRuntimeMs: 20_000,
      memoryBytes: 512 * 1024 * 1024,
      cpus: 2,
      pids: 128,
      tmpfsBytes: 128 * 1024 * 1024,
    },
  };
  const lockBytes = Buffer.from(JSON.stringify(lock, null, 2));
  const layerBytes = inventory.reduce((sum, file) => sum + file.bytes, 0) + lockBytes.length;
  await writeFile(
    path.join(output, "preparation.json"),
    JSON.stringify({ layerBytes, cap, buildStarted: false, downloads: 0 }, null, 2),
  );
  await writeFile(path.join(output, "input-lock.json"), lockBytes);
  if (layerBytes > cap) throw new Error("static_layer_cap");
  const buildInputLockSha256 = hash(lockBytes);
  await writeFile(path.join(app, "static-build-input-lock.json"), lockBytes);
  await writeFile(
    path.join(output, "Dockerfile"),
    `FROM ${baseId}\nCOPY app /opt/zero-browser\nLABEL org.repositoryzero.browser.profile="zero-browser-static-v1" org.repositoryzero.browser.input-lock-sha256="${buildInputLockSha256}"\nENTRYPOINT ["/usr/local/bin/node","/opt/zero-browser/static-entrypoint.mjs"]\n`,
  );
  const tag = `zero-browser-static:${randomUUID()}`;
  await command(
    [
      "build",
      "--pull=false",
      "--network=none",
      "--tag",
      tag,
      "--iidfile",
      path.join(output, "image.id"),
      output,
    ],
    path.join(output, "build.log"),
  );
  const imageId = (await readFile(path.join(output, "image.id"), "utf8")).trim();
  const image = JSON.parse(await command(["image", "inspect", imageId]))[0];
  if (image.Size > 900 * 1024 * 1024 || image.Size - base.Size > cap)
    throw new Error("static_image_cap");
  const report = {
    profile: "zero-browser-static-v1",
    imageId,
    imageBytes: image.Size,
    addedImageBytes: image.Size - base.Size,
    layerBytes,
    buildInputLockSha256,
    baseId,
    downloads: 0,
    buildNetwork: "none",
    output,
  };
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
