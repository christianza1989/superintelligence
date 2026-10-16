/** Fixed offline executor or budget checks against a fresh disposable local database. */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const platform = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const requireDb = createRequire(path.join(platform, "packages/db/package.json"));
const budgetMode = process.argv.length === 3 && process.argv[2] === "--budget";
const expectedTests = budgetMode ? [
  "serializes concurrent reservations at the shared account limit",
  "rolls back the account debit when the lane or token ceiling denies",
  "admits one globally unique invocation across competing allocations",
  "retains held reservations after reconnect without restoring budget",
  "denies unconfigured and zero allocations before any debit",
  "keeps monetary reservations within the finite account ceiling",
] : [
  "allows only one worker to claim a queued run",
  "reclaims an expired running lease with a higher fence",
  "records an uncertain result without replaying an interrupted external effect",
  "fences concurrent terminal commits so only one final message is durable",
];
const testFile = budgetMode
  ? "packages/db/src/zero-budget.postgres.test.ts"
  : "packages/testkit/src/executor-lifecycle.test.ts";
const databaseName = "repositoryzero_verify_" + randomBytes(10).toString("hex");
const redactions = [];
let created = false;
let admin;
let scratch;

function redact(value) {
  let text = String(value);
  for (const secret of [...redactions].sort((a, b) => b.length - a.length)) {
    if (secret) text = text.replaceAll(secret, "[REDACTED]");
  }
  return text;
}

function runStep(label, executable, args, env, cwd, timeoutMs = 120_000) {
  console.log("[verify] " + label);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      killSignal: "SIGTERM",
    });
    const output = [];
    let bytes = 0;
    let overflow = false;
    const collect = (chunk) => {
      bytes += chunk.length;
      if (bytes > 1_048_576) {
        overflow = true;
        child.kill("SIGTERM");
        return;
      }
      output.push(chunk);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", () => reject(new Error(label + " could not start.")));
    child.on("close", (code, signal) => {
      // Buffer before redacting so a password split across chunks cannot escape.
      const diagnostics = redact(Buffer.concat(output).toString("utf8"));
      if (code !== 0 || signal || overflow) {
        if (diagnostics) console.error(diagnostics.slice(-8_000));
        reject(new Error(label + " failed; no model call was enabled."));
      } else resolve();
    });
  });
}

async function main() {
  if (process.argv.length !== 2 && !budgetMode) {
    throw new Error("Usage: node platform/scripts/verify-zero-foundation.mjs [--budget]");
  }
  const envFile = path.join(platform, ".env");
  if (!existsSync(envFile)) throw new Error("Initialize the local profile before verification.");
  const local = parseEnv(readFileSync(envFile, "utf8"));
  for (const [name, value] of Object.entries(local)) {
    if (/SECRET|TOKEN|KEY|PASSWORD|DATABASE_URL/.test(name) && value) redactions.push(value);
  }
  let source;
  try {
    source = new URL(local.DATABASE_URL);
  } catch {
    throw new Error("The local database configuration is invalid.");
  }
  if (
    !["postgres:", "postgresql:"].includes(source.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(source.hostname) ||
    !source.username ||
    !source.password
  ) throw new Error("Verification requires an authenticated loopback PostgreSQL profile.");
  redactions.push(source.password, decodeURIComponent(source.password), source.toString());

  const required = [
    "packages/db/node_modules/prisma/build/index.js",
    "node_modules/vitest/vitest.mjs",
    testFile,
    ...(!budgetMode ? [
      "packages/testkit/node_modules/@rakazo/db/package.json",
      "packages/testkit/node_modules/@rakazo/adapters/package.json",
    ] : []),
  ];
  if (required.some((file) => !existsSync(path.join(platform, file)))) {
    throw new Error("The selected verification file and pinned dependencies must exist before verification.");
  }
  const { Pool } = requireDb("pg");
  const adminUrl = new URL(source);
  adminUrl.pathname = "/postgres";
  const testUrl = new URL(source);
  testUrl.pathname = "/" + databaseName;
  redactions.push(adminUrl.toString(), testUrl.toString());
  admin = new Pool({
    connectionString: adminUrl.toString(),
    max: 1,
    connectionTimeoutMillis: 5_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
    idleTimeoutMillis: 1_000,
    application_name: "repositoryzero-foundation-verifier",
  });
  scratch = mkdtempSync(path.join(tmpdir(), "repositoryzero-foundation-"));
  const reportPath = path.join(scratch, "result.json");
  // No inherited model/provider/cloud/OAuth credentials or developer profile.
  // loadRootEnv intentionally skips developer .env when NODE_ENV=test.
  const freshSecret = () => randomBytes(32).toString("hex");
  const env = {
    PATH: process.env.PATH ?? "",
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
    NODE_ENV: "test",
    CI: "1",
    FORCE_COLOR: "0",
    VERIFY_DATABASE: "1",
    DATABASE_URL: testUrl.toString(),
    REALTIME_DATABASE_URL: testUrl.toString(),
    AGENT_RUNTIME: "scripted",
    SANDBOX_PROVIDER: "fake",
    CLOUD_AGENT_PROVIDER: "emulator",
    WAKEUP_DRIVER: "memory",
    SECRET_STORE: "encrypted",
    BETTER_AUTH_SECRET: freshSecret(),
    ENCRYPTION_KEY: freshSecret(),
    SCREEN_PROXY_SECRET: freshSecret(),
    SANDBOX_SUPERVISOR_TOKEN: freshSecret(),
    WEB_ORIGIN: "http://127.0.0.1:5173",
    BETTER_AUTH_URL: "http://127.0.0.1:5173",
    API_URL: "http://127.0.0.1:3100",
    API_HOST: "127.0.0.1",
    DATA_DIR: path.join(scratch, "data"),
    SIGNUPS_ENABLED: "true",
    SIGNUP_ALLOWLIST: "",
    PI_DEFAULT_PROVIDER: "scripted",
    PI_DEFAULT_MODEL: "scripted",
    OPENROUTER_API_KEY: "",
    MODEL_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    TYPESAFE_API_KEY: "",
    RAKAZO_AUTO_REVIEW: "false",
    MCP_STDIO_ENABLED: "false",
    MCP_ALLOW_PRIVATE_ENDPOINT: "false",
    PI_SESSION_RECORDING: "false",
    LOG_LEVEL: "off",
    AXIOM_TOKEN: "",
    PUBLIC_POSTHOG_KEY: "",
    ASTRO_TELEMETRY_DISABLED: "1",
  };
  redactions.push(...Object.entries(env).filter(([name]) => /SECRET|TOKEN|KEY|PASSWORD/.test(name)).map(([, value]) => value).filter(Boolean));

  console.log("[verify] Creating an isolated disposable loopback database.");
  // The name is generated by this invocation; it is never read from an argument.
  await admin.query('CREATE DATABASE "' + databaseName + '"');
  created = true;
  await runStep("Migrating only the disposable database.", process.execPath, [
    path.join(platform, "packages/db/node_modules/prisma/build/index.js"), "migrate", "deploy",
  ], env, path.join(platform, "packages/db"));
  await runStep(budgetMode
    ? "Running six offline shared-account budget cases."
    : "Running four existing scripted/fake executor lifecycle cases.", process.execPath, [
    path.join(platform, "node_modules/vitest/vitest.mjs"), "run",
    testFile,
    ...(!budgetMode ? ["--testNamePattern", expectedTests.join("|")] : []),
    "--maxWorkers=1", "--no-file-parallelism", "--reporter=json", "--outputFile", reportPath,
  ], env, platform, 180_000);
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const passedTitles = (report.testResults ?? []).flatMap((result) => result.assertionResults ?? [])
    .filter((assertion) => assertion.status === "passed")
    .map((assertion) => assertion.title);
  if (
    report.numPassedTests !== expectedTests.length ||
    report.numFailedTests !== 0 ||
    report.success !== true ||
    passedTitles.length !== expectedTests.length ||
    !expectedTests.every((title) => passedTitles.includes(title)) ||
    (budgetMode && report.numTotalTests !== expectedTests.length)
  ) {
    throw new Error("Verification did not pass exactly the intended " + expectedTests.length + " named test cases.");
  }
  if (budgetMode) {
    console.log("[verify] PASS: 6/6 focused offline PostgreSQL budget cases.");
    console.log("[verify] Scope: atomic account/lane allocation; unique invocation; durable holds; finite ceilings.");
  } else {
    console.log("[verify] PASS: 4/4 focused offline PostgreSQL executor cases.");
    console.log("[verify] Scope: claim once; higher recovery fence; uncertain effect without replay; atomic terminal commit.");
  }
}

try {
  await main();
} catch (error) {
  console.error("[verify] " + redact(error instanceof Error ? error.message : "Verification failed."));
  process.exitCode = 1;
} finally {
  if (created && admin) {
    try {
      await admin.query('DROP DATABASE "' + databaseName + '" WITH (FORCE)');
      console.log("[verify] This invocation's disposable database removed.");
    } catch (error) {
      console.error("[verify] Disposable database cleanup failed: " + redact(error instanceof Error ? error.message : "unknown error"));
      process.exitCode = 1;
    }
  }
  if (admin) await admin.end();
  if (scratch) rmSync(scratch, { recursive: true, force: true });
}
