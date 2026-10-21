import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

export async function nativeMigrationEngine(output, closure) {
  const engines = closure.packages.filter(pkg => pkg.name === "@prisma/engines");
  if (engines.length !== 1) throw new Error("Native migration requires one exact Prisma engines package");
  const relative = "node_modules/.pnpm/" + engines[0].instance + "/schema-engine-debian-openssl-3.0.x";
  if (relative.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Invalid native migration engine path");
  const file = path.resolve(output, relative), info = await lstat(file);
  if (!(await realpath(file)).startsWith((await realpath(output)) + path.sep)) throw new Error("Native migration engine escapes package");
  if (!info.isFile() || !(info.mode & 0o111) || info.size > 64_000_000) throw new Error("Native migration schema engine is missing or invalid");
  return { path: relative, bytes: info.size, sha256: createHash("sha256").update(await readFile(file)).digest("hex"), packageVersion: engines[0].version };
}

export function nativeMigrationSources(engine) {
  const validateUrl = [
    'const url = process.env.DATABASE_URL;',
    'if (!url) throw new Error("DATABASE_URL is required");',
    'let parsed; try { parsed = new URL(url); } catch { throw new Error("Invalid DATABASE_URL"); }',
    'if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || parsed.pathname.length <= 1) throw new Error("Invalid DATABASE_URL");',
  ];
  return {
    config: [
      'import { defineConfig } from "prisma/config";',
      'import { fileURLToPath } from "node:url";',
      ...validateUrl,
      'export default defineConfig({ schema: fileURLToPath(new URL("./prisma/schema.prisma", import.meta.url)), migrations: { path: fileURLToPath(new URL("./prisma/migrations", import.meta.url)) }, datasource: { url } });',
      "",
    ].join("\n"),
    launcher: [
      'import { spawn } from "node:child_process";',
      'import { createHash } from "node:crypto";',
      'import { lstat, mkdir, mkdtemp, readFile, realpath } from "node:fs/promises";',
      'import { tmpdir } from "node:os";',
      'import path from "node:path";',
      'import { fileURLToPath } from "node:url";',
      'if (process.argv.length !== 2) throw new Error("Migration launcher takes no arguments");',
      ...validateUrl,
      `const engine = fileURLToPath(new URL(${JSON.stringify("./" + engine.path)}, import.meta.url));`,
      'const info = await lstat(engine);',
      'if (!(await realpath(engine)).startsWith((await realpath(fileURLToPath(new URL("./", import.meta.url)))) + "/")) throw new Error("Native migration engine escapes package");',
      `if (!info.isFile() || !(info.mode & 0o111) || info.size !== ${engine.bytes} || createHash("sha256").update(await readFile(engine)).digest("hex") !== ${JSON.stringify(engine.sha256)}) throw new Error("Native migration engine integrity mismatch");`,
      'const childHome = await mkdtemp(path.join(tmpdir(), "zero-native-migration-"));',
      'for (const name of ["config", "cache"]) await mkdir(path.join(childHome, name), { mode: 0o700 });',
      'const child = spawn(process.execPath, [fileURLToPath(new URL("./node_modules/prisma/build/index.js", import.meta.url)), "migrate", "deploy", "--config", fileURLToPath(new URL("./db/prisma.config.mjs", import.meta.url))], { cwd: fileURLToPath(new URL("./db/", import.meta.url)), env: { DATABASE_URL: url, PRISMA_SCHEMA_ENGINE_BINARY: engine, CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1", NODE_ENV: "production", HOME: childHome, XDG_CONFIG_HOME: path.join(childHome, "config"), XDG_CACHE_HOME: path.join(childHome, "cache"), TMPDIR: childHome }, stdio: "inherit" });',
      'child.once("error", () => { process.exitCode = 1; });',
      'child.once("exit", (code) => { process.exitCode = code ?? 1; });',
      'for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));',
      "",
    ].join("\n"),
  };
}
