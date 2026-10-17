import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const profile = JSON.parse(readFileSync(new URL("./profile.json", import.meta.url)));
const lock = JSON.parse(readFileSync(new URL("./wheels.lock.json", import.meta.url)));
test("frozen source, wheel, model, CPU and fixture pins are exact", () => {
  assert.equal(profile.package.version, "2.140.0");
  assert.match(profile.pythonImage, /^python@sha256:[a-f0-9]{64}$/);
  assert.equal(lock.platform, "linux/amd64");
  assert.equal(lock.python, "3.11");
  assert.equal(new Set(lock.packages.map((p) => p.name.toLowerCase())).size, lock.packages.length);
  for (const p of lock.packages) {
    assert.match(p.sha256, /^[a-f0-9]{64}$/);
    assert.equal(new URL(p.url).protocol, "https:");
    assert.equal(p.file, decodeURIComponent(new URL(p.url).pathname.split("/").at(-1)));
    assert.equal(p.file.endsWith(".whl"), true);
    assert.doesNotMatch(p.name, /nvidia|cuda|cudnn|triton/i);
  }
  assert.equal(lock.packages.find((p) => p.name === "docling-slim").sha256, profile.package.sha256);
  assert.equal(lock.packages.find((p) => p.name === "torch").version, "2.8.0+cpu");
  assert.equal(lock.packages.find((p) => p.name === "torchvision").version, "0.23.0+cpu");
  let bytes = 0;
  for (const model of profile.models) {
    assert.match(model.revision, /^[a-f0-9]{40}$/);
    for (const file of model.files) {
      assert.match(file.sha256, /^[a-f0-9]{64}$/);
      assert.equal(new URL(file.url).pathname.includes(model.revision), true);
      bytes += file.bytes;
    }
  }
  assert.equal(bytes, 384434788);
  assert.ok(bytes < profile.limits.modelDownloadBytes);
  const fixture = readFileSync(
    new URL("../../testkit/fixtures/pdf-born-digital-v1/manifest.json", import.meta.url),
  );
  assert.equal(createHash("sha256").update(fixture).digest("hex"), profile.fixtureManifestSha256);
});
test("resource bounds stay finite and default activation is absent", () => {
  assert.deepEqual(profile.limits, {
    dependencyDownloadBytes: 2147483648,
    modelDownloadBytes: 1073741824,
    installedCacheBytes: 6442450944,
    prepareMs: 600000,
    inputBytes: 1048576,
    pages: 5,
    outputBytes: 1048576,
    runtimeMs: 120000,
    memoryBytes: 2147483648,
    threads: 2,
  });
  assert.equal(profile.defaultDownloads, 0);
});
for (const script of ["zero-docling-prepare.mjs", "zero-docling-spike.mjs"])
  test(`${script} cannot activate without exact opt-in flag`, () => {
    for (const args of [[], ["--help"], ["--run", "--prepare"]]) {
      const child = spawnSync(
        process.execPath,
        [fileURLToPath(new URL(`../../../scripts/${script}`, import.meta.url)), ...args],
        { env: { PATH: "" }, encoding: "utf8", timeout: 3000 },
      );
      assert.equal(child.status, 2, child.stderr);
      const result = JSON.parse(child.stdout);
      assert.equal(result.state, "blocked");
      assert.equal(result.defaultDownloads, 0);
    }
  });
