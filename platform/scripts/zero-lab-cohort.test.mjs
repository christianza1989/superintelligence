import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runLabCohort, summarizeLabCohort } from "./zero-lab-cohort.mjs";

const ids = ["claude-fixed-v1", "zero-retrieval-claude-v1"], pin = "a".repeat(64);
const commonSources = ["benchmarks/sprintdesk-v1/PROMPT.md", "benchmarks/sprintdesk-v1/PROMPT.v2.md", "benchmarks/sprintdesk-v1/acceptance.mjs",
  "platform/scripts/zero-lab-evaluate.mjs", "platform/scripts/zero-codex-cli.mjs", "platform/scripts/zero-claude-cli.mjs",
  "platform/scripts/zero-lab-run.mjs", "platform/scripts/zero-lab-config.mjs", "platform/scripts/zero-lab-acceptance.mjs",
  "platform/scripts/zero-lab-browser.mjs", "platform/packages/testkit/fixtures/zero-lab-ui/browser-grader.cjs"];
function fixture(index = 0, frozenSources) {
  const order = index % 2 ? [...ids].reverse() : [...ids];
  return {
    version: 1, kind: "zero-lab-local-cli-experiment", runId: "controlled-synthetic-" + index,
    executionKind: "claude_cli", liveRequested: true, taskPromptVersion: 2,
    status: "passed", suite: "sprintdesk-v1", suiteSplit: "calibration",
    controls: { trials: 1, timeoutMs: 900000, maxToolCalls: 60 },
    executionProfile: { platform: "linux", arch: "x64", nodeVersion: "v24.19.0", cliVersion: "2.1.292" },
    evaluatorProfile: { id: "controlled-synthetic-contract" },
    sourceDigests: frozenSources ?? Object.fromEntries(commonSources.map(name => [name, pin])),
    profileDigests: Object.fromEntries(ids.map(id => [id, pin])),
    profiles: order.map(id => ({ id, modelMode: "fixed", codingModel: "claude-sonnet-5-5", reasoning: "high", auth: "claude-cli-subscription" })),
    cliInvocationAttempts: 2, modelDispatchAttempts: 0,
    trials: order.map(id => {
      const baseline = id === ids[0];
      return {
        strategy: id, caseId: "sprintdesk-v1", trial: 1, phase: "finished", taskDigest: pin,
        promptDigest: (baseline ? "b" : "c").repeat(64), outcome: "passed", qualityComplete: true,
        latencyMs: baseline ? 300 + index : 250 + index, timings: { codingMs: baseline ? 200 : 180, gradingMs: baseline ? 100 : 70 },
        inputTokens: baseline ? 1000 : 900, outputTokens: 100, totalTokens: baseline ? 1100 : 1000, costUsd: null,
        generation: { status: "completed", requestedModel: "claude-sonnet-5-5", requestedReasoning: "high", actualModel: "claude-sonnet-5-5" },
        evaluation: { status: "passed", functionalStatus: "passed", automatedContractComplete: true, cleanup: "passed",
          api: { status: "passed" }, persistence: { status: "passed" },
          ui: { status: "passed", automatedContractComplete: true, browserVersion: "154.0.8037.57", browserAssets: { digest: pin, playwrightVersion: "1.63.0" } } },
      };
    }),
  };
}
async function temporary(t) {
  const artifactRoot = await mkdtemp(path.join(tmpdir(), "zero-cohort-test-"));
  t.after(() => rm(artifactRoot, { recursive: true, force: true })); return artifactRoot;
}

function jevFixture(index, preparationMs = 100, candidate = "zero-jev-reuse-claude-v1") {
  const report = fixture(index);
  for (const profile of report.profiles) if (profile.id === ids[1]) {
    profile.id = candidate; profile.tools = "Bash,Read,Write,Edit"; profile.reusePlanDigest = pin;
  }
  report.profileDigests[candidate] = report.profileDigests[ids[1]]; delete report.profileDigests[ids[1]];
  for (const row of report.trials) {
    row.generation.apiEquivalentCostEstimateUsd = row.strategy === ids[0] ? 1 : 0.4;
    if (row.strategy === ids[1]) {
      row.strategy = candidate; row.latencyMs = 100; row.reusePlanDigest = pin;
      row.generation.enabledTools = "Bash,Read,Write,Edit";
    }
  }
  report.sourceDigests["platform/scripts/zero-lab-jev.mjs"] = pin;
  report.sourceDigests["platform/scripts/zero-lab-reuse.mjs"] = pin;
  report.reusePreparation = { digest: pin, elapsedMs: preparationMs, api: { status: "answered", modelDispatchAttempts: 1, actualCostUsd: 0.01 } };
  return report;
}
test("Jev's 50 percent target charges the frozen preparation once and keeps subscription savings unknown", () => {
  const reports = [jevFixture(0), jevFixture(1), jevFixture(2)];
  const result = summarizeLabCohort(reports, { mode: "jev" });
  assert.equal(result.status, "comparable"); assert.equal(result.measurements.allAttemptWorkflowMs.candidate, 400);
  assert.equal(result.target50Percent.workflowTimeReductionReached, true);
  assert.equal(result.target50Percent.estimatedApiEquivalentReductionReached, true);
  assert.equal(result.target50Percent.actualSubscriptionCostReductionReached, null);
  const expensive = summarizeLabCohort([jevFixture(0, 800), jevFixture(1, 800), jevFixture(2, 800)], { mode: "jev" });
  assert.equal(expensive.target50Percent.workflowTimeReductionReached, false);
  const http = summarizeLabCohort([0,1,2].map(i => jevFixture(i, 100, "zero-jev-http-claude-v1")), { mode: "jev-http" });
  assert.equal(http.status, "comparable"); assert.equal(http.target50Percent.workflowTimeReductionReached, true);
});
test("missing Jev preparation, inconsistent tool receipts or changed plans cannot establish a target result", () => {
  for (const mutate of [r => { r[0].reusePreparation = null; }, r => { r[1].reusePreparation.digest = "d".repeat(64); },
    r => { r[0].trials.find(t => t.strategy === "zero-jev-reuse-claude-v1").generation.enabledTools = "Agent"; }]) {
    const reports = [jevFixture(0), jevFixture(1), jevFixture(2)]; mutate(reports);
    const result = summarizeLabCohort(reports, { mode: "jev" }); assert.equal(result.status, "not_comparable"); assert.equal(result.measurements, null);
    assert.equal(result.target50Percent, undefined);
  }
  const reports = [jevFixture(0), jevFixture(1), jevFixture(2)]; delete reports[0].trials[0].latencyMs;
  const unknown = summarizeLabCohort(reports, { mode: "jev" }); assert.equal(unknown.measurements.allAttemptWorkflowMs.relativeChangePercent, null);
  assert.equal(unknown.target50Percent.workflowTimeReductionReached, null);
});
test("three distinct alternating pairs separate coding from grading and never invent subscription savings", () => {
  const result = summarizeLabCohort([fixture(0), fixture(1), fixture(2)]);
  assert.equal(result.status, "comparable"); assert.equal(result.measurements.codingMedianMs.relativeChangePercent, -10);
  assert.equal(result.measurements.gradingMedianMs.relativeChangePercent, -30);
  assert.equal(result.measurements.allAttemptTotalTokens.baseline, 3300);
  assert.equal(result.usage.actualSubscriptionCostUsd, null); assert.equal(result.winner, "not_assessed");
});
test("a failed pair cannot be silently removed to create an apparent performance victory", () => {
  const reports = [fixture(0), fixture(1), fixture(2)];
  const failed = reports[1].trials.find(t => t.strategy === ids[1]);
  failed.outcome = "quality_failed"; failed.qualityComplete = false; failed.evaluation.status = "failed"; failed.evaluation.ui.status = "failed";
  const result = summarizeLabCohort(reports);
  assert.equal(result.status, "not_comparable"); assert.equal(result.measurements, null);
  assert.equal(result.usage.candidateTokens, 3000); assert.equal(result.pairs.length, 3);
});
test("cohorts reject duplicate receipts, changed prompts, source drift, swapped order and an incomplete plan", () => {
  for (const mutate of [
    r => { r[2].runId = r[0].runId; },
    r => { r[1].trials[0].promptDigest = "d".repeat(64); },
    r => { r[1].sourceDigests[commonSources[0]] = "d".repeat(64); },
    r => { r[1].trials.reverse(); }, r => r.pop(),
  ]) {
    const reports = [fixture(0), fixture(1), fixture(2)]; mutate(reports);
    const result = summarizeLabCohort(reports); assert.equal(result.status, "not_comparable"); assert.equal(result.measurements, null);
  }
});
test("missing timing remains unknown and injected executors cannot create measured superiority", () => {
  const reports = [fixture(0), fixture(1), fixture(2)]; delete reports[0].trials[0].timings.codingMs;
  assert.equal(summarizeLabCohort(reports).measurements.codingMedianMs.delta, null);
  assert.equal(summarizeLabCohort(reports, { testOnly: true }).measurements, null);
});
test("the real default is a frozen three-pair dry run with zero CLI or auth invocations", async t => {
  const { report } = await runLabCohort({ artifactRoot: await temporary(t) });
  assert.equal(report.status, "prepared_not_run"); assert.equal(report.members.length, 3);
  assert.equal(report.maximumCodingSessions, 6); assert.equal(report.cliInvocationAttempts, 0); assert.equal(report.modelDispatchAttempts, 0);
  assert.deepEqual(report.members.map(m => m.profiles), [ids, [...ids].reverse(), ids]);
});
test("a bounded live orchestration passes the frozen sources, quality evaluation and isolated artifact roots to each member", async t => {
  const calls = [], artifactRoot = await temporary(t);
  const { directory, report } = await runLabCohort({ artifactRoot, live: true }, {
    runPair: async options => { const index = calls.length; calls.push(options); return { directory: path.join(options.artifactRoot, "controlled"), report: fixture(index, options.frozenSourceDigests) }; },
  });
  assert.equal(calls.length, 3); assert.ok(calls.every(c => c.engine === "claude" && c.promptVersion === 2 && c.evaluate && c.live));
  assert.equal(new Set(calls.map(c => c.artifactRoot)).size, 3);
  assert.equal(report.cliInvocationAttempts, 6); assert.equal(report.modelDispatchAttempts, 0);
  assert.equal(report.executionKind, "injected_runner_test_not_model_benchmark"); assert.equal(report.summary.measurements, null);
  assert.equal(JSON.parse(await readFile(path.join(directory, "cohort.json"), "utf8")).members.length, 3);
});
test("a shared missing auth prerequisite stops after one blocked member without charging subsequent lanes", async t => {
  let calls = 0;
  const { report } = await runLabCohort({ artifactRoot: await temporary(t), live: true }, {
    runPair: async options => { calls++; const r = fixture(0, options.frozenSourceDigests); r.status = "blocked_before_model_dispatch"; r.cliInvocationAttempts = 0;
      for (const row of r.trials) { row.phase = undefined; row.outcome = "not_run"; row.generation = null; }
      return { directory: options.artifactRoot, report: r }; },
  });
  assert.equal(calls, 1); assert.equal(report.cliInvocationAttempts, 0); assert.equal(report.status, "stopped_shared_prerequisite");
});
test("source mutation stops the next pair and invalidates the cohort even if an earlier receipt passed", async t => {
  let plans = 0, calls = 0; const original = { config: { controls: { trials: 1, timeoutMs: 900000 } }, sourceDigests: Object.fromEntries(commonSources.map(p => [p, pin])) };
  const { report } = await runLabCohort({ artifactRoot: await temporary(t), live: true }, {
    getPlan: async () => { plans++; return plans < 3 ? original : { ...original, sourceDigests: { changed: pin } }; },
    runPair: async options => { calls++; return { directory: options.artifactRoot, report: fixture(0, options.frozenSourceDigests) }; },
  });
  assert.equal(calls, 1); assert.equal(report.status, "stopped_source_changed"); assert.equal(report.summary.measurements, null);
});
test("cancellation between pairs preserves the first receipt and starts no further member", async t => {
  const controller = new AbortController(); let calls = 0;
  const { report } = await runLabCohort({ artifactRoot: await temporary(t), live: true, signal: controller.signal }, {
    runPair: async options => { calls++; controller.abort(); return { directory: options.artifactRoot, report: fixture(0, options.frozenSourceDigests) }; },
  });
  assert.equal(calls, 1); assert.equal(report.status, "cancelled"); assert.equal(report.members.length, 1);
});
test("invalid or unlimited requests are rejected and raw child errors never become public diagnostics", async t => {
  for (const options of [{ pairs: 0 }, { pairs: 4 }, { pairs: "3" }, { mode: "auto" }, { live: "yes" }])
    await assert.rejects(runLabCohort(options));
  const { report } = await runLabCohort({ artifactRoot: await temporary(t), live: true }, { runPair: async () => { throw new Error("private account diagnostic"); } });
  assert.equal(report.status, "harness_error"); assert.ok(!JSON.stringify(report).includes("private account diagnostic"));
});
test("malformed imported receipts fail closed and prototype mode names cannot select a profile", () => {
  for (const report of [null, {}, { trials: {} }, { trials: [null] }, { trials: [1] }]) {
    const result = summarizeLabCohort([report], { expectedPairs: 1 });
    assert.equal(result.status, "not_comparable"); assert.equal(result.measurements, null);
  }
  assert.throws(() => summarizeLabCohort([], { mode: "constructor" }));
});
test("injected wrappers or unknown child accounting never imply zero real model calls", async t => {
  const { report } = await runLabCohort({ artifactRoot: await temporary(t), live: true, pairs: 1 }, {
    runPair: async options => { const report = fixture(0, options.frozenSourceDigests); report.modelDispatchAttempts = null;
      return { directory: options.artifactRoot, report }; },
  });
  assert.equal(report.modelDispatchAttempts, null); assert.equal(report.summary.measurements, null);
});
