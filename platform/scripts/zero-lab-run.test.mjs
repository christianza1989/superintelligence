import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { runLabExperiment } from "./zero-lab-run.mjs";

let artifactRoot;
before(async () => {
  artifactRoot = await mkdtemp(path.join(tmpdir(), "zero-lab-offline-"));
});
after(async () => {
  await rm(artifactRoot, { recursive: true, force: true });
});
const generated = () => ({
  status: "completed",
  reason: null,
  requestedModel: "gpt-6.1-sol",
  requestedReasoning: "xhigh",
  actualModel: null,
  actualCostUsd: null,
  usage: { inputTokens: 120, outputTokens: 10, cachedInputTokens: 20, totalTokens: 130 },
  toolActions: 2,
  toolFailures: 0,
  finalText: "Synthetic test handoff, not a generated application",
});
const ready = async () => ({ ready: true, reason: null });

test("prompt v2 clarifies exact heading names before either lane starts and preserves v1", async () => {
  const original = await runLabExperiment({ artifactRoot, engine: "claude" });
  const next = await runLabExperiment({ artifactRoot, engine: "claude", promptVersion: 2, profiles: ["zero-retrieval-claude-v1", "claude-fixed-v1"] });
  assert.equal(next.report.taskPromptVersion, 2);
  assert.equal(next.report.trials[0].strategy, "zero-retrieval-claude-v1");
  assert.equal(next.report.trials[0].taskDigest, next.report.trials[1].taskDigest);
  assert.notEqual(next.report.trials[0].taskDigest, original.report.trials[0].taskDigest);
  assert.ok(next.report.sourceDigests["benchmarks/sprintdesk-v1/PROMPT.v2.md"]);
  const prompts = await Promise.all(next.report.profiles.map(p => readFile(path.join(next.directory, "inputs", p.id + ".prompt.md"), "utf8")));
  assert.ok(prompts.every(p => p.includes('exactly one accessible heading named `Todo`')));
  assert.equal(prompts[0].split("\n\nUser task:\n")[1], prompts[1].split("\n\nUser task:\n")[1]);
  assert.equal(next.report.modelDispatchAttempts, 0);
  for (const promptVersion of [0, 3, "2", NaN]) await assert.rejects(runLabExperiment({ artifactRoot, promptVersion }));
});

test("Claude pairs freeze the same task and limits while retaining subscription and model identity", async () => {
  const dry = await runLabExperiment({ artifactRoot, engine: "claude" });
  assert.equal(dry.report.executionKind, "claude_cli");
  assert.deepEqual(dry.report.profiles.map(p => p.id), ["claude-fixed-v1", "zero-retrieval-claude-v1"]);
  assert.ok(dry.report.profiles.every(p => p.codingModel === "claude-sonnet-5-5" && p.reasoning === "high" && p.auth === "claude-cli-subscription"));
  assert.equal(dry.report.trials[0].taskDigest, dry.report.trials[1].taskDigest);
  assert.equal(dry.report.cliInvocationAttempts, 0);
  const requests = [];
  const live = await runLabExperiment({ artifactRoot, engine: "claude", live: true }, {
    preflight: ready, invoke: async request => { requests.push(request); const output = generated(); return { ...output, usage: { ...output.usage, cacheCreationInputTokens: 6 } }; },
  });
  assert.equal(live.report.executionKind, "injected_executor_test_not_model_benchmark");
  assert.ok(live.report.trials.every(t => t.cacheWriteTokens === 6));
  assert.equal(requests.length, 2); assert.ok(requests.every(r => r.timeoutMs === 900000 && r.maxObservedToolActions === 60));
  await assert.rejects(runLabExperiment({ artifactRoot, engine: "claude", profiles: ["codex-fixed-v1"] }));
  await assert.rejects(runLabExperiment({ artifactRoot, engine: "unknown" }));
});
test("compact context is a separate opt-in profile while legacy prompt bytes remain unchanged", async () => {
  const legacy = await runLabExperiment({ artifactRoot, engine: "claude", promptVersion: 2 });
  const compact = await runLabExperiment({ artifactRoot, engine: "claude", promptVersion: 2,
    profiles: ["zero-retrieval-claude-v1", "zero-compact-claude-v1"] });
  const [a, b] = compact.report.trials;
  assert.equal(a.promptDigest, legacy.report.trials[1].promptDigest);
  assert.equal(a.taskDigest, b.taskDigest); assert.ok(b.contextBytes < a.contextBytes);
  assert.equal(b.contextMetrics.qualityEvidence, "NOT_RUN");
  assert.equal(b.contextMetrics.inputBytes, a.contextBytes);
  assert.ok(b.contextMetrics.retainedLegacyBytes < a.contextBytes);
  assert.equal(b.generation, null); assert.equal(compact.report.cliInvocationAttempts, 0);
  assert.equal(compact.report.sourceIntegrity.status, "passed");
});
test("a mismatched frozen source map blocks before auth, workspace creation or model calls", async () => {
  let calls = 0;
  const { report } = await runLabExperiment({ artifactRoot, live: true, frozenSourceDigests: {} }, {
    preflight: async () => { calls++; return { ready: true }; }, invoke: async () => { calls++; return generated(); },
  });
  assert.equal(calls, 0); assert.equal(report.status, "blocked_source_changed");
  assert.equal(report.sourceIntegrity.status, "source_changed"); assert.ok(report.trials.every(t => t.workspace === null));
});
test("cancelled coding retains reported usage and shared grader failure prevents the second lane", async () => {
  let calls = 0;
  const cancelled = await runLabExperiment({ artifactRoot, live: true }, {
    preflight: ready, invoke: async () => { calls++; return { ...generated(), status: "cancelled" }; },
  });
  assert.equal(calls, 1); assert.equal(cancelled.report.status, "cancelled");
  assert.equal(cancelled.report.trials[0].totalTokens, 130); assert.equal(cancelled.report.trials[1].outcome, "not_run");
  calls = 0;
  const broken = await runLabExperiment({ artifactRoot, live: true, evaluate: true }, {
    preflight: ready, invoke: async () => { calls++; return generated(); },
    evaluate: async () => { throw new Error("synthetic grader failure"); },
  });
  assert.equal(calls, 1); assert.equal(broken.report.trials[0].outcome, "harness_error");
  assert.ok(Number.isSafeInteger(broken.report.trials[0].timings.codingMs));
  assert.ok(Number.isSafeInteger(broken.report.trials[0].timings.gradingMs));
});
test("shared protocol or network failures cannot spend another lane and injected grading is labelled", async () => {
  for (const reason of ["subscription_auth_required", "network_unavailable", "unavailable", "invalid_cli_events", "invocation_unavailable"]) {
    let calls = 0;
    const { report } = await runLabExperiment({ artifactRoot, engine: "claude", live: true }, {
      preflight: ready, invoke: async () => { calls++; return { status: "failed", reason, usage: null }; },
    });
    assert.equal(calls, 1); assert.equal(report.trials[1].outcome, "not_run");
  }
  // An injected grader is a test even if no coding executor was substituted.
  const { report } = await runLabExperiment({ artifactRoot, engine: "claude" }, { evaluate: async () => ({ status: "passed" }) });
  assert.equal(report.executionKind, "injected_executor_test_not_model_benchmark");
});

test("default dry run freezes equal tasks and never dispatches even with an available executor", async () => {
  let calls = 0;
  const { directory, report } = await runLabExperiment(
    { artifactRoot },
    {
      invoke: async () => {
        calls++;
        return generated();
      },
    },
  );
  assert.equal(calls, 0);
  assert.equal(report.status, "prepared_not_run");
  assert.equal(report.modelDispatchAttempts, 0);
  assert.equal(report.cliInvocationAttempts, 0);
  assert.equal(report.trials.length, 2);
  assert.equal(report.trials[0].taskDigest, report.trials[1].taskDigest);
  assert.notEqual(report.trials[0].promptDigest, report.trials[1].promptDigest);
  const a = await readFile(path.join(directory, "inputs/codex-fixed-v1.prompt.md"), "utf8");
  const b = await readFile(path.join(directory, "inputs/zero-retrieval-v1.prompt.md"), "utf8");
  assert.equal(a.split("\n\nUser task:\n")[1], b.split("\n\nUser task:\n")[1]);
  assert.ok(b.includes("RepositoryZero source context"));
  assert.ok(!a.includes("RepositoryZero source context"));
  assert.ok(report.summary.every((s) => s.costUsd === null && s.winner === "not_assessed"));
  assert.equal((await stat(path.join(directory, "report.json"))).mode & 0o077, 0);
});

test("an unwritable CLI runtime blocks the whole experiment before creating coding sessions", async () => {
  let calls = 0;
  const { report } = await runLabExperiment(
    { artifactRoot, live: true },
    {
      preflight: async () => ({ ready: false, reason: "local_state_unwritable" }),
      invoke: async () => {
        calls++;
        return generated();
      },
    },
  );
  assert.equal(report.status, "blocked_before_model_dispatch");
  assert.equal(calls, 0);
  assert.ok(report.trials.every((t) => t.status === "not-run" && t.workspace === null));
});

test("missing evaluator prerequisites block both coding sessions before any tokens are spent", async () => {
  let calls = 0;
  const { report } = await runLabExperiment({ artifactRoot, live: true, evaluate: true }, {
    preflight: ready, acceptancePreflight: async () => ({ ready: false, reason: "browser_prerequisites_unavailable" }),
    invoke: async () => { calls++; return generated(); },
  });
  assert.equal(calls, 0); assert.equal(report.status, "blocked_before_model_dispatch");
  assert.equal(report.cliInvocationAttempts, 0); assert.equal(report.modelDispatchAttempts, 0);
  assert.equal(report.evaluationPreflight.ready, false);
});

test("two independent lanes receive the same effective controls and persist actual receipts without claiming quality", async () => {
  const calls = [];
  const { directory, report } = await runLabExperiment(
    { artifactRoot, live: true },
    {
      preflight: ready,
      invoke: async (request) => {
        calls.push(request);
        return generated();
      },
    },
  );
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].workspace, calls[1].workspace);
  for (const call of calls) {
    assert.equal(call.timeoutMs, 900_000);
    assert.equal(call.maxObservedToolActions, 60);
    assert.ok(!call.prompt.includes("Synthetic test handoff"));
  }
  assert.equal(report.executionKind, "injected_executor_test_not_model_benchmark");
  assert.equal(report.modelDispatchAttempts, 0);
  assert.equal(report.cliInvocationAttempts, 2);
  assert.equal(report.workflowCostUsd, null);
  assert.ok(
    report.trials.every(
      (t) => t.outcome === "not_evaluated" && t.inputTokens === 120 && t.costUsd === null,
    ),
  );
  const persisted = JSON.parse(await readFile(path.join(directory, "report.json"), "utf8"));
  assert.equal(persisted.trials[1].generation.usage.totalTokens, 130);
  assert.equal(persisted.summary[0].winner, "not_assessed");
});

test("functional success with missing UI is incomplete; an unsupported artifact is kept distinct from a quality failure", async () => {
  let evaluations = 0;
  const { report } = await runLabExperiment(
    { artifactRoot, live: true, evaluate: true },
    {
      preflight: ready,
      invoke: async () => generated(),
      evaluate: async (request) => {
        assert.equal(request.trustProfile, "controlled_local_candidate");
        return ++evaluations === 1
          ? {
              status: "partial",
              functionalStatus: "passed",
              qualityComplete: false,
              ui: { status: "not_run" },
            }
          : { status: "unsupported", functionalStatus: "not_run", qualityComplete: false };
      },
    },
  );
  assert.equal(report.trials[0].outcome, "quality_incomplete");
  assert.equal(report.trials[1].outcome, "unsupported");
  assert.ok(report.summary.every((s) => s.winner === "not_assessed" && !s.qualityComparisonReady));
  assert.ok(!report.summary.some((s) => Object.hasOwn(s, "autonomousSuccessRate")));
});

test("a genuine functional failure cannot be promoted to passing by an incomplete quality report", async () => {
  const { report } = await runLabExperiment(
    { artifactRoot, live: true, evaluate: true, profiles: ["codex-fixed-v1"] },
    {
      preflight: ready,
      invoke: async () => generated(),
      evaluate: async () => ({
        status: "failed",
        functionalStatus: "failed",
        qualityComplete: false,
      }),
    },
  );
  assert.equal(report.trials[0].outcome, "functional_failed");
  assert.notEqual(report.status, "passed");
});

test("shared auth/model failure prevents charging the second lane and preserves unavailable usage", async () => {
  let calls = 0;
  const { report } = await runLabExperiment(
    { artifactRoot, live: true },
    {
      preflight: ready,
      invoke: async () => {
        calls++;
        return { status: "failed", reason: "auth_required", usage: null };
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(report.trials[0].outcome, "generation_failed");
  assert.equal(report.trials[0].inputTokens, null);
  assert.equal(report.trials[1].status, "not-run");
});

test("cancellation before the first trial never invokes an executor", async () => {
  let calls = 0;
  const { report } = await runLabExperiment(
    { artifactRoot, live: true, signal: AbortSignal.abort() },
    {
      preflight: ready,
      invoke: async () => {
        calls++;
        return generated();
      },
    },
  );
  assert.equal(calls, 0);
  assert.equal(report.status, "cancelled");
});

test("unwired Jev/Auto lanes, duplicate profiles and malformed limits cannot silently fall back", async () => {
  for (const options of [
    { profiles: ["zero-jev-v1"] },
    { profiles: ["zero-auto-v1"] },
    { profiles: ["codex-fixed-v1", "codex-fixed-v1"] },
    { profiles: [] },
    { live: "yes" },
  ])
    await assert.rejects(runLabExperiment({ artifactRoot, ...options }));
});

test("cleanup errors and cancelled evaluations remain distinct even if functional checks passed", async () => {
  for (const [evaluation, expected] of [
    [
      {
        status: "error",
        functionalStatus: "passed",
        qualityComplete: true,
        cleanup: "failed_owned_resources_retained_for_operator",
      },
      "harness_error",
    ],
    [
      { status: "cancelled", functionalStatus: "passed", qualityComplete: true, cleanup: "passed" },
      "cancelled",
    ],
  ]) {
    const { report } = await runLabExperiment(
      { artifactRoot, live: true, evaluate: true, profiles: ["codex-fixed-v1"] },
      {
        preflight: ready,
        invoke: async () => generated(),
        evaluate: async () => evaluation,
      },
    );
    assert.equal(report.trials[0].outcome, expected);
    assert.equal(report.trials[0].qualityComplete, false);
    assert.notEqual(report.status, "passed");
  }
});

test("completed automated UI acceptance can pass; a UI regression keeps functional success separate", async () => {
  let count = 0;
  const { report } = await runLabExperiment({ artifactRoot, live: true, evaluate: true }, {
    preflight: ready, invoke: async () => generated(),
    evaluate: async () => {
      const passed = ++count === 1;
      return { status: passed ? "passed" : "failed", functionalStatus: "passed", cleanup: "passed",
        qualityComplete: passed, automatedContractComplete: passed,
        ui: { status: passed ? "passed" : "failed", automatedContractComplete: passed } };
    },
  });
  assert.equal(report.trials[0].outcome, "passed");
  assert.equal(report.trials[1].outcome, "quality_failed");
  assert.equal(report.trials[1].evaluation.functionalStatus, "passed");
  assert.equal(report.summary[1].outcomes.quality_failed, 1);
  assert.notEqual(report.status, "passed");
});
