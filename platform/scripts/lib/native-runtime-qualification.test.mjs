import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nativeQualificationArguments, nativeQualificationEnvironment, relocateNativeQualificationPackage, verifyNativeQualificationPackage } from "./native-runtime-qualification.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const revision = "a".repeat(40), image = "sha256:" + "b".repeat(64);
async function fixture(t) {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "zero-qualification-test-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const source = path.join(scratch, "package"); await mkdir(source);
  const files = [];
  for (const name of ["app/api.mjs", "app/worker.mjs", "migrate.mjs", "pnpm-lock.yaml", "db/prisma/schema.prisma"]) {
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
