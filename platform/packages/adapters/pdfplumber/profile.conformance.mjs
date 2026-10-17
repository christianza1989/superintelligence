import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const profile = JSON.parse(readFileSync(new URL("./profile.json", import.meta.url)));
const lock = JSON.parse(readFileSync(new URL("./wheels.lock.json", import.meta.url)));
test("explicit lighter epoch freezes eight exact binary wheels and no models", () => {
  assert.equal(profile.id, "pdfplumber-0.11.10-born-digital-lines-v1");
  assert.equal(profile.package.sourceCommit, "7d4f2f582f2d99f9e60ba522fdf7afd2f6d54c62");
  assert.equal(lock.packages.length, 8);
  assert.equal(new Set(lock.packages.map((p) => p.name)).size, 8);
  assert.equal(
    lock.packages.reduce((n, p) => n + p.bytes, 0),
    22884554,
  );
  for (const p of lock.packages) {
    assert.match(p.sha256, /^[a-f0-9]{64}$/);
    assert.equal(new URL(p.url).hostname, "files.pythonhosted.org");
    assert.equal(p.file.endsWith(".whl"), true);
    assert.ok(p.bytes > 0);
  }
  assert.deepEqual(profile.models, []);
  assert.equal(profile.defaultDownloads, 0);
});
test("same frozen corpus and byte-identical grader are required", () => {
  const hash = (p) =>
    createHash("sha256")
      .update(readFileSync(new URL(p, import.meta.url)))
      .digest("hex");
  assert.equal(
    hash("../../testkit/fixtures/pdf-born-digital-v1/manifest.json"),
    profile.fixtureManifestSha256,
  );
  assert.equal(hash("../docling/grade.mjs"), profile.graderSha256);
});
test("caps and ruled-line semantics do not expand silently", () => {
  assert.deepEqual(profile.limits, {
    dependencyDownloadBytes: 67108864,
    modelDownloadBytes: 0,
    installedCacheBytes: 536870912,
    prepareMs: 180000,
    inputBytes: 1048576,
    pages: 5,
    outputBytes: 1048576,
    runtimeMs: 30000,
    memoryBytes: 536870912,
    threads: 2,
  });
  assert.deepEqual(profile.tableSettings, {
    vertical_strategy: "lines",
    horizontal_strategy: "lines",
    snap_tolerance: 3,
    join_tolerance: 3,
    intersection_tolerance: 3,
    edge_min_length: 3,
  });
  assert.equal(profile.discovery.catalogRuntimeTested, false);
  assert.equal(profile.discovery.catalogLicenseApproved, false);
});
