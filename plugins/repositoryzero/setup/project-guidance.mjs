import { constants } from "node:fs";
import { lstat, open, realpath, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const begin = "<!-- REPOSITORYZERO_PROJECT_GUIDANCE_V1_BEGIN -->";
const end = "<!-- REPOSITORYZERO_PROJECT_GUIDANCE_V1_END -->";
export const projectGuidance = `\n\n${begin}
RepositoryZero is enabled for this project. Before finalizing a software implementation plan, including a plan-only request, read the installed repositoryzero-reuse skill and use zero_status, then zero_search for the task's concrete capabilities. Inspect relevant returned sources and describe suitable modules, integration work and remaining gaps. An honest no-fit is valid; do not force a dependency.
Respect the user's scope and stop-before-coding requests. Planning permits discovery; when the operator has separately authorized an active Jev source-selection profile and finite API budget, follow the skill's zero_select recommendation workflow before finalizing the plan. Do not install, prepare or verify components, run application code or submit other paid jobs during a plan-only pause. During authorized implementation, follow the skill's scoped preparation, host integration and verification workflow. This guidance grants no execution, network transmission or spending permission. If discovery or source selection is unavailable, report that boundary honestly; an unavailable execution backend alone does not prevent local discovery.
${end}\n`;
const block = Buffer.from(projectGuidance);

async function snapshot(file) {
  let metadata;
  try {
    metadata = await lstat(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  if (!metadata.isFile() || metadata.nlink !== 1)
    throw new Error("Project guidance must be a regular, unlinked file");
  const handle = await open(
    file,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const current = await handle.stat();
    if (current.ino !== metadata.ino || current.dev !== metadata.dev)
      throw new Error("Project guidance changed while opening");
    if (current.size > 131072)
      throw new Error("Project guidance exceeds setup limit");
    return { bytes: await handle.readFile(), mode: current.mode & 0o777 };
  } finally {
    await handle.close();
  }
}

function locate(bytes) {
  const text = bytes.toString("utf8");
  const count = (marker) => text.split(marker).length - 1;
  if (!count(begin) && !count(end)) return -1;
  const index = bytes.indexOf(block);
  if (count(begin) !== 1 || count(end) !== 1 || index < 0)
    throw new Error(
      "Managed RepositoryZero guidance was edited; preserve it for manual review",
    );
  return index;
}

// Operator-run project setup only. No config, credentials, hook trust or ancestor
// instructions are read or modified. Never invoked automatically by the MCP.
export async function configureProjectGuidance(project, action) {
  if (!isAbsolute(project) || !["apply", "remove", "status"].includes(action))
    throw new Error(
      "Use apply, remove or status with an absolute existing project directory",
    );
  const directory = await realpath(project);
  if (!(await lstat(directory)).isDirectory())
    throw new Error("Project directory required");
  const file = join(directory, "AGENTS.md");
  const original = await snapshot(file);
  const bytes = original?.bytes ?? Buffer.alloc(0);
  const index = locate(bytes);
  if (action === "status")
    return { state: index < 0 ? "absent" : "configured", changed: false };
  if (action === "apply") {
    const override = await snapshot(join(directory, "AGENTS.override.md"));
    if (override?.bytes.toString("utf8").trim())
      throw new Error(
        "AGENTS.override.md shadows AGENTS.md; review project instructions before setup",
      );
    if (index >= 0) return { state: "configured", changed: false };
  } else if (index < 0) return { state: "absent", changed: false };
  const updated =
    action === "apply"
      ? Buffer.concat([bytes, block])
      : Buffer.concat([
          bytes.subarray(0, index),
          bytes.subarray(index + block.length),
        ]);
  const temp = join(directory, `.repositoryzero-guidance-${randomUUID()}.tmp`);
  const handle = await open(temp, "wx", original?.mode ?? 0o644);
  try {
    await handle.writeFile(updated);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    const current = await snapshot(file);
    if (
      Boolean(current) !== Boolean(original) ||
      (current && !current.bytes.equals(bytes))
    )
      throw new Error(
        "Project instructions changed during setup; retry after review",
      );
    if (updated.length === 0 && action === "remove") {
      await unlink(file);
    } else {
      await rename(temp, file);
    }
  } finally {
    await unlink(temp).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  return { state: action === "apply" ? "configured" : "absent", changed: true };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (process.argv.length !== 4)
      throw new Error(
        "Usage: node project-guidance.mjs apply|remove|status /absolute/project",
      );
    console.log(
      JSON.stringify(
        await configureProjectGuidance(process.argv[3], process.argv[2]),
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
