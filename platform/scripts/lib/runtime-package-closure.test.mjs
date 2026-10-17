import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import {
  copyRuntimePackageClosure,
  inspectRuntimePackageClosure,
} from "./runtime-package-closure.mjs";
const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "zero-closure-test-"));
  roots.push(root);
  const workspace = path.join(root, "workspace"),
    store = path.join(workspace, "node_modules/.pnpm"),
    app = path.join(workspace, "apps/client");
  await mkdir(store, { recursive: true });
  await mkdir(path.join(app, "node_modules"), { recursive: true });
  await writeFile(path.join(app, "package.json"), "{}");
  const pkg = async (
    name,
    version,
    dependencies = {},
    code = 'module.exports="fixture";',
  ) => {
    const directory = path.join(
      store,
      name + "@" + version,
      "node_modules",
      name,
    );
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "package.json"),
      JSON.stringify({
        name,
        version,
        main: "index.cjs",
        dependencies,
        license: "MIT",
      }),
    );
    await writeFile(path.join(directory, "index.cjs"), code);
    await writeFile(path.join(directory, "LICENSE"), "fixture license");
    return directory;
  };
  const d1 = await pkg("dep", "1"),
    d2 = await pkg("dep", "2", {}, 'module.exports="second";');
  const alpha = await pkg(
    "alpha",
    "1",
    { dep: "1" },
    'module.exports=require("dep")+require("node:fs").readFileSync(require("node:path").join(__dirname,"asset.txt"),"utf8");',
  );
  const beta = await pkg(
    "beta",
    "1",
    { dep: "2" },
    'module.exports=require("dep");',
  );
  await writeFile(path.join(alpha, "asset.txt"), "-asset");
  for (const [owner, dep] of [
    [alpha, d1],
    [beta, d2],
  ]) {
    await mkdir(path.join(owner, "node_modules"));
    await symlink(dep, path.join(owner, "node_modules/dep"));
  }
  for (const [name, directory] of [
    ["alpha", alpha],
    ["beta", beta],
  ])
    await symlink(directory, path.join(app, "node_modules", name));
  return {
    root,
    workspace,
    app,
    alpha,
    beta,
    pkg,
    options: {
      workspaceRoot: workspace,
      importers: [
        { file: path.join(app, "package.json"), packages: ["alpha", "beta"] },
      ],
      outputDirectory: path.join(root, "output"),
    },
  };
}
test("copies exact installed versions and runtime assets without flattening dependency versions", async () => {
  const f = await fixture();
  const report = await copyRuntimePackageClosure(f.options);
  assert.equal(report.packages.length, 4);
  assert.ok(report.rootBindings.alpha.includes("alpha@1"));
  assert.ok(
    report.packages
      .find((p) => p.name === "alpha")
      .dependencies.dep.includes("dep@1"),
  );
  assert.deepEqual(report.roots, ["alpha", "beta"]);
  const require = createRequire(
    path.join(f.options.outputDirectory, "consumer.cjs"),
  );
  assert.equal(require("alpha"), "fixture-asset");
  assert.equal(require("beta"), "second");
  assert.ok(report.fileBytes > 0);
  assert.ok(report.allocatedBytes > 0);
  assert.equal(report.physicalSharedExtentDedup, null);
  assert.ok(report.packages.every((p) => /^[a-f0-9]{64}$/.test(p.treeSha256)));
  assert.ok(report.packages.every((p) => !p.instance.includes(f.root)));
});
test("refuses an existing output without overwriting it", async () => {
  const f = await fixture();
  await mkdir(f.options.outputDirectory);
  await writeFile(path.join(f.options.outputDirectory, "marker"), "keep");
  await assert.rejects(copyRuntimePackageClosure(f.options), {
    code: "EEXIST",
  });
  assert.equal(
    await readFile(path.join(f.options.outputDirectory, "marker"), "utf8"),
    "keep",
  );
});
test("fails missing mandatory dependencies and private/store-escaping packages before output writes", async () => {
  const f = await fixture();
  await writeFile(
    path.join(f.beta, "package.json"),
    JSON.stringify({
      name: "beta",
      version: "1",
      dependencies: { missing: "1" },
    }),
  );
  await assert.rejects(copyRuntimePackageClosure(f.options), /not installed/);
  const outside = path.join(f.root, "private");
  await mkdir(outside);
  await writeFile(
    path.join(outside, "package.json"),
    JSON.stringify({ name: "dep", version: "1" }),
  );
  await rm(path.join(f.alpha, "node_modules/dep"));
  await symlink(outside, path.join(f.alpha, "node_modules/dep"));
  await assert.rejects(
    copyRuntimePackageClosure({
      ...f.options,
      importers: [
        { file: path.join(f.app, "package.json"), packages: ["alpha"] },
      ],
    }),
    /escapes/,
  );
});
test("rejects package asset symlink escapes and bounded-copy overflow while retaining the partial attempt", async () => {
  const f = await fixture();
  const privateFile = path.join(f.root, "private-marker");
  await writeFile(privateFile, "fixture private bytes");
  await symlink(privateFile, path.join(f.alpha, "escape"));
  await assert.rejects(copyRuntimePackageClosure(f.options), /symlink escapes/);
  await rm(f.options.outputDirectory, { recursive: true });
  await rm(path.join(f.alpha, "escape"));
  await assert.rejects(
    copyRuntimePackageClosure({ ...f.options, maxBytes: 1 }),
    /exceeds/,
  );
  assert.equal((await lstat(f.options.outputDirectory)).isDirectory(), true);
});

test("read-only inventory matches copied payload hashes without creating an output", async () => {
  const f = await fixture();
  await assert.rejects(
    inspectRuntimePackageClosure({ ...f.options, maxBytes: 1 }),
    /exceeds/,
  );
  const inventory = await inspectRuntimePackageClosure(f.options);
  await assert.rejects(lstat(f.options.outputDirectory), { code: "ENOENT" });
  assert.equal(inventory.measurement, "source-inventory");
  assert.equal(inventory.apparentBytes, null);
  assert.equal(inventory.allocatedBytes, null);
  assert.equal(inventory.uniqueInodes, null);
  assert.equal(inventory.physicalSharedExtentDedup, null);
  const copied = await copyRuntimePackageClosure(f.options);
  assert.equal(copied.measurement, "copied-runtime");
  assert.deepEqual(inventory.packages, copied.packages);
  assert.deepEqual(inventory.rootBindings, copied.rootBindings);
  assert.equal(inventory.fileBytes, copied.fileBytes);
  assert.equal(inventory.fileCount, copied.fileCount);
});
