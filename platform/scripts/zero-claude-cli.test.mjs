import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { test } from "node:test";
import { CLAUDE_MODEL, checkClaudeRuntime, claudeArguments, claudeEnvironment, createClaudeEventParser, runClaudeCli } from "./zero-claude-cli.mjs";
import { LEAN_SYSTEM_PROMPT, LEAN_SYSTEM_PROMPT_DIGEST } from "./zero-lab-strategies.mjs";

test("lean configurations retain security boundaries and record the exact system prompt and effort", async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), "zero-lean-cli-")); t.after(() => rm(workspace, { recursive: true, force: true }));
  for (const reasoning of ["high", "medium", "low"]) {
    const stub = fake([result()]);
    const value = await runClaudeCli({ workspace, prompt: "Controlled task", reasoning, systemPromptMode: "lean-v1", tools: "Bash,Read,Write,Edit" }, stub);
    const args = stub.calls[0].args;
    assert.equal(args[args.indexOf("--system-prompt") + 1], LEAN_SYSTEM_PROMPT);
    assert.equal(args[args.indexOf("--effort") + 1], reasoning);
    assert.ok(args.includes("--safe-mode") && args.includes("--strict-mcp-config"));
    assert.equal(value.requestedReasoning, reasoning); assert.equal(value.systemPromptDigest, LEAN_SYSTEM_PROMPT_DIGEST);
    assert.equal(value.systemPromptMode, "lean-v1"); assert.equal(value.enabledTools, "Bash,Read,Write,Edit");
  }
  assert.ok(!claudeArguments().includes("--system-prompt"));
  for (const config of [{ reasoning: "unbounded" }, { systemPromptMode: "custom" }, { tools: "Bash,Agent" }]) assert.throws(() => claudeArguments(config));
});

const result = () => ({ type: "result", subtype: "success", is_error: false, result: "Synthetic handoff", num_turns: 2,
  total_cost_usd: 0.012, permission_denials: [], modelUsage: { [CLAUDE_MODEL]: {} },
  usage: { input_tokens: 3, output_tokens: 7, cache_creation_input_tokens: 20, cache_read_input_tokens: 100 } });
const assistant = { type: "assistant", message: { model: CLAUDE_MODEL, content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "fixture" } }] } };
const lines = events => events.map(e => JSON.stringify(e)).join("\n") + "\n";
const parse = events => { const p = createClaudeEventParser(); p.push(Buffer.from(lines(events))); return p.finish(); };

test("pins Sonnet 5.5 without fallback, agents, customizations, API keys or permission bypass", () => {
  const args = claudeArguments();
  assert.equal(args[args.indexOf("--model") + 1], CLAUDE_MODEL);
  assert.equal(args[args.indexOf("--permission-mode") + 1], "dontAsk");
  assert.ok(args.includes("--safe-mode") && args.includes("--strict-mcp-config"));
  assert.ok(!args.some(a => /fallback|bypass|dangerously/.test(a)));
  assert.ok(!args[args.indexOf("--tools") + 1].split(",").includes("Agent"));
  const env = claudeEnvironment({ HOME: "/fixture", PATH: "/bin", ANTHROPIC_API_KEY: "private", CLAUDE_CODE_OAUTH_TOKEN: "private", CODEX_HOME: "/other", DATABASE_URL: "private" });
  assert.equal(env.HOME, "/fixture");
  for (const key of ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "CODEX_HOME", "DATABASE_URL"]) assert.equal(env[key], undefined);
});

test("normalizes fresh, cache-write and cache-read tokens once while keeping estimate separate from charge", () => {
  let observed = 0;
  const p = createClaudeEventParser({ onToolAction: n => observed = n });
  const text = Buffer.from(lines([assistant, assistant, { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", is_error: true }] } }, result()]));
  for (let i = 0; i < text.length; i += 3) p.push(text.subarray(i, i + 3));
  const r = p.finish();
  assert.equal(r.valid, true); assert.equal(observed, 1); assert.equal(r.toolFailures, 1);
  assert.deepEqual(r.usage, { inputTokens: 123, outputTokens: 7, cachedInputTokens: 100, cacheCreationInputTokens: 20, uncachedInputTokens: 3, totalTokens: 130 });
  assert.equal(r.actualModel, CLAUDE_MODEL); assert.equal(r.apiEquivalentCostEstimateUsd, 0.012);
  assert.equal(r.actualCostUsd, undefined);
});
test("synthetic error model placeholders do not hide quota, auth or network failures", () => {
  for (const [message, expected] of [["You've hit your limit", "usage_limit"], ["You have reached your usage limit", "usage_limit"],
    ["Authentication required", "auth_required"], ["Network connection unavailable", "network_unavailable"]]) {
    const placeholder = { type: "assistant", message: { model: "<synthetic>", content: [{ type: "text", text: message }] } };
    const failed = { ...result(), subtype: "error_during_execution", is_error: true, result: message, modelUsage: {} };
    const parsed = parse([placeholder, failed]); assert.equal(parsed.valid, false); assert.equal(parsed.failure, expected); assert.equal(parsed.actualModel, null);
  }
  const placeholderSuccess = { type: "assistant", message: { model: "<synthetic>", content: [] } };
  assert.equal(parse([placeholderSuccess, result()]).failure, "model_unavailable");
});

test("rejects missing/duplicate receipts, malformed usage, unintended models and failed turns", () => {
  for (const events of [[], [result(), result()], [{ ...result(), usage: { input_tokens: "3", output_tokens: 7 } }],
    [{ ...result(), modelUsage: { "another-model": {} } }], [{ ...result(), subtype: "error_max_turns", is_error: true }]])
    assert.equal(parse(events).valid, false);
  assert.equal(parse([{ ...result(), subtype: "error_max_turns", is_error: true }]).failure, "turn_limit");
});

test("malformed assistant and user content invalidate once without throwing or accepting a later receipt", () => {
  for (const type of ["assistant", "user"]) for (const content of [undefined, null, {}, "text", [null], [3], [[]], [{}]]) {
    let invalidations = 0;
    const parser = createClaudeEventParser({ onInvalidEvent: () => { invalidations++; } });
    assert.doesNotThrow(() => parser.push(Buffer.from(lines([{ type, message: { content } }, result()]))));
    const parsed = parser.finish();
    assert.equal(parsed.valid, false); assert.equal(parsed.failure, "invalid_cli_events");
    assert.equal(invalidations, 1); assert.equal(parsed.usage, undefined);
  }
});

test("rejects malformed blocks, model usage and negative or overflowing counters without reflecting private values", () => {
  const invalidMessages = [
    { type: "assistant", message: { model: 5, content: [] } },
    { type: "assistant", message: { content: [{ type: "tool_use", id: "", name: "Bash" }] } },
    { type: "assistant", message: { content: [{ type: "tool_use", id: "tool", name: null }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: null, is_error: true }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "tool", is_error: "true" }] } },
  ];
  for (const event of invalidMessages) assert.equal(parse([event, result()]).valid, false);
  for (const modelUsage of [null, [], "SYNTHETIC_PRIVATE_TEXT", { [CLAUDE_MODEL]: null }, { [CLAUDE_MODEL]: [] }])
    assert.equal(parse([{ ...result(), modelUsage }]).valid, false);
  for (const field of ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]) {
    const value = result(); value.usage[field] = -1; assert.equal(parse([value]).valid, false);
  }
  const overflow = result(); overflow.usage.input_tokens = Number.MAX_SAFE_INTEGER;
  assert.equal(parse([overflow]).valid, false);
  const unintended = parse([{ ...result(), modelUsage: { SYNTHETIC_PRIVATE_TEXT: {} } }]);
  assert.equal(unintended.valid, false); assert.equal(unintended.actualModel, null);
  assert.equal(JSON.stringify(unintended).includes("SYNTHETIC_PRIVATE_TEXT"), false);
});

test("a terminal receipt cannot hide subsequent unaccounted model or tool activity", () => {
  assert.equal(parse([result(), assistant]).valid, false);
  assert.equal(parse([result(), { type: "user", message: { content: [] } }]).valid, false);
  const different = { ...assistant, message: { ...assistant.message, model: "other-model" } };
  const parsed = parse([different, result()]);
  assert.equal(parsed.valid, false); assert.equal(parsed.failure, "model_unavailable"); assert.equal(parsed.actualModel, null);
  const negativeEstimate = parse([{ ...result(), total_cost_usd: -1 }]);
  assert.equal(negativeEstimate.valid, true); assert.equal(negativeEstimate.apiEquivalentCostEstimateUsd, null);
});

test("preflight accepts only first-party subscription OAuth and strips private account metadata", async () => {
  for (const authMethod of ["claude.ai", "api_key", "oauth_token"]) {
    const auth = { loggedIn: true, authMethod, apiProvider: "firstParty", subscriptionType: "pro", email: "private@example.test" };
    const r = await checkClaudeRuntime({ execFile: async () => ({ stdout: JSON.stringify(auth) }) });
    assert.equal(r.ready, authMethod === "claude.ai"); assert.ok(!JSON.stringify(r).includes("private@"));
  }
  assert.equal((await checkClaudeRuntime({ execFile: async () => { throw new Error("private token"); } })).ready, false);
});

test("auth shape and plan metadata never turn malformed account content into public diagnostics", async () => {
  for (const auth of [null, [], "private account", { loggedIn: "true", authMethod: "claude.ai", apiProvider: "firstParty" }])
    assert.equal((await checkClaudeRuntime({ execFile: async () => ({ stdout: JSON.stringify(auth) }) })).ready, false);
  for (const subscriptionType of ["private@example.test", { email: "private@example.test" }, ["pro"]]) {
    const auth = { loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType, email: "private@example.test" };
    const value = await checkClaudeRuntime({ execFile: async (_file, args, options) => {
      assert.deepEqual(args, ["--safe-mode", "auth", "status"]); assert.equal(options.env.ANTHROPIC_API_KEY, undefined);
      return { stdout: JSON.stringify(auth) };
    }, env: { PATH: "/bin", ANTHROPIC_API_KEY: "synthetic" } });
    assert.equal(value.ready, true); assert.equal(value.subscriptionType, null);
    assert.equal(JSON.stringify(value).includes("private@"), false);
  }
});

function fake(events, pending = false, ignoreTerm = false) {
  const calls = [], signals = [], inputs = [];
  const spawn = (file, args, options) => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    calls.push({ file, args, options });
    child.kill = signal => { signals.push(signal); if (!(ignoreTerm && signal === "SIGTERM")) queueMicrotask(() => child.emit("close", null, signal)); };
    child.stdin = new Writable({ write(chunk, _enc, cb) { inputs.push(chunk.toString()); cb(); }, final(cb) {
      cb(); queueMicrotask(() => { child.stdout.write(lines(events)); if (!pending) child.emit("close", 0, null); });
    } });
    return child;
  };
  return { spawn, calls, signals, inputs };
}
test("bounded invocation streams only normalized metadata and stops on tools, timeout, cancellation and oversized output", async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), "zero-claude-test-")); t.after(() => rm(workspace, { recursive: true, force: true }));
  const options = { workspace, prompt: "Controlled test", timeoutMs: 1000, maxObservedToolActions: 1 };
  const normal = fake([assistant, result()]); const completed = await runClaudeCli(options, normal);
  assert.equal(completed.status, "completed"); assert.equal(completed.actualCostUsd, null); assert.equal(completed.usage.totalTokens, 130);
  assert.equal(normal.calls[0].file, "claude"); assert.equal(normal.calls[0].options.cwd, workspace);
  const more = { ...assistant, message: { ...assistant.message, content: [{ type: "tool_use", id: "t2", name: "Bash" }] } };
  for (const [events, overrides, expected] of [
    [[assistant, more], {}, "observed_tool_limit"], [[], { timeoutMs: 100 }, "timeout"],
    [[{ ...result(), result: "x".repeat(3000) }], { maxOutputBytes: 1024 }, "output_limit"],
  ]) {
    const stub = fake(events, true), r = await runClaudeCli({ ...options, ...overrides }, stub);
    assert.equal(r.status, expected); assert.ok(stub.signals.includes("SIGTERM"));
  }
  const cancelled = fake([]);
  assert.equal((await runClaudeCli({ ...options, signal: AbortSignal.abort() }, cancelled)).status, "cancelled"); assert.equal(cancelled.calls.length, 0);
});

test("malformed live stdout fails closed and terminates the child instead of escaping its data callback", async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), "zero-claude-malformed-")); t.after(() => rm(workspace, { recursive: true, force: true }));
  for (const event of [
    { type: "assistant", message: { content: {} } },
    { type: "user", message: { content: [null] } },
    { ...result(), usage: { input_tokens: -1, output_tokens: 0 } },
    { ...result(), modelUsage: [] },
  ]) {
    const stub = fake([event], true);
    const value = await runClaudeCli({ workspace, prompt: "Controlled test", timeoutMs: 1000 }, stub);
    assert.equal(value.status, "failed"); assert.equal(value.reason, "invalid_cli_events");
    assert.equal(value.finalText, null); assert.ok(stub.signals.includes("SIGTERM"));
  }
  const duplicate = fake([result(), result()], true);
  const value = await runClaudeCli({ workspace, prompt: "Controlled test", timeoutMs: 1000 }, duplicate);
  assert.equal(value.status, "failed"); assert.equal(value.reason, "invalid_cli_events"); assert.ok(duplicate.signals.includes("SIGTERM"));
});

test("a malformed child that ignores SIGTERM reaches bounded SIGKILL cleanup", async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), "zero-claude-kill-")); t.after(() => rm(workspace, { recursive: true, force: true }));
  const stub = fake([{ type: "assistant", message: { content: [null] } }], true, true);
  const value = await runClaudeCli({ workspace, prompt: "Controlled test", timeoutMs: 2000 }, stub);
  assert.equal(value.status, "failed"); assert.deepEqual(stub.signals, ["SIGTERM", "SIGKILL"]);
  assert.equal(value.actualCostUsd, null);
});

test("the validated prompt and credential route are snapshots across filesystem awaits", async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), "zero-claude-snapshot-")); t.after(() => rm(workspace, { recursive: true, force: true }));
  const options = { workspace, prompt: "Original controlled prompt" }, env = { HOME: "/synthetic-original", PATH: "/bin" };
  const stub = fake([result()]);
  const waiting = runClaudeCli(options, { ...stub, env });
  options.prompt = "x".repeat(40000); env.HOME = "/synthetic-changed";
  const value = await waiting;
  assert.equal(value.status, "completed"); assert.equal(stub.inputs.join(""), "Original controlled prompt");
  assert.equal(stub.calls[0].options.env.HOME, "/synthetic-original");
});
