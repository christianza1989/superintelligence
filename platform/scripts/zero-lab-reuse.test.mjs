import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CLAUDE_LOCAL_TOOLS, CLAUDE_TOOLS, claudeArguments } from "./zero-claude-cli.mjs";
import { HTTP_LIBRARY_SOURCES, loadLabReusePlan, reuseHash, stageLabReusePlan, verifyHttpReuseLibrary } from "./zero-lab-reuse.mjs";
import { prepareJevLabPlan, selectJevLabContext, withJevLabBudget } from "./zero-lab-jev.mjs";
import { buildLabPlan } from "./zero-lab-config.mjs";
import { runLabExperiment } from "./zero-lab-run.mjs";

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "zero-reuse-test-")); t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, "library"));
  const sourceDigests = { "controlled-source.mjs": "a".repeat(64) }, taskDigest = "b".repeat(64), context = "Controlled source-only context";
  const assets = [];
  for (const name of ["http.mjs", "LICENSE.hono", "LICENSE.node-server", "README.md"]) {
    const data = Buffer.from("Controlled synthetic file " + name + "\n");
    await writeFile(path.join(directory, "library", name), data);
    assets.push({ name: "vendor/" + name, file: "library/" + name, bytes: data.length, sha256: reuseHash(data) });
  }
  const plan = { version: 1, kind: "zero-lab-jev-reuse-plan", status: "ready", sourceDigests, taskDigest,
    context, contextDigest: reuseHash(context), elapsedMs: 25, tools: CLAUDE_LOCAL_TOOLS, assets, librarySelected: true,
    api: { model: "typesafe/jev-1.13", status: "answered", modelDispatchAttempts: 1 },
    library: { verification: "passed", sources: HTTP_LIBRARY_SOURCES } };
  const file = path.join(directory, "plan.json");
  const save = () => writeFile(file, JSON.stringify(plan), { mode: 0o600 }); await save();
  return { directory, file, plan, save, match: { sourceDigests, taskDigest } };
}
test("combined profiles retain staged provenance and reject overriding Jev's tool decision before auth", async t => {
  const f = await fixture(t), snapshot = await buildLabPlan({ promptVersion: 2 });
  f.plan.sourceDigests = snapshot.sourceDigests;
  f.plan.taskDigest = reuseHash(await readFile(new URL("../../benchmarks/sprintdesk-v1/PROMPT.v2.md", import.meta.url)));
  f.plan.libraryPolicy = "verified-http"; await f.save();
  let calls = 0;
  for (const reasoning of ["high", "medium", "low"]) {
    const { report } = await runLabExperiment({ engine: "claude", profiles: [`zero-jev-http-lean-${reasoning}-claude-v1`], promptVersion: 2,
      artifactRoot: path.join(f.directory, reasoning), reusePlan: f.file, live: true }, {
      preflight: async () => ({ ready: true }), invoke: async options => {
        calls++; assert.equal(options.reasoning, reasoning); assert.equal(options.systemPromptMode, "lean-v1");
        assert.equal(options.tools, CLAUDE_LOCAL_TOOLS);
        assert.ok((await readFile(path.join(options.workspace, "vendor/LICENSE.hono"), "utf8")).includes("Controlled"));
        return { status: "completed", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
      },
    });
    assert.equal(report.profiles[0].libraryPolicy, "verified-http"); assert.equal(report.trials[0].initialAssets.length, 4);
    assert.equal(report.executionKind, "injected_executor_test_not_model_benchmark");
  }
  assert.equal(calls, 3);
  f.plan.tools = CLAUDE_TOOLS; await f.save();
  const check = () => runLabExperiment({ engine: "claude", profiles: ["zero-jev-http-lean-low-claude-v1"], promptVersion: 2,
    artifactRoot: path.join(f.directory, "blocked"), reusePlan: f.file, live: true }, {
    preflight: async () => { calls++; throw new Error("Should not authenticate"); }, invoke: async () => { calls++; },
  });
  await assert.rejects(check()); assert.equal(calls, 3);
  f.plan.tools = CLAUDE_LOCAL_TOOLS; f.plan.libraryPolicy = "jev"; await f.save();
  await assert.rejects(check()); assert.equal(calls, 3);
});
test("offline Jev preparation does not authenticate, build, fetch or dispatch a model", async () => {
  const original = globalThis.fetch; globalThis.fetch = () => { throw new Error("Unexpected network"); };
  try { const plan = await prepareJevLabPlan(); assert.equal(plan.status, "prepared_not_run"); assert.equal(plan.modelDispatchAttempts, 0); }
  finally { globalThis.fetch = original; }
});
test("only two bounded tool profiles are selectable, and neither enables agents or permission bypass", () => {
  for (const tools of [CLAUDE_TOOLS, CLAUDE_LOCAL_TOOLS]) {
    const args = claudeArguments({ tools }); assert.equal(args[args.indexOf("--tools") + 1], tools);
    assert.equal(args[args.indexOf("--allowedTools") + 1], tools); assert.ok(!args.join(" ").includes("Agent"));
    assert.equal(args[args.indexOf("--permission-mode") + 1], "dontAsk");
  }
  for (const tools of ["Agent", "Bash", "Bash,Read,Write,Edit,Agent", "", []]) assert.throws(() => claudeArguments({ tools }));
});
test("a valid pinned plan stages only verified generic assets and preserves both MIT notices", async t => {
  const f = await fixture(t), loaded = await loadLabReusePlan(f.file, f.match), workspace = path.join(f.directory, "workspace");
  await mkdir(workspace); await stageLabReusePlan(loaded, workspace);
  assert.equal(loaded.assets.length, 4); assert.equal(loaded.digest, reuseHash(await readFile(f.file)));
  assert.ok((await readFile(path.join(workspace, "vendor/LICENSE.hono"), "utf8")).includes("Controlled"));
  await assert.rejects(stageLabReusePlan(loaded, workspace));
});
test("the real experiment stages the frozen library and passes selected tools before the injected coding boundary", async t => {
  const f = await fixture(t), snapshot = await buildLabPlan({ promptVersion: 2 });
  f.plan.sourceDigests = snapshot.sourceDigests;
  f.plan.taskDigest = reuseHash(await readFile(new URL("../../benchmarks/sprintdesk-v1/PROMPT.v2.md", import.meta.url)));
  await f.save(); let invoked = 0;
  const result = await runLabExperiment({ engine: "claude", profiles: ["zero-jev-reuse-claude-v1"], promptVersion: 2, live: true,
    artifactRoot: path.join(f.directory, "runs"), reusePlan: f.file }, {
    preflight: async () => ({ ready: true }), invoke: async options => {
      invoked++; assert.equal(options.tools, CLAUDE_LOCAL_TOOLS);
      assert.ok((await readFile(path.join(options.workspace, "vendor/http.mjs"), "utf8")).startsWith("Controlled"));
      assert.ok(options.prompt.includes(f.plan.context));
      return { status: "completed", actualModel: "claude-sonnet-5-5", requestedModel: "claude-sonnet-5-5", requestedReasoning: "high", enabledTools: options.tools,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, finalText: "Controlled synthetic handoff, no app or model" };
    },
  });
  assert.equal(invoked, 1); assert.equal(result.report.executionKind, "injected_executor_test_not_model_benchmark");
  assert.equal(result.report.trials[0].initialAssets.length, 4); assert.equal(result.report.reusePreparation.digest, reuseHash(await readFile(f.file)));
  f.plan.libraryPolicy = "verified-http"; await f.save();
  await assert.rejects(runLabExperiment({ engine: "claude", profiles: ["zero-jev-reuse-claude-v1"], promptVersion: 2, artifactRoot: path.join(f.directory,"wrong"), reusePlan: f.file }));
  const http = await runLabExperiment({ engine: "claude", profiles: ["zero-jev-http-claude-v1"], promptVersion: 2, artifactRoot: path.join(f.directory,"http"), reusePlan: f.file });
  assert.equal(http.report.status, "prepared_not_run"); assert.equal(http.report.cliInvocationAttempts, 0);
  assert.equal(http.report.profiles[0].libraryPolicy, "verified-http");
});
test("changed task, trusted source, context, tools or source pin blocks a plan before staging", async t => {
  const f = await fixture(t);
  await assert.rejects(loadLabReusePlan(f.file, { ...f.match, taskDigest: "d".repeat(64) }));
  await assert.rejects(loadLabReusePlan(f.file, { ...f.match, sourceDigests: {} }));
  for (const mutate of [p => { p.context += "changed"; }, p => { p.tools = "Agent"; }, p => { p.library.sources = []; }, p => { p.api.modelDispatchAttempts = 0; }]) {
    const copy = structuredClone(f.plan); mutate(copy); await writeFile(f.file, JSON.stringify(copy));
    await assert.rejects(loadLabReusePlan(f.file, f.match));
  }
});
test("asset tampering, lost license notices, traversal and symlinks are rejected", async t => {
  const f = await fixture(t);
  const original = await readFile(path.join(f.directory, "library/http.mjs"));
  await writeFile(path.join(f.directory, "library/http.mjs"), "tampered"); await assert.rejects(loadLabReusePlan(f.file, f.match));
  await writeFile(path.join(f.directory, "library/http.mjs"), original);
  for (const mutate of [p => p.assets.pop(), p => { p.assets[0].file = "../outside"; }, p => { p.assets[0].name = "../outside"; }]) {
    const copy = structuredClone(f.plan); mutate(copy); await writeFile(f.file, JSON.stringify(copy)); await assert.rejects(loadLabReusePlan(f.file, f.match));
  }
  await f.save(); await rm(path.join(f.directory, "library/http.mjs"));
  await writeFile(path.join(f.directory, "outside.mjs"), original); await symlink(path.join(f.directory, "outside.mjs"), path.join(f.directory, "library/http.mjs"));
  await assert.rejects(loadLabReusePlan(f.file, f.match));
});
test("uncertain source decisions are omitted, full tools remain the fallback and assets need a positive library decision", () => {
  const library = { verification: "passed", scope: "generic_only", assets: ["controlled"] }, sources = [{ repository: "synthetic/one" }, { repository: "synthetic/two" }];
  const selected = selectJevLabContext(sources, { source0: { type: "noul", noul: 0.9 }, source1: { type: "noul", noul: 0.6 }, http_library: { type: "noul", noul: 0.5 } }, library);
  assert.equal(selected.selectedSources, 1); assert.equal(selected.librarySelected, false); assert.deepEqual(selected.assets, []); assert.equal(selected.tools, CLAUDE_TOOLS);
  const enabled = selectJevLabContext(sources, { http_library: { type: "noul", noul: 0.9 }, tools: { type: "choice", choice: "local" } }, library);
  assert.equal(enabled.librarySelected, true); assert.equal(enabled.tools, CLAUDE_LOCAL_TOOLS);
  const fixed = selectJevLabContext(sources, { http_library: { type: "noul", noul: 0.69 } }, library, { libraryPolicy: "verified-http" });
  assert.equal(fixed.librarySelected, true); assert.equal(fixed.libraryPolicy, "verified-http");
  assert.ok(fixed.context.includes("operator_selected_verified_foundation_not_Jev_choice"));
  assert.throws(() => selectJevLabContext(sources, {}, library, { libraryPolicy: "unknown" }));
});
test("library execution failure survives successful cleanup, and unverified cleanup prevents a pass", async () => {
  const missing = () => Object.assign(new Error("Controlled missing object"), { stderr: "No such object" });
  let calls = 0;
  await assert.rejects(verifyHttpReuseLibrary("/controlled/library", "controlled-image", { command: async (_, args) => {
    calls++; if (args[0] === "run") throw new Error("Controlled library failure"); throw missing();
  } }), /Controlled library failure/);
  assert.equal(calls, 3);
  await assert.rejects(verifyHttpReuseLibrary("/controlled/library", "controlled-image", { command: async (_, args) => {
    if (args[0] === "run") return {}; if (args[0] === "rm") throw new Error("Controlled removal failed"); return {};
  } }), /cleanup failed/);
});
async function budgetFile(t, reserved = 0) {
  const dir = await mkdtemp(path.join(tmpdir(), "zero-jev-budget-test-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "ledger.json"), invocations = Array.from({ length: reserved / 100000 }, (_, i) => ({ id: "controlled-" + i, reservedUsdMicros: 100000, status: "held" }));
  await writeFile(file, JSON.stringify({ limitUsdMicros: 1000000, reservedUsdMicros: reserved, invocations }), { mode: 0o600 }); return file;
}
test("shared one-dollar ledger persists a reservation before dispatch and never refunds an uncertain call", async t => {
  const file = await budgetFile(t);
  await assert.rejects(withJevLabBudget(file, async reserve => { const receipt = await reserve("controlled"); assert.ok(receipt); assert.equal(await reserve("another"), null); throw new Error("Controlled interrupted call"); }));
  const state = JSON.parse(await readFile(file)); assert.equal(state.reservedUsdMicros, 100000); assert.equal(state.invocations[0].status, "reserved");
  await withJevLabBudget(file, async reserve => assert.equal(await reserve("controlled"), null));
});
test("an exhausted budget blocks dispatch, and an overlapping operation cannot acquire the same ledger", async t => {
  const exhausted = await budgetFile(t, 1000000);
  await withJevLabBudget(exhausted, async reserve => assert.equal(await reserve("extra"), null));
  const file = await budgetFile(t); let release, entered;
  const inside = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const running = withJevLabBudget(file, async () => { entered(); await gate; });
  await inside; await assert.rejects(withJevLabBudget(file, async () => assert.fail("Must not enter"))); release(); await running;
});
