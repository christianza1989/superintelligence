/** Combine independent functional and browser checks of the same controlled source. */
import { evaluateSprintDesk, SPRINTDESK_PROFILE } from "./zero-lab-evaluate.mjs";
import { evaluateSprintDeskBrowser, SPRINTDESK_BROWSER_PROFILE } from "./zero-lab-browser.mjs";

export const SPRINTDESK_ACCEPTANCE_PROFILE = Object.freeze({
  id: "sprintdesk-automated-api-sqlite-ui-linux-x64-v2",
  functional: SPRINTDESK_PROFILE,
  browser: SPRINTDESK_BROWSER_PROFILE,
  sourceConsistency: "identical_content_digest_across_independent_snapshots",
  coverage: "api_contract_sqlite_restart_desktop_mobile_keyboard_create_move_reload",
  visualQualityAssessed: false,
});
export const STOCKDESK_ACCEPTANCE_PROFILE = Object.freeze({
  ...SPRINTDESK_ACCEPTANCE_PROFILE, id: "stockdesk-automated-v2",
  functional: { ...SPRINTDESK_PROFILE, id: "stockdesk-node24-prebuilt-linux-x64-v1", sqliteRecordProbe: "product_and_each_seed_movement_real_rows" },
  browser: { ...SPRINTDESK_BROWSER_PROFILE, id: "stockdesk-controlled-chromium-v2", accessibleContract: "StockDesk prompt v2", coverage: "keyboard_product_adjustment_transfer_CSV_preview_commit_replay_validation_filters_export_safe_text_reload" },
  coverage: "stockdesk_API_CSV_atomicity_idempotency_concurrency_SQLite_UI_workflows",
});
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export async function evaluateSprintDeskAcceptance(options, deps = {}) {
  const started = performance.now();
  const report = {
    version: 1, suite: options?.suite ?? "sprintdesk-v1", profile: options?.suite === "stockdesk-v1" ? STOCKDESK_ACCEPTANCE_PROFILE : SPRINTDESK_ACCEPTANCE_PROFILE,
    status: "error", functionalStatus: "not_run", qualityComplete: false,
    automatedContractComplete: false, visualQualityAssessed: false,
    api: { status: "not_run" }, persistence: { status: "not_run" }, ui: { status: "not_run" },
    cleanup: "not_needed", paidModelCalls: 0,
    limitations: [
      "Automated contract conformance is not a subjective design or comprehensive product-quality score",
      options?.suite === "stockdesk-v1" ? "StockDesk UI workflow checks cover the declared sampled flows; visual design and exhaustive accessibility remain unscored" : "UI coverage is create, move, API readback, reload, overflow and runtime errors; other UI flows require further review",
      "Controlled local code only; Docker shares its host kernel and Chromium runs without its own process sandbox",
      "Persistence is checked across application-container restart, not host power loss",
    ],
  };
  try {
    const functional = await (deps.functional ?? evaluateSprintDesk)(options);
    report.functional = functional;
    report.functionalStatus = functional.functionalStatus;
    report.api = functional.api;
    report.persistence = functional.persistence;
    report.acceptanceDigest = functional.acceptanceDigest;
    report.sourceDigest = functional.sourceDigest;
    report.cleanup = functional.cleanup;
    if (functional.status === "cancelled" || options?.signal?.aborted) report.status = "cancelled";
    else if (functional.status === "error" || !["passed", "not_needed"].includes(functional.cleanup)) report.status = "error";
    else if (functional.status === "unsupported") report.status = "unsupported";
    else if (functional.status === "failed" || functional.functionalStatus === "failed") report.status = "failed";
    else if (functional.cleanup !== "passed" || functional.functionalStatus !== "passed" || functional.api?.status !== "passed" || functional.persistence?.status !== "passed") report.status = "partial";
    else {
      const ui = await (deps.browser ?? evaluateSprintDeskBrowser)(options);
      report.ui = ui;
      report.cleanup = ["passed", "not_needed"].includes(ui.cleanup) && functional.cleanup === "passed" ? "passed" : ui.cleanup;
      if (ui.status === "cancelled" || options?.signal?.aborted) report.status = "cancelled";
      else if (ui.status === "error" || !["passed", "not_needed"].includes(ui.cleanup)) report.status = "error";
      else if (ui.status === "unsupported") report.status = "unsupported";
      else if (!digest(functional.sourceDigest) || functional.sourceDigest !== ui.sourceDigest) {
        report.status = "error";
        report.reason = "candidate_source_changed_between_evaluators";
      } else if (ui.status === "failed") report.status = "failed";
      else if (ui.status === "passed" && ui.cleanup === "passed" && ui.automatedContractComplete === true) {
        report.status = "passed";
        // Legacy report compatibility: this flag covers only the declared automated contract.
        report.qualityComplete = report.automatedContractComplete = true;
      } else report.status = "partial";
    }
  } catch {
    report.status = options?.signal?.aborted ? "cancelled" : "error";
    report.reason = "acceptance_stage_unavailable";
    report.cleanup = "unverified_after_stage_exception";
  }
  report.elapsedMs = Math.round(performance.now() - started);
  return report;
}
