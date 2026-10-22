import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rmdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { testPlanningActivation } from "./test-mcp-plugin-planning.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
if (process.argv.length !== 3)
  throw new Error("Pass the generated local plugin directory.");
const directory = resolve(process.argv[2]);
const read = async (file) =>
  JSON.parse(await readFile(join(directory, file), "utf8"));
const manifest = await read("plugin.json");
const build = await read("BUILD.json");
const server = await readFile(join(directory, "server/index.mjs"));
assert.equal(
  build.serverSha256,
  createHash("sha256").update(server).digest("hex"),
);
assert.equal(build.serverBytes, server.byteLength);
assert.equal(manifest.version, build.version);
assert.equal(build.defaultProfile, "discovery-only");
assert.deepEqual(build.bundles.map((b) => b.file).sort(), [
  "server/discovery.mjs",
  "server/execution.mjs",
  "server/index.mjs",
]);
for (const bundle of build.bundles) {
  const bytes = await readFile(join(directory, bundle.file));
  assert.equal(bundle.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(bundle.bytes, bytes.byteLength);
}
assert.ok(
  build.dependencies.every(
    (p) =>
      ![
        "pg",
        "graphile-worker",
        "koffi",
        "@rakazo/db",
        "@prisma/client",
      ].includes(p.name),
  ),
);
for (const notice of await read("THIRD-PARTY-NOTICES.json")) {
  assert.ok(notice.files.length);
  for (const file of notice.files) await access(join(directory, file));
}
for (const host of [".codex-plugin", ".claude-plugin"]) {
  const hostManifest = await read(`${host}/plugin.json`);
  assert.equal(hostManifest.name, manifest.name);
  assert.equal(hostManifest.version, manifest.version);
}
await testPlanningActivation(directory);
const require = createRequire(
  join(root, "platform/packages/adapters/package.json"),
);
const { Client } = await import(
  pathToFileURL(require.resolve("@modelcontextprotocol/sdk/client/index.js"))
);
const { StdioClientTransport } = await import(
  pathToFileURL(require.resolve("@modelcontextprotocol/sdk/client/stdio.js"))
);
// Run from an unrelated empty directory. The packaged runtime must not resolve
// workspace source or dependencies from the invoking project's cwd.
const cwd = await mkdtemp(join(tmpdir(), "zero-plugin-cwd-"));
for (const file of ["mcp.json", ".mcp.json"]) {
  const config = (await read(file)).mcpServers.repositoryzero;
  assert.equal(config.command, "node");
  assert.equal(config.args.length, 1);
  const entry = config.args[0]
    .replace("${PLUGIN_ROOT}", directory)
    .replace("${CLAUDE_PLUGIN_ROOT}", directory);
  assert.equal(resolve(entry), join(directory, "server/index.mjs"));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    cwd,
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const client = new Client({
    name: "repositoryzero-package-proof",
    version: "1",
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(({ name }) => name).sort(), [
      "zero_inspect",
      "zero_search",
      "zero_status",
    ]);
    const nonce = `package-proof-${file}`;
    const status = (
      await client.callTool({ name: "zero_status", arguments: { nonce } })
    ).structuredContent;
    assert.equal(status.nonce, nonce);
    assert.equal(status.server.version, manifest.version);
    assert.equal(status.profile, "discovery-only");
    assert.equal(status.backend, "unavailable");
    assert.equal(typeof status.protocolVersion, "string");
    const search = (
      await client.callTool({
        name: "zero_search",
        arguments: { query: "playwright" },
      })
    ).structuredContent;
    assert.equal(search.candidates[0].repository, "microsoft/playwright");
    const inspect = (
      await client.callTool({
        name: "zero_inspect",
        arguments: { candidateId: "microsoft/playwright" },
      })
    ).structuredContent;
    assert.equal(inspect.status, "source_candidate");
    assert.equal(inspect.candidate.runtimeTested, false);
    assert.equal(inspect.candidate.licenseApproved, false);
  } finally {
    await client.close();
  }
  assert.equal(stderr, "");
}
await rmdir(cwd);
console.log(
  "PASS: portable and compatibility launch configs run a self-contained discovery server; not a native host plugin installation proof.",
);

if (process.platform === "linux") {
  const { testExecutionPackage } =
    await import("./test-mcp-plugin-execution.mjs");
  await testExecutionPackage(directory, { Client, StdioClientTransport });
} else
  console.log(
    "SKIP: optional execution requires Linux; discovery proof above remains applicable.",
  );
