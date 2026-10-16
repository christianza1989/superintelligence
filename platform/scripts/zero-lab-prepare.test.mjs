import assert from "node:assert/strict";
import test from "node:test";
import { inspectLabPrerequisites, prepareLabEnvironment } from "./zero-lab-prepare.mjs";
import { SPRINTDESK_IMAGE } from "./zero-lab-evaluate.mjs";

test("read-only preflight uses only the evaluator's local daemon, empty config and pinned image", async () => {
 const calls = [];
 const report = await inspectLabPrerequisites({}, { browser: async () => ({ ready: true }),
  command: async (file, args, options) => { calls.push({ file, args, options }); return { stdout: "ok" }; } });
 assert.equal(report.ready, true); assert.equal(report.modelDispatchAttempts, 0);
 assert.deepEqual(calls.map(c => c.args[0]), ["info", "image"]);
 assert.deepEqual(calls[1].args, ["image", "inspect", SPRINTDESK_IMAGE]);
 assert.equal(calls[0].options.env.DOCKER_HOST, "unix:///var/run/docker.sock");
 assert.deepEqual(Object.keys(calls[0].options.env).sort(), ["DOCKER_CONFIG", "DOCKER_HOST", "HOME", "PATH"]);
});
test("a missing image never pulls during a live-run preflight, but explicit preparation can fetch only that pin", async () => {
 for (const prepareImage of [false, true]) {
  const calls = []; let inspections = 0;
  const report = await inspectLabPrerequisites({ prepareImage }, { browser: async () => ({ ready: true }),
   command: async (_file, args) => { calls.push(args); if (args[0] === "image" && ++inspections === 1) throw new Error("missing"); } });
  assert.equal(report.ready, prepareImage);
  assert.deepEqual(calls.filter(args => args[0] === "pull"), prepareImage ? [["pull", SPRINTDESK_IMAGE]] : []);
 }
});
test("missing browser assets block readiness despite healthy Docker without leaking command diagnostics", async () => {
 const report = await inspectLabPrerequisites({}, { browser: async () => ({ ready: false }), command: async () => ({ stdout: "ok" }) });
 assert.equal(report.ready, false); assert.equal(report.imageReady, true);
 assert.equal(report.reason, "browser_prerequisites_unavailable");
 const failed = await inspectLabPrerequisites({}, { browser: async () => ({ ready: true }), command: async () => { throw new Error("private credentials"); } });
 assert.equal(failed.ready, false); assert.ok(!JSON.stringify(failed).includes("private credentials"));
});

test("Claude preparation checks the selected subscription engine without requiring Codex state", async () => {
 let authChecks = 0;
 const prepared = await prepareLabEnvironment({ engine: "claude" }, {
  inspect: async () => ({ ready: true, modelDispatchAttempts: 0 }),
  checkAuth: async () => { authChecks++; return { ready: true, authMethod: "claude.ai" }; },
 });
 assert.equal(prepared.ready, true); assert.equal(prepared.engine, "claude");
 assert.equal(prepared.cliState.authMethod, "claude.ai"); assert.equal(authChecks, 1);
 assert.equal(prepared.codexState, undefined); assert.equal(prepared.modelDispatchAttempts, 0);
 const blocked = await prepareLabEnvironment({ engine: "claude" }, {
  inspect: async () => ({ ready: true }), checkAuth: async () => ({ ready: false, reason: "subscription_auth_required" }),
 });
 assert.equal(blocked.ready, false); assert.equal(blocked.evaluatorReady, true);
 await assert.rejects(prepareLabEnvironment({ engine: "unknown" }));
});
