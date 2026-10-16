import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { compareLabExperiments, readLabReport } from "./zero-lab-compare.mjs";

const a = "codex-fixed-v1", b = "zero-retrieval-v1", pin = "a".repeat(64);
function fixture() {
  const profile = (id) => ({ id, modelMode: "fixed", codingModel: "gpt-6.1-sol", reasoning: "xhigh", auth: "codex-cli-oauth" });
  const row = (id, latencyMs, inputTokens) => ({
    strategy: id, caseId: "sprintdesk-v1", trial: 1, taskDigest: pin, phase: "finished",
    outcome: "passed", qualityComplete: true, latencyMs, inputTokens, outputTokens: 100, totalTokens: inputTokens + 100,
    costUsd: null, costSources: [], generation: { status: "completed", requestedModel: "gpt-6.1-sol", requestedReasoning: "xhigh", actualModel: null },
    evaluation: { status: "passed", cleanup: "passed", functionalStatus: "passed", automatedContractComplete: true,
      api: { status: "passed" }, persistence: { status: "passed" }, ui: { status: "passed", automatedContractComplete: true,
        browserVersion: "154.0.8037.57", browserAssets: { digest: pin, playwrightVersion: "1.63.0" } } },
  });
  return {
    version: 1, kind: "zero-lab-local-cli-experiment", executionKind: "codex_cli", liveRequested: true,
    suite: "sprintdesk-v1", suiteSplit: "calibration", controls: { trials: 1, timeoutMs: 900000, maxToolCalls: 60 },
    executionProfile: { platform: "linux", arch: "x64", nodeVersion: "24.19.0", cliVersion: "0.159.2" },
    evaluatorProfile: { id: "fixture-automated-contract", image: "fixture-digest", uiImplemented: true },
    profiles: [profile(a), profile(b)],
    sourceDigests: Object.fromEntries(["benchmarks/sprintdesk-v1/PROMPT.md", "benchmarks/sprintdesk-v1/acceptance.mjs", "platform/scripts/zero-lab-evaluate.mjs", "platform/scripts/zero-codex-cli.mjs", "platform/scripts/zero-lab-run.mjs", "platform/scripts/zero-lab-config.mjs", "platform/scripts/zero-lab-acceptance.mjs", "platform/scripts/zero-lab-browser.mjs", "platform/packages/testkit/fixtures/zero-lab-ui/browser-grader.cjs"].map((key) => [key, pin])),
    trials: [row(a, 1000, 1000), row(b, 800, 900)],
  };
}

test("reports a directional single-task result without declaring an overall winner or a free OAuth price", () => {
  const report = fixture(), result = compareLabExperiments(report, report);
  assert.equal(result.status, "comparable"); assert.equal(result.evidenceLevel, "single_task_exploratory");
  assert.equal(result.deltas.acceptedLatencyMedianMs.delta, -200);
  assert.equal(result.deltas.totalTokens.delta, -100); assert.equal(result.deltas.costUsd.delta, null);
  assert.ok(result.observations.includes("candidate_faster_at_matched_automated_acceptance"));
  assert.equal(result.winner, "not_assessed"); assert.equal(result.automaticPromotion, false);
});
test("coding and grading time stay separate, missing values remain unknown and failed integrity blocks comparison", () => {
  const report = fixture();
  report.trials[0].timings = { codingMs: 600, gradingMs: 400 };
  report.trials[1].timings = { codingMs: 500, gradingMs: 300 };
  const measured = compareLabExperiments(report, report);
  assert.equal(measured.deltas.acceptedCodingMedianMs.delta, -100);
  assert.equal(measured.deltas.acceptedGradingMedianMs.delta, -100);
  delete report.trials[1].timings.gradingMs;
  assert.equal(compareLabExperiments(report, report).deltas.acceptedGradingMedianMs.delta, null);
  report.trials[1].timings.codingMs = -1;
  assert.equal(compareLabExperiments(report, report).status, "not_comparable");
  report.trials[1].timings.codingMs = 500;
  report.sourceIntegrity = { status: "source_changed" };
  assert.ok(compareLabExperiments(report, report).reasons.includes("source_integrity_not_verified"));
});

test("compares matching Claude subscription pairs and rejects missing bridges or mixed CLI engines", () => {
  const report = fixture(); report.executionKind = "claude_cli";
  report.sourceDigests["platform/scripts/zero-claude-cli.mjs"] = pin;
  for (const profile of report.profiles) Object.assign(profile, { codingModel: "claude-sonnet-5-5", reasoning: "high", auth: "claude-cli-subscription" });
  for (const trial of report.trials) Object.assign(trial.generation, { requestedModel: "claude-sonnet-5-5", requestedReasoning: "high", actualModel: "claude-sonnet-5-5" });
  assert.equal(compareLabExperiments(report, report).status, "comparable");
  assert.ok(compareLabExperiments(report, fixture()).reasons.includes("coding_cli_engine_mismatch"));
  delete report.sourceDigests["platform/scripts/zero-claude-cli.mjs"];
  assert.ok(compareLabExperiments(report, report).reasons.includes("task_grader_or_cli_source_mismatch"));
});

test("keeps prompt versions separate and requires the exact v2 prompt source", () => {
  const original = fixture(), next = fixture(); next.taskPromptVersion = 2;
  next.sourceDigests["benchmarks/sprintdesk-v1/PROMPT.v2.md"] = pin;
  assert.equal(compareLabExperiments(next, next).status, "comparable");
  assert.ok(compareLabExperiments(original, next).reasons.includes("task_prompt_version_mismatch"));
  delete next.sourceDigests["benchmarks/sprintdesk-v1/PROMPT.v2.md"];
  assert.ok(compareLabExperiments(next, next).reasons.includes("task_grader_or_cli_source_mismatch"));
});
test("rejects dry-run and injected reports as evidence of real model superiority", () => {
  for (const change of [{ liveRequested: false }, { executionKind: "injected_executor_test_not_model_benchmark" }]) {
    const report = { ...fixture(), ...change }, result = compareLabExperiments(report, report);
    assert.equal(result.status, "not_comparable"); assert.equal(result.deltas, null);
    assert.deepEqual(result.observations, []);
  }
});
test("blocks mismatched task, grading source, runtime controls, model, environment and evaluator image", () => {
  const mutations = [
    [r => { r.trials[1].taskDigest = "b".repeat(64); }, "user_task_mismatch"],
    [r => { r.sourceDigests["platform/scripts/zero-lab-evaluate.mjs"] = "b".repeat(64); }, "task_grader_or_cli_source_mismatch"],
    [r => { r.controls.timeoutMs = 1000; }, "execution_controls_mismatch"],
    [r => { r.profiles[1].reasoning = "low"; }, "fixed_model_or_reasoning_or_auth_mismatch"],
    [r => { r.executionProfile.cliVersion = "other"; }, "recorded_environment_mismatch"],
    [r => { r.evaluatorProfile.image = "changed"; }, "evaluator_profile_mismatch"],
    [r => { r.trials[1].evaluation.ui.browserAssets.digest = "b".repeat(64); }, "browser_runtime_assets_mismatch"],
  ];
  for (const [mutate, reason] of mutations) {
    const baseline = fixture(), candidate = fixture(); mutate(candidate);
    assert.ok(compareLabExperiments(baseline, candidate).reasons.includes(reason));
  }
});
test("a fast failure cannot earn a speed win against a correctly completed task", () => {
  const report = fixture(); report.trials[1].outcome = "functional_failed";
  report.trials[1].qualityComplete = false; report.trials[1].latencyMs = 1;
  report.trials[1].evaluation.functionalStatus = "failed";
  const result = compareLabExperiments(report, report);
  assert.equal(result.quality.status, "measured"); assert.equal(result.candidate.failures, 1);
  assert.equal(result.candidate.acceptedLatencyMedianMs, null);
  assert.ok(result.observations.includes("candidate_acceptance_regressed"));
  assert.ok(!result.observations.includes("candidate_faster_at_matched_automated_acceptance"));
});
test("partial UI, unsupported, cancellation and harness failures do not become a zero quality score or a victory", () => {
  for (const outcome of ["quality_incomplete", "unsupported", "cancelled", "harness_error"]) {
    const report = fixture(); report.trials[1].outcome = outcome; report.trials[1].qualityComplete = false;
    const result = compareLabExperiments(report, report);
    assert.equal(result.quality.status, "incomplete"); assert.equal(result.candidate.incomplete, 1);
    assert.ok(result.observations.includes("quality_incomplete_no_speed_or_cost_victory"));
    assert.equal(result.winner, "not_assessed");
  }
});
test("unexplained numeric zero and pricing estimates do not become actual cost receipts", () => {
  const report = fixture(); for (const row of report.trials) row.costUsd = 0;
  assert.equal(compareLabExperiments(report, report).deltas.costUsd.delta, null);
  for (const row of report.trials) row.costSources = ["estimate"];
  assert.equal(compareLabExperiments(report, report).deltas.costUsd.delta, null);
  for (const row of report.trials) row.costSources = ["provider-reported"];
  assert.equal(compareLabExperiments(report, report).deltas.costUsd.delta, 0);
});
test("missing tokens stay unknown and invalid or double-counted measurements are rejected", () => {
  const report = fixture(); report.trials[1].totalTokens = null;
  assert.equal(compareLabExperiments(report, report).deltas.totalTokens.delta, null);
  for (const value of [-1, "1000", Infinity]) {
    const bad = fixture(); bad.trials[1].inputTokens = value;
    assert.ok(compareLabExperiments(bad, bad).reasons.includes("invalid_numeric_measurement"));
  }
  const bad = fixture(); bad.trials[1].totalTokens += 20;
  assert.ok(compareLabExperiments(bad, bad).reasons.includes("invalid_token_accounting"));
});
test("requires paired, distinct, completed trials and substantiated passes", () => {
  const mutations = [
    r => r.trials.push({ ...r.trials[0] }),
    r => { r.trials[1].generation.status = "failed"; },
    r => { r.trials[1].evaluation.cleanup = "failed"; },
    r => { r.trials[1].evaluation.ui.status = "not_run"; },
    r => { r.trials[1].evaluation.status = "partial"; },
    r => { r.trials[1].evaluation.ui.browserAssets = {}; },
    r => { r.trials[1].generation.actualModel = "another-model"; },
  ];
  for (const mutate of mutations) {
    const report = fixture(); mutate(report);
    assert.equal(compareLabExperiments(report, report).status, "not_comparable");
  }
});
test("invalid row/profile structures return a blocked contract instead of coercing identities", () => {
  for (const value of [null, [], { ...fixture(), trials: [null] }, { ...fixture(), profiles: [null] }])
    assert.equal(compareLabExperiments(value, value).status, "not_comparable");
});
test("reads only bounded regular report files and never follows a credential symlink", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "zero-lab-compare-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "report.json"); await writeFile(file, JSON.stringify(fixture()));
  assert.equal((await readLabReport(file)).suite, "sprintdesk-v1");
  const link = path.join(directory, "link.json"); await symlink(file, link);
  await assert.rejects(readLabReport(link)); await assert.rejects(readLabReport("relative.json"));
  await writeFile(file, " ".repeat(2_097_153)); await assert.rejects(readLabReport(file));
});
