import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assertNativeMigrationInventory, nativeMigrationEngine, nativeMigrationSources } from "./native-runtime-migration.mjs";

test("canonical migration inventory ignores SQL collation order but rejects missing, duplicate and unexpected names", () => {
  const section = "20260828090002_group_organization_section_idx_concurrent";
  const repair = "20260828090002a_group_organization_repair_invalid_idx";
  const expected = ["0001_init", section, repair];
  const postgresOrder = ["0001_init", repair, section];
  assert.doesNotThrow(() => assertNativeMigrationInventory(expected, postgresOrder));
  for (const actual of [
    postgresOrder.slice(0, 2),
    [...postgresOrder, repair],
    ["0001_init", repair, repair],
    [...postgresOrder, "unexpected_migration"],
  ]) assert.throws(() => assertNativeMigrationInventory(expected, actual), /NATIVE_CANONICAL_MIGRATION_INVENTORY/);
  assert.deepEqual(expected, ["0001_init", section, repair]);
  assert.deepEqual(postgresOrder, ["0001_init", repair, section]);
});

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
    await writeFile(path.join(root, "node_modules/prisma/build/index.js"), 'const os=require("node:os"), fs=require("node:fs"), path=require("node:path"); console.log(JSON.stringify({env:process.env,args:process.argv.slice(2),cwd:process.cwd(),home:os.homedir(),ambientNpmrc:fs.existsSync(path.join(os.homedir(),".npmrc"))}));\n');
    await writeFile(path.join(root, "migrate.mjs"), sources.launcher);
    await writeFile(path.join(root, "db/prisma.config.mjs"), sources.config);
    await run({ root, enginePath, engine });
  } finally { await rm(root, { recursive: true, force: true }); }
}
test("actual generated migration launcher fixes the copied engine and isolates child credentials", async () => fixture(async ({ root, enginePath }) => {
  await writeFile(path.join(root, ".env"), "SOURCE_AUTH_CANARY=dotenv\n");
  const ambientHome = path.join(root, "ambient-home"); await mkdir(ambientHome);
  await writeFile(path.join(ambientHome, ".npmrc"), "//fixture.invalid/:_authToken=SOURCE_AUTH_CANARY\n");
  const databaseUrl = "postgresql://fixture:fixture@127.0.0.1:1/fixture";
  const output = execFileSync(process.execPath, [path.join(root, "migrate.mjs")], { cwd: os.tmpdir(), env: { DATABASE_URL: databaseUrl, HOME: ambientHome, SOURCE_AUTH_CANARY: "ambient", PRISMA_SCHEMA_ENGINE_BINARY: "/ignored/operator-override", TMPDIR: root }, encoding: "utf8", timeout: 10_000 });
  const result = JSON.parse(output);
  assert.equal(result.env.DATABASE_URL, databaseUrl);
  assert.equal(result.env.PRISMA_SCHEMA_ENGINE_BINARY, enginePath);
  assert.equal(result.env.SOURCE_AUTH_CANARY, undefined);
  assert.notEqual(result.home, ambientHome);
  assert.ok(result.home.startsWith(root + path.sep + "zero-native-migration-"));
  assert.equal(result.env.HOME, result.home);
  assert.equal(result.env.TMPDIR, result.home);
  assert.equal(result.env.XDG_CONFIG_HOME, path.join(result.home, "config"));
  assert.equal(result.env.XDG_CACHE_HOME, path.join(result.home, "cache"));
  assert.equal((await stat(result.home)).mode & 0o777, 0o700);
  assert.equal(result.ambientNpmrc, false);
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
