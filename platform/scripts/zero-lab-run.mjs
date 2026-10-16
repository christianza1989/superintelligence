/** Repeatable local CLI experiment. No model executes without an explicit live request. */
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import {
  REUSE_FIRST_GUIDANCE,
  repositorySearchFromTool,
} from "../packages/adapters/src/zero-repository-tools.ts";
import { emptyTrial, summarize } from "../packages/testkit/src/evals/report.ts";
import { checkCodexRuntime, codexEnvironment, runCodexCli } from "./zero-codex-cli.mjs";
import { CLAUDE_MODEL, CLAUDE_REASONING, checkClaudeRuntime, claudeEnvironment, runClaudeCli } from "./zero-claude-cli.mjs";
import { buildLabPlan } from "./zero-lab-config.mjs";
import { buildCompactRepositoryContext } from "./zero-lab-context.mjs";
import { loadLabReusePlan, stageLabReusePlan } from "./zero-lab-reuse.mjs";

const root = new URL("../../", import.meta.url);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const engines = {
  codex: { ids: ["codex-fixed-v1", "zero-retrieval-v1"], check: checkCodexRuntime, invoke: runCodexCli, env: codexEnvironment, version: /^codex-cli ([a-zA-Z0-9.+-]+)/m },
  claude: { ids: ["claude-fixed-v1", "zero-retrieval-claude-v1"], check: checkClaudeRuntime, invoke: runClaudeCli, env: claudeEnvironment, version: /^([0-9]+\.[0-9]+\.[0-9]+)\b/m },
};
const commonRules =
  "Work only in your assigned project workspace. Do not inspect other experiment workspaces or the evaluator. You may consult public open-source sources using the available tools and network policy. Do not start additional model sessions, call paid model APIs, publish, push, or contact other people. Report what was reused and actual checks. Both benchmark lanes receive these same rules.";

export async function runLabExperiment(options = {}, dependencies = {}) {
  options = { ...options };
  dependencies = { ...dependencies };
  const engineName = options.engine ?? "codex";
  if (!Object.hasOwn(engines, engineName)) throw new Error("Unsupported coding CLI engine.");
  const engine = engines[engineName], supported = new Set([...engine.ids, ...(engineName === "claude" ? ["zero-compact-claude-v1", "zero-jev-reuse-claude-v1"] : [])]);
  const ids = options.profiles ?? [...engine.ids];
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 2 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !supported.has(id)) ||
    (options.live !== undefined && typeof options.live !== "boolean")
  )
    throw new Error(
      "Select one or two implemented fixed-model profiles; Auto model selection is not wired.",
    );
  const plan = await buildLabPlan({ promptVersion: options.promptVersion });
  const task = await readFile(new URL(plan.taskPromptPath, root), "utf8");
  const reuse = ids.includes("zero-jev-reuse-claude-v1")
    ? await loadLabReusePlan(options.reusePlan, { taskDigest: sha256(task), sourceDigests: plan.sourceDigests }) : null;
  const sourceSnapshotMatches = async () => {
    const current = await buildLabPlan({ promptVersion: options.promptVersion });
    return JSON.stringify(current.sourceDigests) === JSON.stringify(options.frozenSourceDigests ?? plan.sourceDigests);
  };
  const profiles = ids.map((id) => engineName === "codex" ? plan.config.profiles.find((p) => p.id === id) : {
    ...plan.config.profiles.find(p => p.id === (id === "claude-fixed-v1" ? "codex-fixed-v1" : "zero-retrieval-v1")),
    id, codingModel: CLAUDE_MODEL, reasoning: CLAUDE_REASONING, auth: "claude-cli-subscription",
    ...(id === "zero-compact-claude-v1" ? { retrieval: "catalog-compact-v2" } : {}),
    ...(id === "zero-jev-reuse-claude-v1" ? { retrieval: "jev-reuse-v1", reusePlanDigest: reuse.digest, tools: reuse.plan.tools } : {}),
  });
  if (plan.config.controls.trials * profiles.length > 8)
    throw new Error("The first runner permits at most eight coding invocations per experiment.");
  const artifactRoot =
    options.artifactRoot ?? fileURLToPath(new URL(".artifacts/zero-lab/runs/", root));
  if (typeof artifactRoot !== "string" || !path.isAbsolute(artifactRoot))
    throw new Error("The artifact root must be an absolute operator-controlled directory.");
  const runId =
    new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomBytes(6).toString("hex");
  const directory = path.join(artifactRoot, runId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const report = {
    version: 1,
    kind: "zero-lab-local-cli-experiment",
    runId,
    executionKind: dependencies.invoke || dependencies.evaluate ? "injected_executor_test_not_model_benchmark" : `${engineName}_cli`,
    startedAtUtc: new Date().toISOString(),
    status: "prepared_not_run",
    suite: plan.config.suite,
    suiteSplit: plan.config.split,
    taskPromptVersion: plan.taskPromptVersion,
    taskPromptPath: plan.taskPromptPath,
    controls: plan.config.controls,
    executionProfile: { platform: process.platform, arch: process.arch, nodeVersion: process.version, cliVersion: null, networkPolicy: "inherited_cli_policy_not_independently_attested" },
    evaluatorProfile: plan.evaluatorProfile,
    profiles,
    profileDigests: Object.fromEntries(profiles.map(profile => [profile.id, sha256(JSON.stringify(profile))])),
    sourceDigests: plan.sourceDigests,
    liveRequested: options.live === true,
    modelDispatchAttempts: 0,
    cliInvocationAttempts: 0,
    reusePreparation: reuse ? { digest: reuse.digest, elapsedMs: reuse.plan.elapsedMs, api: reuse.plan.api,
      librarySelected: reuse.plan.librarySelected, library: reuse.plan.library, selectedSources: reuse.plan.selectedSources } : null,
    preflight: null,
    evaluationPreflight: null,
    sourceIntegrity: { status: "not_checked", checks: 0 },
    trials: [],
    summary: [],
    limitations: [
      "CLI requested model/reasoning are recorded; the CLI usage event is not provider model attestation or an invoice",
      engineName === "codex" ? "CLI input tokens include cached input; never add cache-read tokens to input again" : "Claude raw input excludes cache creation/read; normalized input includes each once. API-equivalent cost estimates are not subscription charges",
      "Separate workspace directories share the local CLI identity; they are not mutually unreadable OS sandboxes",
      "Provider prompt cache is uncontrolled; report actual cached usage instead of assuming a cold model cache",
      "Tool threshold stops on observed CLI events, after an action may have started; it is not a pre-dispatch side-effect cap",
      "The explicit Jev reuse profile combines source filtering, a bounded tool profile and optional generic HTTP library reuse; it does not isolate their individual effects",
      "The full web application's runtime is not exercised by this experimental CLI lane",
      "Trial latency covers retrieval, CLI and acceptance; common setup/preflight and prompt freezing are retained only in experiment elapsed time",
    ],
  };
  const started = performance.now();
  const save = async () => {
    report.summary = summarize(report.trials).map((measurement) => {
      const { passed, failed, autonomousSuccessRate, firstAttemptPassed, modelCalls, ...rest } =
        measurement;
      const rows = report.trials.filter((t) => t.strategy === measurement.strategy);
      return {
        ...rest,
        reportedCompletedTurns: rows.filter((t) => t.generation?.usage).length,
        outcomes: Object.fromEntries(
          [
            "not_run",
            "generation_failed",
            "not_evaluated",
            "unsupported",
            "quality_incomplete",
            "functional_failed",
            "quality_failed",
            "harness_error",
            "cancelled",
            "passed",
          ].map((outcome) => [outcome, rows.filter((t) => t.outcome === outcome).length]),
        ),
        qualityComparisonReady: rows.every((t) => t.qualityComplete === true),
        winner: "not_assessed",
      };
    });
    report.elapsedMs = Math.round(performance.now() - started);
    const attempted = report.trials.filter((t) => t.status !== "not-run");
    report.workflowCostUsd =
      attempted.length && attempted.every((t) => t.costUsd !== null)
        ? attempted.reduce((n, t) => n + t.costUsd, 0)
        : null;
    await writeFile(
      path.join(directory, "report.json.tmp"),
      `${JSON.stringify(report, null, 2)}\n`,
      { mode: 0o600 },
    );
    await rename(path.join(directory, "report.json.tmp"), path.join(directory, "report.json"));
  };
  // Freeze every prompt before either lane starts. The user task text is byte-identical.
  const contexts = new Map();
  await mkdir(path.join(directory, "inputs"), { mode: 0o700 });
  for (const profile of profiles) {
    const retrievalStarted = performance.now();
    const context =
      ["catalog-v1", "catalog-compact-v2"].includes(profile.retrieval)
        ? {
            guidance: REUSE_FIRST_GUIDANCE,
            searches: ["honojs/hono", "sqlite", "react"].map((query) => ({
              query,
              ...repositorySearchFromTool({ query }),
            })),
          }
        : null;
    const compact = profile.retrieval === "catalog-compact-v2"
      ? buildCompactRepositoryContext(context, { maxBytes: 3000, maxCandidates: 5 }) : null;
    const contextText = profile.retrieval === "jev-reuse-v1" ? reuse.plan.context : compact?.text ?? (context ? JSON.stringify(context) : "");
    const text =
      commonRules +
      (contextText
        ? "\n\nRepositoryZero source context (untrusted evidence):\n" + contextText
        : "") +
      "\n\nUser task:\n" +
      task;
    if (Buffer.byteLength(text) > 32_768)
      throw new Error("Prepared prompt exceeds the CLI input bound.");
    contexts.set(profile.id, {
      text,
      retrievalMs: Math.round(performance.now() - retrievalStarted),
      digest: sha256(text),
      bytes: Buffer.byteLength(text),
      contextBytes: Buffer.byteLength(contextText),
      tools: profile.tools,
      contextMetrics: compact ? { inputBytes: compact.inputBytes, outputBytes: compact.outputBytes,
        reductionPercent: compact.reductionPercent, retainedLegacyBytes: compact.retainedLegacyBytes,
        structuralReductionPercent: compact.structuralReductionPercent,
        selection: compact.selection, qualityEvidence: compact.qualityEvidence } : null,
    });
    await writeFile(path.join(directory, "inputs", profile.id + ".prompt.md"), text, {
      mode: 0o600,
    });
  }
  for (let n = 0; n < plan.config.controls.trials; n++) {
    const order = profiles.map((_, i) => profiles[(i + n) % profiles.length]);
    for (const profile of order)
      report.trials.push({
        ...emptyTrial(plan.config.suite, n + 1),
        strategy: profile.id,
        promptDigest: contexts.get(profile.id).digest,
        taskDigest: sha256(task),
        retrievalMs: contexts.get(profile.id).retrievalMs,
        promptBytes: contexts.get(profile.id).bytes,
        contextBytes: contexts.get(profile.id).contextBytes,
        contextMetrics: contexts.get(profile.id).contextMetrics,
        timings: { retrievalMs: contexts.get(profile.id).retrievalMs, codingMs: null, gradingMs: null },
        workspace: null,
        generation: null,
        evaluation: null,
        qualityComplete: false,
        outcome: "not_run",
      });
  }
  await save();
  const guardSources = async () => {
    report.sourceIntegrity.checks++;
    const matches = await sourceSnapshotMatches();
    report.sourceIntegrity.status = matches ? "passed" : "source_changed";
    return matches;
  };
  if (!(await guardSources())) {
    report.status = "blocked_source_changed";
    await save(); return { directory, report };
  }
  if (!options.live) return { directory, report };
  report.preflight = await (dependencies.preflight ?? engine.check)();
  if (!report.preflight.ready) {
    report.status = "blocked_before_model_dispatch";
    for (const trial of report.trials) trial.reason = report.preflight.reason;
    await save();
    return { directory, report };
  }
  if (options.evaluate === true) {
    const inspect = dependencies.acceptancePreflight ??
      (dependencies.invoke ? async () => ({ ready: true, reason: "injected_test_prerequisites" }) :
        (await import("./zero-lab-prepare.mjs")).inspectLabPrerequisites);
    report.evaluationPreflight = await inspect();
    if (!report.evaluationPreflight.ready) {
      report.status = "blocked_before_model_dispatch";
      for (const trial of report.trials) trial.reason = "evaluation_prerequisites_unavailable";
      await save(); return { directory, report };
    }
  }
  if (dependencies.invoke) report.executionProfile.cliVersion = "injected-test-executor";
  else {
    try {
      const version = await promisify(execFile)(engineName, ["--version"], { env: engine.env(), timeout: 5_000, maxBuffer: 16_384 });
      const match = engine.version.exec(version.stdout);
      if (!match) throw new Error("unavailable");
      report.executionProfile.cliVersion = match[1];
    } catch {
      report.status = "blocked_before_model_dispatch";
      report.preflight = { ready: false, reason: "cli_version_unavailable" };
      for (const trial of report.trials) trial.reason = "cli_version_unavailable";
      await save(); return { directory, report };
    }
  }
  const invoke = dependencies.invoke ?? engine.invoke;
  for (const trial of report.trials) {
    if (options.signal?.aborted) {
      trial.reason = "cancelled_before_start";
      report.status = "cancelled";
      break;
    }
    if (!(await guardSources())) {
      report.status = "blocked_source_changed";
      trial.reason = "trusted_source_snapshot_changed";
      await save(); break;
    }
    const workspaceName = trial.strategy + "-" + trial.trial;
    const workspace = path.join(directory, "workspaces", workspaceName);
    await mkdir(workspace, { recursive: true, mode: 0o700 });
    trial.workspace = path.join("workspaces", workspaceName);
    trial.reason = null;
    const trialStarted = performance.now();
    if (trial.strategy === "zero-jev-reuse-claude-v1") {
      const stagingStarted = performance.now();
      await stageLabReusePlan(reuse, workspace);
      trial.timings.stagingMs = Math.round(performance.now() - stagingStarted);
      trial.reusePlanDigest = reuse.digest;
      trial.initialAssets = reuse.plan.assets;
    }
    report.status = "running";
    trial.phase = "generating";
    await save();
    let generation;
    let codingStarted;
    try {
      report.cliInvocationAttempts++;
      if (!dependencies.invoke) report.modelDispatchAttempts = null;
      await save();
      codingStarted = performance.now();
      generation = await invoke({
        workspace,
        prompt: contexts.get(trial.strategy).text,
        timeoutMs: plan.config.controls.timeoutMs,
        maxObservedToolActions: plan.config.controls.maxToolCalls,
        maxOutputBytes: 4_194_304,
        tools: contexts.get(trial.strategy).tools,
        signal: options.signal,
      });
    } catch {
      generation = { status: "failed", reason: "invocation_unavailable", usage: null };
    }
    trial.timings.codingMs = codingStarted === undefined ? null : Math.round(performance.now() - codingStarted);
    const { finalText, ...metadata } = generation;
    trial.generation = metadata;
    trial.outcome = generation.status === "completed" ? "not_evaluated" : "generation_failed";
    trial.status = "failed";
    trial.category = generation.status === "completed" ? "incomplete" : "provider";
    trial.reason = generation.reason ?? "Independent application evaluation has not run";
    trial.modelCalls = !dependencies.invoke && generation.usage ? 1 : 0;
    trial.toolCalls = generation.toolActions ?? 0;
    trial.inputTokens = generation.usage?.inputTokens ?? null;
    trial.outputTokens = generation.usage?.outputTokens ?? null;
    trial.cacheReadTokens = generation.usage?.cachedInputTokens ?? null;
    trial.cacheWriteTokens = generation.usage?.cacheCreationInputTokens ?? null;
    trial.totalTokens = generation.usage?.totalTokens ?? null;
    // Subscription OAuth charge is unknown; never turn null into zero or invent an API tariff.
    trial.costUsd = null;
    if (typeof finalText === "string")
      await writeFile(path.join(workspace, "MODEL-HANDOFF.txt"), finalText, { mode: 0o600 });
    if (generation.status === "completed" && options.evaluate === true) {
      trial.phase = "evaluating";
      await save();
      const gradingStarted = performance.now();
      try {
        if (!(await guardSources())) throw new Error("source_changed");
        // Deferred because a generation-only experiment need not initialize Docker.
        const evaluate =
          dependencies.evaluate ?? (await import("./zero-lab-acceptance.mjs")).evaluateSprintDeskAcceptance;
        const result = await evaluate({
          candidatePath: workspace,
          trustProfile: "controlled_local_candidate",
          artifactDirectory: path.join(directory, "evaluations", workspaceName),
          signal: options.signal,
        });
        trial.evaluation = result;
        const clean = result.cleanup === "passed";
        trial.qualityComplete =
          result.qualityComplete === true &&
          result.automatedContractComplete === true &&
          clean &&
          result.status !== "error" &&
          result.status !== "cancelled";
        trial.outcome =
          result.status === "cancelled"
            ? "cancelled"
            : result.status === "error" ||
                (result.cleanup !== undefined && !clean && result.cleanup !== "not_needed")
              ? "harness_error"
              : result.status === "unsupported"
                ? "unsupported"
                : result.functionalStatus === "failed"
                  ? "functional_failed"
                  : result.ui?.status === "failed"
                    ? "quality_failed"
                  : trial.qualityComplete && result.functionalStatus === "passed"
                    ? "passed"
                    : "quality_incomplete";
        trial.status = trial.outcome === "passed" ? "passed" : "failed";
        trial.category =
          trial.outcome === "passed"
            ? null
            : trial.outcome === "harness_error"
              ? "harness"
              : ["functional_failed", "quality_failed"].includes(trial.outcome)
                ? "agent"
                : "incomplete";
        trial.reason =
          result.status === "partial"
            ? "Functional checks passed; remaining quality checks are not complete"
            : result.status;
      } catch {
        trial.reason = report.sourceIntegrity.status === "source_changed" ? "trusted_source_snapshot_changed" : "evaluation_unavailable";
        trial.category = "harness";
        trial.outcome = "harness_error";
      }
      trial.timings.gradingMs = Math.round(performance.now() - gradingStarted);
    }
    trial.phase = "finished";
    if (!(await guardSources())) {
      trial.outcome = "harness_error"; trial.category = "harness"; trial.status = "failed";
      trial.qualityComplete = false; trial.reason = "trusted_source_snapshot_changed";
    }
    trial.latencyMs = Math.round(performance.now() - trialStarted) + trial.retrievalMs;
    if (generation.status === "cancelled" || options.signal?.aborted) {
      trial.outcome = "cancelled"; trial.category = "incomplete"; trial.status = "failed";
      report.status = "cancelled";
    }
    await save();
    if (report.sourceIntegrity.status === "source_changed") report.status = "blocked_source_changed";
    if (report.status === "cancelled" || report.sourceIntegrity.status === "source_changed" || trial.outcome === "harness_error") break;
    // An unavailable runtime/auth/model does not justify charging another identical lane.
    if (
      [
        "local_state_unwritable",
        "auth_required",
        "subscription_auth_required",
        "model_unavailable",
        "sandbox_unavailable",
        "usage_limit",
        "network_unavailable",
        "unavailable",
        "invalid_cli_events",
        "invocation_unavailable",
      ].includes(generation.reason)
    ) {
      for (const pending of report.trials.filter((t) => t.phase === undefined))
        pending.reason = "Stopped after shared runtime prerequisite failed";
      break;
    }
  }
  if (report.status !== "cancelled" && report.status !== "blocked_source_changed")
    report.status = report.trials.every((t) => t.status === "passed")
      ? "passed"
      : "completed_with_failures_or_incomplete_checks";
  report.finishedAtUtc = new Date().toISOString();
  await save();
  return { directory, report };
}

async function main() {
  const { values } = parseArgs({
    options: {
      live: { type: "boolean", default: false },
      evaluate: { type: "boolean", default: false },
      profiles: { type: "string" },
      engine: { type: "string", default: "codex" },
      "prompt-version": { type: "string", default: "1" },
    },
  });
  const { directory, report } = await runLabExperiment({
    live: values.live,
    evaluate: values.evaluate,
    engine: values.engine,
    promptVersion: Number(values["prompt-version"]),
    ...(values.profiles ? { profiles: values.profiles.split(",") } : {}),
  });
  console.log(
    JSON.stringify(
      {
        status: report.status,
        artifact: path.relative(fileURLToPath(root), path.join(directory, "report.json")),
        modelDispatchAttempts: report.modelDispatchAttempts,
        preflight: report.preflight,
        evaluationPreflight: report.evaluationPreflight,
        cliInvocationAttempts: report.cliInvocationAttempts,
        summary: report.summary.map((s) => ({ profile: s.strategy, attempted: s.attempted, inputTokens: s.inputTokens, outputTokens: s.outputTokens, costUsd: s.costUsd, outcomes: s.outcomes })),
      },
      null,
      2,
    ),
  );
  if (values.live && report.status !== "passed") process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(() => {
    console.error(
      "Zero Lab could not complete; inspect the private local report. No raw auth diagnostics are printed.",
    );
    process.exitCode = 1;
  });
