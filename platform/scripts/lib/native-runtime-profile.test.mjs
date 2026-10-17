import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { copyRuntimePackageClosure } from "./runtime-package-closure.mjs";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(workspace, "package.json"));
const tsxRequire = createRequire(require.resolve("tsx/package.json"));
const { build } = await import(tsxRequire.resolve("esbuild"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const envSource = path.join(workspace, "packages/core/src/node/load-root-env.ts");
async function bundle(entry, output, runtime, external = []) {
  await mkdir(path.dirname(output), { recursive: true });
  await build({
    entryPoints: [entry], outfile: output, bundle: true, platform: "node",
    format: "esm", target: "node24", logLevel: "silent", external,
    define: { ZERO_RUNTIME_BUNDLED: String(runtime), ZERO_OPERATOR_BUNDLED: "false" },
    banner: { js: 'import { createRequire as zeroRuntimeRequire } from "node:module"; const require = zeroRuntimeRequire(import.meta.url);' },
  });
}
async function fixture(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "zero-runtime-relocation-"));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}
function child(code, cwd, extra = {}) {
  const env = { ...process.env, NODE_ENV: "production", ...extra };
  delete env.ZERO_RUNTIME_CWD_CANARY;
  delete env.ZERO_RUNTIME_PARENT_CANARY;
  return execFileSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd, env, encoding: "utf8", timeout: 10_000,
  }).trim();
}
test("runtime env bundle ignores cwd and ancestor dotenv canaries", async () => fixture(async (directory) => {
  const app = path.join(directory, "runtime/app/env.mjs");
  const cwd = path.join(directory, "work/child");
  await mkdir(cwd, { recursive: true });
  await writeFile(path.join(cwd, ".env"), "ZERO_RUNTIME_CWD_CANARY=cwd\n");
  await writeFile(path.join(directory, "work/.env"), "ZERO_RUNTIME_PARENT_CANARY=parent\n");
  await bundle(envSource, app, true);
  assert.equal(child(
    `import {loadRootEnv} from ${JSON.stringify(pathToFileURL(app).href)};loadRootEnv();console.log(JSON.stringify([process.env.ZERO_RUNTIME_CWD_CANARY??null,process.env.ZERO_RUNTIME_PARENT_CANARY??null]));`,
    cwd,
  ), "[null,null]");
}));
test("source env branch retains existing cwd dotenv behavior", async () => fixture(async (directory) => {
  const app = path.join(directory, "env.mjs");
  await writeFile(path.join(directory, ".env"), "ZERO_RUNTIME_CWD_CANARY=source\n");
  await bundle(envSource, app, false);
  assert.equal(child(
    `import {loadRootEnv} from ${JSON.stringify(pathToFileURL(app).href)};loadRootEnv();console.log("CANARY="+process.env.ZERO_RUNTIME_CWD_CANARY);`,
    directory,
  ).split("\n").at(-1), "CANARY=source");
}));
test("runtime operator reader blocks the whole package and permits private external policy", async () => fixture(async (directory) => {
  const root = path.join(directory, "runtime");
  const app = path.join(root, "app/policy.mjs");
  await bundle(path.join(workspace, "packages/adapters/src/zero-operator-file.ts"), app, true);
  const inside = path.join(root, "other/policy.json");
  const outside = path.join(directory, "external.json");
  await mkdir(path.dirname(inside), { recursive: true });
  for (const file of [inside, outside]) {
    await writeFile(file, "{}");
    await chmod(file, 0o600);
  }
  const mod = await import(pathToFileURL(app).href);
  await assert.rejects(mod.readZeroOperatorFile(inside), { name: "ZeroOperatorFileError" });
  assert.equal(Buffer.from(await mod.readZeroOperatorFile(outside)).toString(), "{}");
  await chmod(outside, 0o644);
  await assert.rejects(mod.readZeroOperatorFile(outside), { name: "ZeroOperatorFileError" });
}));
test("runtime CSV bundle consumes copied pinned sources and package lock", async () => fixture(async (directory) => {
  const root = path.join(directory, "runtime");
  await copyRuntimePackageClosure({
    workspaceRoot: workspace,
    importers: [{ file: path.join(workspace, "packages/adapters/package.json"), packages: ["d3-dsv"] }],
    outputDirectory: root,
    maxBytes: 2_000_000,
  });
  const app = path.join(root, "app/csv.mjs");
  const lock = await readFile(path.join(workspace, "pnpm-lock.yaml"));
  await writeFile(path.join(root, "pnpm-lock.yaml"), lock);
  await bundle(path.join(workspace, "packages/adapters/src/zero-csv-profile.ts"), app, true, ["d3-dsv"]);
  const mod = await import(pathToFileURL(app).href);
  const result = await mod.prepareZeroCsvComponent();
  assert.equal(result.lockfileSha256, hash(lock));
  assert.deepEqual(mod.executeZeroCsv("a,b\n1,2\n").rows, [["a", "b"], ["1", "2"]]);
  for (const file of result.files) assert.equal(hash(file.content), file.sha256);
  await writeFile(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await assert.rejects(mod.prepareZeroCsvComponent(), /component_lock_mismatch/);
  await writeFile(path.join(root, "pnpm-lock.yaml"), lock);
  const packageRequire = createRequire(path.join(root, "package.json"));
  const packageRoot = path.dirname(path.dirname(packageRequire.resolve("d3-dsv")));
  await writeFile(path.join(packageRoot, "src/csv.js"), "// changed fixture source\n");
  await assert.rejects(mod.prepareZeroCsvComponent(), /component_source_mismatch/);
}));
test("source CSV module still consumes the canonical source lock and pinned sources", async () => {
  const entry = path.join(workspace, "packages/adapters/src/zero-csv-profile.ts");
  const output = execFileSync(process.execPath, [
    "--import", require.resolve("tsx"), "--input-type=module", "-e",
    `import {prepareZeroCsvComponent} from ${JSON.stringify(pathToFileURL(entry).href)};console.log(JSON.stringify({lock:(await prepareZeroCsvComponent()).lockfileSha256}));`,
  ], { cwd: workspace, encoding: "utf8", timeout: 10_000 });
  assert.equal(JSON.parse(output).lock, hash(await readFile(path.join(workspace, "pnpm-lock.yaml"))));
});
