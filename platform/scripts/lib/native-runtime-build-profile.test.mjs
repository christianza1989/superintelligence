import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertNativeMessagingNotShipped, nativeRuntimeBuildProfile } from "./native-runtime-build-profile.mjs";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(workspace, "package.json"));
const { build } = await import(createRequire(require.resolve("tsx/package.json")).resolve("esbuild"));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

test("actual explicit native boundary bundle preserves exports and rejects every configured source credential", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "zero-native-messaging-"));
  try {
    const source = path.join(workspace, "packages/adapters/src/messaging-platforms.ts");
    const original = await readFile(source);
    const profile = await nativeRuntimeBuildProfile(workspace);
    const result = await build({
      absWorkingDir: workspace, entryPoints: [source], outfile: path.join(directory, "profile.mjs"),
      format: "esm", platform: "node", bundle: true, metafile: true, plugins: [profile.plugin], logLevel: "silent",
    });
    assertNativeMessagingNotShipped(result.metafile);
    assert.ok(Object.keys(result.metafile.inputs).every(input => !input.includes("node_modules/")));
    const native = await import(pathToFileURL(path.join(directory, "profile.mjs")).href);
    const names = [...original.toString().matchAll(/^export function (\w+)/gm)].map(match => match[1]).sort();
    assert.deepEqual(Object.keys(native).sort(), names);
    assert.deepEqual(native.messagingEnvFromProcess({ DATABASE_URL: "unrelated" }), {});
    assert.deepEqual(native.messagingPlatformsFromEnv({}), []);
    assert.equal(native.isMessagingEnabled([]), false);
    assert.equal(native.isMessagingSurfaceEnabled([], { deploymentModelConfigured: true, openSignup: true }), false);
    const fields = [...original.toString().matchAll(/(\w+): clean\(env\.(\w+)\)/g)];
    assert.equal(fields.length, 17);
    for (const [, property, key] of fields) {
      const secret = "DO_NOT_EXPOSE_" + key;
      for (const operation of [() => native.messagingEnvFromProcess({ [key]: secret }), () => native.messagingPlatformsFromEnv({ [property]: secret })]) {
        assert.throws(operation, error => error.message === "Messaging is unsupported by native-mcp-local-v1" && !error.message.includes(secret));
      }
      assert.deepEqual(native.messagingEnvFromProcess({ [key]: "  " }), {});
    }
    assert.throws(() => native.parseSendblueStatus({}), /unsupported/);
    assert.throws(() => native.enrichSlackTeamRoom({}, {}), /unsupported/);
    assert.equal(hash(await readFile(source)), hash(original));
    assert.equal(profile.manifest.moduleOverrides[0].sourceSha256, hash(original));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("native guard uses positive shipped bytes and fails a surviving messaging vendor", () => {
  for (const name of [
    "chat", "chat-adapter-sendblue", "sendblue", "@chat-adapter/state-memory",
    "@chat-adapter/slack", "chat-adapter-lark", "@slack/web-api",
    "@larksuiteoapi/node-sdk", "grammy", "@grammyjs/types",
  ]) {
    for (const prefix of ["node_modules/", "node_modules/.pnpm/fixture/node_modules/"]) {
      const input = prefix + name + "/dist/index.js";
      const bundle = bytesInOutput => ({ outputs: {
        "api.mjs": { inputs: { [input]: { bytesInOutput: 0 } } },
        "worker.mjs": { inputs: { [input]: { bytesInOutput } } },
      } });
      assert.deepEqual(assertNativeMessagingNotShipped(bundle(0)), {
        positiveForbiddenBundleContributions: 0, copiedForbiddenPackages: 0,
      });
      assert.throws(() => assertNativeMessagingNotShipped(bundle(1)), /Unsupported messaging dependency/);
    }
    assert.throws(() => assertNativeMessagingNotShipped({ outputs: {} }, [{ name }]), /copied/);
  }
  const allowed = "node_modules/chatty/index.js";
  assert.doesNotThrow(() => assertNativeMessagingNotShipped({ outputs: {
    "api.mjs": { inputs: { [allowed]: { bytesInOutput: 1 } } },
  } }, [{ name: "chatty" }]));
});

test("actual adapter barrel preserves native messaging exports without vendors or usable surfaces", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "zero-native-messaging-graph-"));
  try {
    const profile = await nativeRuntimeBuildProfile(workspace);
    const sources = ["messaging-platforms", "chat-sdk-surface", "sendblue-emulator"];
    const expected = [];
    for (const source of sources) {
      const text = await readFile(path.join(workspace, "packages/adapters/src", source + ".ts"), "utf8");
      expected.push(...[...text.matchAll(/^export (?:function|class|const) (\w+)/gm)].map(match => match[1]));
    }
    const barrel = path.join(workspace, "packages/adapters/src/index.ts");
    // Resolve the actual shared barrel and its .js re-exports. Unrelated
    // adapters are empty fixture modules; full API/worker staging separately
    // checks positive bytes across the complete production graph.
    const scopedBarrel = { name: "scoped-adapter-barrel-fixture", setup(build) {
      build.onResolve({ filter: /^\.\// }, args => {
        if (args.importer !== barrel || sources.some(source => args.path === "./" + source + ".js")) return;
        return { path: args.path, namespace: "unrelated-adapter-fixture" };
      });
      build.onLoad({ filter: /.*/, namespace: "unrelated-adapter-fixture" }, () => ({ contents: "", loader: "js" }));
    } };
    const outfile = path.join(directory, "profile.mjs");
    const result = await build({
      absWorkingDir: workspace,
      stdin: {
        contents: "export { " + expected.join(", ") + ' } from "./packages/adapters/src/index.ts";', resolveDir: workspace,
      },
      outfile, format: "esm", platform: "node", bundle: true, metafile: true,
      plugins: [profile.plugin, scopedBarrel], logLevel: "silent",
    });
    assertNativeMessagingNotShipped(result.metafile);
    assert.ok(Object.keys(result.metafile.inputs).every(input => !input.includes("node_modules/")));
    const native = await import(pathToFileURL(outfile).href);
    assert.deepEqual(Object.keys(native).sort(), expected.sort());
    assert.ok(Object.keys(result.metafile.inputs).includes("packages/adapters/src/index.ts"));
    for (const { replacement } of profile.manifest.moduleOverrides) {
      assert.ok(Object.keys(result.metafile.inputs).includes(replacement));
    }
    const source = await readFile(path.join(workspace, "packages/adapters/src/chat-sdk-surface.ts"), "utf8");
    const bound = source.match(/export const MESSAGING_WEBHOOK_MAX_BODY_BYTES = (\d+) \* (\d+);/);
    assert.ok(bound, "Shared webhook bound changed; review native profile boundary");
    assert.equal(native.MESSAGING_WEBHOOK_MAX_BODY_BYTES, Number(bound[1]) * Number(bound[2]));
    for (const attempt of [
      () => new native.ChatSdkMessagingSurface([]),
      () => new native.ChatSdkMessagingSurface([{ provider: "fixture" }]),
      () => new native.SendBlueEmulator(),
      () => native.createEmulatedSendbluePlatform({}),
      () => native.providerOfThreadId("sendblue:fixture"),
      () => native.isMessagingEnabled([{ provider: "fixture" }]),
      () => native.isMessagingSurfaceEnabled([{ provider: "fixture" }], { deploymentModelConfigured: true, openSignup: true }),
    ]) assert.throws(attempt, { message: "Messaging is unsupported by native-mcp-local-v1" });
    assert.equal(profile.manifest.moduleOverrides.length, 3);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
