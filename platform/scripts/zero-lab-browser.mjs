/** Bounded controlled-code browser conformance; no candidate code executes on the host. */
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { chmod, copyFile, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { snapshotSprintDesk, SPRINTDESK_IMAGE } from "./zero-lab-evaluate.mjs";

import { STOCKDESK_BROWSER_CHECKS, STOCKDESK_BROWSER_STAGES } from './zero-stockdesk-contract.mjs';

export const SPRINTDESK_BROWSER_PROFILE = Object.freeze({
  id: "sprintdesk-controlled-system-chromium-linux-x64-v1", image: SPRINTDESK_IMAGE,
  platform: "linux", arch: "x64", playwrightVersion: "1.63.0",
  browserSource: "installed_system_chromium_readonly_copy_with_content_digest",
  network: "candidate_network_namespace_only_no_host_browser", chromiumSandbox: false,
  memoryBytes: 805306368, pids: 256, temporaryBytes: 100663296, shmBytes: 134217728,
  desktop: "1440x900", mobile: "390x844", maxTabsPerControl: 40,
  accessibleContract: "Title textbox; Create/Add task button; named task article; native Status select Todo/doing/Done",
  coverage: "load_headings_overflow_keyboard_create_move_api_readback_reload_runtime_errors",
  visualQualityAssessed: false,
});
const exec = promisify(execFile), hash = value => createHash("sha256").update(value).digest("hex");
const graderPath = fileURLToPath(new URL("../packages/testkit/fixtures/zero-lab-ui/browser-grader.cjs", import.meta.url));
const toolEnv = { PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" };
const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const fontConfig = '<fontconfig><dir>/browser/fonts</dir><cachedir>/tmp/font-cache</cachedir></fontconfig>';
class BrowserError extends Error {
  constructor(code, status = "error") { super(code); this.code = code; this.status = status; }
}
async function digestFile(file) {
  const digest = createHash("sha256"); for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}

async function browserLibraries() {
  const linked = await exec("ldd", ["/usr/lib/chromium/chromium"], { env: toolEnv, timeout: 5000, maxBuffer: 32768, encoding: "utf8" });
  if (linked.stdout.includes("not found")) throw new BrowserError("browser_library_missing", "unsupported");
  const libraries = new Map();
  for (const line of linked.stdout.split("\n")) {
    const match = line.match(/=> (\/[^ ]+)/) ?? line.match(/^\s*(\/[^ ]+)/);
    if (!match) continue;
    const source = match[1], name = path.basename(source);
    if (!/^\/(?:usr\/)?lib(?:64)?\//.test(source) || !/^[\w.+-]+$/.test(name) || libraries.size >= 128)
      throw new BrowserError("unsupported_browser_library_path", "unsupported");
    const canonical = await realpath(source);
    if (libraries.has(name) && libraries.get(name) !== canonical) throw new BrowserError("ambiguous_browser_library", "unsupported");
    libraries.set(name, canonical);
  }
  if (!libraries.has("ld-linux-x86-64.so.2") || !libraries.has("libc.so.6"))
    throw new BrowserError("browser_glibc_closure_missing", "unsupported");
  return libraries;
}
async function browserClient() {
  const testRequire = createRequire(await realpath(fileURLToPath(new URL("../packages/testkit/node_modules/@playwright/test/package.json", import.meta.url))));
  const playwrightRequire = createRequire(testRequire.resolve("playwright/package.json"));
  const client = path.dirname(playwrightRequire.resolve("playwright-core/package.json"));
  const packageInfo = JSON.parse(await readFile(path.join(client, "package.json"), "utf8"));
  if (packageInfo.version !== SPRINTDESK_BROWSER_PROFILE.playwrightVersion) throw new BrowserError("playwright_version_requires_profile_review", "unsupported");
  return { client, version: packageInfo.version };
}
async function installedBrowserFacts() {
  const executable = "/usr/lib/chromium/chromium", info = await lstat(executable);
  if (!info.isFile() || info.isSymbolicLink() || !(info.mode & 0o111)) throw new BrowserError("chromium_executable_missing", "unsupported");
  const file = await open(executable, constants.O_RDONLY | constants.O_NOFOLLOW);
  const elf = Buffer.alloc(20);
  try { const read = await file.read(elf, 0, 20, 0); if (read.bytesRead !== 20) throw new BrowserError("chromium_elf_invalid", "unsupported"); }
  finally { await file.close(); }
  if (elf.subarray(0, 4).toString() !== "\u007fELF" || elf[4] !== 2 || elf[5] !== 1 || elf.readUInt16LE(18) !== 62)
    throw new BrowserError("chromium_elf_requires_linux_x64", "unsupported");
  const libraries = await browserLibraries(), client = await browserClient();
  let bytes = Buffer.byteLength(fontConfig), files = 1, entries = 0;
  const inspectFile = async source => {
    const current = await lstat(source);
    if (!current.isFile() || current.isSymbolicLink()) throw new BrowserError("unsupported_browser_asset", "unsupported");
    bytes += current.size; files++;
    if (bytes > 640 * 1024 * 1024 || files > 2048) throw new BrowserError("browser_assets_exceed_bound", "unsupported");
  };
  const inspectTree = async (source, depth = 0) => {
    if (depth > 8) throw new BrowserError("browser_assets_depth_exceeded", "unsupported");
    for (const name of await readdir(source)) {
      if (++entries > 4096) throw new BrowserError("browser_assets_entry_bound_exceeded", "unsupported");
      const child = path.join(source, name), current = await lstat(child);
      if (current.isDirectory()) await inspectTree(child, depth + 1); else await inspectFile(child);
    }
  };
  await inspectTree("/usr/lib/chromium"); await inspectTree(client.client);
  for (const source of libraries.values()) await inspectFile(source);
  await inspectFile(await realpath("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"));
  return { bytes, files, libraryCount: libraries.size, playwrightVersion: client.version, elfMachine: "x86_64" };
}

/** Lightweight read-only preflight; readiness is not a browser launch or Docker proof. */
export async function inspectBrowserPrerequisites(deps = {}) {
  const report = { ready: false, reason: null, profile: SPRINTDESK_BROWSER_PROFILE,
    scope: "installed_assets_only_not_browser_runtime_or_docker", copiedBytes: 0, modelDispatchAttempts: 0 };
  try {
    if ((deps.platform ?? process.platform) !== "linux" || (deps.arch ?? process.arch) !== "x64")
      throw new BrowserError("linux_x64_only", "unsupported");
    const facts = await (deps.discover ?? installedBrowserFacts)();
    if (!Number.isSafeInteger(facts?.bytes) || facts.bytes <= 0 || facts.bytes > 640 * 1024 * 1024 ||
      !Number.isSafeInteger(facts.files) || facts.files < 1 || facts.files > 2048 ||
      !Number.isSafeInteger(facts.libraryCount) || facts.libraryCount < 2 || facts.libraryCount > 128 || facts.elfMachine !== "x86_64")
      throw new BrowserError("invalid_browser_prerequisite_facts", "unsupported");
    if (facts.playwrightVersion !== SPRINTDESK_BROWSER_PROFILE.playwrightVersion)
      throw new BrowserError("playwright_version_requires_profile_review", "unsupported");
    report.ready = true;
    Object.assign(report, { assetEstimateBytes: facts.bytes, files: facts.files, libraryCount: facts.libraryCount,
      playwrightVersion: facts.playwrightVersion, elfMachine: facts.elfMachine });
  } catch (error) {
    report.reason = error instanceof BrowserError ? error.code : ["ENOENT", "ENOTDIR", "MODULE_NOT_FOUND"].includes(error.code)
      ? "system_browser_prerequisites_unavailable" : "browser_prerequisite_inspection_failed";
  }
  return report;
}

/** Copies only explicit installed test dependencies, never candidate executables. */
export async function prepareSystemChromium(target) {
  const manifest = []; let bytes = 0;
  const copy = async (source, relative) => {
    const info = await lstat(source);
    if (!info.isFile() || info.isSymbolicLink()) throw new BrowserError("unsupported_browser_asset", "unsupported");
    bytes += info.size;
    if (bytes > 640 * 1024 * 1024 || manifest.length >= 2048) throw new BrowserError("browser_assets_exceed_bound", "unsupported");
    const destination = path.join(target, relative);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o755 });
    await copyFile(source, destination); await chmod(destination, info.mode & 0o111 ? 0o755 : 0o644);
    manifest.push({ path: relative, bytes: info.size, sha256: await digestFile(destination) });
  };
  const tree = async (source, relative, depth = 0) => {
    if (depth > 8) throw new BrowserError("browser_assets_depth_exceeded", "unsupported");
    for (const name of (await readdir(source)).sort()) {
      const sourceFile = path.join(source, name), info = await lstat(sourceFile);
      if (info.isDirectory()) await tree(sourceFile, `${relative}/${name}`, depth + 1);
      else await copy(sourceFile, `${relative}/${name}`);
    }
  };
  await tree("/usr/lib/chromium", "chromium");
  for (const [name, canonical] of await browserLibraries()) {
    if (name === "ld-linux-x86-64.so.2") await copy(canonical, "loader");
    else await copy(canonical, `lib/${name}`);
  }
  await copy(await realpath("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"), "fonts/DejaVuSans.ttf");
  await writeFile(path.join(target, "fonts.conf"), fontConfig, { mode: 0o644 });
  bytes += Buffer.byteLength(fontConfig); manifest.push({ path: "fonts.conf", bytes: Buffer.byteLength(fontConfig), sha256: hash(fontConfig) });
  const client = await browserClient();
  await tree(client.client, "playwright-core");
  manifest.sort((a, b) => a.path.localeCompare(b.path));
  return { bytes, files: manifest.length, digest: hash(JSON.stringify(manifest)), playwrightVersion: client.version };
}

export function parseBrowserReceipt(text, { suite = "sprintdesk-v1" } = {}) {
  if (!["sprintdesk-v1", "stockdesk-v1"].includes(suite)) return null;
  const stockdesk = suite === "stockdesk-v1";
  const stages = stockdesk ? new RegExp("^(?:browser_(?:start|cleanup)|(?:desktop|mobile)_(?:" + STOCKDESK_BROWSER_STAGES.join("|") + "))$") : /^(?:browser_(?:start|cleanup)|(?:desktop|mobile)_(?:load|layout|keyboard_create|keyboard_move|reload|layout_after_actions|runtime_errors))$/;
  let receipt;
  try { receipt = JSON.parse(text); } catch { return null; }
  if (!receipt || receipt.version !== 1 || !["passed", "failed"].includes(receipt.status) ||
    (receipt.browserVersion !== null && (typeof receipt.browserVersion !== "string" || !/^\d+(?:\.\d+){1,3}$/.test(receipt.browserVersion))) ||
    (receipt.failedCheck !== null && (typeof receipt.failedCheck !== "string" || !stages.test(receipt.failedCheck))) ||
    (receipt.status === "failed" && receipt.failedCheck === null) ||
    !receipt.checks || typeof receipt.checks !== "object" || Array.isArray(receipt.checks) || !Array.isArray(receipt.captures) || receipt.captures.length > 2) return null;
  const expected = stockdesk ? STOCKDESK_BROWSER_CHECKS : ["load", "noHorizontalOverflow", "keyboardCreate", "keyboardMoveApiReadback", "reloadReadback", "noJavaScriptOrConsoleErrors", "noExternalRequestsOrPopups"];
  for (const [name, checks] of Object.entries(receipt.checks)) {
    if (!["desktop", "mobile"].includes(name) || !checks || typeof checks !== "object" || Array.isArray(checks) ||
      Object.entries(checks).some(([key, value]) => !expected.includes(key) || value !== true)) return null;
  }
  if (receipt.status === "passed" && (receipt.failedCheck !== null ||
    ["desktop", "mobile"].some(name => expected.some(key => receipt.checks[name]?.[key] !== true)))) return null;
  const names = new Set();
  for (const capture of receipt.captures) {
    if (!["desktop", "mobile"].includes(capture.name) || names.has(capture.name) ||
      capture.width !== (capture.name === "desktop" ? 1440 : 390) || capture.height !== (capture.name === "desktop" ? 900 : 844) ||
      typeof capture.pngBase64 !== "string" || capture.pngBase64.length > 700000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(capture.pngBase64)) return null;
    names.add(capture.name);
    const data = Buffer.from(capture.pngBase64, "base64");
    if (data.length < 24 || data.length > 512 * 1024 || !data.subarray(0, 8).equals(pngHeader) ||
      data.subarray(12, 16).toString() !== "IHDR" || data.readUInt32BE(16) !== capture.width || data.readUInt32BE(20) !== capture.height ||
      data.toString("base64") !== capture.pngBase64) return null;
  }
  if (receipt.status === "passed" && (names.size !== 2 || receipt.browserVersion === null)) return null;
  return receipt;
}

async function docker(args, options) {
  try {
    const result = await exec("docker", args, { env: options.env, cwd: options.cwd, timeout: options.timeoutMs,
      signal: options.signal, killSignal: "SIGKILL", maxBuffer: 2 * 1024 * 1024, encoding: "utf8" });
    return { stdout: result.stdout, exitCode: 0 };
  } catch (error) {
    // Only the trusted grader's bounded JSON can be accepted; raw diagnostics stay private.
    return { stdout: typeof error.stdout === "string" ? error.stdout : "", exitCode: Number.isInteger(error.code) ? error.code : -1 };
  }
}

export async function evaluateSprintDeskBrowser(options, deps = {}) {
  if (options?.suite !== undefined && !["sprintdesk-v1", "stockdesk-v1"].includes(options.suite)) throw new Error("Unsupported browser suite.");
  const stockdesk = options?.suite === "stockdesk-v1";
  const selectedGrader = stockdesk ? fileURLToPath(new URL("../../benchmarks/stockdesk-v1/browser-grader.cjs", import.meta.url)) : graderPath;
  const report = {
    version: 1, suite: stockdesk ? "stockdesk-v1" : "sprintdesk-v1", status: "error", automatedContractComplete: false,
    visualQualityAssessed: false, paidModelCalls: 0, profile: stockdesk ? { ...SPRINTDESK_BROWSER_PROFILE, id: "stockdesk-controlled-chromium-v1", accessibleContract: "StockDesk prompt v1", coverage: STOCKDESK_BROWSER_CHECKS.join(",") } : SPRINTDESK_BROWSER_PROFILE,
    executionKind: deps.runDocker ? "injected_executor_test_not_browser_evidence" : "docker_system_chromium",
    checks: {}, screenshots: [], cleanup: "not_needed",
    limitations: ["Two viewport samples and one keyboard flow per viewport, not exhaustive accessibility or visual quality",
      "System Chromium with exact copied asset digest; not the Playwright bundled browser compatibility guarantee",
      "Chromium sandbox disabled inside the bounded Docker controlled-code profile; not hostile upstream PR isolation"],
  };
  const started = performance.now(), owned = new Set(); let scratch, dockerEnv;
  const timeoutMs = options?.timeoutMs ?? (stockdesk ? 180000 : 120000), run = deps.runDocker ?? docker;
  const call = async (args, { limit = 30000, cleanup = false, allowFailure = false } = {}) => {
    if (!cleanup && options.signal?.aborted) throw new BrowserError("browser_evaluation_cancelled", "cancelled");
    const remaining = timeoutMs - (performance.now() - started);
    if (!cleanup && remaining <= 0) throw new BrowserError("browser_evaluation_deadline", "failed");
    const value = await run(args, { env: dockerEnv, cwd: scratch, timeoutMs: cleanup ? 5000 : Math.max(1, Math.min(remaining, limit)), signal: cleanup ? undefined : options.signal });
    if (options.signal?.aborted && !cleanup) throw new BrowserError("browser_evaluation_cancelled", "cancelled");
    if (value.exitCode !== 0 && !allowFailure) throw new BrowserError(cleanup ? "browser_owned_cleanup_failed" : "browser_docker_stage_failed");
    return value;
  };
  try {
    if (!options || !["controlled_synthetic", "controlled_local_candidate"].includes(options.trustProfile))
      throw new BrowserError("explicit_controlled_trust_profile_required", "unsupported");
    if (process.platform !== "linux" || process.arch !== "x64") throw new BrowserError("linux_x64_only", "unsupported");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10000 || timeoutMs > 180000) throw new BrowserError("invalid_browser_deadline", "unsupported");
    if (options.signal?.aborted) throw new BrowserError("browser_evaluation_cancelled", "cancelled");
    if (options.artifactDirectory !== undefined && (typeof options.artifactDirectory !== "string" || !path.isAbsolute(options.artifactDirectory)))
      throw new BrowserError("artifact_directory_must_be_absolute", "unsupported");
    scratch = await mkdtemp(path.join(tmpdir(), "repositoryzero-ui-eval-"));
    const input = path.join(scratch, "input"), assets = path.join(scratch, "assets"), grader = path.join(scratch, "grader");
    for (const directory of [input, assets, grader, path.join(scratch, "docker-config")]) await mkdir(directory, { mode: 0o755 });
    try { Object.assign(report, await snapshotSprintDesk(options.candidatePath, input)); }
    catch (error) {
      if (error.status === "unsupported") throw new BrowserError("candidate_outside_prebuilt_support_contract", "unsupported");
      throw error;
    }
    await copyFile(selectedGrader, path.join(grader, "browser-grader.cjs"));
    report.graderDigest = hash(await readFile(path.join(grader, "browser-grader.cjs")));
    try { report.browserAssets = await (deps.prepareBrowser ?? prepareSystemChromium)(assets); }
    catch (error) {
      if (["ENOENT", "ENOTDIR"].includes(error.code)) throw new BrowserError("system_browser_assets_unavailable", "unsupported");
      throw error;
    }
    dockerEnv = { ...toolEnv, HOME: scratch, DOCKER_CONFIG: path.join(scratch, "docker-config"), DOCKER_HOST: "unix:///var/run/docker.sock" };
    try { await call(["image", "inspect", SPRINTDESK_IMAGE]); }
    catch (error) { if (error.status === "cancelled") throw error; throw new BrowserError("pinned_image_unavailable_no_pull", "unsupported"); }
    const id = randomBytes(8).toString("hex"), app = `repositoryzero-ui-${id}`, browser = `${app}-browser`;
    const base = ["--user", "1000:1000", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges=true", "--cpus", "1", "--log-driver", "none"];
    owned.add(app);
    await call(["create", "--name", app, ...base, "--network", "none", "--pids-limit", "128", "--memory", "256m",
      "--tmpfs", "/tmp:rw,nosuid,nodev,size=32m,mode=1777", "--tmpfs", "/data:rw,nosuid,nodev,size=64m,uid=1000,gid=1000,mode=0700",
      "--mount", `type=bind,source=${input},target=/candidate,readonly`, "--workdir", "/candidate",
      "--env", "PORT=38641", "--env", "DB_PATH=/data/sprintdesk.sqlite", "--env", "HOME=/tmp", "--env", "NODE_ENV=production",
      "--env", "npm_config_cache=/tmp/npm-cache", "--entrypoint", "npm", SPRINTDESK_IMAGE, "--ignore-scripts", "start"]);
    owned.add(browser);
    await call(["create", "--name", browser, ...base, "--network", `container:${app}`, "--pids-limit", "256", "--memory", "768m", "--shm-size", "128m",
      "--tmpfs", "/tmp:rw,nosuid,nodev,size=96m,mode=1777",
      "--mount", `type=bind,source=${assets},target=/browser,readonly`,
      "--mount", `type=bind,source=${path.join(assets, "loader")},target=/lib64/ld-linux-x86-64.so.2,readonly`,
      "--mount", `type=bind,source=${path.join(assets, "playwright-core")},target=/browserdeps/playwright-core,readonly`,
      "--mount", `type=bind,source=${grader},target=/grader,readonly`,
      "--env", "HOME=/tmp", "--entrypoint", "node", SPRINTDESK_IMAGE, "/grader/browser-grader.cjs"]);
    let appId;
    for (const [name, network, memory, pids] of [[app, "none", 268435456, 128], [browser, `container:${app}`, 805306368, 256]]) {
      const settings = JSON.parse((await call(["inspect", name])).stdout)[0], host = settings.HostConfig;
      if (name === app) appId = settings.Id;
      // Docker may normalize container:<name> to container:<id> on inspect.
      if ((network === "none" ? host.NetworkMode !== "none" : ![`container:${app}`, `container:${appId}`].includes(host.NetworkMode)) ||
        !host.ReadonlyRootfs || host.Privileged || settings.Config.User !== "1000:1000" ||
        !host.CapDrop?.includes("ALL") || !host.SecurityOpt?.includes("no-new-privileges=true") ||
        host.Memory !== memory || host.PidsLimit !== pids || host.NanoCpus !== 1000000000 ||
        settings.Mounts.some(mount => mount.Type === "bind" && mount.RW)) throw new BrowserError("browser_isolation_profile_mismatch");
    }
    report.isolation = { network: "none_shared_candidate_namespace", nonroot: true, readOnlyRoot: true, readOnlyHostBinds: true,
      inheritedSecretEnvironment: false, hostBrowserUsed: false, hostSocketMounted: false, candidateDataLimitBytes: 67108864 };
    await call(["start", app]);
    const graded = await call(["start", "--attach", browser], { limit: stockdesk ? 150000 : 90000, allowFailure: true });
    const receipt = parseBrowserReceipt(graded.stdout, { suite: stockdesk ? "stockdesk-v1" : "sprintdesk-v1" });
    if (!receipt || ![0, 1].includes(graded.exitCode) || (receipt.status === "passed") !== (graded.exitCode === 0))
      throw new BrowserError("invalid_or_missing_browser_grader_receipt");
    report.browserVersion = receipt.browserVersion; report.checks = receipt.checks;
    report.status = receipt.status; report.failedCheck = receipt.failedCheck;
    report.automatedContractComplete = receipt.status === "passed";
    if (options.artifactDirectory) {
      await mkdir(options.artifactDirectory, { recursive: true, mode: 0o700 });
      if (!(await lstat(options.artifactDirectory)).isDirectory() || (await lstat(options.artifactDirectory)).isSymbolicLink())
        throw new BrowserError("invalid_artifact_directory");
    }
    for (const capture of receipt.captures) {
      const data = Buffer.from(capture.pngBase64, "base64"), file = capture.name + ".png";
      if (options.artifactDirectory) await writeFile(path.join(options.artifactDirectory, file), data, { flag: "wx", mode: 0o600 });
      report.screenshots.push({ name: capture.name, width: capture.width, height: capture.height, bytes: data.length, sha256: hash(data), ...(options.artifactDirectory ? { file } : {}) });
    }
  } catch (error) {
    report.status = error instanceof BrowserError ? error.status : "error";
    report.reason = error instanceof BrowserError ? error.code : "browser_evaluation_failed_without_exposing_tool_output";
    report.automatedContractComplete = false;
  } finally {
    let failed = false;
    for (const name of [...owned].reverse()) { try { await call(["rm", "--force", name], { cleanup: true }); } catch { failed = true; } }
    if (scratch && !failed) { try { await rm(scratch, { recursive: true, force: true }); } catch { failed = true; } }
    report.cleanup = failed ? "failed_owned_resources_retained_for_operator" : scratch ? "passed" : "not_needed";
    if (failed) { report.status = "error"; report.reason = "browser_owned_cleanup_failed"; report.automatedContractComplete = false; }
    report.elapsedMs = Math.round(performance.now() - started);
  }
  return report;
}
