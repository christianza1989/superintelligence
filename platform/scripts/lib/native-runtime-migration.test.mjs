import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { nativeMigrationEngine, nativeMigrationSources } from "./native-runtime-migration.mjs";

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "zero-native-migrate-"));
  try {
    const instance = "@prisma+engines@fixture/node_modules/@prisma/engines";
    const enginePath = path.join(root, "node_modules/.pnpm", instance, "schema-engine-debian-openssl-3.0.x");
    await mkdir(path.dirname(enginePath), { recursive: true });
    await writeFile(enginePath, "fixture engine\n");
    await chmod(enginePath, 0o755);
    const engine = await nativeMigrationEngine(root, { packages: [{ name: "@prisma/engines", version: "fixture", instance }] });
    const sources = nativeMigrationSources(engine);
    await mkdir(path.join(root, "db"));
    await mkdir(path.join(root, "node_modules/prisma/build"), { recursive: true });
    await writeFile(path.join(root, "node_modules/prisma/build/index.js"), 'console.log(JSON.stringify({env:process.env,args:process.argv.slice(2),cwd:process.cwd()}));\n');
    await writeFile(path.join(root, "migrate.mjs"), sources.launcher);
    await writeFile(path.join(root, "db/prisma.config.mjs"), sources.config);
    await run({ root, enginePath, engine });
  } finally { await rm(root, { recursive: true, force: true }); }
}
test("actual generated migration launcher fixes the copied engine and isolates child credentials", async () => fixture(async ({ root, enginePath }) => {
  await writeFile(path.join(root, ".env"), "SOURCE_AUTH_CANARY=dotenv\n");
  const databaseUrl = "postgresql://fixture:fixture@127.0.0.1:1/fixture";
  const output = execFileSync(process.execPath, [path.join(root, "migrate.mjs")], { cwd: os.tmpdir(), env: { DATABASE_URL: databaseUrl, SOURCE_AUTH_CANARY: "ambient", PRISMA_SCHEMA_ENGINE_BINARY: "/ignored/operator-override" }, encoding: "utf8", timeout: 10_000 });
  const result = JSON.parse(output);
  assert.equal(result.env.DATABASE_URL, databaseUrl);
  assert.equal(result.env.PRISMA_SCHEMA_ENGINE_BINARY, enginePath);
  assert.equal(result.env.SOURCE_AUTH_CANARY, undefined);
  assert.deepEqual(result.args, ["migrate", "deploy", "--config", path.join(root, "db/prisma.config.mjs")]);
  assert.equal(result.cwd, path.join(root, "db"));
}));
test("generated migration rejects missing URL, malformed secret URL and tampered engine before CLI", async () => fixture(async ({ root, enginePath }) => {
  const run = env => execFileSync(process.execPath, [path.join(root, "migrate.mjs")], { cwd: root, env, encoding: "utf8", timeout: 10_000, stdio: "pipe" });
  await writeFile(path.join(root, ".env"), "DATABASE_URL=postgres://dotenv/fixture\n");
  assert.throws(() => run({}), error => error.stdout === "" && error.stderr.includes("DATABASE_URL is required"));
  const secret = "DO_NOT_EXPOSE_BAD_URL";
  assert.throws(() => run({ DATABASE_URL: secret }), error => error.stdout === "" && error.stderr.includes("Invalid DATABASE_URL") && !error.stderr.includes(secret));
  await writeFile(enginePath, "tampered engine\n");
  assert.throws(() => run({ DATABASE_URL: "postgres://fixture/fixture" }), error => error.stdout === "" && error.stderr.includes("integrity mismatch"));
}));
