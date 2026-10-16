/** Subscription CLI adapter. The official CLI owns OAuth; credentials are never read here. */
import { execFile, spawn } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { promisify } from "node:util";
import { codexEnvironment } from "./zero-codex-cli.mjs";

export const CLAUDE_MODEL = "claude-sonnet-5-5";
export const CLAUDE_REASONING = "high";
export const CLAUDE_TOOLS = "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch";
export const claudeEnvironment = (source = process.env) => {
  const env = codexEnvironment(source);
  delete env.CODEX_HOME;
  return env;
};
export function claudeArguments() {
  return ["--safe-mode", "--print", "--model", CLAUDE_MODEL, "--effort", CLAUDE_REASONING,
    "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk",
    "--permission-prompts", "none", "--tools", CLAUDE_TOOLS, "--allowedTools", CLAUDE_TOOLS,
    "--strict-mcp-config", "--no-session-persistence", "--disable-slash-commands", "--max-turns", "60"];
}
function failure(text) {
  if (/unauthorized|not logged in|authentication|401\b/i.test(text)) return "auth_required";
  if (/model.{0,100}(not supported|not available|unsupported|not found|does not exist)/i.test(text)) return "model_unavailable";
  if (/rate.limit|usage.limit|limit reached|out of.{0,20}usage|429\b/i.test(text)) return "usage_limit";
  if (/network|connection|dns|timed out/i.test(text)) return "network_unavailable";
  return "cli_failure";
}
const count = value => Number.isSafeInteger(value) && value >= 0;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
export function createClaudeEventParser(options = {}) {
  const decoder = new StringDecoder("utf8"), tools = new Set(), toolErrors = new Set(), models = new Set();
  let pending = "", malformed = false, results = 0, receipt, reportedFailure;
  const eventCounts = {};
  const invalidate = () => {
    if (malformed) return;
    malformed = true;
    options.onInvalidEvent?.();
  };
  function consume(line) {
    if (malformed || !line.trim()) return;
    let event;
    try { event = JSON.parse(line); } catch { invalidate(); return; }
    if (!record(event) || typeof event.type !== "string") { invalidate(); return; }
    const kind = ["system", "assistant", "user", "result", "rate_limit_event"].includes(event.type) ? event.type : "other";
    eventCounts[kind] = (eventCounts[kind] ?? 0) + 1;
    if (event.type === "assistant" || event.type === "user") {
      if (results || !record(event.message) || !Array.isArray(event.message.content) ||
          event.message.content.some(block => !record(block) || typeof block.type !== "string")) {
        invalidate(); return;
      }
    }
    if (event.type === "assistant") {
      if (event.message.model !== undefined) {
        if (typeof event.message.model !== "string" || !event.message.model || event.message.model.length > 128) { invalidate(); return; }
        models.add(event.message.model);
        if (event.message.model !== CLAUDE_MODEL) reportedFailure = "model_unavailable";
      }
      for (const block of event.message.content) {
        if (block.type !== "tool_use") continue;
        if (typeof block.id !== "string" || !block.id || block.id.length > 128 ||
            typeof block.name !== "string" || !block.name || block.name.length > 128 || (!tools.has(block.id) && tools.size >= 256)) {
          invalidate(); return;
        }
        if (!tools.has(block.id)) { tools.add(block.id); options.onToolAction?.(tools.size); }
      }
    }
    if (event.type === "user") for (const block of event.message.content) {
      if (block.type !== "tool_result") continue;
      if (typeof block.tool_use_id !== "string" || !block.tool_use_id || block.tool_use_id.length > 128 ||
          (block.is_error !== undefined && typeof block.is_error !== "boolean")) { invalidate(); return; }
      if (block.is_error === true && toolErrors.size < 256) toolErrors.add(block.tool_use_id);
    }
    if (event.type === "result") {
      results++;
      if (results !== 1 || (event.is_error !== undefined && typeof event.is_error !== "boolean") ||
          (event.modelUsage !== undefined && (!record(event.modelUsage) || Object.keys(event.modelUsage).length > 8 ||
            Object.entries(event.modelUsage).some(([name, usage]) => !name || name.length > 128 || !record(usage))))) {
        invalidate(); return;
      }
      if (event.is_error || event.subtype !== "success") {
        const errorText = JSON.stringify(event.errors ?? event.result ?? "");
        reportedFailure = event.subtype === "error_max_turns" ? "turn_limit" : failure(errorText);
      }
      const u = event.usage;
      if (!record(u) || ![u.input_tokens, u.output_tokens, u.cache_creation_input_tokens ?? 0, u.cache_read_input_tokens ?? 0].every(count)) {
        invalidate(); return;
      }
      const input = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
      if (!count(input + u.output_tokens) || typeof event.result !== "string" || Buffer.byteLength(event.result) > 65536) { invalidate(); return; }
      for (const name of Object.keys(event.modelUsage ?? {})) models.add(name);
      if ([...models].some(name => name !== CLAUDE_MODEL)) reportedFailure = "model_unavailable";
      receipt = {
        usage: { inputTokens: input, outputTokens: u.output_tokens, cachedInputTokens: u.cache_read_input_tokens ?? 0,
          cacheCreationInputTokens: u.cache_creation_input_tokens ?? 0, uncachedInputTokens: u.input_tokens, totalTokens: input + u.output_tokens },
        finalText: event.result, actualModel: models.size === 1 && models.has(CLAUDE_MODEL) ? CLAUDE_MODEL : null,
        apiEquivalentCostEstimateUsd: typeof event.total_cost_usd === "number" && Number.isFinite(event.total_cost_usd) && event.total_cost_usd >= 0 ? event.total_cost_usd : null,
        reportedTurns: count(event.num_turns) ? event.num_turns : null,
        permissionDenials: Array.isArray(event.permission_denials) ? event.permission_denials.length : null,
      };
    }
  }
  return {
    push(chunk) {
      pending += decoder.write(chunk);
      const lines = pending.split("\n"); pending = lines.pop() ?? "";
      for (const line of lines) consume(line);
      if (Buffer.byteLength(pending) > 1048576) { invalidate(); pending = ""; }
    },
    finish() {
      pending += decoder.end(); if (pending) consume(pending);
      const valid = !malformed && results === 1 && receipt !== undefined && receipt.actualModel === CLAUDE_MODEL &&
        models.size === 1 && models.has(CLAUDE_MODEL) && !reportedFailure;
      return { ...receipt, valid, failure: reportedFailure ?? (valid ? null : "invalid_cli_events"), eventCounts,
        toolActions: tools.size, toolFailures: toolErrors.size };
    },
  };
}

export async function checkClaudeRuntime(deps = {}) {
  try {
    const run = deps.execFile ?? promisify(execFile), env = claudeEnvironment(deps.env ?? process.env);
    const result = await run("claude", ["--safe-mode", "auth", "status"], { env, timeout: 10000, maxBuffer: 16384 });
    const auth = JSON.parse(result.stdout);
    if (!record(auth) || auth.loggedIn !== true || auth.authMethod !== "claude.ai" || auth.apiProvider !== "firstParty")
      return { ready: false, reason: "subscription_auth_required" };
    return { ready: true, reason: null, authMethod: "claude.ai",
      subscriptionType: ["free", "pro", "max", "team", "enterprise"].includes(auth.subscriptionType) ? auth.subscriptionType : null };
  } catch { return { ready: false, reason: "subscription_auth_required" }; }
}

export async function runClaudeCli(options, deps = {}) {
  options = { ...options }; deps = { ...deps };
  const timeoutMs = options.timeoutMs ?? 900000, maxOutputBytes = options.maxOutputBytes ?? 4194304;
  const toolLimit = options.maxObservedToolActions ?? 60;
  if (typeof options.prompt !== "string" || !options.prompt.trim() || Buffer.byteLength(options.prompt) > 32768 ||
    typeof options.workspace !== "string" || !path.isAbsolute(options.workspace) || !count(timeoutMs) || timeoutMs < 100 || timeoutMs > 900000 ||
    !count(toolLimit) || toolLimit < 1 || toolLimit > 100 || !count(maxOutputBytes) || maxOutputBytes < 1024 || maxOutputBytes > 8388608)
    throw new Error("Invalid bounded Claude invocation.");
  const env = claudeEnvironment(deps.env ?? process.env);
  const workspace = await realpath(options.workspace);
  if (!(await stat(workspace)).isDirectory()) throw new Error("Claude workspace must be a directory.");
  const base = { requestedModel: CLAUDE_MODEL, requestedReasoning: CLAUDE_REASONING, actualCostUsd: null,
    sandbox: "cli_permissions_dontAsk_not_os_isolation", actualModel: null };
  if (options.signal?.aborted) return { ...base, status: "cancelled", reason: "cancelled_before_start" };
  const started = Date.now();
  return new Promise(resolve => {
    let child, timeout, hardStop, forceFinish, stopReason, finished = false, outputBytes = 0, stderr = "";
    const signalProcess = signal => {
      try { if (process.platform !== "win32" && child?.pid) process.kill(-child.pid, signal); else child?.kill(signal); }
      catch { try { child?.kill(signal); } catch {} }
    };
    const finish = (exitCode, signal) => {
      if (finished) return; finished = true;
      clearTimeout(timeout); clearTimeout(hardStop); clearTimeout(forceFinish); options.signal?.removeEventListener("abort", cancel);
      const parsed = parser.finish(), status = stopReason === "invalid_cli_events" ? "failed"
        : stopReason ?? (exitCode === 0 && !signal && parsed.valid ? "completed" : "failed");
      const { valid, failure: parsedFailure, finalText, ...metadata } = parsed;
      resolve({ ...base, ...metadata, status, reason: status === "completed" ? null : stopReason ?? (failure(stderr) !== "cli_failure" ? failure(stderr) : parsedFailure ?? "cli_failure"),
        finalText: status === "completed" ? finalText : null, exitCode, signal: signal ?? null, elapsedMs: Date.now() - started, outputBytes });
    };
    const stop = reason => {
      if (finished || stopReason) return; stopReason = reason; child?.stdin?.destroy(); signalProcess("SIGTERM");
      if (finished) return;
      hardStop = setTimeout(() => signalProcess("SIGKILL"), 500); forceFinish = setTimeout(() => finish(null, "SIGKILL"), 1500);
    };
    const cancel = () => stop("cancelled");
    const parser = createClaudeEventParser({
      onToolAction: n => { if (n > toolLimit) stop("observed_tool_limit"); },
      onInvalidEvent: () => stop("invalid_cli_events"),
    });
    try { child = (deps.spawn ?? spawn)("claude", claudeArguments(), { cwd: workspace, env, shell: false,
      detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] }); }
    catch { stopReason = "unavailable"; finish(null, null); return; }
    const collect = (chunk, error) => {
      if (finished || stopReason) return;
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) { stop("output_limit"); return; }
      if (error) stderr = (stderr + chunk.toString("utf8")).slice(-8192); else parser.push(chunk);
    };
    child.stdout.on("data", chunk => collect(chunk, false)); child.stderr.on("data", chunk => collect(chunk, true));
    child.on("error", () => { stopReason = "unavailable"; finish(null, null); }); child.on("close", finish);
    child.stdin.on("error", () => stop("stdin_failure")); timeout = setTimeout(() => stop("timeout"), timeoutMs);
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) cancel(); else child.stdin.end(options.prompt);
  });
}
