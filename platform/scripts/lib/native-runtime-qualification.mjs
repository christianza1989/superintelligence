import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, cp, lstat, mkdir, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

const hashFile = async file => {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
};
const safeRelative = value => typeof value === "string" && value.length > 0 && !path.isAbsolute(value) && value.split(/[\\/]/).every(part => part && part !== "." && part !== "..");
const inside = (root, file) => file === root || file.startsWith(root + path.sep);

export async function prepareNativeQualificationDirectories(scratch) {
  for (const name of ["home", "tmp", "data", "operator", "cwd/child", "pg-data", "docker"]) {
    await mkdir(path.join(scratch, name), { recursive: true, mode: 0o700 });
  }
  // PG18 drops to its own UID before initializing the versioned child data
  // directory. Only the empty mounted parent needs cross-UID traversal; the
  // private host scratch root and the actual PGDATA remain inaccessible.
  await chmod(path.join(scratch, "pg-data"), 0o711);
}

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
  const root = path.resolve(directory), rootInfo = await lstat(directory);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || await realpath(directory) !== root) throw new Error("NATIVE_BUILD_PACKAGE_ROOT");
  const buildFile = path.join(root, "BUILD.json");
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
  for (const file of ["app/api.mjs", "app/worker.mjs", "migrate.mjs", "pnpm-lock.yaml", "db/prisma/schema.prisma", "web/index.html"]) if (!expected.has(file)) throw new Error("NATIVE_BUILD_REQUIRED_ENTRY_MISSING");
  return { build, bytes, manifestBytes: (await lstat(buildFile)).size };
}

export async function relocateNativeQualificationPackage(source, target, pins) {
  await verifyNativeQualificationPackage(source, pins.expectedSource, pins.buildSha256);
  const targetParent = path.dirname(target);
  if (await realpath(targetParent) !== path.dirname(path.resolve(target))) throw new Error("NATIVE_BUILD_TARGET_ROOT");
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

export function assertNativeQualificationProcessAlive(record) {
  if (record.exited || record.child.exitCode !== null || record.child.signalCode !== null || record.error || record.overflow || record.forced || record.stopRequested) throw new Error("NATIVE_QUALIFICATION_PROCESS_NOT_ALIVE");
}

async function waitForProcessClose(record, timeoutMs) {
  let timer;
  try {
    return await Promise.race([record.closed.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })]);
  } finally { clearTimeout(timer); }
}

// Cleanup is bounded and owns only process groups created by this run; it makes no acceptance claim.
export async function cleanupNativeQualificationProcess(record, { gracefulTimeoutMs = 5_000, killTimeoutMs = 2_000 } = {}) {
  const signalOwnedGroup = signal => {
    if (!Number.isSafeInteger(record.child.pid) || record.child.pid <= 0) return;
    try { process.kill(-record.child.pid, signal); } catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  if (!record.exited) signalOwnedGroup("SIGTERM");
  if (!await waitForProcessClose(record, gracefulTimeoutMs)) {
    record.forced = true;
    signalOwnedGroup("SIGKILL");
    if (!await waitForProcessClose(record, killTimeoutMs)) throw new Error("NATIVE_OWNED_PROCESS_CLEANUP_UNKNOWN");
  }
}

export async function stopNativeQualificationProcess(record, options) {
  assertNativeQualificationProcessAlive(record);
  record.stopRequested = true;
  await cleanupNativeQualificationProcess(record, options);
  if (!record.exited || record.code !== 0 || record.signal !== null || record.error || record.overflow || record.forced) throw new Error("NATIVE_QUALIFICATION_PROCESS_STOP_FAILED");
}

export async function qualifyNativeSharedWeb({ apiUrl, build, signal, assertAlive }) {
  const origin = new URL(apiUrl);
  if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("NATIVE_WEB_FIXTURE_ORIGIN");
  const entryFor = (file, bound) => {
    const item = build.files.find(item => item.path === file);
    if (!item || item.symlink || !Number.isSafeInteger(item.bytes) || item.bytes <= 0 || item.bytes > bound || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error("NATIVE_WEB_BUILD_ENTRY");
    return item;
  };
  const index = entryFor("web/index.html", 1_000_000);
  const request = async (suffix, method, bound) => {
    assertAlive();
    const response = await fetch(origin.origin + suffix, { method, headers: { accept: "text/html", "accept-encoding": "identity" }, redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]) });
    const chunks = []; let length = 0;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          length += value.byteLength;
          if (length > bound) throw new Error("NATIVE_WEB_RESPONSE_BOUND");
          chunks.push(Buffer.from(value));
        }
      } finally { await reader.cancel(); }
    }
    assertAlive();
    return { response, bytes: Buffer.concat(chunks) };
  };
  const check = (result, item, type, method) => {
    if (result.response.status !== 200 || result.response.headers.get("content-type") !== type || result.response.headers.get("content-length") !== String(item.bytes)) throw new Error("NATIVE_WEB_RESPONSE_METADATA");
    if (method === "HEAD") {
      if (result.bytes.length !== 0) throw new Error("NATIVE_WEB_HEAD_BODY");
    } else if (result.bytes.length !== item.bytes || createHash("sha256").update(result.bytes).digest("hex") !== item.sha256) throw new Error("NATIVE_WEB_RESPONSE_INTEGRITY");
  };
  const shell = await request("/discover", "GET", index.bytes);
  check(shell, index, "text/html; charset=utf-8", "GET");
  check(await request("/discover", "HEAD", 0), index, "text/html; charset=utf-8", "HEAD");
  // A literal root-relative, inventoried script only; never resolve arbitrary HTML URLs.
  let assetUrl;
  for (const tag of shell.bytes.toString("utf8").replace(/<!--[\s\S]*?(?:-->|$)/g, "").matchAll(/<script\b([^<>]{0,4096})>[\s\S]*?<\/script\s*>/gi)) {
    const attributes = new Map(), pattern = /\s+([A-Za-z_:][A-Za-z0-9_:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gy;
    let attribute, consumed = 0;
    while ((attribute = pattern.exec(tag[1]))) {
      consumed = pattern.lastIndex;
      const name = attribute[1].toLowerCase();
      if (attributes.has(name)) throw new Error("NATIVE_WEB_AMBIGUOUS_ASSET");
      attributes.set(name, attribute[2] ?? attribute[3] ?? attribute[4] ?? "");
    }
    if (tag[1].slice(consumed).trim()) throw new Error("NATIVE_WEB_AMBIGUOUS_ASSET");
    if (attributes.get("type") !== "module") continue;
    const value = attributes.get("src");
    if (value && /^\/assets\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(?:js|mjs)$/.test(value)) { assetUrl = value; break; }
  }
  if (!assetUrl) throw new Error("NATIVE_WEB_LOCAL_ASSET_MISSING");
  const asset = entryFor("web" + assetUrl, 32_000_000);
  for (const method of ["GET", "HEAD"]) check(await request(assetUrl, method, method === "HEAD" ? 0 : asset.bytes), asset, "text/javascript; charset=utf-8", method);
  const missing = "/assets/zero-native-qualification-missing-00000000.js";
  if (build.files.some(item => item.path === "web" + missing)) throw new Error("NATIVE_WEB_MISSING_CONTROL_COLLISION");
  for (const route of [missing, "/api/zero/native-package-qualification-missing"]) for (const method of ["GET", "HEAD"]) {
    if ((await request(route, method, method === "HEAD" ? 0 : 65_536)).response.status !== 404) throw new Error("NATIVE_WEB_RESERVED_OR_MISSING_FALLBACK");
  }
  return { index: { path: index.path, bytes: index.bytes, sha256: index.sha256 }, asset: { path: asset.path, bytes: asset.bytes, sha256: asset.sha256 }, checkedRequests: 8, uiQualified: false };
}
