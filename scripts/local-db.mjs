import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const command = process.argv[2] === "status" ? ["ps"] : ["up", "-d", "postgres"];
const child = spawn("docker", ["compose", "--env-file", ".env", "-f", "infra/compose/repositoryzero-local.yml", ...command], { cwd: path.join(root, "platform"), stdio: "inherit" });
child.on("error", () => { console.error("Docker Compose is required for the local database profile."); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
