/** Export the authored source without local credentials, dependencies or generated artifacts. */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
if (process.platform !== "linux" || process.argv.length !== 2)
  throw new Error("Create this source archive on the Linux development host without arguments.");
const excluded = new Set([
  ".git",
  "node_modules",
  ".cache",
  ".local",
  ".artifacts",
  ".astro",
  ".turbo",
  ".next",
  ".codex",
  ".vite",
  "dist",
  "coverage",
  "test-results",
  "playwright-report",
  "test-report",
]);
const entries = [
  ".gitignore",
  ".rgignore",
  "LICENSE",
  "NOTICE",
  "README.md",
  "AGENTS.md",
  "PLAN.md",
  "ROADMAP.md",
  "MVP-ROADMAP.md",
  "package.json",
  "scripts",
  "docs",
  "catalog",
  "benchmarks",
  "platform",
];
const files = [];
const records = [];
let total = 0;
const hash = (value) => createHash("sha256").update(value).digest("hex");
async function inspect(relative) {
  const name = path.basename(relative);
  if (
    excluded.has(name) ||
    /^(auth\.json|credentials\.json|\.npmrc|id_rsa|id_ed25519)$/i.test(name) ||
    (/^\.env(?:\.|$)/.test(name) && !/^\.env\.(example|sample|template)$/.test(name))
  )
    return;
  const absolute = path.join(root, relative);
  const info = await lstat(absolute);
  if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()))
    throw new Error(
      "Source export encountered a link or special file; inspect the source tree first.",
    );
  if (info.isDirectory()) {
    for (const child of (await readdir(absolute)).sort()) await inspect(path.join(relative, child));
    return;
  }
  if (
    info.size > 32 * 1024 * 1024 ||
    total + info.size > 192 * 1024 * 1024 ||
    files.length >= 12_000
  )
    throw new Error("Source export exceeds its explicit file/byte bounds.");
  const content = await readFile(absolute);
  if (/\bsk-(?:or-v1-|proj-)[A-Za-z0-9_-]{32,}/.test(content.toString("utf8")))
    throw new Error("Source export detected a possible model credential; no archive was produced.");
  total += content.length;
  files.push(relative);
  records.push({
    path: relative.split(path.sep).join("/"),
    bytes: content.length,
    sha256: hash(content),
  });
}
for (const entry of entries) await inspect(entry);
const output = path.join(root, ".artifacts/distribution");
await mkdir(output, { recursive: true, mode: 0o700 });
const scratch = await mkdtemp(path.join(tmpdir(), "repositoryzero-source-export-"));
const archive = path.join(output, "repositoryzero-local-source.tar.gz");
try {
  const manifest = {
    kind: "repositoryzero_source_export_not_installer",
    createdAtUtc: new Date().toISOString(),
    files: records,
    totalBytes: total,
    setup: "docs/LOCAL-LAB.md",
    notes: [
      "No Git metadata, user credentials, node_modules or local artifact state",
      "The active local runner uses WSL2/Linux x64 and the owner's official Claude CLI subscription; Codex/OpenRouter races are deferred",
      "Use docs/LOCAL-LAB.md for bounded repeat and compact cohorts; model calls require an explicit live request",
      "No model completion, benchmark victory or desktop installer is claimed",
    ],
  };
  await writeFile(
    path.join(scratch, "SOURCE-MANIFEST.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await new Promise((resolve, reject) => {
    const child = spawn(
      "tar",
      [
        "--create",
        "--gzip",
        "--file",
        archive,
        "--owner=0",
        "--group=0",
        "--numeric-owner",
        "--transform=s,^,repositoryzero/,",
        "--directory",
        root,
        "--null",
        "--verbatim-files-from",
        "--files-from=-",
        "--directory",
        scratch,
        "SOURCE-MANIFEST.json",
      ],
      { stdio: ["pipe", "ignore", "pipe"], timeout: 60_000 },
    );
    child.stderr.on("data", () => {});
    child.on("error", () => reject(new Error("Source archive could not start.")));
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Source archive failed; its output must not be distributed.")),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(files.join("\0") + "\0");
  });
  const bytes = await readFile(archive);
  const report = {
    sourceFiles: files.length,
    sourceBytes: total,
    archiveBytes: bytes.length,
    sha256: hash(bytes),
    kind: "source_not_installer",
    localCredentialsIncluded: false,
  };
  await writeFile(
    path.join(output, "repositoryzero-local-source.sha256"),
    `${report.sha256}  repositoryzero-local-source.tar.gz\n`,
  );
  await writeFile(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await rm(archive, { force: true });
  throw error;
} finally {
  await rm(scratch, { recursive: true, force: true });
}
