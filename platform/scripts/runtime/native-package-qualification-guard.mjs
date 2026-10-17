// Qualification instrumentation only. This is not the production sandbox.
import fs from "node:fs";
import net from "node:net";
import childProcess from "node:child_process";
import path from "node:path";
import { registerHooks, syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";

const read = fs.readFileSync;
const real = fs.realpathSync;
const write = fs.writeFileSync;
const configFile = process.env.ZERO_NATIVE_QUALIFICATION_GUARD;
if (!configFile || fs.statSync(configFile).size > 65_536) throw new Error("NATIVE_GUARD_CONFIG_REQUIRED");
const config = JSON.parse(read(configFile, "utf8"));
const packageRoot = real(config.packageRoot);
const deniedRoots = config.deniedRoots.map(root => path.resolve(root));
const deniedFiles = new Set(config.deniedFiles.map(file => path.resolve(file)));
const allowedPorts = new Set(config.allowedPorts);
const audit = { version: 1, moduleResolutions: 0, deniedModules: 0, deniedFilesystem: 0, deniedNetwork: 0, guardedNodeChildren: 0 };
const inside = (root, file) => file === root || file.startsWith(root + path.sep);
const flush = () => {
  try { write(config.auditFile + "." + process.pid + ".json", JSON.stringify({ ...audit, maxRssKiB: process.resourceUsage().maxRSS }) + "\n", { mode: 0o600 }); } catch { /* Harness treats missing audit as failure. */ }
};
const deny = (counter, code) => { audit[counter]++; flush(); throw new Error(code); };
const readable = (value) => {
  if (typeof value === "number") return;
  const file = value instanceof URL ? fileURLToPath(value) : Buffer.isBuffer(value) ? value.toString() : value;
  if (typeof file !== "string") return;
  const absolute = path.resolve(file);
  let resolved = absolute;
  try { resolved = real(absolute); } catch { /* Keep lexical checks for absent probes. */ }
  if (deniedFiles.has(absolute) || deniedFiles.has(resolved) || deniedRoots.some(root => inside(root, absolute) || inside(root, resolved))) deny("deniedFilesystem", "NATIVE_AMBIENT_FILE_FORBIDDEN");
};
for (const name of ["readFile", "readFileSync", "open", "openSync", "access", "accessSync", "existsSync", "stat", "statSync", "lstat", "lstatSync", "readdir", "readdirSync", "readlink", "readlinkSync", "realpath", "realpathSync"]) {
  const original = fs[name];
  if (typeof original === "function") {
    const wrapped = function (...args) { readable(args[0]); return original.apply(this, args); };
    if (typeof original.native === "function") wrapped.native = function (...args) { readable(args[0]); return original.native.apply(this, args); };
    fs[name] = wrapped;
  }
}
for (const name of ["readFile", "open", "access", "stat", "lstat", "readdir", "readlink", "realpath"]) {
  const original = fs.promises[name];
  fs.promises[name] = function (...args) { readable(args[0]); return original.apply(this, args); };
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let options = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (typeof options === "number") options = { port: options, host: typeof args[1] === "string" ? args[1] : "localhost" };
  const host = options?.host ?? options?.hostname ?? "localhost";
  if (!options || typeof options !== "object" || options.path || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(host) || !allowedPorts.has(Number(options.port))) deny("deniedNetwork", "NATIVE_NONFIXTURE_NETWORK_FORBIDDEN");
  return connect.apply(this, args);
};
// The packaged migration launcher intentionally supplies a minimal child env.
// Instrument its real Node CLI child as well; do not borrow host module paths.
const spawn = childProcess.spawn;
childProcess.spawn = function (executable, args, options) {
  if (executable === process.execPath || executable === "node") {
    if (!Array.isArray(args)) { options = args ?? {}; args = []; }
    options ??= {};
    audit.guardedNodeChildren++;
    return spawn.call(this, executable, ["--import", fileURLToPath(import.meta.url), ...args], { ...options, env: { ...(options.env ?? process.env), ZERO_NATIVE_QUALIFICATION_GUARD: configFile } });
  }
  return spawn.call(this, executable, args, options);
};
syncBuiltinESMExports();
registerHooks({ resolve(specifier, context, nextResolve) {
  const result = nextResolve(specifier, context);
  if (result.url.startsWith("node:")) return result;
  if (!result.url.startsWith("file:")) deny("deniedModules", "NATIVE_PACKAGE_MODULE_ESCAPE");
  const file = real(fileURLToPath(result.url));
  if (!inside(packageRoot, file)) deny("deniedModules", "NATIVE_PACKAGE_MODULE_ESCAPE");
  audit.moduleResolutions++;
  return result;
} });
process.once("exit", flush);
process.on("uncaughtExceptionMonitor", flush);
flush();
