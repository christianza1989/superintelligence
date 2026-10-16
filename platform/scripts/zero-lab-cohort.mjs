/** Bounded, alternating Claude calibration pairs. No automatic promotion or model calls by default. */
import { randomBytes } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { buildLabPlan } from "./zero-lab-config.mjs";
import { compareLabExperiments } from "./zero-lab-compare.mjs";
import { runLabExperiment } from "./zero-lab-run.mjs";

const modes = {
  repeat: ["claude-fixed-v1", "zero-retrieval-claude-v1"],
  compact: ["zero-retrieval-claude-v1", "zero-compact-claude-v1"],
  jev: ["claude-fixed-v1", "zero-jev-reuse-claude-v1"],
  "jev-http": ["claude-fixed-v1", "zero-jev-http-claude-v1"],
};
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const count = value => Number.isSafeInteger(value) && value >= 0;
const median = values => {
  if (!values.length || !values.every(count)) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
};
const total = (rows, field) => {
  if (!rows.length || !rows.every(row => count(row[field]))) return null;
  const value = rows.reduce((n, row) => n + row[field], 0);
  return count(value) ? value : null;
};
const timing = (row, phase) => row?.timings?.[phase + "Ms"] ?? (phase === "coding" ? row?.generation?.elapsedMs : row?.evaluation?.elapsedMs);
const delta = (a, b) => a !== null && b !== null
  ? { baseline: a, candidate: b, delta: b - a, relativeChangePercent: a > 0 && Number.isFinite(100 * (b - a) / a) ? 100 * (b - a) / a : null }
  : { baseline: a ?? null, candidate: b ?? null, delta: null, relativeChangePercent: null };

/** All planned pairs must remain visible; failed/incomplete cohorts do not earn a speed victory. */
export function summarizeLabCohort(reports, { mode = "repeat", expectedPairs = 3, testOnly = false } = {}) {
  if (!Object.hasOwn(modes, mode) || !Number.isSafeInteger(expectedPairs) || expectedPairs < 1 || expectedPairs > 3 || !Array.isArray(reports) || reports.length > expectedPairs)
    throw new Error("Invalid bounded cohort contract.");
  const ids = modes[mode];
  const result = {
    status: "not_comparable", reasons: [], plannedPairs: expectedPairs, recordedPairs: reports.length,
    baselineProfile: ids[0], candidateProfile: ids[1], pairs: [], measurements: null,
    winner: "not_assessed", automaticPromotion: false,
    evidenceLevel: "same_task_calibration_not_general_advantage",
    limitations: ["Order alternates but provider cache and service load remain uncontrolled", "Coding, grading and total trial time are separate measurements",
      "Unknown subscription price remains null", "All failures remain visible; no selective successful-pair speed claim"],
  };
  if (reports.length !== expectedPairs) result.reasons.push("planned_pairs_incomplete");
  if (testOnly) result.reasons.push("injected_runner_is_not_model_evidence");
  if (!reports.length) return result;
  if (reports.some(report => !report || !Array.isArray(report.trials) || report.trials.length > 2 ||
      report.trials.some(row => !row || typeof row !== "object"))) {
    result.reasons.push("invalid_pair_report_contract");
    return result;
  }
  if (reports.some(r => typeof r?.runId !== "string" || !r.runId || r.runId.length > 100) || new Set(reports.map(r => r.runId)).size !== reports.length)
    result.reasons.push("duplicate_or_missing_run_identity");
  const first = reports[0];
  if (mode.startsWith("jev")) result.preparation = first.reusePreparation ?? null;
  const rows = { baseline: [], candidate: [] };
  for (let index = 0; index < reports.length; index++) {
    const report = reports[index];
    const comparison = compareLabExperiments(report, report, { baselineProfile: ids[0], candidateProfile: ids[1] });
    const cross = compareLabExperiments(first, report, { baselineProfile: ids[0], candidateProfile: ids[1] });
    const expectedOrder = index % 2 ? [...ids].reverse() : ids;
    if (canonical(report?.trials?.map(r => r.strategy)) !== canonical(expectedOrder)) result.reasons.push("execution_order_mismatch");
    if (comparison.status !== "comparable" || cross.status !== "comparable") result.reasons.push("pair_contract_or_runtime_incompatible");
    if (canonical(first?.sourceDigests) !== canonical(report?.sourceDigests) || canonical(first?.profileDigests) !== canonical(report?.profileDigests))
      result.reasons.push("source_or_profile_changed_between_pairs");
    for (let lane = 0; lane < ids.length; lane++) {
      const row = report?.trials?.find(r => r.strategy === ids[lane]);
      if (row) rows[lane ? "candidate" : "baseline"].push(row);
      const initial = first?.trials?.find(r => r.strategy === ids[lane]);
      if (row?.promptDigest !== initial?.promptDigest || row?.taskDigest !== initial?.taskDigest) result.reasons.push("prompt_changed_between_pairs");
    }
    result.pairs.push({ number: index + 1, comparisonStatus: comparison.status, reasons: comparison.reasons,
      quality: comparison.quality, deltas: comparison.status === "comparable" && comparison.baseline.accepted === 1 && comparison.candidate.accepted === 1 ? comparison.deltas : null,
      outcomes: ids.map(id => ({ profile: id, outcome: report?.trials?.find(r => r.strategy === id)?.outcome ?? "not_run" })) });
  }
  const all = [...rows.baseline, ...rows.candidate];
  result.usage = { baselineTokens: total(rows.baseline.filter(r => r.phase === "finished"), "totalTokens"),
    candidateTokens: total(rows.candidate.filter(r => r.phase === "finished"), "totalTokens"), actualSubscriptionCostUsd: null };
  const fullPass = all.length === expectedPairs * 2 && all.every(row => row.outcome === "passed" && row.qualityComplete === true);
  if (!fullPass) result.reasons.push("not_all_planned_trials_accepted");
  result.reasons = [...new Set(result.reasons)];
  if (result.reasons.length) return result;
  result.status = "comparable";
  result.measurements = {
    trialMedianMs: delta(median(rows.baseline.map(r => r.latencyMs)), median(rows.candidate.map(r => r.latencyMs))),
    codingMedianMs: delta(median(rows.baseline.map(r => timing(r, "coding"))), median(rows.candidate.map(r => timing(r, "coding")))),
    gradingMedianMs: delta(median(rows.baseline.map(r => timing(r, "grading"))), median(rows.candidate.map(r => timing(r, "grading")))),
    allAttemptTotalTokens: delta(result.usage.baselineTokens, result.usage.candidateTokens),
  };
  if (mode.startsWith("jev")) {
    const preparation = first.reusePreparation;
    if (!preparation || !count(preparation.elapsedMs) || preparation.api?.status !== "answered" ||
        preparation.api.modelDispatchAttempts !== 1 || reports.some(r => r.reusePreparation?.digest !== preparation.digest)) {
      result.status = "not_comparable"; result.reasons.push("missing_or_changed_jev_preparation"); result.measurements = null; return result;
    }
    const candidateElapsed = total(rows.candidate, "latencyMs");
    result.measurements.allAttemptWorkflowMs = delta(total(rows.baseline, "latencyMs"), candidateElapsed === null ? null : candidateElapsed + preparation.elapsedMs);
    const estimate = trials => trials.every(r => typeof r.generation?.apiEquivalentCostEstimateUsd === "number" && Number.isFinite(r.generation.apiEquivalentCostEstimateUsd) && r.generation.apiEquivalentCostEstimateUsd >= 0)
      ? trials.reduce((n,r) => n + r.generation.apiEquivalentCostEstimateUsd, 0) : null;
    const baseEstimate = estimate(rows.baseline), candidateEstimate = estimate(rows.candidate), routingCost = preparation.api.actualCostUsd;
    result.measurements.estimatedApiEquivalentCostUsd = delta(baseEstimate,
      candidateEstimate !== null && typeof routingCost === "number" && Number.isFinite(routingCost) && routingCost >= 0 ? candidateEstimate + routingCost : null);
    result.target50Percent = { scope: "same_task_calibration_all_planned_trials_passed", preparationTimeIncluded: true,
      workflowTimeReductionReached: result.measurements.allAttemptWorkflowMs.relativeChangePercent === null ? null : result.measurements.allAttemptWorkflowMs.relativeChangePercent <= -50,
      estimatedApiEquivalentReductionReached: result.measurements.estimatedApiEquivalentCostUsd.relativeChangePercent === null ? null : result.measurements.estimatedApiEquivalentCostUsd.relativeChangePercent <= -50,
      actualSubscriptionCostReductionReached: null };
    result.limitations.push("The 50 percent API-equivalent target uses CLI estimates plus reported Jev cost; actual subscription savings remain unknown",
      "One frozen preparation is charged in full to the candidate cohort, without pretending it ran independently for each pair",
      "The combined source/tool/library profile does not isolate Jev's causal contribution");
  }
  return result;
}

export async function runLabCohort(options = {}, deps = {}) {
  const mode = options.mode ?? "repeat", pairs = options.pairs ?? 3;
  if (!Object.hasOwn(modes, mode) || !Number.isSafeInteger(pairs) || pairs < 1 || pairs > 3 ||
      (options.live !== undefined && typeof options.live !== "boolean")) throw new Error("Choose repeat/compact/jev/jev-http and one to three pairs.");
  const artifactRoot = options.artifactRoot ?? fileURLToPath(new URL("../../.artifacts/zero-lab/cohorts/", import.meta.url));
  if (typeof artifactRoot !== "string" || !path.isAbsolute(artifactRoot)) throw new Error("Cohort artifact root must be absolute.");
  const getPlan = deps.getPlan ?? (() => buildLabPlan({ promptVersion: 2 }));
  const plan = await getPlan();
  if (plan.config.controls.trials !== 1) throw new Error("Each cohort member must contain exactly one pair.");
  const runId = new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomBytes(6).toString("hex");
  const directory = path.join(artifactRoot, runId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const testOnly = Boolean(deps.runPair || deps.getPlan);
  const report = { version: 1, kind: "zero-lab-claude-cohort", runId, mode, status: "prepared_not_run",
    executionKind: testOnly ? "injected_runner_test_not_model_benchmark" : "claude_cli",
    liveRequested: options.live === true, plannedPairs: pairs, maximumCodingSessions: pairs * 2,
    codingTimeoutMs: plan.config.controls.timeoutMs, maximumCohortMs: 7_200_000,
    taskPromptVersion: 2, sourceDigests: plan.sourceDigests, members: [],
    startedAtUtc: new Date().toISOString(), cliInvocationAttempts: 0, modelDispatchAttempts: 0, summary: null };
  const members = [];
  const save = async () => {
    report.summary = summarizeLabCohort(members, { mode, expectedPairs: pairs, testOnly });
    if (["stopped_source_changed", "stopped_shared_prerequisite", "cancelled", "harness_error"].includes(report.status)) {
      report.summary.status = "not_comparable";
      report.summary.measurements = null;
      if (report.summary.target50Percent) report.summary.target50Percent = null;
      report.summary.reasons.push("cohort_interrupted_or_source_unverified");
    }
    await writeFile(path.join(directory, "cohort.json.tmp"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
    await rename(path.join(directory, "cohort.json.tmp"), path.join(directory, "cohort.json"));
  };
  await save();
  const runPair = deps.runPair ?? runLabExperiment;
  const deadline = options.live ? AbortSignal.timeout(report.maximumCohortMs) : null;
  const signal = deadline ? (options.signal ? AbortSignal.any([options.signal, deadline]) : deadline) : options.signal;
  try {
    if (options.live) { report.status = "running"; await save(); }
    for (let index = 0; index < pairs; index++) {
      if (signal?.aborted) { report.status = "cancelled"; break; }
      if (canonical((await getPlan()).sourceDigests) !== canonical(plan.sourceDigests)) { report.status = "stopped_source_changed"; break; }
      const ids = index % 2 ? [...modes[mode]].reverse() : modes[mode];
      if (options.live) { report.cliInvocationAttempts = null; report.modelDispatchAttempts = null; await save(); }
      const value = await runPair({ engine: "claude", promptVersion: 2, profiles: [...ids], live: options.live === true,
        evaluate: true, artifactRoot: path.join(directory, "pair-" + (index + 1)), frozenSourceDigests: plan.sourceDigests, signal, reusePlan: options.reusePlan });
      const child = value.report;
      members.push(child);
      report.members.push({ pair: index + 1, profiles: [...ids], status: child.status,
        report: path.relative(directory, path.join(value.directory, "report.json")), sourceDigests: child.sourceDigests });
      report.cliInvocationAttempts = total(members, "cliInvocationAttempts");
      report.modelDispatchAttempts = total(members, "modelDispatchAttempts");
      await save();
      if (canonical((await getPlan()).sourceDigests) !== canonical(plan.sourceDigests) || canonical(child.sourceDigests) !== canonical(plan.sourceDigests)) {
        report.status = "stopped_source_changed"; break;
      }
      if (signal?.aborted || child.status === "cancelled") { report.status = "cancelled"; break; }
      if (options.live && (child.status.startsWith("blocked") || child.trials.some(row => row.outcome === "harness_error" ||
          ["local_state_unwritable", "auth_required", "subscription_auth_required", "model_unavailable", "sandbox_unavailable", "usage_limit",
            "network_unavailable", "unavailable", "invalid_cli_events", "invocation_unavailable"].includes(row.generation?.reason)))) {
        report.status = "stopped_shared_prerequisite"; break;
      }
    }
    if (report.status === "running" && options.live) report.status = members.length === pairs ? "completed" : "incomplete";
  } catch {
    report.status = signal?.aborted ? "cancelled" : "harness_error";
    report.reason = "cohort_stage_unavailable_without_raw_diagnostics";
    if (options.live) { report.cliInvocationAttempts = null; report.modelDispatchAttempts = null; }
  } finally {
    report.finishedAtUtc = new Date().toISOString();
    await save();
  }
  return { directory, report };
}

async function main() {
  const { values } = parseArgs({ options: { live: { type: "boolean", default: false },
    mode: { type: "string", default: "repeat" }, pairs: { type: "string", default: "3" }, plan: { type: "string" } } });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on("SIGINT", cancel); process.on("SIGTERM", cancel);
  try {
    const { directory, report } = await runLabCohort({ mode: values.mode, pairs: Number(values.pairs), live: values.live, signal: controller.signal, reusePlan: values.plan });
    console.log(JSON.stringify({ status: report.status, artifact: path.relative(fileURLToPath(new URL("../../", import.meta.url)), path.join(directory, "cohort.json")),
      plannedPairs: report.plannedPairs, recordedPairs: report.members.length, cliInvocationAttempts: report.cliInvocationAttempts,
      modelDispatchAttempts: report.modelDispatchAttempts, summary: report.summary }, null, 2));
    if (values.live && (report.status !== "completed" || report.summary.status !== "comparable")) process.exitCode = 1;
  } finally { process.off("SIGINT", cancel); process.off("SIGTERM", cancel); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(() => { console.error("Cannot complete the bounded Claude cohort; no raw auth diagnostics printed."); process.exitCode = 1; });
