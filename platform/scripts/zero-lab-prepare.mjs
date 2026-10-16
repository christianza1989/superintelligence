/** Read-only prerequisites, with an explicit preparation command for the pinned image. */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { checkCodexRuntime } from "./zero-codex-cli.mjs";
import { checkClaudeRuntime } from "./zero-claude-cli.mjs";
import { inspectBrowserPrerequisites } from "./zero-lab-browser.mjs";
import { SPRINTDESK_ACCEPTANCE_PROFILE } from "./zero-lab-acceptance.mjs";
import { SPRINTDESK_IMAGE } from "./zero-lab-evaluate.mjs";

const exec = promisify(execFile);
export async function inspectLabPrerequisites(options = {}, deps = {}) {
  const report = { profile: SPRINTDESK_ACCEPTANCE_PROFILE.id, ready: false,
    dockerReady: false, imageReady: false, imageDownloaded: false,
    browser: await (deps.browser ?? inspectBrowserPrerequisites)(), modelDispatchAttempts: 0 };
  let scratch;
  try {
    if (process.platform !== "linux" || process.arch !== "x64") throw new Error("platform");
    scratch = await mkdtemp(path.join(tmpdir(), "repositoryzero-lab-preflight-"));
    const config = path.join(scratch, "docker-config"); await mkdir(config);
    // Matches the evaluator's local Unix daemon; no inherited remote Docker context or credentials.
    const env = { PATH: process.env.PATH, HOME: scratch, DOCKER_CONFIG: config, DOCKER_HOST: "unix:///var/run/docker.sock" };
    const run = deps.command ?? exec;
    const call = (args, timeout = 15_000) => run("docker", args, { env, timeout, maxBuffer: 1_048_576 });
    await call(["info", "--format", "{{.ServerVersion}}"]); report.dockerReady = true;
    try { await call(["image", "inspect", SPRINTDESK_IMAGE]); }
    catch {
      if (options.prepareImage !== true) throw new Error("image");
      await call(["pull", SPRINTDESK_IMAGE], 180_000); report.imageDownloaded = true;
      await call(["image", "inspect", SPRINTDESK_IMAGE]);
    }
    report.imageReady = true;
  } catch { report.reason = "Linux_x64_local_Docker_or_pinned_image_unavailable"; }
  finally { if (scratch) await rm(scratch, { recursive: true, force: true }); }
  report.ready = report.dockerReady && report.imageReady && report.browser.ready === true;
  if (!report.ready && !report.reason) report.reason = "browser_prerequisites_unavailable";
  return report;
}
export async function prepareLabEnvironment(options = {}, deps = {}) {
  const engine = options.engine ?? "codex";
  const checks = { codex: checkCodexRuntime, claude: checkClaudeRuntime };
  if (!Object.hasOwn(checks, engine)) throw new Error("Unsupported coding CLI engine.");
  const evaluator = await (deps.inspect ?? inspectLabPrerequisites)({ prepareImage: true });
  const cliState = await (deps.checkAuth ?? checks[engine])();
  return { ...evaluator, engine, evaluatorReady: evaluator.ready, cliState,
    ready: evaluator.ready === true && cliState.ready === true };
}
async function main() {
  const { values } = parseArgs({ options: { engine: { type: "string", default: "codex" } } });
  const report = await prepareLabEnvironment({ engine: values.engine });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(() => { console.error("Cannot prepare local evaluator prerequisites."); process.exitCode = 1; });
