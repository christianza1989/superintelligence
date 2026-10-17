/** Offline G1 fault qualification. Owns one labeled, disposable PostgreSQL container. */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const platform = fileURLToPath(new URL("../", import.meta.url));
const suffix = randomBytes(6).toString("hex");
const container = `zero-g1-proof-${suffix}`;
const reportDirectory = path.join(platform, ".local", "durability-qualification", suffix);
const fixturePassword = randomBytes(24).toString("hex");
const reports = [];
const matrix = [
  {
    file: "packages/testkit/src/executor-lifecycle.test.ts",
    mechanism: "real PostgreSQL; scripted runtime/fake connector; injected durable boundary states",
    titles: [
      "allows only one worker to claim a queued run",
      "reclaims an expired running lease with a higher fence",
      ...["completed", "cancelled"].map((status) => `does not rerun a ${status} run`),
      "records an uncertain result without replaying an interrupted external effect",
      "recreates the approval pause when an intended effect was interrupted before the card",
      "fences concurrent terminal commits so only one final message is durable",
      "rolls back every terminal write when the atomic commit fails",
      "coalesces steering that races finalization into one durable continuation",
      ...[
        [false, false, "failed"],
        [true, false, "failed"],
        [false, true, "failed"],
        [true, true, "failed"],
        [true, false, "completed"],
      ].map(
        ([claim, fresh, outcome]) => `bounds steering recovery (${claim}, ${fresh}, '${outcome}')`,
      ),
      "discards pending steering when the user stops active work",
      "turns a regular bot-thread send during active work into steering",
      "turns a send during waiting takeover into steering",
      "applies the same no-parallel-run rule to the targeted group member",
      "leaves private steering for a private continuation and excludes it from group recovery",
      "recovers a computer a crashed worker left booting",
      "leaves a booting computer alone while its worker still holds the lease",
    ],
  },
  {
    file: "packages/adapters/src/wakeup.postgres.test.ts",
    mechanism:
      "real PostgreSQL/Graphile; real workers; fake handlers; graceful stop is not a crash",
    titles: [
      "waits for an active handler during graceful shutdown",
      "replaces a keyed delayed job without running the old payload or schedule",
      "removes a keyed delayed job before a worker can run it",
      "keeps attempts and run_at while a keyed job is still in backoff",
      "re-enqueues an exhausted job with fresh attempts",
      "enqueues a keepExisting job when the key is missing",
      "persists a handler failure and retries the job successfully",
    ],
  },
  {
    file: "packages/testkit/src/zero-durability-qualification.postgres.test.ts",
    mechanism:
      "real PostgreSQL; CAS/authority cutpoints; event reconnect; 2 actual SIGKILL cuts; quiesced dump/restore",
    titles: [
      ...["owner", "fence", "space", "thread", "bot", "task", "cancelled", "expired"].map(
        (cut) => `G1 terminal commit rejects stale ${cut} authority`,
      ),
      ...["zero cursor", "middle cursor", "terminal cursor", "disconnect gap"].map(
        (cut) => `G1 event reconnect preserves ${cut}`,
      ),
      ...["completed replay", "ambiguous timeout", "concurrent claim", "foreign result"].map(
        (cut) => `G1 fake effect protects ${cut}`,
      ),
      ...["before-commit", "after-commit"].map(
        (cut) => `G1 actual SIGKILL ${cut} retains atomic terminal state`,
      ),
      ...["round trip", "missing blob", "changed blob", "foreign scope"].map(
        (cut) => `G1 DB and artifact restore detects ${cut}`,
      ),
    ],
  },
];
if (matrix.reduce((sum, group) => sum + group.titles.length, 0) !== 50)
  throw new Error("Qualification matrix must name exactly 50 scenarios");

let created = false;
let postgresImageId;
let interrupted = false;
let activeChild;
function stopChild(child) {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32") child.kill("SIGKILL");
    else process.kill(-child.pid, "SIGKILL");
  } catch {
    /* The owned process group already exited. */
  }
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    interrupted = true;
    stopChild(activeChild);
  });
function redact(value) {
  return String(value).replaceAll(fixturePassword, "[FIXTURE_CREDENTIAL]");
}
async function run(
  executable,
  args,
  env = { PATH: process.env.PATH },
  timeout = 30_000,
  cleanup = false,
) {
  if (interrupted && !cleanup) throw new Error("Qualification interrupted");
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: platform,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    activeChild = child;
    const chunks = [];
    let size = 0;
    let overflow = false;
    const timer = setTimeout(() => stopChild(child), timeout);
    const collect = (bytes) => {
      size += bytes.length;
      if (size > 2_097_152) {
        overflow = true;
        stopChild(child);
      } else chunks.push(bytes);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Qualification process could not start"));
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (activeChild === child) activeChild = undefined;
      const output = redact(Buffer.concat(chunks).toString("utf8"));
      if (code || signal || overflow)
        reject(new Error(output.slice(-16_000) || "Qualification process failed"));
      else resolve(output);
    });
  });
}

async function main() {
  if (process.argv.length !== 2)
    throw new Error("Usage: node platform/scripts/qualify-zero-durability.mjs");
  await mkdir(reportDirectory, { recursive: true, mode: 0o700 });
  // Fixed installed image, no pull, host network, model credentials, .env, or production DB.
  await run("docker", [
    "run",
    "--detach",
    "--pull=never",
    "--name",
    container,
    "--label",
    "zero.g1.qualification=true",
    "--memory",
    "256m",
    "--cpus",
    "1",
    "--pids-limit",
    "128",
    "--tmpfs",
    "/var/lib/postgresql:rw,nosuid,nodev,size=128m",
    "-p",
    "127.0.0.1::5432",
    "-e",
    "POSTGRES_USER=zero_g1_test",
    "-e",
    `POSTGRES_PASSWORD=${fixturePassword}`,
    "-e",
    "POSTGRES_DB=zero_g1_test",
    "postgres:18.6",
  ]);
  created = true;
  postgresImageId = (await run("docker", ["inspect", "--format", "{{.Image}}", container])).trim();
  const mapped = (await run("docker", ["port", container, "5432/tcp"])).trim();
  if (!/^127\.0\.0\.1:\d+$/u.test(mapped)) throw new Error("Unexpected owned PostgreSQL binding");
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await run("docker", ["exec", container, "pg_isready", "-U", "zero_g1_test"]);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!ready) throw new Error("Owned PostgreSQL did not become ready");
  const databaseUrl = `postgres://zero_g1_test:${fixturePassword}@${mapped}/zero_g1_test`;
  const secret = () => randomBytes(32).toString("hex");
  const env = {
    PATH: process.env.PATH,
    NODE_ENV: "test",
    CI: "1",
    FORCE_COLOR: "0",
    DATABASE_URL: databaseUrl,
    REALTIME_DATABASE_URL: databaseUrl,
    VERIFY_DATABASE: "1",
    VERIFY_ZERO_G1: "1",
    ZERO_G1_CONTAINER: container,
    AGENT_RUNTIME: "scripted",
    SANDBOX_PROVIDER: "fake",
    CLOUD_AGENT_PROVIDER: "emulator",
    WAKEUP_DRIVER: "memory",
    SECRET_STORE: "encrypted",
    BETTER_AUTH_SECRET: secret(),
    ENCRYPTION_KEY: secret(),
    SCREEN_PROXY_SECRET: secret(),
    SANDBOX_SUPERVISOR_TOKEN: secret(),
    WEB_ORIGIN: "http://127.0.0.1:5173",
    BETTER_AUTH_URL: "http://127.0.0.1:5173",
    API_URL: "http://127.0.0.1:3100",
    DATA_DIR: path.join(reportDirectory, "data"),
    SIGNUPS_ENABLED: "true",
    SIGNUP_ALLOWLIST: "",
    PI_DEFAULT_PROVIDER: "scripted",
    PI_DEFAULT_MODEL: "scripted",
    RAKAZO_AUTO_REVIEW: "false",
    MCP_STDIO_ENABLED: "false",
    MCP_ALLOW_PRIVATE_ENDPOINT: "false",
    PI_SESSION_RECORDING: "false",
    LOG_LEVEL: "off",
    ASTRO_TELEMETRY_DISABLED: "1",
  };
  const migrationConfig = path.join(reportDirectory, "prisma.config.mjs");
  await writeFile(
    migrationConfig,
    `export default ${JSON.stringify({
      schema: path.join(platform, "packages/db/prisma/schema.prisma"),
      migrations: { path: path.join(platform, "packages/db/prisma/migrations") },
    }).replace(/}$/, ",datasource:{url:process.env.DATABASE_URL}}")};\n`,
    { mode: 0o600 },
  );
  await run(
    process.execPath,
    [
      "packages/db/node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--config",
      migrationConfig,
    ],
    env,
    120_000,
  );
  for (const [index, group] of matrix.entries()) {
    const outputFile = path.join(reportDirectory, `batch-${index + 1}.json`);
    let error;
    try {
      await run(
        process.execPath,
        [
          "node_modules/vitest/vitest.mjs",
          "run",
          group.file,
          "--maxWorkers=1",
          "--no-file-parallelism",
          "--reporter=json",
          "--outputFile",
          outputFile,
        ],
        env,
        180_000,
      );
    } catch (failure) {
      error = redact(failure.message);
    }
    let report;
    try {
      report = JSON.parse(await readFile(outputFile, "utf8"));
    } catch {
      /* Keep absent output as failure. */
    }
    const assertions = (report?.testResults ?? []).flatMap(
      (result) => result.assertionResults ?? [],
    );
    const cases = group.titles.map((title) => {
      const matches = assertions.filter((assertion) => assertion.title === title);
      const assertion = matches.length === 1 ? matches[0] : undefined;
      return {
        title,
        mechanism: group.mechanism,
        expected: "authoritative state preserved; no unauthorized duplicate fake effect",
        factual: assertion?.status ?? "missing",
        durationMs: assertion?.duration ?? null,
        failure: assertion?.failureMessages?.length
          ? redact(assertion.failureMessages.join("\n")).slice(0, 8000)
          : null,
      };
    });
    // Preserve the authoritative synthetic rows, ordered event sequence, and effect
    // outcomes before destroying this invocation's database. Never query another DB.
    const evidence = await run("docker", [
      "exec",
      container,
      "psql",
      "-X",
      "-qAt",
      "-U",
      "zero_g1_test",
      "-d",
      "zero_g1_test",
      "-c",
      `SELECT json_build_object(
        'runs', (SELECT coalesce(json_agg(r ORDER BY r.id), '[]'::json) FROM
          (SELECT r.id,r.status,r."leaseOwner",r."leaseFence",r."leaseExpiresAt",r."taskId",t.prompt FROM runs r JOIN tasks t ON t.id=r."taskId") r),
        'attempts', (SELECT coalesce(json_agg(a ORDER BY a."runId",a.fence), '[]'::json) FROM
          (SELECT "runId",fence,status,error FROM attempts) a),
        'effects', (SELECT coalesce(json_agg(e ORDER BY e."runId",e.id), '[]'::json) FROM
          (SELECT id,"runId",kind,status,result FROM external_effects) e),
        'events', (SELECT coalesce(json_agg(e ORDER BY e."threadId",e.seq), '[]'::json) FROM
          (SELECT id,"threadId","runId",seq,type,payload FROM events) e))`,
    ]);
    await writeFile(path.join(reportDirectory, `batch-${index + 1}-state.json`), evidence, {
      mode: 0o600,
    });
    const pass =
      !error &&
      report?.success === true &&
      assertions.length === group.titles.length &&
      cases.every((item) => item.factual === "passed");
    reports.push({
      file: group.file,
      pass,
      error: error ?? null,
      evidence: `batch-${index + 1}-state.json`,
      cases,
    });
    console.log(
      `[G1] Batch ${index + 1}: ${cases.filter((item) => item.factual === "passed").length}/${group.titles.length}`,
    );
  }
}

let fatal;
try {
  await main();
} catch (error) {
  fatal = redact(error.message);
} finally {
  if (created) {
    try {
      await run("docker", ["rm", "--force", container], { PATH: process.env.PATH }, 30_000, true);
    } catch {
      fatal = [fatal, "Owned disposable container cleanup failed"].filter(Boolean).join("; ");
    }
  }
  const cases = reports.flatMap((group) => group.cases);
  const passed = cases.filter((item) => item.factual === "passed").length;
  const qualified =
    !fatal &&
    reports.length === matrix.length &&
    reports.every((group) => group.pass) &&
    passed === 50;
  const sourceFiles = await Promise.all(
    [
      ...matrix.map((group) => group.file),
      "packages/testkit/src/fixtures/g1-finalize-child.ts",
      "packages/db/src/events.ts",
      "scripts/qualify-zero-durability.mjs",
    ].map(async (file) => ({
      file,
      sha256: createHash("sha256")
        .update(await readFile(path.join(platform, file)))
        .digest("hex"),
    })),
  );
  const report = {
    kind: "zero.g1.fault-qualification.v1",
    passed,
    denominator: 50,
    qualified,
    paidModelCalls: 0,
    runtime: {
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      postgresImageId,
    },
    sourceFiles,
    fatal: fatal ?? null,
    groups: reports,
    limitations: [
      "Selected deterministic development matrix, not a universal crash guarantee",
      "Only two terminal-transaction cuts kill a real child; stored lease/effect states simulate other interruption cuts",
      "Graphile shutdown is graceful; no scheduler-process or PostgreSQL power-loss kill in this matrix",
      "Backup is quiesced synthetic pg_dump plus artifact copy into a fresh database; no live backup consistency or off-host restore claim",
      "No disk-full, RAM/CPU exhaustion, clean-host footprint, native reconnect, or paid provider qualification in this report",
      "Full G1/P0.12 remains open for the omitted scheduler crash/disk-full/resource matrix and separate base-byte/peak-temporary-disk criteria",
    ],
  };
  await mkdir(reportDirectory, { recursive: true, mode: 0o700 });
  await writeFile(
    path.join(reportDirectory, "qualification.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(
    `[G1] ${qualified ? "PASS" : "FAIL"}: ${passed}/50; report retained in .local/durability-qualification/${suffix}/qualification.json`,
  );
  if (fatal) console.error(fatal);
  if (!qualified) process.exitCode = 1;
}
