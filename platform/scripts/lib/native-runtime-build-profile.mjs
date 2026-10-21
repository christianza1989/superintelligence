import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Packages whose own lazy loaders and filesystem-relative assets must stay intact.
export const nativeRuntimeExternalPackages = Object.freeze(["graphile-worker", "jsdom", "sharp", "koffi", "d3-dsv", "playwright-core"]);

export async function nativeRuntimeBuildProfile(workspace) {
  const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
  const overrides = [
    ["packages/adapters/src/messaging-platforms.ts", "scripts/runtime/native-messaging-platforms.ts"],
    ["packages/adapters/src/chat-sdk-surface.ts", "scripts/runtime/native-chat-sdk-surface.ts"],
    ["packages/adapters/src/sendblue-emulator.ts", "scripts/runtime/native-sendblue-emulator.ts"],
  ].map(([source, replacement]) => ({
    source: path.resolve(workspace, source), replacement: path.resolve(workspace, replacement),
  }));
  return {
    manifest: {
      name: "native-mcp-local-v1",
      capabilities: {
        messaging: "unsupported; configured messaging credentials, surfaces and emulators fail",
        browserLibrary: "exact copied Playwright import; Chromium and BiDi capabilities require separate qualification",
      },
      externalPackages: nativeRuntimeExternalPackages,
      moduleOverrides: await Promise.all(overrides.map(async ({ source, replacement }) => ({
        source: path.relative(workspace, source), sourceSha256: sha256(await readFile(source)),
        replacement: path.relative(workspace, replacement), replacementSha256: sha256(await readFile(replacement)),
      }))),
    },
    plugin: { name: "explicit-native-runtime-profile", setup(build) {
      build.onResolve({ filter: /(?:messaging-platforms|chat-sdk-surface|sendblue-emulator)\.(js|ts)$/ }, args => {
        const resolved = path.resolve(args.resolveDir, args.path).replace(/\.js$/, ".ts");
        const override = overrides.find(entry => entry.source === resolved);
        return override ? { path: override.replacement } : undefined;
      });
    } },
  };
}

export function assertNativeMessagingNotShipped(metafile, copiedPackages = []) {
  const names = /^(?:chat|chat-adapter-sendblue|sendblue|@chat-adapter\/[^/]+|chat-adapter-lark|@slack\/[^/]+|@larksuiteoapi\/[^/]+|grammy|@grammyjs\/[^/]+)$/;
  const forbidden = /(?:^|\/)node_modules\/(chat|chat-adapter-sendblue|sendblue|@chat-adapter\/[^/]+|chat-adapter-lark|@slack\/[^/]+|@larksuiteoapi\/[^/]+|grammy|@grammyjs\/[^/]+)\//;
  for (const output of Object.values(metafile.outputs)) {
    for (const [input, contribution] of Object.entries(output.inputs)) {
      if (contribution.bytesInOutput > 0 && forbidden.test(input)) throw new Error("Unsupported messaging dependency contributes to native runtime");
    }
  }
  if (copiedPackages.some(pkg => names.test(pkg.name))) throw new Error("Unsupported messaging dependency copied into native runtime");
  return { positiveForbiddenBundleContributions: 0, copiedForbiddenPackages: 0 };
}
