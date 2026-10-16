import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const platformArgs = process.argv.slice(2);
if (platformArgs[0] === "install") {
  let store = path.join(root, ".cache/pnpm-store");
  try {
    const metadata = readFileSync(path.join(root, "platform/node_modules/.modules.yaml"), "utf8");
    store = /^storeDir: (.+)$/m.exec(metadata)?.[1]?.trim() || store;
  } catch {}
  platformArgs.push("--store-dir", store);
}
const args = ["exec", "--cache", path.join(root, ".cache/npm"), "--yes", "--package=pnpm@9.15.0", "--", "pnpm", ...platformArgs];
const npmCli = process.env.npm_execpath;
const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" };
const child = npmCli ? spawn(process.execPath, [npmCli, ...args], { cwd: path.join(root, "platform"), stdio: "inherit", env }) : spawn("npm", args, { cwd: path.join(root, "platform"), stdio: "inherit", env });
child.on("error", () => { console.error("Could not start npm. Install a supported Node.js/npm runtime."); process.exitCode = 1; });
child.on("exit", (code, signal) => { if (signal) process.kill(process.pid, signal); else process.exitCode = code ?? 1; });
