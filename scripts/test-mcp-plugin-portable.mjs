import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { testPlanningActivation } from "./test-mcp-plugin-planning.mjs";

// Node built-ins only, so a Windows runtime can probe a Linux-built package
// without resolving SDK dependencies through workspace symlinks.
if (process.argv.length !== 3)
  throw new Error("Pass the generated plugin directory.");
await testPlanningActivation(resolve(process.argv[2]));
const entry = join(resolve(process.argv[2]), "server/index.mjs");
const cwd = await mkdtemp(join(tmpdir(), "zero-plugin-portable-"));
const env = {
  PATH: process.env.PATH ?? process.env.Path ?? "",
  ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
};
const child = spawn(process.execPath, [entry], {
  cwd,
  env,
  stdio: ["pipe", "pipe", "pipe"],
});
let stderr = "",
  next = 0;
const pending = new Map();
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});
const lines = createInterface({ input: child.stdout });
lines.on("line", (line) => {
  const value = JSON.parse(line);
  if (value.id !== undefined) {
    const item = pending.get(value.id);
    if (item) {
      pending.delete(value.id);
      clearTimeout(item.timer);
      item.resolve(value);
    }
  }
});
const closed = new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code) => resolve(code));
});
const send = (method, params) =>
  new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Packaged protocol timeout"));
    }, 10000);
    pending.set(id, { resolve, timer });
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
    );
  });
try {
  const initialize = await send("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "zero-portable-fixture", version: "1" },
  });
  assert.ok(initialize.result.serverInfo);
  child.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) +
      "\n",
  );
  assert.deepEqual(
    (await send("tools/list", {})).result.tools.map((t) => t.name).sort(),
    ["zero_inspect", "zero_search", "zero_status"],
  );
  const status = (
    await send("tools/call", {
      name: "zero_status",
      arguments: { nonce: "portable-fixture" },
    })
  ).result.structuredContent;
  assert.equal(status.nonce, "portable-fixture");
  assert.equal(status.profile, "discovery-only");
  assert.equal(status.backend, "unavailable");
  const search = (
    await send("tools/call", {
      name: "zero_search",
      arguments: { query: "playwright" },
    })
  ).result.structuredContent;
  assert.equal(search.candidates[0].repository, "microsoft/playwright");
  const inspect = (
    await send("tools/call", {
      name: "zero_inspect",
      arguments: { candidateId: "microsoft/playwright" },
    })
  ).result.structuredContent;
  assert.equal(inspect.candidate.runtimeTested, false);
  child.stdin.end();
  assert.equal(await closed, 0);
  assert.equal(stderr, "");
  if (process.platform === "win32") {
    const opt = spawn(process.execPath, [entry], {
      cwd,
      env: { ...env, ZERO_MCP_BINDING_FILE: "private-fixture-marker" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "",
      err = "";
    opt.stdout.on("data", (c) => {
      out += c;
    });
    opt.stderr.on("data", (c) => {
      err += c;
    });
    const code = await new Promise((resolve, reject) => {
      opt.once("error", reject);
      opt.once("close", resolve);
    });
    assert.equal(code, 1);
    assert.equal(out, "");
    assert.equal(
      err,
      "RepositoryZero packaged execution requires Linux operator setup.\n",
    );
  }
  console.log(
    "PASS: standalone discovery initialize/list/status/search/inspect; Windows opt-in execution refused where applicable. Not a native plugin installation proof.",
  );
} finally {
  for (const item of pending.values()) clearTimeout(item.timer);
  child.stdin.destroy();
  if (child.exitCode === null) child.kill();
  await closed.catch(() => {});
  lines.close();
  await rmdir(cwd);
}
