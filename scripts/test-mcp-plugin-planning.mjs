import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Built-ins only: exercise the installed command on Windows and Linux without
// resolving the MCP SDK through the source checkout's platform-specific links.
export async function testPlanningActivation(directory) {
  const read = async (file) =>
    JSON.parse(await readFile(join(directory, file), "utf8"));
  const manifest = await read("plugin.json");
  const build = await read("BUILD.json");
  assert.equal(manifest.extensions["com.openai"].hooks, "./hooks/hooks.json");
  assert.equal((await read(".codex-plugin/plugin.json")).hooks, "./hooks/hooks.json");
  assert.equal(build.planningActivation.requiresUserHookTrust, true);
  assert.deepEqual(build.planningActivation.files.map(({ file }) => file).sort(), [
    "hooks/hooks.json",
    "hooks/session-start.cjs",
    "skills/repositoryzero-reuse/SKILL.md",
    "skills/repositoryzero-reuse/agents/openai.yaml",
  ]);
  for (const entry of build.planningActivation.files) {
    const bytes = await readFile(join(directory, entry.file));
    assert.equal(entry.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(entry.bytes, bytes.byteLength);
  }
  const cwd = await mkdtemp(join(tmpdir(), "zero-plugin-planning-"));
  try {
    const hookConfig = await read("hooks/hooks.json");
    const [hookGroup] = hookConfig.hooks.SessionStart;
    const [handler] = hookGroup.hooks;
    assert.equal(handler.type, "command");
    assert.ok(handler.timeout <= 5 && handler.additionalContextLimit <= 768);
    let firstHookOutput;
    for (const source of ["startup", "compact"]) {
      const result = spawnSync(handler.command, {
        shell: true,
        cwd,
        env: {
          PATH: process.env.PATH ?? process.env.Path ?? "",
          ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
          PLUGIN_ROOT: directory,
          ZERO_TEST_PRIVATE_VALUE: "fixture-do-not-reflect-5291",
        },
        input: JSON.stringify({ hook_event_name: "SessionStart", source, cwd, transcript_path: "fixture-never-read-transcript-5291" }),
        encoding: "utf8",
        timeout: 5000,
        maxBuffer: 16384,
      });
      assert.equal(result.status, 0, result.stderr || String(result.error ?? result.signal));
      assert.equal(result.stderr, "");
      assert.ok(Buffer.byteLength(result.stdout) < 4096);
      const output = JSON.parse(result.stdout);
      assert.deepEqual(Object.keys(output), ["hookSpecificOutput"]);
      assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
      const context = output.hookSpecificOutput.additionalContext;
      assert.equal(typeof context, "string");
      assert.ok(context.includes("zero_status") && context.includes("zero_search"));
      assert.ok(context.includes(JSON.stringify(join(directory, "skills/repositoryzero-reuse/SKILL.md"))));
      assert.ok(!result.stdout.includes("5291"), "hook must not reflect private environment or transcript input");
      if (firstHookOutput !== undefined) assert.equal(result.stdout, firstHookOutput);
      firstHookOutput = result.stdout;
      assert.deepEqual(await readdir(cwd), [], "hook must not write into the user's project");
    }
  } finally {
    await rmdir(cwd);
  }
  console.log("PASS: packaged planning context is bounded, deterministic and does not reflect hook input or write project files; native hook trust/activation remains separate.");
}
