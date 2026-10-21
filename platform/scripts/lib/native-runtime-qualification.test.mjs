import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import net from "node:net";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNativeQualificationProcessAlive, cleanupNativeQualificationProcess, stopNativeQualificationProcess, nativeQualificationArguments, nativeQualificationEnvironment, prepareNativeQualificationDirectories, retainNativeQualificationAudits, qualifyNativeSharedWeb, relocateNativeQualificationPackage, verifyNativeQualificationPackage } from "./native-runtime-qualification.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const revision = "a".repeat(40), image = "sha256:" + "b".repeat(64);
async function fixture(t) {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "zero-qualification-test-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const source = path.join(scratch, "package"); await mkdir(source);
  const files = [];
  for (const name of ["app/api.mjs", "app/worker.mjs", "migrate.mjs", "pnpm-lock.yaml", "db/prisma/schema.prisma", "web/index.html"]) {
    const content = Buffer.from("// fixture " + name + "\n");
    await mkdir(path.dirname(path.join(source, name)), { recursive: true }); await writeFile(path.join(source, name), content);
    files.push({ path: name, bytes: content.length, sha256: hash(content) });
  }
  await symlink("api.mjs", path.join(source, "app/alias.mjs")); files.push({ path: "app/alias.mjs", symlink: "app/api.mjs" });
  const build = { profile: "native-mcp-local-v1", sourceRevision: revision, sourceDirtyPaths: [], localOnly: true, doNotPublish: true, distributionReady: false, runtimeQualified: false, status: "experimental-local-stage-not-distributable", files, payloadFileBytesExcludingBuildManifest: files.reduce((sum, file) => sum + (file.bytes ?? 0), 0) };
  const content = JSON.stringify(build); await writeFile(path.join(source, "BUILD.json"), content);
  return { scratch, source, build, pins: { expectedSource: revision, buildSha256: hash(content) } };
}

test("qualification is explicit and requires exact independent source, image and manifest pins", () => {
  assert.deepEqual(nativeQualificationArguments(["--plan"]), { plan: true });
  const args = ["--run", "--package", "/fixture/package", "--postgres-image", image, "--expected-source", revision, "--build-sha256", "c".repeat(64)];
  assert.equal(nativeQualificationArguments(args).expectedSource, revision);
  assert.throws(() => nativeQualificationArguments(args.slice(1)));
  assert.throws(() => nativeQualificationArguments(args.map(value => value === image ? "postgres:latest" : value)));
  assert.throws(() => nativeQualificationArguments(args.map(value => value === "/fixture/package" ? "relative" : value)));
});

test("PostgreSQL mount parent permits its separate UID to traverse without exposing private host roots", async t => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "zero-qualification-permissions-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  await prepareNativeQualificationDirectories(scratch);
  const mode = async file => (await stat(path.join(scratch, file))).mode & 0o777;
  assert.equal(await mode("."), 0o700);
  assert.equal(await mode("pg-data") & 0o011, 0o011);
  assert.equal(await mode("pg-data") & 0o066, 0);
  for (const name of ["home", "tmp", "data", "operator", "cwd/child", "docker"]) {
    assert.equal(await mode(name), 0o700);
  }
});

test("audit retention preserves private failure evidence with bounded files and rejects symlinks", async t => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "zero-qualification-audits-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  await prepareNativeQualificationDirectories(scratch);
  const evidence = path.join(scratch, "evidence"); await mkdir(evidence, { mode: 0o700 });
  const operator = path.join(scratch, "operator");
  const audit = JSON.stringify({ deniedFilesystem: 1 });
  await writeFile(path.join(operator, "migration-guard-audit.1.json"), audit);
  await writeFile(path.join(operator, "api-guard-audit.2.json"), Buffer.alloc(65_537));
  await writeFile(path.join(scratch, "outside.json"), "private");
  await symlink("../outside.json", path.join(operator, "worker-guard-audit.3.json"));
  await writeFile(path.join(operator, "unrelated.json"), "ignored");
  assert.deepEqual(await retainNativeQualificationAudits(scratch, evidence), { copiedFiles: 1, rejectedFiles: 2, truncated: false });
  assert.equal(await readFile(path.join(evidence, "migration-guard-audit.1.json"), "utf8"), audit);
  assert.equal((await stat(path.join(evidence, "migration-guard-audit.1.json"))).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(evidence), ["migration-guard-audit.1.json"]);
  for (let pid = 10; pid < 30; pid++) await writeFile(path.join(operator, "worker-guard-audit." + pid + ".json"), audit);
  const bounded = await retainNativeQualificationAudits(scratch, evidence);
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.copiedFiles + bounded.rejectedFiles, 16);
});

test("sealed inventory relocates contained symlinks and rejects stale pins, tamper and extra files", async t => {
  const { scratch, source, pins } = await fixture(t);
  const target = path.join(scratch, "unrelated/runtime"); await mkdir(path.dirname(target));
  const original = await verifyNativeQualificationPackage(source, pins.expectedSource, pins.buildSha256);
  assert.equal((await relocateNativeQualificationPackage(source, target, pins)).bytes, original.bytes);
  await rm(source, { recursive: true });
  assert.equal((await verifyNativeQualificationPackage(target, pins.expectedSource, pins.buildSha256)).bytes, original.bytes);
  await assert.rejects(verifyNativeQualificationPackage(target, "d".repeat(40), pins.buildSha256), /PROVENANCE/);
  await writeFile(path.join(target, "extra"), "extra");
  await assert.rejects(verifyNativeQualificationPackage(target, pins.expectedSource, pins.buildSha256), /UNINVENTORIED/);
  await rm(path.join(target, "extra")); await writeFile(path.join(target, "app/api.mjs"), "tampered");
  await assert.rejects(verifyNativeQualificationPackage(target, pins.expectedSource, pins.buildSha256), /INTEGRITY/);
});

test("sealed inventory rejects an inventoried symlink redirected outside the package", async t => {
  const { scratch, source, pins } = await fixture(t);
  await writeFile(path.join(scratch, "outside.mjs"), "outside"); await rm(path.join(source, "app/alias.mjs"));
  await symlink("../../outside.mjs", path.join(source, "app/alias.mjs"));
  await assert.rejects(verifyNativeQualificationPackage(source, pins.expectedSource, pins.buildSha256), /SYMLINK_ESCAPE/);
});

test("qualification environment has only explicit fake config and fresh home/data roots", () => {
  const value = nativeQualificationEnvironment({ scratch: "/fixture", databaseUrl: "postgresql://fake@127.0.0.1:1234/fake", apiPort: 3100, policyFile: "/fixture/operator/policy", secrets: { auth: "fake-auth", encryption: "fake-encryption", screen: "fake-screen" } });
  assert.equal(value.HOME, "/fixture/home"); assert.equal(value.DATA_DIR, "/fixture/data");
  assert.equal(value.AGENT_RUNTIME, "scripted"); assert.equal(value.WAKEUP_DRIVER, "graphile");
  for (const name of ["NODE_PATH", "NODE_OPTIONS", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "AWS_ACCESS_KEY_ID", "DOCKER_HOST", "SENDBLUE_API_KEY_ID"]) assert.equal(value[name], undefined);
});

async function guardFixture(t, script, extra = {}) {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "zero-guard-test-")); t.after(() => rm(scratch, { recursive: true, force: true }));
  const packageRoot = path.join(scratch, "runtime"), denied = path.join(scratch, "ambient"); await mkdir(packageRoot); await mkdir(denied);
  await writeFile(path.join(denied, "secret"), "fake-secret"); await writeFile(path.join(scratch, "outside.mjs"), "export default true;");
  await writeFile(path.join(packageRoot, "main.mjs"), script); await writeFile(path.join(packageRoot, "child.mjs"), "import fs from 'node:fs'; fs.readFileSync(process.argv[2]);");
  const configFile = path.join(scratch, "guard.json");
  await writeFile(configFile, JSON.stringify({ packageRoot, auditFile: path.join(scratch, "audit"), allowedPorts: [], deniedRoots: [denied], deniedFiles: [], ...extra }));
  const guard = fileURLToPath(new URL("../runtime/native-package-qualification-guard.mjs", import.meta.url));
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath, ["--import", guard, path.join(packageRoot, "main.mjs"), path.join(denied, "secret"), path.join(scratch, "outside.mjs")], { cwd: scratch, env: { PATH: "/usr/bin:/bin", ZERO_NATIVE_QUALIFICATION_GUARD: configFile }, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = ""; child.stderr.on("data", bytes => { stderr += bytes; }); child.once("close", code => resolve({ code, stderr }));
  });
  const audits = await Promise.all((await readdir(scratch)).filter(file => /^audit\.\d+\.json$/.test(file)).map(async file => JSON.parse(await readFile(path.join(scratch, file), "utf8"))));
  return { ...result, audits };
}

test("real Node preload blocks ambient filesystem and outside modules before their contents run", async t => {
  const fs = await guardFixture(t, "import fs from 'node:fs'; fs.readFileSync(process.argv[2]);");
  assert.notEqual(fs.code, 0); assert.match(fs.stderr, /NATIVE_AMBIENT_FILE_FORBIDDEN/); assert.equal(fs.audits[0].deniedFilesystem, 1);
  const module = await guardFixture(t, "await import(process.argv[3]);");
  assert.notEqual(module.code, 0); assert.match(module.stderr, /NATIVE_PACKAGE_MODULE_ESCAPE/); assert.equal(module.audits[0].deniedModules, 1);
});

test("real Node preload rejects nonfixture TCP without making a connection", async t => {
  const result = await guardFixture(t, "import net from 'node:net'; net.connect({host:'203.0.113.1',port:443});");
  assert.notEqual(result.code, 0); assert.match(result.stderr, /NATIVE_NONFIXTURE_NETWORK_FORBIDDEN/); assert.equal(result.audits[0].deniedNetwork, 1);
});

test("real Node preload permits only the explicitly supplied loopback fixture port", async t => {
  const server = net.createServer(socket => socket.end());
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  try {
    const port = server.address().port;
    const result = await guardFixture(t, `import net from 'node:net'; const socket=net.connect({host:'127.0.0.1',port:${port}}); socket.on('error',error=>{throw error});`, { allowedPorts: [port] });
    assert.equal(result.code, 0, result.stderr); assert.equal(result.audits[0].deniedNetwork, 0); assert.ok(result.audits[0].moduleResolutions > 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("minimal-env nested Node migration-style child retains actual preload instrumentation", async t => {
  const result = await guardFixture(t, "import {spawn} from 'node:child_process'; const p=spawn(process.execPath,[new URL('./child.mjs',import.meta.url).pathname,process.argv[2]],{env:{PATH:'/usr/bin:/bin'},stdio:'inherit'});p.once('exit',code=>{process.exitCode=code});");
  assert.notEqual(result.code, 0); assert.match(result.stderr, /NATIVE_AMBIENT_FILE_FORBIDDEN/);
  assert.equal(result.audits.length, 2); assert.equal(result.audits.reduce((sum, item) => sum + item.guardedNodeChildren, 0), 1); assert.equal(result.audits.reduce((sum, item) => sum + item.deniedFilesystem, 0), 1);
});

test("qualification refuses a symlink package root before copy or verification", async t => {
  const { scratch, source, pins } = await fixture(t);
  const alias = path.join(scratch, "package-alias"), target = path.join(scratch, "relocated");
  await symlink(source, alias);
  await assert.rejects(verifyNativeQualificationPackage(alias, pins.expectedSource, pins.buildSha256), /ROOT/);
  await assert.rejects(relocateNativeQualificationPackage(alias, target, pins), /ROOT/);
  await assert.rejects(readFile(path.join(target, "BUILD.json")), { code: "ENOENT" });
});

test("qualification refuses a package reached through a symlink parent", async t => {
  const { scratch, source, pins } = await fixture(t);
  const parentAlias = path.join(scratch, "parent-alias");
  await symlink(scratch, parentAlias);
  await assert.rejects(verifyNativeQualificationPackage(path.join(parentAlias, path.basename(source)), pins.expectedSource, pins.buildSha256), /ROOT/);
});

test("relocation requires an absent target rather than merging an existing directory", async t => {
  const { scratch, source, pins } = await fixture(t);
  const target = path.join(scratch, "existing");
  await mkdir(target);
  await assert.rejects(relocateNativeQualificationPackage(source, target, pins), /EEXIST|TARGET/);
  assert.deepEqual(await readdir(target), []);
});

async function processFixture(t, termination) {
  const script = termination + '; process.stdout.write("receipt-ready\\n"); process.stdin.resume(); process.stdin.on("data",()=>process.exit(7)); setInterval(()=>{},1000);';
  const child = spawn(process.execPath, ["-e", script], { detached: true, stdio: ["pipe", "pipe", "pipe"] });
  const record = { child, exited: false, error: undefined, overflow: false };
  child.on("error", error => { record.error = error.code; });
  record.closed = new Promise(resolve => child.once("close", (code, signal) => { record.exited = true; record.code = code; record.signal = signal; resolve(record); }));
  t.after(() => cleanupNativeQualificationProcess(record, { gracefulTimeoutMs: 100, killTimeoutMs: 500 }));
  await new Promise((resolve, reject) => { child.stdout.once("data", resolve); child.once("error", reject); child.once("exit", code => reject(new Error("fixture exited early: " + code))); });
  return record;
}
const stopBounds = { gracefulTimeoutMs: 100, killTimeoutMs: 500 };

test("successful receipt cannot qualify a process that already exited cleanly or crashed", async t => {
  for (const code of [0, 7]) {
    const record = await processFixture(t, 'process.on("SIGTERM",()=>process.exit(0))');
    if (code === 0) record.child.kill("SIGTERM"); else record.child.stdin.write("crash");
    await record.closed;
    await assert.rejects(stopNativeQualificationProcess(record, stopBounds), /PROCESS/);
    await cleanupNativeQualificationProcess(record, stopBounds);
  }
});

test("receipt followed by a nonzero exit during requested stop cannot qualify", async t => {
  const record = await processFixture(t, 'process.on("SIGTERM",()=>process.exit(7))');
  await assert.rejects(stopNativeQualificationProcess(record, stopBounds), /PROCESS/);
  assert.equal(record.code, 7);
});

test("unexpected termination signal cannot qualify as a clean package stop", async t => {
  const record = await processFixture(t, "");
  await assert.rejects(stopNativeQualificationProcess(record, stopBounds), /PROCESS/);
  assert.equal(record.signal, "SIGTERM");
});

test("a live process with a clean requested stop qualifies", async t => {
  const record = await processFixture(t, 'process.on("SIGTERM",()=>process.exit(0))');
  await stopNativeQualificationProcess(record, stopBounds);
  assert.equal(record.code, 0); assert.equal(record.signal, null); assert.ok(!record.forced);
});

test("bounded forced cleanup cannot qualify an unresponsive package process", async t => {
  const record = await processFixture(t, 'process.on("SIGTERM",()=>{})');
  await assert.rejects(stopNativeQualificationProcess(record, stopBounds), /PROCESS/);
  assert.equal(record.forced, true); assert.equal(record.signal, "SIGKILL"); assert.equal(record.exited, true);
});

test("process output overflow and errors cannot qualify despite a clean exit", async t => {
  for (const failure of ["overflow", "error"]) {
    const record = await processFixture(t, 'process.on("SIGTERM",()=>process.exit(0))');
    record[failure] = failure === "overflow" ? true : "LOG_WRITE_FAILED";
    await assert.rejects(stopNativeQualificationProcess(record, stopBounds), /PROCESS/);
  }
});

test("stage liveness rejects a crashed child even before close bookkeeping finishes", async t => {
  const record = await processFixture(t, 'process.on("SIGTERM",()=>process.exit(0))');
  assert.doesNotThrow(() => assertNativeQualificationProcessAlive(record));
  const exited = new Promise(resolve => record.child.once("exit", resolve));
  record.child.stdin.write("crash");
  await exited;
  assert.throws(() => assertNativeQualificationProcessAlive({ ...record, exited: false }), /PROCESS_NOT_ALIVE/);
  await record.closed;
  assert.throws(() => assertNativeQualificationProcessAlive(record), /PROCESS_NOT_ALIVE/);
});

test("relocation refuses an alias parent before writing package files", async t => {
  const { scratch, source, pins } = await fixture(t);
  const alias = path.join(scratch, "parent-alias");
  await symlink(scratch, alias);
  await assert.rejects(relocateNativeQualificationPackage(source, path.join(alias, "relocated"), pins), /TARGET_ROOT/);
  await assert.rejects(readFile(path.join(scratch, "relocated/BUILD.json")), { code: "ENOENT" });
});

test("relocation refuses an existing target symlink without changing its real package", async t => {
  const { scratch, source, pins } = await fixture(t);
  const alias = path.join(scratch, "target-alias");
  await symlink(source, alias);
  await assert.rejects(relocateNativeQualificationPackage(source, alias, pins));
  assert.equal((await verifyNativeQualificationPackage(source, pins.expectedSource, pins.buildSha256)).build.sourceRevision, revision);
});

test("canonical root checks preserve symlink traversal before parent segments", async t => {
  const { scratch, source, pins } = await fixture(t);
  const other = path.join(scratch, "other"), nested = path.join(other, "nested"), alias = path.join(scratch, "alias");
  await mkdir(nested, { recursive: true }); await symlink(nested, alias);
  await relocateNativeQualificationPackage(source, path.join(other, "package"), pins);
  const traversed = alias + "/../package";
  await assert.rejects(verifyNativeQualificationPackage(traversed, pins.expectedSource, pins.buildSha256), /ROOT/);
  await assert.rejects(relocateNativeQualificationPackage(source, alias + "/../target", pins), /TARGET_ROOT/);
  assert.deepEqual((await readdir(other)).sort(), ["nested", "package"]);
});

test("API-only sealed packages cannot qualify without the shared web index", async t => {
  const { source, build, pins } = await fixture(t);
  const entry = build.files.find(file => file.path === "web/index.html");
  await rm(path.join(source, entry.path));
  build.files = build.files.filter(file => file !== entry);
  build.payloadFileBytesExcludingBuildManifest -= entry.bytes;
  const content = JSON.stringify(build); await writeFile(path.join(source, "BUILD.json"), content);
  await assert.rejects(verifyNativeQualificationPackage(source, pins.expectedSource, hash(content)), /REQUIRED_ENTRY/);
});

async function sharedWebFixture(t, { index = '<!doctype html><script type="module" crossorigin src="/assets/index-Abcd1234.js"></script><div id="root"></div>', change = () => undefined } = {}) {
  const asset = "console.log('ready');", requests = [];
  const entries = new Map([["/discover", { body: index, type: "text/html; charset=utf-8" }], ["/assets/index-Abcd1234.js", { body: asset, type: "text/javascript; charset=utf-8" }]]);
  const build = { files: [{ path: "web/index.html", bytes: Buffer.byteLength(index), sha256: hash(index) }, { path: "web/assets/index-Abcd1234.js", bytes: Buffer.byteLength(asset), sha256: hash(asset) }] };
  const server = createServer((request, response) => {
    requests.push([request.method, request.url, request.headers.accept]);
    const entry = entries.get(request.url);
    const result = { status: entry ? 200 : 404, body: entry?.body ?? "Not found", type: entry?.type ?? "text/plain; charset=utf-8", headers: {} };
    change(result, request, { index, asset });
    response.writeHead(result.status, { "content-type": result.type, "content-length": Buffer.byteLength(result.body), ...result.headers });
    response.end(request.method === "HEAD" ? undefined : result.body);
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  let aliveChecks = 0;
  return { apiUrl: "http://127.0.0.1:" + server.address().port, build, signal: AbortSignal.timeout(5_000), assertAlive: () => { aliveChecks++; }, requests, aliveChecks: () => aliveChecks };
}

test("actual HTTP web smoke binds GET/HEAD shell and built asset to the sealed inventory", async t => {
  const fixture = await sharedWebFixture(t);
  const result = await qualifyNativeSharedWeb(fixture);
  assert.equal(result.asset.path, "web/assets/index-Abcd1234.js"); assert.equal(result.checkedRequests, 8); assert.equal(result.uiQualified, false);
  assert.equal(fixture.requests.length, 8); assert.equal(fixture.aliveChecks(), 16);
  assert.deepEqual(fixture.requests.slice(0, 4), [["GET", "/discover", "text/html"], ["HEAD", "/discover", "text/html"], ["GET", "/assets/index-Abcd1234.js", "text/html"], ["HEAD", "/assets/index-Abcd1234.js", "text/html"]]);
});

test("shared web smoke rejects hash drift, wrong MIME, wrong HEAD length and oversized bodies", async t => {
  const changes = [
    (result, request) => { if (request.url.startsWith("/assets/")) result.body = "console.log('wrong');"; },
    (result, request) => { if (request.url === "/discover") result.type = "application/json"; },
    (result, request) => { if (request.method === "HEAD") result.headers["content-length"] = "999"; },
    (result, request) => { if (request.url.startsWith("/assets/")) result.body += "extra"; },
  ];
  for (const change of changes) await assert.rejects(qualifyNativeSharedWeb(await sharedWebFixture(t, { change })), /NATIVE_WEB_RESPONSE/);
});

test("shared web smoke never follows remote, encoded, comment-only or fake attribute references", async t => {
  for (const index of [
    '<script type="module" src="https://example.invalid/a.js"></script>',
    '<script type="module" src="//example.invalid/a.js"></script>',
    '<script type="module" src="/assets/%2e%2e/private.js"></script>',
    '<!-- <script type="module" src="/assets/index-Abcd1234.js"></script> -->',
    '<script type="module" data-ref=\' src="/assets/index-Abcd1234.js"\'></script>',
    '<script type="module" src="/assets/index-Abcd1234.js" src="/assets/other.js"></script>',
    '<script type="module" src="/assets/not-in-build.js"></script>',
  ]) {
    const fixture = await sharedWebFixture(t, { index });
    await assert.rejects(qualifyNativeSharedWeb(fixture), /NATIVE_WEB_(?:LOCAL_ASSET_MISSING|AMBIGUOUS_ASSET|BUILD_ENTRY)/);
    assert.equal(fixture.requests.length, 2);
  }
});

test("shared web smoke rejects SPA fallbacks on missing assets and reserved API paths", async t => {
  for (const route of ["/assets/zero-native-qualification-missing-00000000.js", "/api/zero/native-package-qualification-missing"]) {
    const fixture = await sharedWebFixture(t, { change: (result, request, { index }) => { if (request.url === route) { result.status = 200; result.body = index; result.type = "text/html; charset=utf-8"; } } });
    await assert.rejects(qualifyNativeSharedWeb(fixture), /NATIVE_WEB_RESERVED_OR_MISSING_FALLBACK/);
  }
});

test("shared web smoke refuses redirects before requesting another location", async t => {
  const fixture = await sharedWebFixture(t, { change: result => { result.status = 302; result.headers.location = "https://example.invalid/"; } });
  await assert.rejects(qualifyNativeSharedWeb(fixture));
  assert.equal(fixture.requests.length, 1);
});
