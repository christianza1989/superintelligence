import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { bundledRuntimePackages, copyBundledRuntimeNotices } from "./native-runtime-notices.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "zero-notices-"));
  try {
    const folder = path.join(root, "node_modules/.pnpm/example@1/node_modules/example");
    await mkdir(path.join(folder, "dist"), { recursive: true });
    await writeFile(path.join(folder, "package.json"), JSON.stringify({ name: "example", version: "1", license: "MIT" }));
    await writeFile(path.join(folder, "dist/package.json"), JSON.stringify({ name: "example", version: "1", type: "module" }));
    await writeFile(path.join(folder, "dist/index.js"), "export {};\n");
    const input = path.relative(root, path.join(folder, "dist/index.js"));
    const packages = await bundledRuntimePackages(root, [input]);
    await run({ root, folder, input, packages, output: path.join(root, "output") });
  } finally { await rm(root, { recursive: true, force: true }); }
}
test("format-only nested metadata cannot hide original package license files", async () => fixture(async ({ folder, packages, output }) => {
  await writeFile(path.join(folder, "LICENSE-MIT"), "original license\n");
  await writeFile(path.join(folder, "NOTICE_extra"), "original notice\n");
  await writeFile(path.join(folder, "UNLICENSE"), "original public domain grant\n");
  await mkdir(path.join(folder, "LICENSES"));
  await writeFile(path.join(folder, "LICENSES/Apache-2.0.txt"), "original nested license\n");
  const notices = await copyBundledRuntimeNotices({ packages, output });
  assert.equal(notices[0].license, "MIT");
  assert.equal(notices[0].files.length, 4);
  assert.equal(await readFile(path.join(output, notices[0].files[0].path), "utf8"), "original license\n");
  assert.equal(await readFile(path.join(output, notices[0].metadataFile), "utf8"), await readFile(path.join(folder, "package.json"), "utf8"));
}));
test("declared MIT metadata alone leaves the license file gap explicit", async () => fixture(async ({ packages, output }) => {
  const notices = await copyBundledRuntimeNotices({ packages, output });
  assert.deepEqual(notices[0].files, []);
  assert.equal(notices[0].licenseApproval, "unknown");
}));
test("reviewed installed README is copied byte-for-byte with exact identity", async () => fixture(async ({ folder, packages, output }) => {
  const bytes = Buffer.from("original complete license with copyright and grant\n");
  await writeFile(path.join(folder, "README.md"), bytes);
  const pkg = packages.get("example@1");
  const evidence = [{ package: "example", version: "1", packageJsonSha256: pkg.packageJsonSha256, files: [{ file: "README.md", outputName: "README.md", evidenceKind: "installed-readme-full-license", sha256: hash(bytes) }] }];
  const notices = await copyBundledRuntimeNotices({ packages, output, evidence });
  assert.deepEqual(await readFile(path.join(output, notices[0].files[0].path)), bytes);
  assert.equal(notices[0].files[0].evidenceKind, "installed-readme-full-license");
}));
test("supplemental license tampering and outside-root paths fail", async () => fixture(async ({ root, packages, output }) => {
  const evidenceRoot = path.join(root, "evidence");
  await mkdir(evidenceRoot);
  await writeFile(path.join(evidenceRoot, "LICENSE"), "changed\n");
  const entry = { package: "example", version: "1", packageJsonSha256: packages.get("example@1").packageJsonSha256, files: [{ file: "LICENSE", outputName: "LICENSE", evidenceKind: "official-exact-commit-license", sha256: hash("expected\n") }] };
  await assert.rejects(copyBundledRuntimeNotices({ packages, output, evidenceRoot, evidence: [entry] }), /content mismatch/);
  entry.files[0].file = "../node_modules/.pnpm/example@1/node_modules/example/package.json";
  await assert.rejects(copyBundledRuntimeNotices({ packages, output: output + "2", evidenceRoot, evidence: [entry] }), /escapes/);
}));
test("bundled input symlink outside installed store fails", async () => fixture(async ({ root, folder }) => {
  const outside = path.join(root, "outside.js");
  await writeFile(outside, "export {};\n");
  await symlink(outside, path.join(folder, "outside.js"));
  await assert.rejects(bundledRuntimePackages(root, [path.relative(root, path.join(folder, "outside.js"))]), /escapes/);
}));
test("reviewed exact-source license assets retain their original pinned bytes", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../runtime/native-license-evidence");
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
  for (const entry of manifest.entries) {
    for (const file of entry.files) {
      if (file.evidenceKind !== "official-exact-commit-license") continue;
      const bytes = await readFile(path.join(root, file.file));
      assert.ok(bytes.length <= 65_536);
      assert.equal(hash(bytes), file.sha256);
    }
  }
  assert.equal(manifest.distributionReady, false);
  assert.equal(manifest.unresolved.length, 8);
});
