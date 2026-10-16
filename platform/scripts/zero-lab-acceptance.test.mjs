import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSprintDeskAcceptance } from "./zero-lab-acceptance.mjs";

const pin = "a".repeat(64);
const functional = () => ({ status: "partial", functionalStatus: "passed", cleanup: "passed", sourceDigest: pin,
  api: { status: "passed" }, persistence: { status: "passed" } });
const browser = () => ({ status: "passed", automatedContractComplete: true, cleanup: "passed", sourceDigest: pin });
const options = { candidatePath: "/controlled-fixture", trustProfile: "controlled_synthetic" };
test("accepts only the combined declared contract, without claiming visual quality", async () => {
  const report = await evaluateSprintDeskAcceptance(options, { functional, browser });
  assert.equal(report.status, "passed"); assert.equal(report.automatedContractComplete, true);
  assert.equal(report.qualityComplete, true); assert.equal(report.visualQualityAssessed, false);
  assert.equal(report.cleanup, "passed"); assert.equal(report.paidModelCalls, 0);
});
test("functional failures and missing prerequisite outcomes skip the browser", async () => {
  for (const [change, expected] of [
    [{ status: "failed", functionalStatus: "failed" }, "failed"],
    [{ status: "failed", functionalStatus: "passed" }, "failed"],
    [{ cleanup: "not_needed" }, "partial"],
    [{ status: "unsupported", functionalStatus: "not_run", cleanup: "not_needed" }, "unsupported"],
    [{ status: "cancelled" }, "cancelled"],
    [{ status: "error", cleanup: "failed" }, "error"],
    [{ api: { status: "not_run" } }, "partial"],
  ]) {
    let calls = 0;
    const report = await evaluateSprintDeskAcceptance(options, { functional: () => ({ ...functional(), ...change }), browser: () => { calls++; return browser(); } });
    assert.equal(report.status, expected); assert.equal(calls, 0); assert.equal(report.automatedContractComplete, false);
  }
});
test("a browser regression is a measured failure while missing browser assets stay unsupported", async () => {
  for (const [change, expected] of [
    [{ status: "failed", automatedContractComplete: false }, "failed"],
    [{ status: "unsupported", cleanup: "not_needed" }, "unsupported"],
    [{ status: "cancelled" }, "cancelled"],
    [{ status: "passed", automatedContractComplete: false }, "partial"],
    [{ status: "passed", cleanup: "failed" }, "error"],
  ]) {
    const report = await evaluateSprintDeskAcceptance(options, { functional, browser: () => ({ ...browser(), ...change }) });
    assert.equal(report.status, expected); assert.equal(report.automatedContractComplete, false);
  }
});
test("two passing stages on different source snapshots cannot create a pass", async () => {
  const report = await evaluateSprintDeskAcceptance(options, { functional, browser: () => ({ ...browser(), sourceDigest: "b".repeat(64) }) });
  assert.equal(report.status, "error"); assert.equal(report.reason, "candidate_source_changed_between_evaluators");
  assert.equal(report.qualityComplete, false);
});
test("abort after functional verification prevents the next stage", async () => {
  const controller = new AbortController(); let calls = 0;
  const report = await evaluateSprintDeskAcceptance({ ...options, signal: controller.signal }, {
    functional: () => { controller.abort(); return functional(); }, browser: () => { calls++; return browser(); },
  });
  assert.equal(report.status, "cancelled"); assert.equal(calls, 0);
});
test("an unexpected stage exception records an unverified cleanup instead of leaking raw diagnostics", async () => {
  const report = await evaluateSprintDeskAcceptance(options, { functional: () => { throw new Error("private diagnostic"); } });
  assert.equal(report.status, "error"); assert.equal(report.cleanup, "unverified_after_stage_exception");
  assert.ok(!JSON.stringify(report).includes("private diagnostic"));
});
