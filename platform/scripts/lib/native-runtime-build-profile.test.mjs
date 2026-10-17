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
  const name = "node_modules/.pnpm/chat-adapter-sendblue@0.2.0/node_modules/chat-adapter-sendblue/dist/index.js";
  assert.doesNotThrow(() => assertNativeMessagingNotShipped({ outputs: { "app.mjs": { inputs: { [name]: { bytesInOutput: 0 } } } } }));
  assert.throws(() => assertNativeMessagingNotShipped({ outputs: { "app.mjs": { inputs: { [name]: { bytesInOutput: 1 } } } } }), /Unsupported messaging dependency/);
  assert.throws(() => assertNativeMessagingNotShipped({ outputs: {} }, [{ name: "sendblue" }]), /copied/);
});
