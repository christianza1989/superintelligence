import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { bundledRuntimePackages, copyBundledRuntimeNotices } from "./native-runtime-notices.mjs";
import { nativeRuntimeLicenseEvidence } from "./native-runtime-stage-policy.mjs";

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
  assert.equal(manifest.unresolved.length, 7);
});

test("protobuf supplemental evidence preserves both license texts and rejects a missing or truncated BSD notice", async () => {
  const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const evidenceRoot = path.join(workspace, "runtime/native-license-evidence");
  const manifest = JSON.parse(await readFile(path.join(evidenceRoot, "manifest.json"), "utf8"));
  const entry = manifest.entries.find(item => item.package === "@bufbuild/protobuf" && item.version === "2.14.1");
  assert.ok(entry);
  assert.deepEqual(entry.files.map(file => file.outputName).sort(), ["LICENSE", "NOTICE-GOOGLE-BSD-3-CLAUSE.txt"]);
  const bsd = entry.files.find(file => file.outputName === "NOTICE-GOOGLE-BSD-3-CLAUSE.txt");
  assert.equal(bsd.source.kind, "exact-installed-package-source-notice");
  assert.equal(bsd.source.npmGitHead, "09c98f182a86cd6d4bb89a418f261812d8eb2108");
  assert.equal(bsd.source.sourceFileSha256, "5a78ffe702716989b7c1d5f5deb73f7283655af5a7ecb3d885ae0b19f59eeaeb");
  const input = "node_modules/.pnpm/@bufbuild+protobuf@2.14.1/node_modules/@bufbuild/protobuf/" + bsd.source.sourcePath;
  const packages = await bundledRuntimePackages(workspace, [input]);
  assert.equal(packages.get("@bufbuild/protobuf@2.14.1").packageJsonSha256, entry.packageJsonSha256);
  const source = await readFile(path.join(workspace, input));
  const notice = await readFile(path.join(evidenceRoot, bsd.file));
  assert.equal(hash(source), bsd.source.sourceFileSha256);
  assert.equal(bsd.source.sourceByteRange.offset, 0);
  assert.equal(bsd.source.sourceByteRange.bytes, source.indexOf(Buffer.from("/**\n")));
  assert.deepEqual(notice, source.subarray(0, bsd.source.sourceByteRange.bytes));
  assert.equal(hash(notice), "0e952cb110ff6944789fbe47c25b38819a3866c04c7c5cbea8d0c0d8f3a92f0e");
  assert.deepEqual(manifest.unresolved.map(item => item.package + "@" + item.version), [
    "@better-auth/utils@0.4.2", "@better-auth/utils@0.5.0",
    "chat-adapter-sendblue@0.2.0",
    "@img/sharp-libvips-linux-x64@1.3.3", "@img/sharp-libvips-linuxmusl-x64@1.3.3",
    "@koromix/koffi-linux-x64@3.2.1", "@prisma/dev@0.24.17",
  ]);
  const scratch = await mkdtemp(path.join(os.tmpdir(), "zero-protobuf-notices-"));
  try {
    const output = path.join(scratch, "complete");
    const [preserved] = await copyBundledRuntimeNotices({ packages, output, evidenceRoot, evidence: [entry] });
    assert.equal(preserved.license, "(Apache-2.0 AND BSD-3-Clause)");
    assert.equal(preserved.licenseApproval, "unknown");
    assert.equal(preserved.files.length, 2);
    const otherRuntimeGaps = manifest.unresolved.filter(item => item.package !== "chat-adapter-sendblue");
    const runtimePackages = new Map(packages);
    for (const gap of otherRuntimeGaps) runtimePackages.set(gap.package + "@" + gap.version, { packageJsonSha256: gap.packageJsonSha256 });
    runtimePackages.set("react-remove-scroll-bar@2.3.8", {});
    const gate = nativeRuntimeLicenseEvidence({
      notices: [preserved, { package: "react-remove-scroll-bar", version: "2.3.8", license: "MIT", files: [] }],
      packages: runtimePackages, knownUnresolved: manifest.unresolved,
    });
    assert.equal(gate.releaseLicenseEvidenceGate, "blocked");
    assert.equal(gate.licenseApproval, "unknown");
    assert.equal(gate.unresolvedLicenseEvidence.length, 7);
    assert.ok(gate.unresolvedLicenseEvidence.some(item => item.package === "react-remove-scroll-bar"));
    assert.ok(gate.unresolvedLicenseEvidence.every(item => item.package !== "@bufbuild/protobuf"));
    for (const file of entry.files) {
      assert.deepEqual(await readFile(path.join(output, preserved.files.find(item => item.path.endsWith("/" + file.outputName)).path)), await readFile(path.join(evidenceRoot, file.file)));
    }
    const incomplete = path.join(scratch, "incomplete"); await mkdir(incomplete);
    const apache = entry.files.find(file => file.outputName === "LICENSE");
    await writeFile(path.join(incomplete, apache.file), await readFile(path.join(evidenceRoot, apache.file)));
    await assert.rejects(copyBundledRuntimeNotices({ packages, output: path.join(scratch, "missing"), evidenceRoot: incomplete, evidence: [entry] }), { code: "ENOENT" });
    await writeFile(path.join(incomplete, bsd.file), notice.subarray(0, 64));
    await assert.rejects(copyBundledRuntimeNotices({ packages, output: path.join(scratch, "truncated"), evidenceRoot: incomplete, evidence: [entry] }), /content mismatch/);
  } finally { await rm(scratch, { recursive: true, force: true }); }
});
