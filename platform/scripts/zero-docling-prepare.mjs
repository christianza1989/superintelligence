import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { finished } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { dockerSizeUpperBound } from "../packages/adapters/docling/footprint.mjs";

// Explicit preparation only. Normal package imports never execute this script.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const profile = JSON.parse(
  await readFile(resolve(root, "platform/packages/adapters/docling/profile.json")),
);
const cache = resolve(root, ".cache/zero-docling-v1");
const started = Date.now();
const deadline = started + profile.limits.prepareMs;
const report = {
  version: 1,
  profile: profile.id,
  profileSha256: createHash("sha256")
    .update(await readFile(resolve(root, "platform/packages/adapters/docling/profile.json")))
    .digest("hex"),
  state: "not_run",
  defaultDownloads: 0,
  dependencyArchiveBytes: 0,
  modelBytes: 0,
  resolverMetadataWireBytes: 0,
  resolverMetadataNote:
    "Preparation uses committed wheel hashes and performs no dependency resolution. Initial development resolution attempts are separate evidence.",
  baseImageCompressedBytes: profile.pythonImageCompressedBytes,
  elapsedMs: 0,
};
if (process.argv.length !== 3 || process.argv[2] !== "--prepare") {
  process.stdout.write(
    `${JSON.stringify({ state: "blocked", code: "EXPLICIT_PREPARATION_REQUIRED", defaultDownloads: 0 })}\n`,
  );
  process.exit(2);
}
await mkdir(cache, { recursive: true, mode: 0o700 });
async function atomic(path, data) {
  await writeFile(`${path}.tmp`, data);
  await rename(`${path}.tmp`, path);
}
async function command(args, timeout = Math.max(1, deadline - Date.now())) {
  if (Date.now() >= deadline) throw new Error("PREPARE_TIMEOUT");
  return new Promise((ok, bad) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "",
      bytes = 0;
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (part) => {
        bytes += part.length;
        if (bytes <= 262144) output += part.toString("utf8");
        else child.kill("SIGKILL");
      });
    child.on("error", bad);
    child.on("close", async (code) => {
      clearTimeout(timer);
      if (code === 0) ok(output);
      else {
        await atomic(resolve(cache, "last-process.log"), output);
        bad(new Error(bytes > 262144 ? "PROCESS_OUTPUT_LIMIT" : "PREPARE_PROCESS_FAILED"));
      }
    });
  });
}
async function payload(url, target, expectedHash, maxBytes, expectedBytes) {
  if (Date.now() >= deadline) throw new Error("PREPARE_TIMEOUT");
  try {
    const prior = await readFile(target);
    if (
      prior.length <= maxBytes &&
      (!expectedBytes || prior.length === expectedBytes) &&
      createHash("sha256").update(prior).digest("hex") === expectedHash
    )
      return prior.length;
    throw new Error("CACHE_HASH_MISMATCH");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const host = new URL(url).hostname;
  if (
    ![
      "files.pythonhosted.org",
      "download.pytorch.org",
      "download-r2.pytorch.org",
      "huggingface.co",
    ].includes(host)
  )
    throw new Error("PAYLOAD_HOST_DENIED");
  const response = await fetch(url, {
    signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
  });
  if (!response.ok || !response.body) throw new Error("PAYLOAD_UNAVAILABLE");
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) {
    await response.body.cancel();
    throw new Error("DOWNLOAD_LIMIT");
  }
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const out = createWriteStream(`${target}.tmp`, { mode: 0o600 });
  const completion = finished(out);
  completion.catch(() => {});
  const hash = createHash("sha256");
  let total = 0;
  try {
    for await (const part of response.body) {
      total += part.length;
      if (total > maxBytes) throw new Error("DOWNLOAD_LIMIT");
      hash.update(part);
      if (!out.write(part)) await once(out, "drain");
    }
    out.end();
    await completion;
    if (hash.digest("hex") !== expectedHash || (expectedBytes && total !== expectedBytes))
      throw new Error("PAYLOAD_HASH_MISMATCH");
    await rename(`${target}.tmp`, target);
    return total;
  } finally {
    out.destroy();
  }
}
function buildRecords(output) {
  return new Map(
    output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const item = JSON.parse(line);
        if (
          typeof item.ID !== "string" ||
          !/^[a-z0-9]{10,64}$/.test(item.ID) ||
          typeof item.Shared !== "boolean"
        )
          throw new Error("BUILD_CACHE_MEASUREMENT_INVALID");
        return [item.ID, item];
      }),
  );
}
let cacheEntries = 0;
async function cacheBytes(path, depth = 0) {
  if (depth > 8 || Date.now() >= deadline) throw new Error("CACHE_SCAN_LIMIT");
  let sum = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (++cacheEntries > 1000) throw new Error("CACHE_SCAN_LIMIT");
    if (entry.isSymbolicLink()) throw new Error("CACHE_SYMLINK_DENIED");
    const file = resolve(path, entry.name);
    sum += entry.isDirectory() ? await cacheBytes(file, depth + 1) : (await stat(file)).size;
  }
  return sum;
}
try {
  report.state = "preparing";
  await command(["pull", "--platform", profile.platform, profile.pythonImage]);
  report.baseImageInstalledBytes = JSON.parse(
    await command(["image", "inspect", profile.pythonImage]),
  )[0].Size;
  const definitionPath = resolve(root, "platform/packages/adapters/docling/wheels.lock.json");
  if ((await stat(definitionPath)).size > 131072) throw new Error("LOCK_LIMIT");
  const definition = JSON.parse(await readFile(definitionPath));
  if (
    definition.version !== 1 ||
    definition.python !== "3.11" ||
    definition.platform !== profile.platform ||
    !Array.isArray(definition.packages) ||
    definition.packages.length > 200
  )
    throw new Error("LOCK_INVALID");
  report.wheelLockSha256 = createHash("sha256")
    .update(await readFile(definitionPath))
    .digest("hex");
  const wheels = resolve(cache, "wheels");
  await mkdir(wheels, { recursive: true, mode: 0o700 });
  const lock = [],
    packages = [];
  for (const item of definition.packages) {
    if (!/^[A-Za-z0-9_.-]+$/.test(item.name) || !/^[A-Za-z0-9_.+!-]+$/.test(item.version))
      throw new Error("LOCK_INVALID");
    const url = new URL(item.url);
    const name = decodeURIComponent(url.pathname.split("/").at(-1));
    const hash = item.sha256;
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      name !== item.file ||
      !name.endsWith(".whl") ||
      !/^[A-Za-z0-9_.+%-]+$/.test(name) ||
      !/^[a-f0-9]{64}$/.test(hash)
    )
      throw new Error("BINARY_WHEEL_REQUIRED");
    const bytes = await payload(
      url.href,
      resolve(wheels, name),
      hash,
      profile.limits.dependencyDownloadBytes - report.dependencyArchiveBytes,
    );
    report.dependencyArchiveBytes += bytes;
    packages.push({ name: item.name, version: item.version, file: name, bytes, sha256: hash });
    lock.push(`${item.name}==${item.version} --hash=sha256:${hash}`);
  }
  const slim = packages.find((p) => p.name.toLowerCase() === "docling-slim");
  if (!slim || slim.sha256 !== profile.package.sha256) throw new Error("DOCLING_PIN_MISMATCH");
  await atomic(resolve(cache, "requirements.lock"), `${lock.sort().join("\n")}\n`);
  await atomic(resolve(cache, "wheels.lock.json"), `${JSON.stringify(packages, null, 2)}\n`);
  for (const model of profile.models)
    for (const file of model.files) {
      report.modelBytes += await payload(
        file.url,
        resolve(cache, "models", model.repo.replace("/", "--"), file.file),
        file.sha256,
        profile.limits.modelDownloadBytes - report.modelBytes,
        file.bytes,
      );
    }
  const builderBefore = buildRecords(await command(["buildx", "du", "--format=json"]));
  const build = resolve(cache, "build");
  await mkdir(build, { recursive: true, mode: 0o700 });
  await atomic(
    resolve(build, "Dockerfile"),
    `FROM ${profile.pythonImage}\nRUN --mount=type=bind,from=wheels,source=.,target=/wheels python -m pip install --no-cache-dir --no-index --find-links=/wheels --require-hashes -r /wheels/requirements.lock && python -m pip check\nENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 HF_HUB_DISABLE_TELEMETRY=1 OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 NUMEXPR_NUM_THREADS=2 TOKENIZERS_PARALLELISM=false RAYON_NUM_THREADS=2\n`,
  );
  await atomic(resolve(wheels, "requirements.lock"), `${lock.sort().join("\n")}\n`);
  await command([
    "build",
    "--platform",
    profile.platform,
    "--network=none",
    "--build-context",
    `wheels=${wheels}`,
    "--tag",
    "zero-docling-cpu:2.140.0-local",
    build,
  ]);
  const image = JSON.parse(
    await command(["image", "inspect", "zero-docling-cpu:2.140.0-local"]),
  )[0];
  report.imageId = image.Id;
  report.installedImageBytes = image.Size;
  // Image includes base+installed packages. Cache includes wheel archives and models, without double-counting build bind mounts.
  report.installedDependencyBytes = image.Size - report.baseImageInstalledBytes;

  const builderAfter = buildRecords(await command(["buildx", "du", "--format=json"]));
  let ownedRecords = [];
  try {
    ownedRecords = JSON.parse(await readFile(resolve(cache, "build-records.json")));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (
    !Array.isArray(ownedRecords) ||
    ownedRecords.length > 1000 ||
    ownedRecords.some((id) => typeof id !== "string" || !/^[a-z0-9]{10,64}$/.test(id))
  )
    throw new Error("BUILD_CACHE_IDENTITY_INVALID");
  const owned = new Set([
    ...ownedRecords,
    ...[...builderAfter.keys()].filter((id) => !builderBefore.has(id)),
  ]);
  await atomic(resolve(cache, "build-records.json"), `${JSON.stringify([...owned])}\n`);
  report.buildCachePrivateUpperBoundBytes = [...builderAfter.values()]
    .filter((item) => owned.has(item.ID) && !item.Shared)
    .reduce((sum, item) => sum + dockerSizeUpperBound(item.Size), 0);
  report.ownedCacheBytes = await cacheBytes(cache);
  report.accountingReserveBytes = 1048576;
  report.physicalDeduplicatedBytes = null;
  report.accounting =
    "Conservative logical retained sum; Docker image includes shared base, own cache measured separately, owned nonshared BuildKit display sizes rounded upward. Physical filesystem dedup is not measured.";
  report.installedCacheUpperBoundBytes =
    image.Size +
    report.ownedCacheBytes +
    report.buildCachePrivateUpperBoundBytes +
    report.accountingReserveBytes;
  if (
    !Number.isSafeInteger(report.installedCacheUpperBoundBytes) ||
    report.installedCacheUpperBoundBytes < 0
  )
    throw new Error("FOOTPRINT_MEASUREMENT_INVALID");
  if (report.installedCacheUpperBoundBytes > profile.limits.installedCacheBytes)
    throw new Error("INSTALLED_CACHE_LIMIT");
  report.state = "prepared";
} catch (error) {
  report.state = "failed";
  report.code = /^[A-Z_]+$/.test(error.message) ? error.message : "PREPARATION_FAILED";
  process.exitCode = 1;
} finally {
  report.elapsedMs = Date.now() - started;
  await atomic(resolve(cache, "preparation.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
