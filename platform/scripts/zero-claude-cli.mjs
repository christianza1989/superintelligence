/** Subscription CLI adapter. The official CLI owns OAuth; credentials are never read here. */
import { LEAN_SYSTEM_PROMPT, LEAN_SYSTEM_PROMPT_DIGEST } from "./zero-lab-strategies.mjs";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { execFile, spawn } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { promisify } from "node:util";
import { codexEnvironment } from "./zero-codex-cli.mjs";

export const CLAUDE_MODEL = "claude-sonnet-5-5";
export const CLAUDE_MODELS = Object.freeze([CLAUDE_MODEL, "claude-haiku-5-5"]);
export const CLAUDE_REASONING = "high";
export const CLAUDE_TOOLS = "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch";
export const CLAUDE_LOCAL_TOOLS = "Bash,Read,Write,Edit";
export const claudeEnvironment = (source = process.env) => {
  const env = codexEnvironment(source);
  delete env.CODEX_HOME;
  return env;
};
export async function resolveClaudeExecutable(source = process.env) {
  for (const directory of (claudeEnvironment(source).PATH ?? "").split(path.delimiter)) {
    if (!path.isAbsolute(directory)) continue;
    try { const file = await realpath(path.join(directory,"claude")), info = await stat(file);
      if (info.isFile() && (info.mode & 0o111)) return file;
    } catch {}
  }
  throw new Error("Official CLI executable unavailable.");
}
export async function claudeExecutableDigest(file) {
  if (typeof file !== "string" || !path.isAbsolute(file)) throw new Error("Absolute pinned CLI path required.");
  const hash=createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex");
}
export function claudeArguments({ model = CLAUDE_MODEL, tools = CLAUDE_TOOLS, reasoning = CLAUDE_REASONING, systemPromptMode = "default", maxTurns = 60 } = {}) {
  if (!CLAUDE_MODELS.includes(model) || !Number.isSafeInteger(maxTurns) || maxTurns < 1 || maxTurns > 100) throw new Error("Unsupported bounded Claude model/turn contract.");
  if (!["high", "medium", "low"].includes(reasoning) || !["default", "lean-v1"].includes(systemPromptMode)) throw new Error("Unsupported declared Claude configuration.");
  if (![CLAUDE_TOOLS, CLAUDE_LOCAL_TOOLS].includes(tools)) throw new Error("Unsupported bounded Claude tool profile.");
  return ["--safe-mode", "--print", "--model", model, "--effort", reasoning, ...(systemPromptMode === "lean-v1" ? ["--system-prompt", LEAN_SYSTEM_PROMPT] : []),
    "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk",
    "--permission-prompts", "none", "--tools", tools, "--allowedTools", tools,
    "--strict-mcp-config", "--no-session-persistence", "--disable-slash-commands", "--max-turns", String(maxTurns)];
}
function failure(text) {
  if (/unauthorized|not logged in|authentication|401\b/i.test(text)) return "auth_required";
  if (/model.{0,100}(not supported|not available|unsupported|not found|does not exist)/i.test(text)) return "model_unavailable";
  if (/rate.limit|(?:usage|session|weekly|daily|monthly)[ _-]+(?:limit|cap)|limit reached|(?:hit|reached)\s+(?:(?:your|the)\s+)?(?:(?:usage|session)\s+)?limit\b|out of.{0,20}usage|quota.{0,30}(?:exhausted|exceeded)|429\b/i.test(text)) return "usage_limit";
  if (/network|connection|dns|timed out/i.test(text)) return "network_unavailable";
  return "cli_failure";
}
const count = value => Number.isSafeInteger(value) && value >= 0;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
export function createClaudeEventParser(options = {}) {
  const model = options.model ?? CLAUDE_MODEL;
  if (!CLAUDE_MODELS.includes(model)) throw new Error("Unsupported expected Claude model.");
  const decoder = new StringDecoder("utf8"), tools = new Set(), toolErrors = new Set(), models = new Set();
  let pending = "", malformed = false, results = 0, receipt, reportedFailure, assistantFailure;
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
        if (event.message.model !== model) reportedFailure = "model_unavailable";
      }
      if (event.error !== undefined) {
        const category = failure(JSON.stringify(event.error));
        if (category !== "cli_failure") reportedFailure = assistantFailure = category;
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
      const errorResult = event.is_error || event.subtype !== "success";
      if (errorResult) {
        const category = failure(JSON.stringify([event.errors, event.result, event.api_error_status, event.api_error]));
        reportedFailure = event.subtype === "error_max_turns" ? "turn_limit" : category === "cli_failure" ? assistantFailure ?? category : category;
      }
      const u = event.usage;
      if (!record(u) || ![u.input_tokens, u.output_tokens, u.cache_creation_input_tokens ?? 0, u.cache_read_input_tokens ?? 0].every(count)) {
        invalidate(); return;
      }
      const input = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
      if (!count(input + u.output_tokens) || typeof event.result !== "string" || Buffer.byteLength(event.result) > 65536) { invalidate(); return; }
      for (const name of Object.keys(event.modelUsage ?? {})) models.add(name);
      // Error placeholders are not a provider model identity. Preserve the actual
      // auth/quota/network failure instead of replacing it with model_unavailable.
      if (!errorResult && [...models].some(name => name !== model)) reportedFailure = "model_unavailable";
      receipt = {
        usage: { inputTokens: input, outputTokens: u.output_tokens, cachedInputTokens: u.cache_read_input_tokens ?? 0,
          cacheCreationInputTokens: u.cache_creation_input_tokens ?? 0, uncachedInputTokens: u.input_tokens, totalTokens: input + u.output_tokens },
        finalText: event.result, actualModel: models.size === 1 && models.has(model) ? model : null,
        apiEquivalentCostEstimateUsd: typeof event.total_cost_usd === "number" && Number.isFinite(event.total_cost_usd) && event.total_cost_usd >= 0 ? event.total_cost_usd : null,
        reportedTurns: count(event.num_turns) ? event.num_turns : null,
        permissionDenials: Array.isArray(event.permission_denials) ? event.permission_denials.length : null,
        terminalSubtype: ["success", "error_max_turns", "error_during_execution", "error_max_budget_usd"].includes(event.subtype) ? event.subtype : "other",
        apiErrorStatus: Number.isInteger(event.api_error_status) && event.api_error_status >= 100 && event.api_error_status <= 599 ? event.api_error_status : null,
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
      const valid = !malformed && results === 1 && receipt !== undefined && receipt.actualModel === model &&
        models.size === 1 && models.has(model) && !reportedFailure;
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
    typeof options.workspace !== "string" || !path.isAbsolute(options.workspace) || !count(timeoutMs) || timeoutMs < 100 || timeoutMs > 1200000 ||
    !count(toolLimit) || toolLimit < 1 || toolLimit > 100 || !count(maxOutputBytes) || maxOutputBytes < 1024 || maxOutputBytes > 8388608)
    throw new Error("Invalid bounded Claude invocation.");
  if (options.executable !== undefined && (typeof options.executable !== "string" || !path.isAbsolute(options.executable))) throw new Error("Absolute operator CLI path required.");
  const env = claudeEnvironment(deps.env ?? process.env);
  const args = claudeArguments({ model: options.model, maxTurns: options.maxTurns, tools: options.tools, reasoning: options.reasoning, systemPromptMode: options.systemPromptMode });
  const workspace = await realpath(options.workspace);
  if (!(await stat(workspace)).isDirectory()) throw new Error("Claude workspace must be a directory.");
  const base = { requestedModel: options.model ?? CLAUDE_MODEL, requestedReasoning: options.reasoning ?? CLAUDE_REASONING, actualCostUsd: null,
    systemPromptMode: options.systemPromptMode ?? "default", systemPromptDigest: options.systemPromptMode === "lean-v1" ? LEAN_SYSTEM_PROMPT_DIGEST : null,
    sandbox: "cli_permissions_dontAsk_not_os_isolation", actualModel: null, enabledTools: options.tools ?? CLAUDE_TOOLS };
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
      model: options.model,
      onToolAction: n => { if (n > toolLimit) stop("observed_tool_limit"); },
      onInvalidEvent: () => stop("invalid_cli_events"),
    });
    try { child = (deps.spawn ?? spawn)(options.executable ?? "claude", args, { cwd: workspace, env, shell: false,
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
