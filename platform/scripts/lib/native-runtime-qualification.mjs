import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

const hashFile = async file => {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
};
const safeRelative = value => typeof value === "string" && value.length > 0 && !path.isAbsolute(value) && value.split(/[\\/]/).every(part => part && part !== "." && part !== "..");
const inside = (root, file) => file === root || file.startsWith(root + path.sep);

export function nativeQualificationArguments(args) {
  if (args.length === 1 && args[0] === "--plan") return { plan: true };
  if (args.length !== 9 || args[0] !== "--run") throw new Error("Explicit --run and pinned package/image/source/build arguments required");
  const result = {};
  for (let index = 1; index < args.length; index += 2) {
    if (!["--package", "--postgres-image", "--expected-source", "--build-sha256"].includes(args[index]) || result[args[index]] !== undefined) throw new Error("Invalid native qualification arguments");
    result[args[index]] = args[index + 1];
  }
  if (!path.isAbsolute(result["--package"]) || !/^sha256:[a-f0-9]{64}$/.test(result["--postgres-image"]) || !/^[a-f0-9]{40}$/.test(result["--expected-source"]) || !/^[a-f0-9]{64}$/.test(result["--build-sha256"])) throw new Error("Qualification requires absolute package and exact pins");
  return { packageDirectory: result["--package"], postgresImage: result["--postgres-image"], expectedSource: result["--expected-source"], buildSha256: result["--build-sha256"] };
}

export async function verifyNativeQualificationPackage(directory, expectedSource, expectedBuildHash) {
  const root = await realpath(directory), buildFile = path.join(root, "BUILD.json");
  const buildInfo = await lstat(buildFile);
  if (!buildInfo.isFile() || buildInfo.size > 64_000_000 || await hashFile(buildFile) !== expectedBuildHash) throw new Error("NATIVE_BUILD_MANIFEST_INTEGRITY");
  const build = JSON.parse(await readFile(buildFile, "utf8"));
  if (build.profile !== "native-mcp-local-v1" || build.sourceRevision !== expectedSource || build.sourceDirtyPaths?.length !== 0 || build.localOnly !== true || build.doNotPublish !== true || build.distributionReady !== false || build.runtimeQualified !== false || !["experimental-local-stage-not-distributable", "staged-not-runtime-qualified"].includes(build.status)) throw new Error("NATIVE_BUILD_PROVENANCE");
  if (!Array.isArray(build.files) || build.files.length > 200_000) throw new Error("NATIVE_BUILD_FILE_BOUND");
  const expected = new Map(), actual = new Set();
  let bytes = 0, entries = 0;
  for (const item of build.files) {
    if (!safeRelative(item.path) || item.path === "BUILD.json" || expected.has(item.path)) throw new Error("NATIVE_BUILD_INVALID_PATH");
    expected.set(item.path, item);
  }
  async function walk(folder, depth = 0) {
    if (depth > 64) throw new Error("NATIVE_BUILD_DIRECTORY_BOUND");
    for (const name of await readdir(folder)) {
      if (++entries > 250_000) throw new Error("NATIVE_BUILD_DIRECTORY_BOUND");
      const file = path.join(folder, name), relative = path.relative(root, file), info = await lstat(file);
      if (info.isDirectory()) { await walk(file, depth + 1); continue; }
      if (relative === "BUILD.json") continue;
      const item = expected.get(relative);
      if (!item) throw new Error("NATIVE_BUILD_UNINVENTORIED_FILE");
      actual.add(relative);
      if (info.isSymbolicLink()) {
        const target = await realpath(file);
        if (!inside(root, target) || !safeRelative(item.symlink) || path.relative(root, target) !== item.symlink) throw new Error("NATIVE_BUILD_SYMLINK_ESCAPE");
      } else {
        if (!info.isFile() || info.size !== item.bytes || !/^[a-f0-9]{64}$/.test(item.sha256) || await hashFile(file) !== item.sha256) throw new Error("NATIVE_BUILD_FILE_INTEGRITY");
        bytes += info.size;
        if (bytes > 1_200_000_000) throw new Error("NATIVE_BUILD_BYTE_BOUND");
      }
    }
  }
  await walk(root);
  if (actual.size !== expected.size || bytes !== build.payloadFileBytesExcludingBuildManifest) throw new Error("NATIVE_BUILD_INCOMPLETE_INVENTORY");
  for (const file of ["app/api.mjs", "app/worker.mjs", "migrate.mjs", "pnpm-lock.yaml", "db/prisma/schema.prisma"]) if (!expected.has(file)) throw new Error("NATIVE_BUILD_REQUIRED_ENTRY_MISSING");
  return { build, bytes, manifestBytes: (await lstat(buildFile)).size };
}

export async function relocateNativeQualificationPackage(source, target, pins) {
  await verifyNativeQualificationPackage(source, pins.expectedSource, pins.buildSha256);
  await cp(source, target, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true });
  return verifyNativeQualificationPackage(target, pins.expectedSource, pins.buildSha256);
}

export function nativeQualificationEnvironment({ scratch, databaseUrl, apiPort, policyFile, secrets }) {
  return {
    PATH: "/usr/bin:/bin", HOME: path.join(scratch, "home"), XDG_CONFIG_HOME: path.join(scratch, "home/config"), XDG_CACHE_HOME: path.join(scratch, "home/cache"), TMPDIR: path.join(scratch, "tmp"), LANG: "C.UTF-8", TZ: "UTC",
    NODE_ENV: "production", DATABASE_URL: databaseUrl, REALTIME_DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: secrets.auth, ENCRYPTION_KEY: secrets.encryption, SCREEN_PROXY_SECRET: secrets.screen,
    SECRET_STORE: "encrypted", SANDBOX_PROVIDER: "none", CLOUD_AGENT_PROVIDER: "none", AGENT_RUNTIME: "scripted", WAKEUP_DRIVER: "graphile",
    API_HOST: "127.0.0.1", API_PORT: String(apiPort), API_URL: `http://127.0.0.1:${apiPort}`, BETTER_AUTH_URL: `http://127.0.0.1:${apiPort}`, WEB_ORIGIN: `http://127.0.0.1:${apiPort}`,
    SIGNUPS_ENABLED: "true", DATA_DIR: path.join(scratch, "data"), ZERO_PROJECT_POLICY_FILE: policyFile, RAKAZO_AUTO_REVIEW: "false",
  };
}
