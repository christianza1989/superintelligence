import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, open, readdir, readlink, rename, rmdir, unlink } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

export const NATIVE_BACKUP_PROFILE = "native-mcp-local-v1";
export const NATIVE_BACKUP_LIMITS = Object.freeze({ sqlBytes: 268435456, artifactBytes: 67108864, artifactRows: 512, manifestBytes: 262144, runtimeMs: 300000 });
const hash = (value) => createHash("sha256").update(value).digest("hex");
const deny = (code = "NATIVE_BACKUP_DENIED") => { throw new Error(code); };
const identifier = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const sha = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const absolute = (value) => typeof value === "string" && value.startsWith("/") && path.posix.normalize(value) === value && value !== "/" && !value.includes("\0");
const keys = (value, expected) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join() === [...expected].sort().join();
const nested = (parent, candidate) => candidate === parent || candidate.startsWith(`${parent}/`);
const same = (a, b) => a.dev === b.dev && a.ino === b.ino && a.uid === b.uid && a.mode === b.mode;

/** Linux descriptor and parent identity checks; no symlink, hardlink or checkout traversal. */
async function parents(file) {
  if (process.platform !== "linux" || !process.getuid || !absolute(file)) deny();
  const held = [];
  try {
    let current = path.dirname(file);
    for (;;) {
      const handle = await open(current, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      held.push({ current, handle, info: await handle.stat({ bigint: true }) });
      if (await lstat(path.join(current, ".git")).then(() => true, (error) => error.code === "ENOENT" ? false : Promise.reject(error))) deny();
      if (current === "/") break;
      current = path.dirname(current);
    }
    const verify = async () => {
      for (const item of held) {
        const named = await lstat(item.current, { bigint: true });
        if (!named.isDirectory() || named.isSymbolicLink() || !same(named, item.info) || await readlink(`/proc/self/fd/${item.handle.fd}`) !== item.current) deny();
      }
    };
    await verify();
    return { verify, sync: () => held[0].handle.sync(), close: async () => { await Promise.all(held.map(({ handle }) => handle.close())); } };
  } catch (error) {
    await Promise.all(held.map(({ handle }) => handle.close()));
    throw error;
  }
}

async function inspectDirectory(directory, empty = false) {
  const guard = await parents(path.join(directory, ".probe"));
  try {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o7777) !== 0o700) deny();
    if (info.uid !== process.getuid()) deny();
    if (empty && (await readdir(directory)).length) deny("NATIVE_RESTORE_TARGET_NOT_EMPTY");
    await guard.verify();
    return info.uid;
  } finally { await guard.close(); }
}

async function absent(file) {
  const guard = await parents(file);
  try {
    if (await lstat(file).then(() => true, (error) => error.code === "ENOENT" ? false : Promise.reject(error))) deny("NATIVE_TARGET_EXISTS");
    await guard.verify();
  } finally { await guard.close(); }
}

/** Read/copy through one pinned fd, verifying named file and all parent fds before/after. */
async function fileBytes(file, limit, owner, destination, retain = true, signal) {
  const guard = await parents(file);
  let input;
  let output;
  try {
    input = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = await input.stat({ bigint: true });
    const verify = async () => {
      await guard.verify();
      const after = await input.stat({ bigint: true });
      const named = await lstat(file, { bigint: true });
      if ([after, named].some((info) => !info.isFile() || !same(info, before) || info.nlink !== 1n || info.size !== before.size || info.mtimeNs !== before.mtimeNs || info.ctimeNs !== before.ctimeNs) || await readlink(`/proc/self/fd/${input.fd}`) !== file) deny();
    };
    if (!before.isFile() || before.uid !== BigInt(owner) || (before.mode & 0o7777n) !== 0o600n || before.nlink !== 1n || before.size > BigInt(limit)) deny();
    await verify();
    if (destination) output = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const digest = createHash("sha256");
    const chunks = [];
    const buffer = Buffer.alloc(65536);
    let size = 0;
    for (;;) {
      if (signal?.aborted) deny("NATIVE_BACKUP_TIMEOUT");
      const { bytesRead } = await input.read(buffer, 0, buffer.length, size);
      if (!bytesRead) break;
      size += bytesRead;
      if (size > limit) deny("NATIVE_BACKUP_LIMIT");
      const chunk = buffer.subarray(0, bytesRead);
      digest.update(chunk);
      if (output) {
        let written = 0;
        while (written < bytesRead) written += (await output.write(chunk, written, bytesRead - written)).bytesWritten;
      } else if (retain) chunks.push(Buffer.from(chunk));
    }
    if (size !== Number(before.size)) deny();
    await verify();
    await output?.sync();
    return { bytes: size, sha256: digest.digest("hex"), ...(destination || !retain ? {} : { value: Buffer.concat(chunks) }) };
  } finally { await output?.close(); await input?.close(); await guard.close(); }
}

function binding(value) {
  if (!keys(value, ["profile", "projectName", "composeFile", "envFile", "dataDirectory", "postgresContainerId", "databaseUser", "databaseName"]) || value.profile !== NATIVE_BACKUP_PROFILE || !identifier(value.projectName) || !identifier(value.databaseUser) || !identifier(value.databaseName) || !sha(value.postgresContainerId) || !absolute(value.composeFile) || !absolute(value.envFile) || !absolute(value.dataDirectory) || nested(value.dataDirectory, value.envFile) || nested(value.dataDirectory, value.composeFile)) deny();
  return Object.freeze({ ...value });
}
const scopeFor = (value) => ({ projectName: value.projectName, databaseUser: value.databaseUser, databaseName: value.databaseName });
const metadataSql = `SELECT COALESCE(json_agg(row_to_json(a) ORDER BY a.id),'[]'::json) FROM (SELECT id,"spaceId","userId","storageKey",size,hash FROM artifacts ORDER BY id LIMIT 513) a;`;
const identitySql = `SELECT json_build_object('database',current_database(),'user',current_user,'cluster',(pg_control_system()).system_identifier::text);`;
const emptySql = `WITH user_namespaces AS (SELECT oid FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema') AND nspname NOT LIKE 'pg_toast%') SELECT (SELECT count(*) FROM pg_class WHERE relnamespace IN (SELECT oid FROM user_namespaces)) + (SELECT count(*) FROM pg_proc WHERE pronamespace IN (SELECT oid FROM user_namespaces)) + (SELECT count(*) FROM pg_type WHERE typnamespace IN (SELECT oid FROM user_namespaces)) + (SELECT count(*) FROM pg_namespace WHERE oid IN (SELECT oid FROM user_namespaces) AND nspname <> 'public') + (SELECT count(*) FROM pg_extension WHERE extname <> 'plpgsql') + (SELECT count(*) FROM pg_largeobject_metadata);`;

/** Fixed Docker CLI boundary. Dumps stream to a private file instead of buffering 256 MiB. */
async function docker(args, options) {
  if (options.signal.aborted) deny("NATIVE_BACKUP_TIMEOUT");
  let reason;
  const chunks = [];
  let size = 0;
  let stderr = 0;
  const child = spawn("/usr/bin/docker", args, { env: { PATH: "/usr/bin:/bin", DOCKER_CONFIG: options.configDirectory }, stdio: ["pipe", "pipe", "pipe"] });
  const stop = (code) => { reason ??= code; child.kill("SIGKILL"); };
  const abort = () => stop("NATIVE_BACKUP_TIMEOUT");
  options.signal.addEventListener("abort", abort, { once: true });
  child.stderr.on("data", (chunk) => { stderr += chunk.length; if (stderr > 65536) stop("NATIVE_BACKUP_LIMIT"); });
  child.stdin.on("error", () => undefined);
  const completed = new Promise((resolve, reject) => {
    child.once("error", () => { reason ??= "NATIVE_DOCKER_UNAVAILABLE"; });
    child.once("close", (code) => code === 0 && !reason ? resolve() : reject(new Error(reason ?? "NATIVE_DOCKER_FAILED")));
  });
  const limiter = new Transform({ transform(chunk, _encoding, done) { size += chunk.length; size > options.outputLimit ? done(new Error("NATIVE_BACKUP_LIMIT")) : done(null, chunk); } });
  const destination = options.outputPath ? createWriteStream(options.outputPath, { flags: "wx", mode: 0o600 }) : new Transform({ transform(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  const output = pipeline(child.stdout, limiter, destination).catch((error) => { stop("NATIVE_BACKUP_LIMIT"); throw error; });
  const input = options.inputPath ? pipeline(createReadStream(options.inputPath), child.stdin) : Promise.resolve(child.stdin.end(options.input ?? ""));
  try { await Promise.all([completed, output, input]); return Buffer.concat(chunks); }
  finally { options.signal.removeEventListener("abort", abort); child.kill("SIGKILL"); }
}

function runtime(value, stage, signal, supplied) {
  const call = (args, options = {}) => (supplied ?? docker)(args, { configDirectory: path.join(stage, ".docker"), outputLimit: 2097152, signal, ...options });
  const compose = ["compose", "--project-name", value.projectName, "--file", value.composeFile, "--env-file", value.envFile];
  const sql = async (query) => (await call(["exec", "-i", value.postgresContainerId, "psql", "-X", "-A", "-t", "-U", value.databaseUser, "-d", value.databaseName, "--set=ON_ERROR_STOP=on", "--command", query])).toString("utf8").trim();
  const identity = async () => {
    const result = JSON.parse(await sql(identitySql));
    if (!keys(result, ["database", "user", "cluster"]) || result.database !== value.databaseName || result.user !== value.databaseUser || !/^\d{1,32}$/.test(result.cluster)) deny("NATIVE_DATABASE_IDENTITY");
    return result.cluster;
  };
  const verify = async () => {
    const ids = (await call([...compose, "ps", "--all", "--quiet"])).toString().trim().split(/\s+/);
    if (ids.length !== 3 || ids.some((id) => !sha(id)) || new Set(ids).size !== 3) deny("NATIVE_COMPOSE_OWNERSHIP");
    const format = '{"id":{{json .Id}},"labels":{{json .Config.Labels}},"state":{{json .State.Status}},"mounts":{{json .Mounts}}}';
    const rows = (await call(["inspect", "--type", "container", "--format", format, ...ids])).toString().trim().split("\n").map((line) => JSON.parse(line));
    const services = new Set();
    for (const row of rows) {
      const labels = row.labels;
      const service = labels?.["com.docker.compose.service"];
      if (!ids.includes(row.id) || services.has(service) || !["api", "worker", "postgres"].includes(service) || labels["com.docker.compose.project"] !== value.projectName || labels["com.docker.compose.project.config_files"] !== value.composeFile || labels["repositoryzero.profile"] !== NATIVE_BACKUP_PROFILE || labels["com.docker.compose.oneoff"] !== "False") deny("NATIVE_COMPOSE_OWNERSHIP");
      services.add(service);
      if (service === "postgres") {
        if (row.id !== value.postgresContainerId || row.state !== "running") deny("NATIVE_DATABASE_IDENTITY");
      } else {
        if (!["exited", "created"].includes(row.state)) deny("NATIVE_WRITERS_NOT_QUIESCED");
        if (row.mounts.some((mount) => typeof mount.Destination !== "string" || mount.Destination.startsWith("/var/lib/repositoryzero/"))) deny("NATIVE_DATA_BINDING");
        const mounts = row.mounts.filter((mount) => mount.Destination === "/var/lib/repositoryzero");
        if (mounts.length !== 1 || mounts[0].Type !== "bind" || mounts[0].Source !== value.dataDirectory || mounts[0].RW !== true) deny("NATIVE_DATA_BINDING");
      }
    }
    if (services.size !== 3) deny("NATIVE_COMPOSE_OWNERSHIP");
  };
  const rows = async () => artifactRows(JSON.parse(await sql(metadataSql)));
  return { call, sql, identity, verify, rows };
}

function artifactRows(rows) {
  if (!Array.isArray(rows) || rows.length > NATIVE_BACKUP_LIMITS.artifactRows) deny("NATIVE_BACKUP_LIMIT");
  const ids = new Set();
  let bytes = 0;
  for (const row of rows) {
    if (!keys(row, ["id", "spaceId", "userId", "storageKey", "size", "hash"]) || ![row.id, row.spaceId, row.userId, row.storageKey].every(identifier) || !sha(row.hash) || !Number.isSafeInteger(row.size) || row.size < 0 || ids.has(row.id)) deny("NATIVE_ARTIFACT_METADATA");
    ids.add(row.id); bytes += row.size;
  }
  if (bytes > NATIVE_BACKUP_LIMITS.artifactBytes) deny("NATIVE_BACKUP_LIMIT");
  return rows.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function filesFor(rows) {
  const files = new Map();
  for (const row of rows) {
    const name = `artifacts/${row.spaceId}/${row.storageKey}`;
    const value = { name, bytes: row.size, sha256: row.hash };
    if (files.has(name) && JSON.stringify(files.get(name)) !== JSON.stringify(value)) deny("NATIVE_ARTIFACT_METADATA");
    files.set(name, value);
  }
  return [...files.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
}
async function privateFile(file, bytes) {
  const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
async function stageFor(destination) {
  await absent(destination);
  const stage = path.join(path.dirname(destination), `.zero-backup-${randomUUID()}`);
  await mkdir(stage, { mode: 0o700 });
  await mkdir(path.join(stage, ".docker"), { mode: 0o700 });
  return stage;
}
async function publishDirectory(stage, destination, replacingEmpty = false) {
  const sourceParents = await parents(stage);
  const targetParents = await parents(destination);
  let source;
  let target;
  try {
    source = await open(stage, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const info = await source.stat({ bigint: true });
    if (!replacingEmpty) await mkdir(destination, { mode: 0o700 });
    target = await open(destination, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const reserved = await target.stat({ bigint: true });
    if (reserved.uid !== BigInt(process.getuid()) || (reserved.mode & 0o7777n) !== 0o700n || (await readdir(destination)).length) deny("NATIVE_TARGET_EXISTS");
    await sourceParents.verify(); await targetParents.verify();
    if (!same(await lstat(stage, { bigint: true }), info) || !same(await lstat(destination, { bigint: true }), reserved) || await readlink(`/proc/self/fd/${source.fd}`) !== stage || await readlink(`/proc/self/fd/${target.fd}`) !== destination) deny();
    await rename(stage, destination);
    await sourceParents.verify(); await targetParents.verify();
    if (!same(await lstat(destination, { bigint: true }), info) || await readlink(`/proc/self/fd/${source.fd}`) !== destination) deny();
    await source.sync();
    await sourceParents.sync();
    await targetParents.sync();
  } finally { await source?.close(); await target?.close(); await sourceParents.close(); await targetParents.close(); }
}
async function copyArtifacts(files, source, target, owner, signal) {
  await mkdir(path.join(target, "artifacts"), { mode: 0o700 });
  const directories = new Set();
  for (const file of files) {
    if (signal.aborted) deny("NATIVE_BACKUP_TIMEOUT");
    const directory = path.dirname(file.name);
    if (!directories.has(directory)) { await mkdir(path.join(target, directory), { mode: 0o700 }); directories.add(directory); }
    const actual = await fileBytes(path.join(source, file.name), file.bytes, owner, path.join(target, file.name), true, signal);
    if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256) deny("NATIVE_ARTIFACT_INTEGRITY");
  }
  // Persist new directory entries as well as the individually flushed file bytes.
  for (const name of [...directories, "artifacts", ""]) {
    const handle = await open(path.join(target, name), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { await handle.sync(); } finally { await handle.close(); }
  }
}
async function exactTree(root, files) {
  const expected = new Set(["database.sql", "manifest.json", ...files.map((file) => file.name)]);
  const directories = new Set(["artifacts", ...files.map((file) => path.dirname(file.name))]);
  const visit = async (relative = "") => {
    for (const name of await readdir(path.join(root, relative))) {
      const item = relative ? `${relative}/${name}` : name;
      const info = await lstat(path.join(root, item));
      if (info.isSymbolicLink()) deny("NATIVE_BACKUP_TREE");
      if (info.isDirectory() && directories.has(item)) await visit(item);
      else if (!info.isFile() || !expected.delete(item)) deny("NATIVE_BACKUP_TREE");
    }
  };
  await visit();
  if (expected.size) deny("NATIVE_BACKUP_TREE");
}
const bounded = (signal) => AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(NATIVE_BACKUP_LIMITS.runtimeMs)]);

/** Explicit private local snapshot: DB state/session rows plus immutable Artifact blobs, never bot homes or host auth. */
export async function backupNativeProfile(rawBinding, destination, { signal, docker: supplied } = {}) {
  if (signal?.aborted) deny("NATIVE_BACKUP_TIMEOUT");
  const value = binding(rawBinding);
  if (!absolute(destination) || nested(value.dataDirectory, destination) || nested(destination, value.dataDirectory) || nested(destination, value.envFile) || nested(destination, value.composeFile)) deny();
  const owner = await inspectDirectory(value.dataDirectory);
  const stage = await stageFor(destination);
  const active = bounded(signal);
  const run = runtime(value, stage, active, supplied);
  await run.verify();
  const cluster = await run.identity();
  const rows = await run.rows();
  const files = filesFor(rows);
  await run.call(["exec", "-i", value.postgresContainerId, "pg_dump", "-U", value.databaseUser, "-d", value.databaseName, "--no-owner", "--no-acl"], { outputPath: path.join(stage, "database.sql"), outputLimit: NATIVE_BACKUP_LIMITS.sqlBytes });
  await copyArtifacts(files, value.dataDirectory, stage, owner, active);
  if (JSON.stringify(await run.rows()) !== JSON.stringify(rows) || await run.identity() !== cluster) deny("NATIVE_SNAPSHOT_CHANGED");
  await run.verify();
  const sql = await fileBytes(path.join(stage, "database.sql"), NATIVE_BACKUP_LIMITS.sqlBytes, process.getuid(), undefined, false, active);
  if (sql.bytes < 1) deny("NATIVE_SQL_INTEGRITY");
  const manifest = { version: 1, profile: NATIVE_BACKUP_PROFILE, scope: scopeFor(value), sourceCluster: cluster, createdAt: new Date().toISOString(), sql: { bytes: sql.bytes, sha256: sql.sha256 }, artifacts: rows };
  const serialized = Buffer.from(JSON.stringify(manifest));
  if (serialized.length > NATIVE_BACKUP_LIMITS.manifestBytes || active.aborted) deny("NATIVE_BACKUP_LIMIT");
  await privateFile(path.join(stage, "manifest.json"), serialized);
  // Remove only this operation's empty Docker configuration directory, never any backup snapshot.
  await rmdir(path.join(stage, ".docker"));
  await exactTree(stage, files);
  await absent(destination);
  await publishDirectory(stage, destination);
  return { state: "verified", profile: NATIVE_BACKUP_PROFILE, manifestSha256: hash(serialized), artifactRows: rows.length, writers: "stopped" };
}

/** Trusted manifest digest is mandatory before any DB mutation. Failures after SQL leave writers stopped. */
export async function restoreNativeProfile(rawBinding, source, expectedManifestSha256, { signal, docker: supplied } = {}) {
  if (signal?.aborted) deny("NATIVE_BACKUP_TIMEOUT");
  const value = binding(rawBinding);
  if (!absolute(source) || !sha(expectedManifestSha256) || nested(source, value.dataDirectory) || nested(value.dataDirectory, source)) deny();
  const backupOwner = await inspectDirectory(source);
  const manifestBytes = await fileBytes(path.join(source, "manifest.json"), NATIVE_BACKUP_LIMITS.manifestBytes, backupOwner);
  if (manifestBytes.sha256 !== expectedManifestSha256) deny("NATIVE_MANIFEST_INTEGRITY");
  const manifest = JSON.parse(manifestBytes.value.toString("utf8"));
  if (!keys(manifest, ["version", "profile", "scope", "sourceCluster", "createdAt", "sql", "artifacts"]) || manifest.version !== 1 || manifest.profile !== NATIVE_BACKUP_PROFILE || JSON.stringify(manifest.scope) !== JSON.stringify(scopeFor(value)) || !/^\d{1,32}$/.test(manifest.sourceCluster) || !Number.isFinite(Date.parse(manifest.createdAt)) || !keys(manifest.sql, ["bytes", "sha256"]) || !Number.isSafeInteger(manifest.sql.bytes) || manifest.sql.bytes < 1 || manifest.sql.bytes > NATIVE_BACKUP_LIMITS.sqlBytes || !sha(manifest.sql.sha256)) deny("NATIVE_MANIFEST_SCOPE");
  const rows = artifactRows(manifest.artifacts);
  const files = filesFor(rows);
  await exactTree(source, files);
  await inspectDirectory(value.dataDirectory, true);
  const stage = await stageFor(path.join(path.dirname(value.dataDirectory), `.zero-restore-target-${randomUUID()}`));
  const active = bounded(signal);
  const run = runtime(value, stage, active, supplied);
  const sql = await fileBytes(path.join(source, "database.sql"), manifest.sql.bytes, backupOwner, path.join(stage, "database.sql"), true, active);
  if (sql.bytes !== manifest.sql.bytes || sql.sha256 !== manifest.sql.sha256) deny("NATIVE_SQL_INTEGRITY");
  const data = path.join(stage, "data");
  await mkdir(data, { mode: 0o700 });
  await copyArtifacts(files, source, data, backupOwner, active);
  await run.verify();
  const cluster = await run.identity();
  if (await run.sql(emptySql) !== "0") deny("NATIVE_RESTORE_DATABASE_NOT_EMPTY");
  await run.call(["exec", "-i", value.postgresContainerId, "psql", "-X", "-U", value.databaseUser, "-d", value.databaseName, "--set=ON_ERROR_STOP=on", "--single-transaction", "--file=-"], { inputPath: path.join(stage, "database.sql") });
  if (JSON.stringify(await run.rows()) !== JSON.stringify(rows) || await run.identity() !== cluster) deny("NATIVE_RESTORE_METADATA");
  for (const file of files) {
    const actual = await fileBytes(path.join(data, file.name), file.bytes, process.getuid(), undefined, false, active);
    if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256) deny("NATIVE_ARTIFACT_INTEGRITY");
  }
  await run.verify();
  await inspectDirectory(value.dataDirectory, true);
  if (active.aborted) deny("NATIVE_BACKUP_TIMEOUT");
  await publishDirectory(data, value.dataDirectory, true);
  for (const file of files) {
    const actual = await fileBytes(path.join(value.dataDirectory, file.name), file.bytes, process.getuid(), undefined, false, active);
    if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256) deny("NATIVE_ARTIFACT_INTEGRITY");
  }
  if (JSON.stringify(await run.rows()) !== JSON.stringify(rows) || await run.identity() !== cluster || active.aborted) deny("NATIVE_RESTORE_METADATA");
  await run.verify();
  await unlink(path.join(stage, "database.sql"));
  await rmdir(path.join(stage, ".docker"));
  await rmdir(stage);
  return { state: "verified", profile: NATIVE_BACKUP_PROFILE, manifestSha256: expectedManifestSha256, artifactRows: rows.length, writers: "stopped" };
}

/** No default action, config, directory, downloads, service start or backup deletion. */
export async function nativeBackupMain(args) {
  const [mode, configFile, target, digest] = args;
  if (!((mode === "backup" && args.length === 3) || (mode === "restore" && args.length === 4))) deny("NATIVE_EXPLICIT_ARGUMENTS_REQUIRED");
  const config = await fileBytes(configFile, 65536, process.getuid());
  const value = JSON.parse(config.value.toString("utf8"));
  if (nested(value.dataDirectory, configFile)) deny();
  return mode === "backup" ? backupNativeProfile(value, target) : restoreNativeProfile(value, target, digest);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  nativeBackupMain(process.argv.slice(2)).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`), () => {
    process.stderr.write('{"state":"unknown","code":"NATIVE_BACKUP_NOT_VERIFIED","writers":"keep-stopped"}\n');
    process.exitCode = 1;
  });
}
