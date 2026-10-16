/** Shared offline experiment snapshot, controls and report semantics. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { emptyTrial, summarize, validateControls } from "../packages/testkit/src/evals/report.ts";
import { SPRINTDESK_ACCEPTANCE_PROFILE } from "./zero-lab-acceptance.mjs";

export async function buildLabPlan({ promptVersion = 1 } = {}) {
  assert.ok([1, 2].includes(promptVersion), "Unsupported SprintDesk prompt version.");
  const taskPromptPath = promptVersion === 1 ? "benchmarks/sprintdesk-v1/PROMPT.md" : "benchmarks/sprintdesk-v1/PROMPT.v2.md";
  const root = new URL("../../", import.meta.url);
  const config = JSON.parse(await readFile(new URL("benchmarks/zero-lab.v1.json", root), "utf8"));
  assert.equal(config.version, 1);
  assert.equal(config.suite, "sprintdesk-v1");
  assert.equal(config.liveEnabled, false);
  assert.equal(config.paidDispatchLimit, 0);
  validateControls(config.controls);
  assert.ok(["calibration", "validation", "holdout"].includes(config.split));
  assert.equal(config.profiles.length, 4);
  assert.equal(new Set(config.profiles.map((p) => p.id)).size, config.profiles.length);
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const sources = [
    "benchmarks/zero-lab.v1.json",
    "platform/scripts/zero-codex-cli.mjs",
    "platform/scripts/zero-claude-cli.mjs",
    "platform/scripts/zero-lab-config.mjs",
    "platform/scripts/zero-lab-run.mjs",
    "platform/scripts/zero-lab-cohort.mjs",
    "platform/scripts/zero-lab-compare.mjs",
    "platform/scripts/zero-lab-context.mjs",
    "platform/scripts/zero-lab-reuse.mjs",
    "platform/scripts/zero-lab-jev.mjs",
    "platform/scripts/zero-lab-prepare.mjs",
    "platform/scripts/zero-lab-evaluate.mjs",
    "platform/scripts/zero-lab-acceptance.mjs",
    "platform/scripts/zero-lab-browser.mjs",
    "platform/packages/testkit/fixtures/zero-lab-ui/browser-grader.cjs",
    "platform/packages/adapters/src/zero-systemone.ts",
    "platform/packages/adapters/src/zero-model-selector.ts",
    "platform/packages/adapters/src/zero-repository-tools.ts",
    "benchmarks/sprintdesk-v1/PROMPT.md",
    "benchmarks/sprintdesk-v1/acceptance.mjs",
    "platform/packages/core/src/zero-catalog-data.json",
    "platform/packages/adapters/src/zero-repository-selector.ts",
    "platform/packages/testkit/src/evals/report.ts",
    "platform/packages/testkit/src/evals/measurement.ts",
  ];
  if (promptVersion !== 1) sources.push(taskPromptPath);
  const sourceDigests = {};
  for (const file of sources) sourceDigests[file] = digest(await readFile(new URL(file, root)));
  const trials = config.profiles.flatMap((profile, i) =>
    Array.from({ length: config.controls.trials }, (_, n) => ({
      ...emptyTrial(config.suite, n + 1),
      strategy: profile.id,
      reason: "Offline plan only; live execution and independent app acceptance have not run.",
      plannedOrder: (i + n) % config.profiles.length,
    })),
  );
  const summary = summarize(trials);
  assert.ok(
    summary.every((s) => s.attempted === 0 && s.costUsd === null && s.inputTokens === null),
  );
  const report = {
    version: 1,
    kind: "zero-lab-offline-plan",
    createdAtUtc: new Date().toISOString(),
    status: "prepared_not_run",
    config,
    taskPromptVersion: promptVersion,
    taskPromptPath,
    evaluatorProfile: SPRINTDESK_ACCEPTANCE_PROFILE,
    profileDigests: Object.fromEntries(
      config.profiles.map((p) => [p.id, digest(JSON.stringify(p))]),
    ),
    sourceDigests,
    trials,
    summary,
    modelDispatchAttempts: 0,
    reuse: [
      "existing eval report, emptyTrial, summarize and validateControls",
      "existing source catalog, SystemOne selectors and local Codex CLI bridge",
    ],
    limitations: [
      "No model or generated app executed",
      "No quality, speed or cost improvement demonstrated",
      "Live model conformance, database comparison store and promotion remain unverified or planned",
      "Coding wall time is bounded; CLI tool counts are an observation-based stop threshold, not pre-dispatch authorization",
      "Fresh workspaces do not control provider prompt cache; actual cache usage must be recorded",
    ],
  };

  assert.equal(config.module, "zero-lab");
  assert.ok(config.profiles.every((p) => /^[a-z0-9-]{1,80}$/.test(p.id)));
  assert.ok(
    config.profiles
      .filter((p) => p.modelMode === "fixed")
      .every(
        (p) =>
          p.codingModel === "gpt-6.1-sol" &&
          p.reasoning === "xhigh" &&
          p.auth === "codex-cli-oauth",
      ),
  );
  return report;
}
