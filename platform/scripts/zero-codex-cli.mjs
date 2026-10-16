/** Local Codex CLI bridge. OAuth remains owned by the CLI; no credential file is read here. */
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";

export const CODEX_MODEL = "gpt-6.1-sol";
export const CODEX_REASONING = "xhigh";
const MAX_OUTPUT = 8_388_608;
const MAX_PROMPT = 32_768;
const ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "CODEX_HOME",
  "SHELL",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SystemRoot",
  "WINDIR",
  "PATHEXT",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
];

export function codexEnvironment(source = process.env) {
  const env = {};
  for (const key of ENV_ALLOWLIST) if (typeof source[key] === "string") env[key] = source[key];
  return { ...env, NO_COLOR: "1", TERM: "dumb" };
}

export function codexArguments(workspace) {
  return [
    "exec",
    "--ignore-user-config",
    "--ephemeral",
    "--json",
    "--color",
    "never",
    "--sandbox",
    "workspace-write",
    "--model",
    CODEX_MODEL,
    "-c",
    `model_reasoning_effort="${CODEX_REASONING}"`,
    "-c",
    'approval_policy="never"',
    "--skip-git-repo-check",
    "--cd",
    workspace,
    "-",
  ];
}

function classifyFailure(text) {
  if (/failed to initialize in-process app-server client: Read-only file system/i.test(text))
    return "local_state_unwritable";
  if (/unauthorized|not authenticated|authentication|please log in|please login|401\b/i.test(text))
    return "auth_required";
  if (
    /model.{0,100}(not supported|not available|unsupported|not found|does not exist)|unsupported.{0,30}model/i.test(
      text,
    )
  )
    return "model_unavailable";
  if (
    /bwrap|bubblewrap|sandbox.{0,100}(failed|unavailable|not permitted)|operation not permitted/i.test(
      text,
    )
  )
    return "sandbox_unavailable";
  if (/network|connection|dns|timed out|reconnect|stream disconnected/i.test(text))
    return "network_unavailable";
  return "cli_failure";
}
const validCount = (value) => Number.isSafeInteger(value) && value >= 0;

export function createCodexEventParser(options = {}) {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let malformed = false;
  let failure;
  let completions = 0;
  let usage;
  let finalText = "";
  const eventCounts = Object.create(null);
  const knownTypes = new Set([
    "thread.started",
    "turn.started",
    "turn.completed",
    "turn.failed",
    "error",
    "item.started",
    "item.updated",
    "item.completed",
  ]);
  const toolItems = new Set();
  const failedToolItems = new Set();
  const consume = (line) => {
    if (!line.trim()) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      malformed = true;
      return;
    }
    if (!event || typeof event.type !== "string") {
      malformed = true;
      return;
    }
    const type = event.type;
    const countKey = knownTypes.has(type) ? type : "other";
    Object.defineProperty(eventCounts, countKey, {
      value: (eventCounts[countKey] ?? 0) + 1,
      enumerable: true,
      configurable: true,
    });
    if (type === "error" || type === "turn.failed") {
      const message = typeof event.message === "string" ? event.message : event.error?.message;
      failure = classifyFailure(typeof message === "string" ? message : "");
    }
    if (type === "item.started" || type === "item.completed" || type === "item.updated") {
      const item = event.item;
      if (
        item &&
        ["command_execution", "mcp_tool_call", "web_search", "file_change"].includes(item.type)
      ) {
        if (
          typeof item.id === "string" &&
          item.id.length <= 128 &&
          (toolItems.has(item.id) || toolItems.size < 256)
        ) {
          if (!toolItems.has(item.id)) {
            toolItems.add(item.id);
            options.onToolAction?.(toolItems.size);
          }
        } else malformed = true;
        if (
          typeof item.id === "string" &&
          (item.status === "failed" || (validCount(item.exit_code) && item.exit_code !== 0))
        )
          failedToolItems.add(item.id);
      }
      if (type === "item.completed" && item?.type === "agent_message") {
        if (typeof item.text !== "string" || Buffer.byteLength(item.text) > 65_536)
          malformed = true;
        else finalText = item.text;
      }
    }
    if (type === "turn.completed") {
      completions++;
      const reported = event.usage;
      if (
        !reported ||
        !validCount(reported.input_tokens) ||
        !validCount(reported.output_tokens) ||
        !validCount(reported.input_tokens + reported.output_tokens) ||
        (reported.cached_input_tokens !== undefined &&
          (!validCount(reported.cached_input_tokens) ||
            reported.cached_input_tokens > reported.input_tokens))
      ) {
        malformed = true;
        return;
      }
      usage = {
        inputTokens: reported.input_tokens,
        outputTokens: reported.output_tokens,
        cachedInputTokens: reported.cached_input_tokens ?? null,
        totalTokens: reported.input_tokens + reported.output_tokens,
      };
    }
  };
  return {
    push(chunk) {
      pending += decoder.write(chunk);
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) consume(line);
      if (Buffer.byteLength(pending) > 131_072) {
        malformed = true;
        pending = "";
      }
    },
    finish() {
      pending += decoder.end();
      if (pending) consume(pending);
      const valid = !malformed && completions === 1 && usage !== undefined && !failure;
      return {
        valid,
        failure: failure ?? (valid ? undefined : "invalid_cli_events"),
        usage,
        finalText,
        eventCounts: { ...eventCounts },
        toolActions: toolItems.size,
        toolFailures: failedToolItems.size,
      };
    },
  };
}

/** Read-only readiness check. Never opens OAuth credential contents or changes CODEX_HOME. */
export async function checkCodexRuntime(env = process.env) {
  const location = env.CODEX_HOME ?? path.join(env.HOME ?? homedir(), ".codex");
  try {
    const state = await stat(location);
    if (!state.isDirectory()) return { ready: false, reason: "cli_state_missing" };
    await access(location, constants.W_OK);
    return { ready: true, reason: null };
  } catch (error) {
    return {
      ready: false,
      reason: ["EROFS", "EACCES", "EPERM"].includes(error?.code)
        ? "local_state_unwritable"
        : "cli_state_missing",
    };
  }
}

/** A completed CLI turn is not a passing app benchmark or an attested model/billing receipt. */
export async function runCodexCli(options, dependencies = {}) {
  options = { ...options };
  dependencies = { ...dependencies };
  const env = codexEnvironment(dependencies.env ?? process.env);
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxOutputBytes = options.maxOutputBytes ?? 524_288;
  const maxObservedToolActions = options.maxObservedToolActions ?? 100;
  if (
    typeof options.prompt !== "string" ||
    !options.prompt.trim() ||
    Buffer.byteLength(options.prompt) > MAX_PROMPT ||
    typeof options.workspace !== "string" ||
    !path.isAbsolute(options.workspace) ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 900_000 ||
    !Number.isSafeInteger(maxObservedToolActions) ||
    maxObservedToolActions < 1 ||
    maxObservedToolActions > 100 ||
    !Number.isSafeInteger(maxOutputBytes) ||
    maxOutputBytes < 1_024 ||
    maxOutputBytes > MAX_OUTPUT
  )
    throw new Error("Invalid bounded Codex invocation.");
  const workspace = await realpath(options.workspace);
  if (!(await stat(workspace)).isDirectory())
    throw new Error("Codex workspace must be a directory.");
  const base = {
    requestedModel: CODEX_MODEL,
    requestedReasoning: CODEX_REASONING,
    sandbox: "workspace-write",
    actualModel: null,
    actualCostUsd: null,
  };
  if (options.signal?.aborted)
    return { ...base, status: "cancelled", reason: "cancelled_before_start" };
  const launch = dependencies.spawn ?? spawn;
  const started = Date.now();
  return new Promise((resolve) => {
    let child;
    let timeout;
    let hardStop;
    let forceFinish;
    let stopReason;
    let outputBytes = 0;
    let stderr = "";
    let finished = false;
    const stopProcess = (signal) => {
      if (!child) return;
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        try {
          child.kill(signal);
        } catch {}
      }
    };
    const finish = (exitCode, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      clearTimeout(hardStop);
      clearTimeout(forceFinish);
      options.signal?.removeEventListener("abort", cancel);
      const parsed = parser.finish();
      const status =
        stopReason ?? (exitCode === 0 && !signal && parsed.valid ? "completed" : "failed");
      const stderrFailure = classifyFailure(stderr);
      const reason =
        parsed.failure === "invalid_cli_events" && stderrFailure !== "cli_failure"
          ? stderrFailure
          : (parsed.failure ?? stderrFailure);
      resolve({
        ...base,
        status,
        elapsedMs: Date.now() - started,
        exitCode,
        signal: signal ?? null,
        reason: status === "completed" ? null : (stopReason ?? reason),
        usage: parsed.usage ?? null,
        finalText: status === "completed" ? parsed.finalText : null,
        eventCounts: parsed.eventCounts,
        toolActions: parsed.toolActions,
        toolFailures: parsed.toolFailures,
        outputBytes,
      });
    };
    const stop = (reason) => {
      if (finished || stopReason) return;
      stopReason = reason;
      child?.stdin?.destroy();
      stopProcess("SIGTERM");
      if (finished) return;
      hardStop = setTimeout(() => stopProcess("SIGKILL"), 500);
      forceFinish = setTimeout(() => finish(null, "SIGKILL"), 1_500);
    };
    const cancel = () => stop("cancelled");
    const parser = createCodexEventParser({
      onToolAction: (count) => {
        // CLI emits observations after a tool starts; this is a stop threshold,
        // never a pre-dispatch permission or strict count of external side effects.
        if (count > maxObservedToolActions) stop("observed_tool_limit");
      },
    });
    try {
      child = launch("codex", codexArguments(workspace), {
        cwd: workspace,
        env,
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      stopReason = "unavailable";
      finish(null, null);
      return;
    }
    const collect = (chunk, isError) => {
      if (finished || stopReason) return;
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        stop("output_limit");
        return;
      }
      if (isError) stderr = (stderr + chunk.toString("utf8")).slice(-8_192);
      else parser.push(chunk);
    };
    child.stdout.on("data", (chunk) => collect(chunk, false));
    child.stderr.on("data", (chunk) => collect(chunk, true));
    child.on("error", () => {
      stopReason = "unavailable";
      finish(null, null);
    });
    child.on("close", finish);
    child.stdin.on("error", () => stop("stdin_failure"));
    timeout = setTimeout(() => stop("timeout"), timeoutMs);
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) cancel();
    else child.stdin.end(options.prompt);
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--workspace" || !path.isAbsolute(args[1]))
    throw new Error(
      "Usage: node platform/scripts/zero-codex-cli.mjs --workspace <absolute-directory> < prompt.txt",
    );
  let prompt = "";
  let bytes = 0;
  const decoder = new StringDecoder("utf8");
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_PROMPT) throw new Error("Codex prompt exceeds the input limit.");
    prompt += decoder.write(chunk);
  }
  prompt += decoder.end();
  const result = await runCodexCli({ workspace: args[1], prompt });
  console.log(JSON.stringify(result));
  if (result.status !== "completed") process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error("Codex bridge failed; raw provider/auth output is not printed.");
    process.exitCode = 1;
  });
}
