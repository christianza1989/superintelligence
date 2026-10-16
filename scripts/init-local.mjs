import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const random = () => randomBytes(32).toString("hex");
const password = random();
const settings = {
  NODE_ENV: "development", POSTGRES_USER: "repositoryzero", POSTGRES_DB: "repositoryzero", POSTGRES_PASSWORD: password,
  DATABASE_URL: `postgres://repositoryzero:${password}@127.0.0.1:5433/repositoryzero`,
  BETTER_AUTH_SECRET: random(), ENCRYPTION_KEY: random(), SCREEN_PROXY_SECRET: random(),
  WEB_ORIGIN: "http://127.0.0.1:5173", BETTER_AUTH_URL: "http://127.0.0.1:5173", API_URL: "http://127.0.0.1:3100", API_HOST: "127.0.0.1",
  DATA_DIR: path.join(root, ".local/data"), SANDBOX_PROVIDER: "none", WAKEUP_DRIVER: "graphile", AGENT_RUNTIME: "pi",
  SIGNUPS_ENABLED: "true", MCP_STDIO_ENABLED: "false", OPENROUTER_API_KEY: "", ANTHROPIC_API_KEY: "",
  PUBLIC_POSTHOG_KEY: "", AXIOM_TOKEN: "", PI_SESSION_RECORDING: "false",
};
try {
  await writeFile(path.join(root, "platform/.env"), Object.entries(settings).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\n") + "\n", { flag: "wx", mode: 0o600 });
  console.log("Created local configuration with independent random secrets. Existing files are never overwritten. No model credential is configured.");
} catch (error) {
  if (error.code === "EEXIST") console.log("Existing local configuration preserved.");
  else throw error;
}
