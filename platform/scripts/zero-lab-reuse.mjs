/** Generic HTTP library reuse. No task implementation or evaluator fixture is seeded. */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const reuseHash = data => createHash("sha256").update(data).digest("hex");
export const HTTP_LIBRARY_SOURCES = Object.freeze([
  { repository: "honojs/hono", revision: "588ec13fa68ea44fed1b5e1b503341db2bf09d70", license: "MIT", entry: "src/hono.ts", exports: "Hono" },
  { repository: "honojs/node-server", revision: "4b47a0d8a5c12ed69a9f8493df69918f62fb61c0", license: "MIT", entry: "src/server.ts", exports: "serve" },
]);
export const REUSE_LIBRARY_GUIDANCE = "Optional generic HTTP library: vendor/http.mjs exports Hono and serve. Example: import {Hono,serve} from './vendor/http.mjs'; const app=new Hono(); app.get('/ping',c=>c.text('pong')); serve({fetch:app.fetch,hostname:'0.0.0.0',port:Number(process.env.PORT??3000)}). It contains only upstream HTTP routing/server code, no application routes, database or UI. Runtime needs only Node builtins. Read vendor/README.md for provenance; preserve licenses. Inspect source when necessary and verify your own application.";
const allowedNames = new Set(["vendor/http.mjs", "vendor/LICENSE.hono", "vendor/LICENSE.node-server", "vendor/README.md"]);
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

async function boundedFile(file, maxBytes) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size < 1 || info.size > maxBytes) throw new Error("Invalid bounded artifact.");
    const bytes = await handle.readFile();
    if (bytes.length !== info.size || bytes.length > maxBytes) throw new Error("Artifact changed during read.");
    return bytes;
  } finally { await handle.close(); }
}

/** Read-only plan validation also authenticates every byte to be copied. */
export async function loadLabReusePlan(file, { taskDigest, sourceDigests } = {}) {
  if (typeof file !== "string" || !path.isAbsolute(file)) throw new Error("Reuse plan must be an absolute operator path.");
  const bytes = await boundedFile(file, 65536), plan = JSON.parse(bytes), directory = path.dirname(await realpath(file));
  if (plan.version !== 1 || plan.kind !== "zero-lab-jev-reuse-plan" || plan.status !== "ready" ||
      !digest(plan.taskDigest) || plan.taskDigest !== taskDigest || JSON.stringify(plan.sourceDigests) !== JSON.stringify(sourceDigests) ||
      !["Bash,Read,Write,Edit", "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch"].includes(plan.tools) ||
      typeof plan.context !== "string" || Buffer.byteLength(plan.context) > 8192 || !digest(plan.contextDigest) || reuseHash(plan.context) !== plan.contextDigest ||
      !Number.isSafeInteger(plan.elapsedMs) || plan.elapsedMs < 0 || plan.api?.status !== "answered" ||
      !["jev", "verified-http"].includes(plan.libraryPolicy ?? "jev") ||
      plan.api.model !== "typesafe/jev-1.13" || plan.api.modelDispatchAttempts !== 1 ||
      !Array.isArray(plan.assets) || plan.assets.length > 4 || new Set(plan.assets.map(a => a.name)).size !== plan.assets.length)
    throw new Error("Reuse plan does not match the frozen task, sources or bounded contract.");
  const assets = []; let total = 0;
  for (const asset of plan.assets) {
    if (!asset || !allowedNames.has(asset.name) || !digest(asset.sha256) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > 2097152 ||
        typeof asset.file !== "string" || !/^library\/[a-zA-Z0-9_.-]+$/.test(asset.file)) throw new Error("Invalid reuse asset.");
    const source = path.join(directory, asset.file), canonical = await realpath(source);
    if (!canonical.startsWith(directory + path.sep) || (await lstat(source)).isSymbolicLink()) throw new Error("Reuse asset escapes its preparation.");
    const data = await boundedFile(source, 2097152); total += data.length;
    if (total > 4194304 || data.length !== asset.bytes || reuseHash(data) !== asset.sha256) throw new Error("Reuse asset digest changed.");
    assets.push({ name: asset.name, data });
  }
  if (typeof plan.librarySelected !== "boolean" || plan.librarySelected !== (plan.assets.length === 4) ||
      (plan.libraryPolicy === "verified-http" && !plan.librarySelected) ||
      (plan.assets.length && (plan.assets.length !== allowedNames.size || ![...allowedNames].every(name => plan.assets.some(a => a.name === name)) ||
      plan.library?.verification !== "passed" || JSON.stringify(plan.library?.sources) !== JSON.stringify(HTTP_LIBRARY_SOURCES))))
    throw new Error("Unverified reuse library.");
  return { plan, digest: reuseHash(bytes), assets };
}

export async function stageLabReusePlan(loaded, workspace) {
  for (const asset of loaded.assets) {
    if (!allowedNames.has(asset.name) || reuseHash(asset.data) !== loaded.plan.assets.find(a => a.name === asset.name)?.sha256)
      throw new Error("Reuse asset changed after validation.");
    const target = path.join(workspace, asset.name);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, asset.data, { flag: "wx", mode: 0o600 });
  }
}

/** Fetch pinned public source, compile without running its scripts, verify only inside Docker. */
export async function prepareHttpReuseLibrary(directory, image) {
  const started = Date.now(), libraryDir = path.join(directory, "library"), sourceDir = path.join(directory, "source");
  await mkdir(libraryDir, { recursive: true, mode: 0o755 }); await mkdir(sourceDir, { mode: 0o700 });
  const entries = [], notices = [];
  for (const source of HTTP_LIBRARY_SOURCES) {
    const destination = path.join(sourceDir, source.repository.split("/")[1]);
    await mkdir(destination);
    const git = args => exec("git", ["-c", "core.hooksPath=/dev/null", "-c", "credential.helper=", ...args], { timeout: 60000, maxBuffer: 1048576 });
    await git(["init", "-q", destination]);
    await git(["-C", destination, "fetch", "--depth=1", `https://github.com/${source.repository}.git`, source.revision]);
    await git(["-C", destination, "checkout", "-q", "--detach", "FETCH_HEAD"]);
    const actual = await git(["-C", destination, "rev-parse", "HEAD"]);
    if (actual.stdout.trim() !== source.revision) throw new Error("Library source pin mismatch.");
    const license = await boundedFile(path.join(destination, "LICENSE"), 16384);
    if (!license.toString().includes("Permission is hereby granted, free of charge")) throw new Error("Reviewed MIT notice missing.");
    const name = "LICENSE." + source.repository.split("/")[1]; await writeFile(path.join(libraryDir, name), license, { mode: 0o644 });
    notices.push(name); entries.push(`export {${source.exports}} from ${JSON.stringify(path.join(destination, source.entry))};`);
  }
  const entry = path.join(directory, "library-entry.mjs"); await writeFile(entry, entries.join("\n") + "\n");
  const platformRequire = createRequire(new URL("../package.json", import.meta.url));
  const tsxRequire = createRequire(platformRequire.resolve("tsx/package.json"));
  const esbuild = tsxRequire("esbuild");
  const output = path.join(libraryDir, "http.mjs");
  const built = await esbuild.build({ entryPoints: [entry], outfile: output, platform: "node", target: "node24", format: "esm", bundle: true, minify: true, metafile: true, logLevel: "silent",
    alias: { "hono/ws": path.join(sourceDir, "hono/src/helper/websocket/index.ts") },
    plugins: [{ name: "pinned-source-only", setup(build) { build.onLoad({ filter: /.*/ }, async args => {
      const canonical = await realpath(args.path);
      if (canonical !== entry && !canonical.startsWith(sourceDir + path.sep)) throw new Error("Library import escapes pinned sources.");
      return undefined;
    }); } }] });
  if (Object.values(built.metafile.outputs).some(o => o.imports.some(i => i.external && !i.path.startsWith("node:")))) throw new Error("Library has external runtime dependencies.");
  const readme = REUSE_LIBRARY_GUIDANCE + "\n\n" + HTTP_LIBRARY_SOURCES.map(s => `https://github.com/${s.repository}/tree/${s.revision} (${s.license})`).join("\n") + "\n";
  await writeFile(path.join(libraryDir, "README.md"), readme, { mode: 0o644 });
  // Only upstream code, in a bounded network-none disposable container; no candidate/evaluator source.
  await verifyHttpReuseLibrary(libraryDir, image);
  const assets = [];
  for (const name of ["http.mjs", ...notices, "README.md"]) {
    const data = await boundedFile(path.join(libraryDir, name), 2097152);
    assets.push({ name: "vendor/" + name, file: "library/" + name, bytes: data.length, sha256: reuseHash(data) });
  }
  return { assets, sources: HTTP_LIBRARY_SOURCES, elapsedMs: Date.now() - started, verification: "passed", scope: "generic_HTTP_library_only_no_task_solution", bytes: assets.reduce((n,a) => n+a.bytes,0) };
}

export async function verifyHttpReuseLibrary(libraryDir, image, { command = exec } = {}) {
  const container = "repositoryzero-library-" + reuseHash(libraryDir + Date.now()).slice(0, 20);
  try {
    await command("docker", ["run", "--rm", "--name", container, "--network", "none", "--read-only", "--user", "1000:1000", "--cap-drop", "ALL", "--security-opt", "no-new-privileges=true", "--pids-limit", "64", "--memory", "256m", "--cpus", "1", "--mount", `type=bind,source=${libraryDir},target=/library,readonly`, "--entrypoint", "node", image, "--input-type=module", "-e", "import{Hono,serve}from'/library/http.mjs';import{once}from'node:events';const a=new Hono();a.get('/ping',c=>c.text('pong'));const s=serve({fetch:a.fetch,hostname:'127.0.0.1',port:0});try{await once(s,'listening');const r=await fetch('http://127.0.0.1:'+s.address().port+'/ping');if(r.status!==200||await r.text()!=='pong')throw Error('HTTP check failed')}finally{s.closeAllConnections();await new Promise(r=>s.close(r))}"], { timeout: 20000, maxBuffer: 16384 });
  } finally {
    try { await command("docker", ["rm", "--force", container], { timeout: 10000, maxBuffer: 16384 }); }
    catch { // --rm normally removed this exact owned container already.
      let absent = false;
      try { await command("docker", ["container", "inspect", container], { timeout: 10000, maxBuffer: 16384 }); }
      catch (error) { absent = /No such (?:container|object)/.test(String(error.stderr)); if (!absent) throw new Error("Library container cleanup unverified."); }
      if (!absent) throw new Error("Library container cleanup failed.");
    }
  }
}
