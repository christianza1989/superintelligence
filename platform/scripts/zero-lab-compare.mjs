/** Read-only comparison of recorded experiments. Never invokes a model or promotes a profile. */
import { isDeclaredEffortComparison } from "./zero-lab-strategies.mjs";
import { constants } from "node:fs";
import { mkdir, open, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const digest = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const profileId = (v) => typeof v === "string" && /^[a-z][a-z0-9-]{0,79}$/.test(v) && !v.startsWith("sk-");
const measured = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const count = (v) => measured(v) && Number.isSafeInteger(v);
const canonical = (v) => JSON.stringify(v, (_, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
};
function sum(rows, field, predicate = count) {
  if (!rows.length || rows.some((r) => !predicate(r[field]))) return null;
  const total = rows.reduce((n, r) => n + r[field], 0);
  return Number.isFinite(total) && total <= Number.MAX_SAFE_INTEGER ? total : null;
}
function metrics(rows) {
  const attempted = rows.filter((r) => r.phase === "finished");
  const accepted = attempted.filter((r) => r.outcome === "passed" && r.qualityComplete === true && r.evaluation?.cleanup === "passed");
  return {
    planned: rows.length, attempted: attempted.length, accepted: accepted.length,
    incomplete: rows.filter((r) => !["passed", "functional_failed", "quality_failed"].includes(r.outcome)).length,
    failures: attempted.filter((r) => ["functional_failed", "quality_failed"].includes(r.outcome)).length,
    allAttemptInputTokens: sum(attempted, "inputTokens"),
    allAttemptOutputTokens: sum(attempted, "outputTokens"),
    allAttemptTotalTokens: sum(attempted, "totalTokens"),
    allAttemptCostUsd: attempted.every((r) => Array.isArray(r.costSources) && r.costSources.some((s) => ["provider-reported", "provider-invoice"].includes(s))) ? sum(attempted, "costUsd", measured) : null,
    acceptedLatencyMedianMs: accepted.every((r) => count(r.latencyMs)) ? median(accepted.map((r) => r.latencyMs)) : null,
    acceptedCodingMedianMs: accepted.length && accepted.every((r) => count(r.timings?.codingMs ?? r.generation?.elapsedMs))
      ? median(accepted.map((r) => r.timings?.codingMs ?? r.generation.elapsedMs)) : null,
    acceptedGradingMedianMs: accepted.length && accepted.every((r) => count(r.timings?.gradingMs ?? r.evaluation?.elapsedMs))
      ? median(accepted.map((r) => r.timings?.gradingMs ?? r.evaluation.elapsedMs)) : null,
    allAttemptElapsedMs: sum(attempted, "latencyMs"),
  };
}
const difference = (baseline, candidate) => {
  if (!measured(baseline) || !measured(candidate))
    return { baseline: baseline ?? null, candidate: candidate ?? null, delta: null, relativeChangePercent: null };
  const relative = baseline > 0 ? 100 * (candidate - baseline) / baseline : null;
  return { baseline, candidate, delta: candidate - baseline, relativeChangePercent: Number.isFinite(relative) ? relative : null };
};

export function compareLabExperiments(baselineReport, candidateReport, options = {}) {
  const baselineId = options.baselineProfile ?? "codex-fixed-v1";
  const candidateId = options.candidateProfile ?? "zero-retrieval-v1";
  const result = {
    version: 1, kind: "zero-lab-comparison", status: "not_comparable", reasons: [],
    baselineProfile: profileId(baselineId) ? baselineId : null,
    candidateProfile: profileId(candidateId) ? candidateId : null,
    baseline: null, candidate: null, deltas: null,
    quality: { status: "not_assessed", scope: "declared_automated_checks_not_subjective_product_quality" },
    observations: [], winner: "not_assessed", automaticPromotion: false,
    limitations: [
      "Input reports are local recorded evidence, not signed provider or billing attestations",
      "CLI input includes cached input; cache tokens are never added to input a second time",
      "Missing measurements remain null, and failed or incomplete attempts remain visible",
      "A single task is exploratory; repeated trials alone do not establish a global advantage",
      "Trial latency includes retrieval, CLI and acceptance; shared setup/preflight is not allocated to individual profiles",
    ],
  };
  const reject = (reason) => { result.reasons.push(reason); };
  if (!profileId(baselineId) || !profileId(candidateId)) { reject("invalid_profile_id"); return result; }
  for (const report of [baselineReport, candidateReport]) {
    if (!report || report.version !== 1 || report.kind !== "zero-lab-local-cli-experiment" ||
        !Array.isArray(report.trials) || report.trials.length > 160 || !Array.isArray(report.profiles) || report.profiles.length > 32 ||
        report.trials.some((t) => !t || typeof t !== "object" || !profileId(t.strategy) || !count(t.trial) || t.trial < 1) ||
        report.profiles.some((p) => !p || typeof p !== "object" || !profileId(p.id))) {
      reject("invalid_report_contract"); return result;
    }
    if (!["codex_cli", "claude_cli"].includes(report.executionKind)) reject("injected_execution_is_not_a_model_benchmark");
    if (report.liveRequested !== true) reject("experiment_not_live");
    if (report.timingIntegrity !== undefined && report.timingIntegrity?.status !== "passed") reject("timing_clock_discontinuity");
    if (report.sourceIntegrity !== undefined && report.sourceIntegrity?.status !== "passed") reject("source_integrity_not_verified");
  }
  if (baselineReport.executionKind !== candidateReport.executionKind) reject("coding_cli_engine_mismatch");
  const baseline = baselineReport.trials.filter((r) => r.strategy === baselineId);
  const candidate = candidateReport.trials.filter((r) => r.strategy === candidateId);
  result.baseline = metrics(baseline); result.candidate = metrics(candidate);
  if (!baseline.length || !candidate.length) reject("selected_profile_has_no_trials");
  if (baselineReport.suite !== candidateReport.suite || baselineReport.suiteSplit !== candidateReport.suiteSplit)
    reject("suite_or_split_mismatch");
  if ((baselineReport.taskPromptVersion ?? 1) !== (candidateReport.taskPromptVersion ?? 1)) reject("task_prompt_version_mismatch");
  if (canonical(baselineReport.controls) !== canonical(candidateReport.controls)) reject("execution_controls_mismatch");
  if (!baselineReport.executionProfile || !candidateReport.executionProfile) reject("missing_environment_snapshot");
  else if (canonical(baselineReport.executionProfile) !== canonical(candidateReport.executionProfile)) reject("recorded_environment_mismatch");
  if (!baselineReport.evaluatorProfile || !candidateReport.evaluatorProfile ||
      canonical(baselineReport.evaluatorProfile) !== canonical(candidateReport.evaluatorProfile)) reject("evaluator_profile_mismatch");
  const requiredSources = [
    "benchmarks/sprintdesk-v1/PROMPT.md", "benchmarks/sprintdesk-v1/acceptance.mjs",
    "platform/scripts/zero-lab-evaluate.mjs", "platform/scripts/zero-codex-cli.mjs",
    "platform/scripts/zero-lab-config.mjs", "platform/scripts/zero-lab-run.mjs",
    "platform/scripts/zero-lab-acceptance.mjs", "platform/scripts/zero-lab-browser.mjs",
    "platform/packages/testkit/fixtures/zero-lab-ui/browser-grader.cjs",
  ];
  if (baselineReport.executionKind === "claude_cli" || candidateReport.executionKind === "claude_cli")
    requiredSources.push("platform/scripts/zero-claude-cli.mjs");
  if (baselineReport.taskPromptVersion === 2 || candidateReport.taskPromptVersion === 2)
    requiredSources.push("benchmarks/sprintdesk-v1/PROMPT.v2.md");
  if ([baselineReport, candidateReport].some(r => r.profiles.some(p => p.reusePlanDigest !== undefined)))
    requiredSources.push("platform/scripts/zero-lab-reuse.mjs", "platform/scripts/zero-lab-jev.mjs");
  if ([baselineReport, candidateReport].some(r => r.profiles.some(p => (p.id?.startsWith("zero-lean-") || p.id?.startsWith("zero-jev-http-lean-"))))) requiredSources.push("platform/scripts/zero-lab-strategies.mjs");
  // Optional browser grading must have the same implementation on both sides too.
  for (const key of new Set([...Object.keys(baselineReport.sourceDigests ?? {}), ...Object.keys(candidateReport.sourceDigests ?? {})]))
    if (["zero-lab-browser", "zero-lab-context", "zero-lab-cohort", "zero-lab-compare", "zero-lab-reuse", "zero-lab-jev", "zero-lab-strategies"].some(name => key.includes(name)) && !requiredSources.includes(key)) requiredSources.push(key);
  for (const source of requiredSources) {
    const a = baselineReport.sourceDigests?.[source], b = candidateReport.sourceDigests?.[source];
    if (!digest(a) || !digest(b) || a !== b) reject("task_grader_or_cli_source_mismatch");
  }
  const aProfile = baselineReport.profiles.find((p) => p.id === baselineId);
  const bProfile = candidateReport.profiles.find((p) => p.id === candidateId);
  if (!aProfile || !bProfile || aProfile.modelMode !== "fixed" || bProfile.modelMode !== "fixed" ||
      aProfile.codingModel !== bProfile.codingModel || (aProfile.reasoning !== bProfile.reasoning && !isDeclaredEffortComparison(aProfile, bProfile)) || aProfile.auth !== bProfile.auth)
    reject("fixed_model_or_reasoning_or_auth_mismatch");
  if ((bProfile?.id?.startsWith("zero-lean-") || bProfile?.id?.startsWith("zero-jev-http-lean-")) && !isDeclaredEffortComparison(aProfile, bProfile)) reject("declared_configuration_mismatch");
  if (isDeclaredEffortComparison(aProfile, bProfile)) {
    result.comparisonScope = "configured_system_including_effort";
    result.limitations.push("This declared configuration changes the system prompt, tools and optionally effort; it does not isolate repository reuse or Jev");
  }
  const identity = (r) => `${r.caseId}:${r.trial}`;
  if (baseline.length !== candidate.length || new Set(baseline.map(identity)).size !== baseline.length ||
      new Set(candidate.map(identity)).size !== candidate.length) reject("trial_pairing_mismatch");
  for (const a of baseline) {
    const b = candidate.find((r) => identity(r) === identity(a));
    if (!b || !digest(a.taskDigest) || a.taskDigest !== b.taskDigest) reject("user_task_mismatch");
    const uiA = a.evaluation?.ui, uiB = b?.evaluation?.ui;
    if (uiA?.browserVersion && uiB?.browserVersion &&
        (uiA.browserVersion !== uiB.browserVersion || uiA.browserAssets?.digest !== uiB.browserAssets?.digest ||
         uiA.browserAssets?.playwrightVersion !== uiB.browserAssets?.playwrightVersion)) reject("browser_runtime_assets_mismatch");
  }
  for (const [rows, profile] of [[baseline, aProfile], [candidate, bProfile]]) {
    for (const row of rows) {
      for (const field of ["latencyMs", "inputTokens", "outputTokens", "totalTokens"])
        if (row[field] !== null && row[field] !== undefined && !count(row[field])) reject("invalid_numeric_measurement");
      for (const value of [row.timings?.codingMs, row.timings?.gradingMs, row.generation?.elapsedMs, row.evaluation?.elapsedMs])
        if (value !== null && value !== undefined && !count(value)) reject("invalid_numeric_measurement");
      if (row.costUsd !== null && row.costUsd !== undefined && !measured(row.costUsd)) reject("invalid_numeric_measurement");
      if (count(row.inputTokens) && count(row.outputTokens) && count(row.totalTokens) &&
          (!Number.isSafeInteger(row.inputTokens + row.outputTokens) || row.totalTokens !== row.inputTokens + row.outputTokens)) reject("invalid_token_accounting");
      if (row.phase !== "finished" || !row.generation || row.generation.status !== "completed") reject("missing_completed_generation");
      else if (row.generation.requestedModel !== profile?.codingModel || row.generation.requestedReasoning !== profile?.reasoning)
        reject("recorded_generation_model_mismatch");
      if (row.generation?.actualModel && row.generation.actualModel !== profile?.codingModel) reject("attested_model_mismatch");
      if (profile?.systemPromptDigest !== undefined && (row.generation?.systemPromptDigest !== profile.systemPromptDigest || row.generation?.systemPromptMode !== profile.systemPromptMode)) reject("recorded_system_prompt_mismatch");
      if (profile?.tools !== undefined && row.generation?.enabledTools !== profile.tools) reject("recorded_tool_profile_mismatch");
      if (profile?.reusePlanDigest !== undefined && (!digest(profile.reusePlanDigest) || row.reusePlanDigest !== profile.reusePlanDigest)) reject("reuse_preparation_mismatch");
      if (row.outcome === "passed" && (row.qualityComplete !== true || row.evaluation?.automatedContractComplete !== true ||
          row.evaluation?.status !== "passed" ||
          row.evaluation?.cleanup !== "passed" || row.evaluation?.functionalStatus !== "passed" ||
          row.evaluation?.api?.status !== "passed" || row.evaluation?.persistence?.status !== "passed" ||
          row.evaluation?.ui?.status !== "passed" || row.evaluation?.ui?.automatedContractComplete !== true ||
          !digest(row.evaluation?.ui?.browserAssets?.digest) ||
          typeof row.evaluation?.ui?.browserAssets?.playwrightVersion !== "string" ||
          !/^\d+\.\d+\.\d+$/.test(row.evaluation?.ui?.browserAssets?.playwrightVersion ?? "") ||
          typeof row.evaluation?.ui?.browserVersion !== "string" ||
          !/^\d+(?:\.\d+){1,3}$/.test(row.evaluation?.ui?.browserVersion ?? "")))
        reject("unsubstantiated_pass");
    }
  }
  result.reasons = [...new Set(result.reasons)];
  if (result.reasons.length) return result;
  result.status = "comparable";
  const qualityComplete = result.baseline.incomplete === 0 && result.candidate.incomplete === 0;
  result.quality = {
    ...result.quality, status: qualityComplete ? "measured" : "incomplete",
    baselineAccepted: result.baseline.accepted, candidateAccepted: result.candidate.accepted,
    pairedTrials: baseline.length,
  };
  result.deltas = {
    acceptedLatencyMedianMs: difference(result.baseline.acceptedLatencyMedianMs, result.candidate.acceptedLatencyMedianMs),
    acceptedCodingMedianMs: difference(result.baseline.acceptedCodingMedianMs, result.candidate.acceptedCodingMedianMs),
    acceptedGradingMedianMs: difference(result.baseline.acceptedGradingMedianMs, result.candidate.acceptedGradingMedianMs),
    inputTokens: difference(result.baseline.allAttemptInputTokens, result.candidate.allAttemptInputTokens),
    outputTokens: difference(result.baseline.allAttemptOutputTokens, result.candidate.allAttemptOutputTokens),
    totalTokens: difference(result.baseline.allAttemptTotalTokens, result.candidate.allAttemptTotalTokens),
    costUsd: difference(result.baseline.allAttemptCostUsd, result.candidate.allAttemptCostUsd),
  };
  if (!qualityComplete) result.observations.push("quality_incomplete_no_speed_or_cost_victory");
  else {
    if (result.candidate.accepted < result.baseline.accepted) result.observations.push("candidate_acceptance_regressed");
    if (result.candidate.accepted > result.baseline.accepted) result.observations.push("candidate_acceptance_improved_for_these_trials");
    if (result.candidate.accepted === baseline.length && result.baseline.accepted === baseline.length) {
      if (result.deltas.acceptedLatencyMedianMs.delta < 0) result.observations.push("candidate_faster_at_matched_automated_acceptance");
      if (result.deltas.totalTokens.delta !== null && result.deltas.totalTokens.delta < 0) result.observations.push("candidate_used_fewer_reported_cli_tokens");
    }
  }
  if (result.deltas.costUsd.delta === null) result.observations.push("actual_cost_comparison_unavailable");
  result.evidenceLevel = baseline.length === 1 ? "single_task_exploratory" : "repeated_trials_not_a_global_claim";
  return result;
}

export async function readLabReport(filename) {
  if (typeof filename !== "string" || !path.isAbsolute(filename)) throw new Error("Report path must be absolute.");
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 2_097_152) throw new Error("Report is not a bounded regular file.");
    const buffer = Buffer.alloc(info.size + 1); let length = 0;
    while (length < buffer.length) {
      const part = await file.read(buffer, length, buffer.length - length, length);
      if (!part.bytesRead) break;
      length += part.bytesRead;
    }
    if (length !== info.size) throw new Error("Report changed while reading.");
    return JSON.parse(buffer.subarray(0, length).toString("utf8"));
  } finally { await file.close(); }
}

async function main() {
  const { values } = parseArgs({ options: {
    report: { type: "string" }, "candidate-report": { type: "string" },
    baseline: { type: "string", default: "codex-fixed-v1" }, candidate: { type: "string", default: "zero-retrieval-v1" },
  } });
  const a = await readLabReport(values.report);
  const b = values["candidate-report"] ? await readLabReport(values["candidate-report"]) : a;
  const result = compareLabExperiments(a, b, { baselineProfile: values.baseline, candidateProfile: values.candidate });
  const output = new URL(`../../.artifacts/zero-lab/comparisons/${Date.now()}-${randomBytes(6).toString("hex")}.json`, import.meta.url);
  await mkdir(new URL("./", output), { recursive: true, mode: 0o700 });
  await writeFile(fileURLToPath(output) + ".tmp", `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  await rename(fileURLToPath(output) + ".tmp", fileURLToPath(output));
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "comparable") process.exitCode = 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(() => { console.error("Cannot compare the selected bounded report files."); process.exitCode = 1; });
