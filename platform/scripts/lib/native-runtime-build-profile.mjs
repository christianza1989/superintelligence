import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function nativeRuntimeBuildProfile(workspace) {
  const source = path.resolve(workspace, "packages/adapters/src/messaging-platforms.ts");
  const replacement = path.resolve(workspace, "scripts/runtime/native-messaging-platforms.ts");
  const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
  return {
    manifest: {
      name: "native-mcp-local-v1",
      capabilities: { messaging: "unsupported; configured messaging credentials fail startup" },
      moduleOverrides: [{
        source: path.relative(workspace, source), sourceSha256: sha256(await readFile(source)),
        replacement: path.relative(workspace, replacement), replacementSha256: sha256(await readFile(replacement)),
      }],
    },
    plugin: { name: "explicit-native-runtime-profile", setup(build) {
      build.onResolve({ filter: /messaging-platforms\.(js|ts)$/ }, args => {
        const resolved = path.resolve(args.resolveDir, args.path).replace(/\.js$/, ".ts");
        return resolved === source ? { path: replacement } : undefined;
      });
    } },
  };
}

export function assertNativeMessagingNotShipped(metafile, copiedPackages = []) {
  const names = /^(?:chat-adapter-sendblue|sendblue|@chat-adapter\/[^/]+|chat-adapter-lark|@slack\/[^/]+|@larksuiteoapi\/[^/]+|grammy|@grammyjs\/[^/]+)$/;
  const forbidden = /(?:^|\/)node_modules\/(chat-adapter-sendblue|sendblue|@chat-adapter\/[^/]+|chat-adapter-lark|@slack\/[^/]+|@larksuiteoapi\/[^/]+|grammy|@grammyjs\/[^/]+)\//;
  for (const output of Object.values(metafile.outputs)) {
    for (const [input, contribution] of Object.entries(output.inputs)) {
      if (contribution.bytesInOutput > 0 && forbidden.test(input)) throw new Error("Unsupported messaging dependency contributes to native runtime");
    }
  }
  if (copiedPackages.some(pkg => names.test(pkg.name))) throw new Error("Unsupported messaging dependency copied into native runtime");
  return { positiveForbiddenBundleContributions: 0, copiedForbiddenPackages: 0 };
}
