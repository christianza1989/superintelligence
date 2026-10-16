import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateSprintDeskBrowser, inspectBrowserPrerequisites, parseBrowserReceipt, SPRINTDESK_BROWSER_PROFILE } from "./zero-lab-browser.mjs";

const fixture = fileURLToPath(new URL("../packages/testkit/fixtures/zero-lab-ui/app", import.meta.url));
const apiFixture = fileURLToPath(new URL("../packages/testkit/fixtures/zero-lab/sprintdesk/server.mjs", import.meta.url));
const checkNames = ["load", "noHorizontalOverflow", "keyboardCreate", "keyboardMoveApiReadback", "reloadReadback", "noJavaScriptOrConsoleErrors", "noExternalRequestsOrPopups"];
const fullChecks = () => Object.fromEntries(checkNames.map(name => [name, true]));
function capture(name) {
  const width = name === "desktop" ? 1440 : 390, height = name === "desktop" ? 900 : 844;
  const data = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(data);
  data.write("IHDR", 12); data.writeUInt32BE(width, 16); data.writeUInt32BE(height, 20);
  return { name, width, height, pngBase64: data.toString("base64") };
}
function receipt() {
  return { version: 1, status: "passed", browserVersion: "154.0.8037.57", failedCheck: null,
    checks: { desktop: fullChecks(), mobile: fullChecks() }, captures: [capture("desktop"), capture("mobile")] };
}
async function controlledFixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "zero-browser-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, "candidate"); await cp(fixture, source, { recursive: true });
  await copyFile(apiFixture, path.join(source, "api.fixture.mjs"));
  return { directory, source };
}
function dependencies({ value = receipt(), invalidNetwork = false, cleanupFails = false, signalController } = {}) {
  const calls = []; let scratch;
  return {
    calls,
    async prepareBrowser(target) {
      await writeFile(path.join(target, "loader"), "fake unit dependency");
      await mkdir(path.join(target, "playwright-core"));
      return { bytes: 1, files: 1, digest: "a".repeat(64), playwrightVersion: "1.63.0" };
    },
    async runDocker(args, options) {
      calls.push({ args, options }); scratch = options.cwd;
      if (args[0] === "inspect") {
        const browser = args[1].endsWith("-browser"), app = browser ? args[1].slice(0, -8) : args[1];
        return { exitCode: 0, stdout: JSON.stringify([{
          Id: app + "-id", Config: { User: "1000:1000" },
          HostConfig: { NetworkMode: browser ? `container:${invalidNetwork ? "wrong-unrelated-container" : app + "-id"}` : "none",
            ReadonlyRootfs: true, Privileged: false, CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges=true"],
            Memory: browser ? 805306368 : 268435456, PidsLimit: browser ? 256 : 128, NanoCpus: 1e9 },
          Mounts: [{ Type: "bind", RW: false }],
        }]) };
      }
      if (args[0] === "start" && args.includes("--attach")) {
        if (signalController) { signalController.abort(); return { exitCode: -1, stdout: "" }; }
        return { exitCode: value.status === "passed" ? 0 : 1, stdout: JSON.stringify(value) };
      }
      if (args[0] === "rm" && cleanupFails) return { exitCode: 1, stdout: "" };
      return { exitCode: 0, stdout: "" };
    },
    get scratch() { return scratch; },
  };
}

test("requires an explicit controlled profile without starting Docker or copying browser assets", async () => {
  let called = false;
  const result = await evaluateSprintDeskBrowser({ candidatePath: fixture }, { prepareBrowser: () => { called = true; } });
  assert.equal(result.status, "unsupported"); assert.equal(called, false);
});
test("lightweight prerequisite inspection reports only bounded metadata without copying or executing a browser", async () => {
  const result = await inspectBrowserPrerequisites({ platform: "linux", arch: "x64", discover: async () => ({
    bytes: 574600816, files: 508, libraryCount: 100, playwrightVersion: "1.63.0", elfMachine: "x86_64", privatePath: "not returned",
  }) });
  assert.equal(result.ready, true); assert.equal(result.copiedBytes, 0); assert.equal(result.modelDispatchAttempts, 0);
  assert.equal(result.scope, "installed_assets_only_not_browser_runtime_or_docker");
  assert.equal(result.assetEstimateBytes, 574600816); assert.equal(JSON.stringify(result).includes("not returned"), false);
});
test("prerequisite inspection blocks wrong architecture, missing tools, mismatched client and excessive asset sizes", async () => {
  let discovered = false;
  const wrongArch = await inspectBrowserPrerequisites({ platform: "linux", arch: "arm64", discover: () => { discovered = true; } });
  assert.equal(wrongArch.ready, false); assert.equal(wrongArch.reason, "linux_x64_only"); assert.equal(discovered, false);
  const missing = await inspectBrowserPrerequisites({ discover: async () => { throw Object.assign(Error("private pathname"), { code: "ENOENT" }); } });
  assert.equal(missing.ready, false); assert.equal(missing.reason, "system_browser_prerequisites_unavailable");
  for (const change of [{ playwrightVersion: "99.0.0" }, { bytes: 641 * 1024 * 1024 }, { libraryCount: 1 }, { elfMachine: "arm64" }, { bytes: "5" }]) {
    const value = await inspectBrowserPrerequisites({ platform: "linux", arch: "x64", discover: async () => ({
      bytes: 500000000, files: 500, libraryCount: 100, playwrightVersion: "1.63.0", elfMachine: "x86_64", ...change,
    }) });
    assert.equal(value.ready, false); assert.equal(value.modelDispatchAttempts, 0);
  }
});
test("unsupported dependencies stay unsupported and never execute on the host", async t => {
  const { source } = await controlledFixture(t);
  const manifest = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
  manifest.dependencies = { missing: "1.0.0" }; await writeFile(path.join(source, "package.json"), JSON.stringify(manifest));
  const deps = dependencies(), result = await evaluateSprintDeskBrowser({ candidatePath: source, trustProfile: "controlled_synthetic" }, deps);
  assert.equal(result.status, "unsupported"); assert.equal(deps.calls.length, 0);
  assert.equal(result.reason, "candidate_outside_prebuilt_support_contract");
});
test("validates complete UI receipts and PNG viewport dimensions without accepting coerced types", () => {
  assert.equal(parseBrowserReceipt(JSON.stringify(receipt()))?.status, "passed");
  const changes = [
    r => { r.browserVersion = 154.1; }, r => { r.failedCheck = ["desktop_load"]; },
    r => { r.checks.mobile.keyboardCreate = "true"; }, r => { delete r.checks.mobile.keyboardCreate; },
    r => { r.captures.pop(); }, r => { r.captures[1] = r.captures[0]; },
    r => { r.captures[0].width = 1; }, r => { r.captures[0].pngBase64 = Buffer.from("<svg/>").toString("base64"); },
    r => { r.checks.desktop.untrustedPageText = "secret"; },
  ];
  for (const change of changes) { const r = receipt(); change(r); assert.equal(parseBrowserReceipt(JSON.stringify(r)), null); }
  assert.equal(parseBrowserReceipt("untrusted page diagnostics"), null);
});
test("a declared desktop/mobile contract success is not a subjective UI quality claim", async t => {
  const { source } = await controlledFixture(t), deps = dependencies();
  const result = await evaluateSprintDeskBrowser({ candidatePath: source, trustProfile: "controlled_local_candidate" }, deps);
  assert.equal(result.status, "passed"); assert.equal(result.automatedContractComplete, true);
  assert.equal(result.visualQualityAssessed, false); assert.equal(result.paidModelCalls, 0);
  assert.equal(result.executionKind, "injected_executor_test_not_browser_evidence");
  assert.equal(result.cleanup, "passed"); assert.equal(result.screenshots.length, 2);
  const inspections = deps.calls.filter(c => c.args[0] === "inspect");
  const firstStart = deps.calls.findIndex(c => c.args[0] === "start");
  assert.equal(inspections.length, 2); assert.ok(inspections.every(c => deps.calls.indexOf(c) < firstStart));
  for (const { args, options } of deps.calls) {
    assert.deepEqual(Object.keys(options.env).sort(), ["DOCKER_CONFIG", "DOCKER_HOST", "HOME", "PATH"]);
    assert.equal(options.env.DOCKER_HOST, "unix:///var/run/docker.sock");
    assert.ok(!args.includes("--privileged") && !args.includes("--publish") && !args.includes("--ipc=host"));
    if (args[0] === "create") {
      assert.ok(args.includes("--read-only")); assert.ok(args.includes("1000:1000"));
      for (const arg of args.filter(a => a.startsWith("type=bind,"))) {
        assert.ok(arg.endsWith(",readonly")); assert.ok(!arg.includes("docker.sock"));
      }
    }
  }
  await assert.rejects(lstat(deps.scratch), { code: "ENOENT" });
});
test("a semantic keyboard failure remains failed while preserving already observed checks", async t => {
  const { source } = await controlledFixture(t), value = receipt();
  value.status = "failed"; value.failedCheck = "mobile_keyboard_move"; value.checks.mobile = { load: true, noHorizontalOverflow: true, keyboardCreate: true }; value.captures.pop();
  const result = await evaluateSprintDeskBrowser({ candidatePath: source, trustProfile: "controlled_synthetic" }, dependencies({ value }));
  assert.equal(result.status, "failed"); assert.equal(result.failedCheck, "mobile_keyboard_move");
  assert.equal(result.automatedContractComplete, false); assert.equal(result.checks.desktop.keyboardMoveApiReadback, true);
});
test("a wrong shared network namespace is rejected before candidate or browser execution", async t => {
  const { source } = await controlledFixture(t), deps = dependencies({ invalidNetwork: true });
  const result = await evaluateSprintDeskBrowser({ candidatePath: source, trustProfile: "controlled_synthetic" }, deps);
  assert.equal(result.status, "error"); assert.equal(result.reason, "browser_isolation_profile_mismatch");
  assert.equal(deps.calls.some(c => c.args[0] === "start"), false); assert.equal(result.cleanup, "passed");
});
test("browser cancellation preserves cleanup without inheriting the cancelled signal", async t => {
  const { source } = await controlledFixture(t), controller = new AbortController(), deps = dependencies({ signalController: controller });
  const result = await evaluateSprintDeskBrowser({ candidatePath: source, trustProfile: "controlled_synthetic", signal: controller.signal }, deps);
  assert.equal(result.status, "cancelled"); assert.equal(result.cleanup, "passed");
  assert.equal(deps.calls.filter(c => c.args[0] === "rm").length, 2);
  for (const call of deps.calls.filter(c => c.args[0] === "rm")) assert.equal(call.options.signal, undefined);
});
test("missing installed browser assets are unsupported without network installs", async t => {
  const { source } = await controlledFixture(t), deps = dependencies();
  deps.prepareBrowser = async () => { throw Object.assign(Error("not printed"), { code: "ENOENT" }); };
  const result = await evaluateSprintDeskBrowser({ candidatePath: source, trustProfile: "controlled_synthetic" }, deps);
  assert.equal(result.status, "unsupported"); assert.equal(deps.calls.length, 0);
});
test("owned cleanup failure prevents a successful automated contract result", async t => {
  const { source } = await controlledFixture(t), deps = dependencies({ cleanupFails: true });
  const result = await evaluateSprintDeskBrowser({ candidatePath: source, trustProfile: "controlled_synthetic" }, deps);
  t.after(() => rm(deps.scratch, { recursive: true, force: true }));
  assert.equal(result.status, "error"); assert.equal(result.automatedContractComplete, false);
});
test("captures use fixed filenames and never overwrite an existing operator artifact", async t => {
  const { source, directory } = await controlledFixture(t), output = path.join(directory, "captures");
  const first = await evaluateSprintDeskBrowser({ candidatePath: source, trustProfile: "controlled_synthetic", artifactDirectory: output }, dependencies());
  assert.equal(first.status, "passed"); assert.equal((await readFile(path.join(output, "desktop.png"))).length, 24);
  const second = await evaluateSprintDeskBrowser({ candidatePath: source, trustProfile: "controlled_synthetic", artifactDirectory: output }, dependencies());
  assert.equal(second.status, "error"); assert.equal(second.automatedContractComplete, false);
});

test("real Chromium validates both viewports and catches keyboard and mobile layout regressions", {
  skip: process.env.ZERO_LAB_BROWSER_DOCKER_TESTS !== "1", timeout: 360000,
}, async t => {
  const { source, directory } = await controlledFixture(t);
  const captures = await mkdtemp(path.join(tmpdir(), "repositoryzero-browser-captures-"));
  const positive = await evaluateSprintDeskBrowser({ candidatePath: source, trustProfile: "controlled_synthetic", artifactDirectory: captures, signal: t.signal });
  assert.equal(positive.status, "passed", JSON.stringify(positive));
  const keyboard = path.join(directory, "keyboard-broken"); await cp(source, keyboard, { recursive: true });
  const client = await readFile(path.join(keyboard, "client.js"), "utf8");
  await writeFile(path.join(keyboard, "client.js"), client.replace('addEventListener("change"', 'addEventListener("pointerup"'));
  const keyboardRegression = await evaluateSprintDeskBrowser({ candidatePath: keyboard, trustProfile: "controlled_synthetic", signal: t.signal });
  assert.equal(keyboardRegression.status, "failed", JSON.stringify(keyboardRegression));
  assert.equal(keyboardRegression.failedCheck, "desktop_keyboard_move");
  const mobile = path.join(directory, "mobile-broken"); await cp(source, mobile, { recursive: true });
  const html = await readFile(path.join(mobile, "index.html"), "utf8");
  await writeFile(path.join(mobile, "index.html"), html.replace("</style>", "@media(max-width:600px){main{min-width:1000px}}</style>"));
  const mobileRegression = await evaluateSprintDeskBrowser({ candidatePath: mobile, trustProfile: "controlled_synthetic", signal: t.signal });
  assert.equal(mobileRegression.status, "failed", JSON.stringify(mobileRegression));
  assert.equal(mobileRegression.failedCheck, "mobile_layout");
  for (const result of [positive, keyboardRegression, mobileRegression]) {
    assert.equal(result.cleanup, "passed"); assert.equal(result.paidModelCalls, 0); assert.equal(result.visualQualityAssessed, false);
  }
  const module = await readFile(new URL("./zero-lab-browser.mjs", import.meta.url));
  await writeFile(path.join(tmpdir(), "repositoryzero-lab-browser-evidence.json"), JSON.stringify({
    kind: "controlled_browser_fixture_conformance_not_model_app_benchmark", checkedAtUtc: new Date().toISOString(),
    evaluatorSourceDigest: createHash("sha256").update(module).digest("hex"), profile: SPRINTDESK_BROWSER_PROFILE,
    artifactDirectory: captures, positive, keyboardRegression, mobileRegression,
  }, null, 2) + "\n", { mode: 0o600 });
});
