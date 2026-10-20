import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { nativeRuntimeExternalPackages } from "./native-runtime-build-profile.mjs";
import { copyRuntimePackageClosure } from "./runtime-package-closure.mjs";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(workspace, "package.json"));
const { build } = await import(createRequire(require.resolve("tsx/package.json")).resolve("esbuild"));

test("native copied Playwright loads after relocation without a browser or ambient module roots", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "zero-native-playwright-"));
  try {
    const output = path.join(directory, "runtime");
    const closure = await copyRuntimePackageClosure({
      workspaceRoot: workspace, outputDirectory: output, maxBytes: 50_000_000,
      importers: [{ file: path.join(workspace, "packages/adapters/package.json"), packages: ["playwright-core"] }],
    });
    assert.deepEqual(closure.packages.map(pkg => [pkg.name, pkg.version]), [["playwright-core", "1.63.0"]]);
    await readFile(path.join(output, "node_modules/playwright-core/LICENSE"));
    const entry = path.join(output, "app/probe.mjs");
    const result = await build({
      absWorkingDir: workspace,
      stdin: { contents: 'import {chromium} from "playwright-core"; export const browserName=chromium.name(); export const launchAvailable=typeof chromium.launch==="function";', resolveDir: workspace },
      outfile: entry, bundle: true, format: "esm", platform: "node", target: "node24",
      external: nativeRuntimeExternalPackages, metafile: true, logLevel: "silent",
    });
    assert.ok(Object.values(result.metafile.outputs).every(out => Object.keys(out.inputs).every(input => !input.includes("/playwright-core/"))));
    const cwd = path.join(directory, "empty-cwd");
    await mkdir(cwd);
    const actual = execFileSync(process.execPath, ["--input-type=module", "-e",
      'import {createRequire} from "node:module"; const file=' + JSON.stringify(pathToFileURL(entry).href) +
      '; const value=await import(file); const metadata=createRequire(file)("playwright-core/package.json"); console.log(JSON.stringify({name:value.browserName,launchAvailable:value.launchAvailable,version:metadata.version}));',
    ], { cwd, env: { PATH: "/usr/bin:/bin", HOME: cwd, NODE_ENV: "production" }, encoding: "utf8", timeout: 10_000 });
    assert.deepEqual(JSON.parse(actual), { name: "chromium", launchAvailable: true, version: "1.63.0" });
    t.diagnostic("Exact copied Playwright file bytes: " + closure.packages[0].fileBytes);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
