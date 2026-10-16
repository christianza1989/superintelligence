import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { after, before, test } from "node:test";
import {
  checkCodexRuntime,
  codexArguments,
  codexEnvironment,
  createCodexEventParser,
  runCodexCli,
} from "./zero-codex-cli.mjs";

let workspace;
before(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "repositoryzero-cli-offline-"));
});
after(async () => {
  await rm(workspace, { recursive: true, force: true });
});
const completed = [
  { type: "thread.started", thread_id: "not-exported-fixture-thread" },
  { type: "turn.started" },
  { type: "item.completed", item: { id: "answer", type: "agent_message", text: "RZ_CODEX_OK" } },
  {
    type: "turn.completed",
    usage: { input_tokens: 120, cached_input_tokens: 20, output_tokens: 8 },
  },
];
const lines = (events) => events.map((event) => JSON.stringify(event)).join("\n") + "\n";
function fakeSpawn(events = completed, options = {}) {
  const calls = [];
  const signals = [];
  const spawn = (file, args, launchOptions) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    const input = [];
    calls.push({ file, args, options: launchOptions, input });
    child.kill = (signal) => {
      signals.push(signal);
      queueMicrotask(() => child.emit("close", null, signal));
      return true;
    };
    child.stdin = new Writable({
      write(chunk, _encoding, callback) {
        input.push(chunk.toString("utf8"));
        callback();
      },
      final(callback) {
        callback();
        queueMicrotask(() => {
          if (options.pending) return;
          if (options.stderr) child.stderr.write(options.stderr);
          child.stdout.write(options.raw ?? lines(events));
          child.emit("close", options.exitCode ?? 0, null);
        });
      },
    });
    return child;
  };
  return { spawn, calls, signals };
}

test("builds fixed model/reasoning argv with the normal sandbox and no approval bypass", () => {
  const args = codexArguments("/tmp/fixture with spaces");
  assert.equal(args[0], "exec");
  for (const flag of ["--ignore-user-config", "--ephemeral", "--json"])
    assert.ok(args.includes(flag));
  assert.equal(args[args.indexOf("--sandbox") + 1], "workspace-write");
  assert.equal(args[args.indexOf("--model") + 1], "gpt-6.1-sol");
  assert.ok(args.includes('model_reasoning_effort="xhigh"'));
  assert.ok(args.includes('approval_policy="never"'));
  assert.equal(args.at(-1), "-");
  assert.ok(!args.some((value) => /dangerously|danger-full-access|approve-for-me/.test(value)));
});

test("passes only runtime locations/transport settings and never provider or project secrets", () => {
  const source = {
    PATH: "/bin",
    HOME: "/fixture-home",
    CODEX_HOME: "/fixture-cli-auth-location",
    HTTPS_PROXY: "http://fixture-proxy:80",
    OPENAI_API_KEY: "fixture-secret",
    OPENROUTER_API_KEY: "fixture-secret",
    ANTHROPIC_API_KEY: "fixture-secret",
    GITHUB_TOKEN: "fixture-secret",
    DATABASE_URL: "fixture-private-db",
    CODEX_ACCESS_TOKEN: "fixture-secret",
    CODEX_API_KEY: "fixture-secret",
    CODEX_PERMISSION_PROFILE: "not-inherited",
  };
  const env = codexEnvironment(source);
  assert.equal(env.HOME, source.HOME);
  assert.equal(env.CODEX_HOME, source.CODEX_HOME);
  assert.equal(env.HTTPS_PROXY, source.HTTPS_PROXY);
  assert.equal(env.NO_COLOR, "1");
  for (const key of [
    "OPENAI_API_KEY",
    "OPENROUTER_API_KEY",
    "ANTHROPIC_API_KEY",
    "GITHUB_TOKEN",
    "DATABASE_URL",
    "CODEX_ACCESS_TOKEN",
    "CODEX_API_KEY",
    "CODEX_PERMISSION_PROFILE",
  ])
    assert.equal(env[key], undefined);
});

test("parses UTF-8 JSONL chunks and actual token usage without exporting thread identifiers", () => {
  const parser = createCodexEventParser();
  const events = completed.map((event) =>
    event.type === "item.completed"
      ? { ...event, item: { ...event.item, text: "Gerai ✓" } }
      : event,
  );
  const buffer = Buffer.from(lines(events));
  for (let i = 0; i < buffer.length; i++) parser.push(buffer.subarray(i, i + 1));
  const result = parser.finish();
  assert.equal(result.valid, true);
  assert.equal(result.finalText, "Gerai ✓");
  assert.deepEqual(result.usage, {
    inputTokens: 120,
    cachedInputTokens: 20,
    outputTokens: 8,
    totalTokens: 128,
  });
  assert.ok(!JSON.stringify(result).includes("not-exported-fixture-thread"));
});

test("keeps missing cached usage unknown rather than fabricating a zero", () => {
  const parser = createCodexEventParser();
  parser.push(
    Buffer.from(lines([{ type: "turn.completed", usage: { input_tokens: 2, output_tokens: 1 } }])),
  );
  const result = parser.finish();
  assert.equal(result.valid, true);
  assert.equal(result.usage.cachedInputTokens, null);
});

test("fails closed for missing/malformed/duplicate terminal usage", () => {
  const packets = [
    [],
    [{ type: "turn.completed" }],
    [{ type: "turn.completed", usage: { input_tokens: -1, output_tokens: 1 } }],
    [
      {
        type: "turn.completed",
        usage: { input_tokens: 1, cached_input_tokens: 2, output_tokens: 1 },
      },
    ],
    [completed.at(-1), completed.at(-1)],
  ];
  for (const events of packets) {
    const parser = createCodexEventParser();
    parser.push(Buffer.from(lines(events)));
    assert.equal(parser.finish().valid, false);
  }
  const parser = createCodexEventParser();
  parser.push(Buffer.from("not-json\n" + lines(completed)));
  assert.equal(parser.finish().valid, false);
});

test("classifies failure events without returning raw error/auth content", () => {
  const parser = createCodexEventParser();
  parser.push(
    Buffer.from(
      lines([{ type: "turn.failed", error: { message: "Authentication failed: fixture-secret" } }]),
    ),
  );
  const result = parser.finish();
  assert.equal(result.valid, false);
  assert.equal(result.failure, "auth_required");
  assert.ok(!JSON.stringify(result).includes("fixture-secret"));
});

test("counts logical tool items once and keeps tool failures separate from a completed agent turn", () => {
  const parser = createCodexEventParser();
  parser.push(
    Buffer.from(
      lines([
        { type: "item.started", item: { id: "tool-1", type: "command_execution" } },
        {
          type: "item.completed",
          item: { id: "tool-1", type: "command_execution", exit_code: 1, status: "failed" },
        },
        ...completed,
      ]),
    ),
  );
  const result = parser.finish();
  assert.equal(result.valid, true);
  assert.equal(result.toolActions, 1);
  assert.equal(result.toolFailures, 1);
});

test("launches the CLI without a shell, sends the prompt through stdin and reports requested versus unattested model", async () => {
  const fake = fakeSpawn();
  const result = await runCodexCli(
    { workspace, prompt: "fixture prompt with `literal` $text" },
    { spawn: fake.spawn, env: { PATH: "/bin", OPENROUTER_API_KEY: "fixture-secret" } },
  );
  assert.equal(result.status, "completed");
  assert.equal(result.requestedModel, "gpt-6.1-sol");
  assert.equal(result.actualModel, null);
  assert.equal(result.actualCostUsd, null);
  assert.equal(result.usage.totalTokens, 128);
  assert.equal(fake.calls[0].file, "codex");
  assert.equal(fake.calls[0].options.shell, false);
  assert.equal(fake.calls[0].options.env.OPENROUTER_API_KEY, undefined);
  assert.equal(fake.calls[0].input.join(""), "fixture prompt with `literal` $text");
  assert.ok(!fake.calls[0].args.includes("fixture prompt with `literal` $text"));
});

test("reports the observed read-only in-process startup failure safely", async () => {
  const fake = fakeSpawn([], {
    exitCode: 1,
    stderr:
      "Error: failed to initialize in-process app-server client: Read-only file system (os error 30)",
  });
  const result = await runCodexCli({ workspace, prompt: "fixture" }, { spawn: fake.spawn });
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "local_state_unwritable");
  assert.equal(result.usage, null);
  assert.equal(result.finalText, null);
  assert.ok(!JSON.stringify(result).includes("initialize in-process"));
});

test("a nonzero exit or missing completed event cannot become a successful invocation", async () => {
  const nonzero = fakeSpawn(completed, { exitCode: 1 });
  assert.equal(
    (await runCodexCli({ workspace, prompt: "fixture" }, { spawn: nonzero.spawn })).status,
    "failed",
  );
  const missing = fakeSpawn([]);
  assert.equal(
    (await runCodexCli({ workspace, prompt: "fixture" }, { spawn: missing.spawn })).status,
    "failed",
  );
});

test("bounds a stalled child with termination instead of retrying or bypassing its sandbox", async () => {
  const fake = fakeSpawn([], { pending: true });
  const result = await runCodexCli(
    { workspace, prompt: "fixture", timeoutMs: 100 },
    { spawn: fake.spawn },
  );
  assert.equal(result.status, "timeout");
  assert.deepEqual(fake.signals, ["SIGTERM"]);
  assert.equal(fake.calls.length, 1);
});

test("terminates on combined output overflow and returns no partial agent text", async () => {
  const fake = fakeSpawn([], { raw: "x".repeat(1_025) });
  const result = await runCodexCli(
    { workspace, prompt: "fixture", maxOutputBytes: 1_024 },
    { spawn: fake.spawn },
  );
  assert.equal(result.status, "output_limit");
  assert.equal(result.finalText, null);
  assert.deepEqual(fake.signals, ["SIGTERM"]);
});

test("cancellation before start never launches a process", async () => {
  const fake = fakeSpawn();
  const result = await runCodexCli(
    { workspace, prompt: "fixture", signal: AbortSignal.abort() },
    { spawn: fake.spawn },
  );
  assert.equal(result.status, "cancelled");
  assert.equal(fake.calls.length, 0);
});

test("invalid prompt, timeout and workspace requests are rejected before launch", async () => {
  const fake = fakeSpawn();
  for (const options of [
    { workspace, prompt: "" },
    { workspace, prompt: "x".repeat(32_769) },
    { workspace: "relative", prompt: "fixture" },
    { workspace, prompt: "fixture", timeoutMs: 900_001 },
    { workspace, prompt: "fixture", maxObservedToolActions: 101 },
  ])
    await assert.rejects(runCodexCli(options, { spawn: fake.spawn }));
  assert.equal(fake.calls.length, 0);
});

test("accepts the full fifteen-minute benchmark timeout without changing fixed model or sandbox", async () => {
  const fake = fakeSpawn();
  const result = await runCodexCli(
    { workspace, prompt: "fixture", timeoutMs: 900_000 },
    { spawn: fake.spawn },
  );
  assert.equal(result.status, "completed");
  assert.equal(fake.calls[0].args[fake.calls[0].args.indexOf("--model") + 1], "gpt-6.1-sol");
});

test("stops after an observed tool threshold and does not call it a pre-dispatch limit", async () => {
  const fake = fakeSpawn([
    { type: "item.started", item: { id: "one", type: "command_execution" } },
    { type: "item.started", item: { id: "two", type: "command_execution" } },
    ...completed,
  ]);
  const result = await runCodexCli(
    { workspace, prompt: "fixture", maxObservedToolActions: 1 },
    { spawn: fake.spawn },
  );
  assert.equal(result.status, "observed_tool_limit");
  assert.equal(result.toolActions, 2);
  assert.equal(result.finalText, null);
  assert.deepEqual(fake.signals, ["SIGTERM"]);
});

test("checks a writable runtime location without reading or inventing OAuth credentials", async () => {
  assert.deepEqual(await checkCodexRuntime({ CODEX_HOME: workspace }), {
    ready: true,
    reason: null,
  });
  assert.deepEqual(await checkCodexRuntime({ CODEX_HOME: path.join(workspace, "absent") }), {
    ready: false,
    reason: "cli_state_missing",
  });
});
