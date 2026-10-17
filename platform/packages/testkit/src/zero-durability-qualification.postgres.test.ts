import { fork, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AdapterContext } from "@rakazo/adapter-kit";
import type { FinalizeRunInput } from "@rakazo/db";
import { cancelRunsInTransaction, createDb, createThreadEvents, finalizeRun } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  claimIntendedEffect,
  completeExternalEffect,
  resolveDuplicateEffectGate,
  settleUncertainEffect,
} from "../../adapters/src/approval-effect.js";
import { LocalArtifactStore } from "../../adapters/src/artifacts.js";
import { recordEffect } from "../../adapters/src/executor.js";

const databaseUrl = process.env.DATABASE_URL;
const enabled = process.env.VERIFY_ZERO_G1 === "1" && databaseUrl;
const qualified = enabled ? describe.sequential : describe.skip;
const platform = fileURLToPath(new URL("../../../", import.meta.url));
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

qualified("G1 additional durability fault boundaries", () => {
  let db: ReturnType<typeof createDb>;
  let restored: ReturnType<typeof createDb> | undefined;
  let root: string;
  const spaceId = `g1-${randomUUID()}`;
  const userId = `g1-${randomUUID()}`;
  const restoreName = `zero_g1_restore_${randomUUID().replaceAll("-", "")}`;
  let dump: Buffer;
  let backupRow: { id: string; storageKey: string; hash: string; size: number };
  let backupRunId: string;
  const context = { spaceId, userId, operationId: "g1-fixture" } as AdapterContext;

  function docker(args: string[], input?: Buffer) {
    const container = process.env.ZERO_G1_CONTAINER;
    if (!container || !/^zero-g1-proof-[a-f0-9]{12}$/u.test(container))
      throw new Error("Qualification requires its own labeled container");
    const result = spawnSync("docker", ["exec", "-i", container, ...args], {
      input,
      maxBuffer: 32 * 1024 * 1024,
      timeout: 30_000,
    });
    if (result.status !== 0) throw new Error("Owned qualification database operation failed");
    return result.stdout;
  }

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    const container = process.env.ZERO_G1_CONTAINER;
    if (
      !container ||
      !/^zero-g1-proof-[a-f0-9]{12}$/u.test(container) ||
      url.hostname !== "127.0.0.1" ||
      url.username !== "zero_g1_test" ||
      url.pathname !== "/zero_g1_test"
    )
      throw new Error("Dedicated disposable qualification database required");
    const label = spawnSync(
      "docker",
      ["inspect", "--format", '{{index .Config.Labels "zero.g1.qualification"}}', container],
      { timeout: 10_000 },
    );
    const port = spawnSync("docker", ["port", container, "5432/tcp"], { timeout: 10_000 });
    if (
      label.status !== 0 ||
      label.stdout.toString().trim() !== "true" ||
      port.status !== 0 ||
      port.stdout.toString().trim() !== `127.0.0.1:${url.port}`
    )
      throw new Error("Qualification URL must match the labeled owned container");
    db = createDb(databaseUrl!, { poolMax: 4 });
    root = await mkdtemp(path.join(tmpdir(), "zero-g1-qualification-"));
    await db.prisma.organization.create({
      data: {
        id: spaceId,
        name: "Synthetic durability fixture",
        slug: spaceId,
        createdAt: new Date(),
      },
    });
    await db.prisma.space.create({
      data: { id: spaceId, organizationId: spaceId, name: "Fixture" },
    });
    await db.prisma.user.create({
      data: { id: userId, name: "Synthetic fixture", email: `${userId}@fixture.invalid` },
    });
  });
  afterAll(async () => {
    await restored?.prisma.$disconnect();
    await restored?.pool.end();
    if (db) {
      await db.pool.query(`DROP DATABASE IF EXISTS "${restoreName}" WITH (FORCE)`);
      await db.prisma.$disconnect();
      await db.pool.end();
    }
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function seed(label: string) {
    const bot = await db.prisma.bot.create({
      data: { spaceId, userId, name: label, color: "fixture" },
    });
    const thread = await db.prisma.thread.create({ data: { spaceId, userId, botId: bot.id } });
    const task = await db.prisma.task.create({
      data: {
        spaceId,
        userId,
        botId: bot.id,
        threadId: thread.id,
        prompt: label,
        status: "queued",
      },
    });
    const run = await db.prisma.run.create({
      data: {
        spaceId,
        userId,
        botId: bot.id,
        threadId: thread.id,
        taskId: task.id,
        status: "running",
        trigger: "user",
        leaseOwner: "qualification-worker",
        leaseFence: 3,
        leaseExpiresAt: new Date(Date.now() + 60_000),
        startedAt: new Date(),
      },
    });
    const attempt = await db.prisma.attempt.create({
      data: { runId: run.id, fence: 3, status: "running" },
    });
    const input: FinalizeRunInput = {
      spaceId,
      threadId: thread.id,
      botId: bot.id,
      runId: run.id,
      taskId: task.id,
      attemptId: attempt.id,
      leaseOwner: "qualification-worker",
      leaseFence: 3,
      outcome: "completed",
      blocks: [{ kind: "text", text: "synthetic result" }],
    };
    return { run, input };
  }

  const staleCases = [
    "owner",
    "fence",
    "space",
    "thread",
    "bot",
    "task",
    "cancelled",
    "expired",
  ] as const;
  it.each(staleCases)("G1 terminal commit rejects stale %s authority", async (cut) => {
    const { run, input } = await seed(`stale-${cut}`);
    if (cut === "owner") input.leaseOwner = "old-worker";
    if (cut === "fence") input.leaseFence--;
    if (cut === "space") input.spaceId = "foreign-space";
    if (cut === "thread") input.threadId = "foreign-thread";
    if (cut === "bot") input.botId = "foreign-bot";
    if (cut === "task") input.taskId = "foreign-task";
    if (cut === "cancelled")
      await db.prisma.$transaction((tx) =>
        cancelRunsInTransaction(tx, [{ id: run.id, taskId: run.taskId }], new Date()),
      );
    if (cut === "expired")
      await db.prisma.run.update({ where: { id: run.id }, data: { leaseExpiresAt: new Date(0) } });
    expect(await finalizeRun(db.prisma, input)).toBe(false);
    expect(await db.prisma.message.count({ where: { runId: run.id } })).toBe(0);
    expect(await db.prisma.event.count({ where: { runId: run.id } })).toBe(0);
    expect((await db.prisma.run.findUniqueOrThrow({ where: { id: run.id } })).status).toBe(
      cut === "cancelled" ? "cancelled" : "running",
    );
  });

  it.each(["zero cursor", "middle cursor", "terminal cursor", "disconnect gap"])(
    "G1 event reconnect preserves %s",
    async (cut) => {
      const { run } = await seed(cut);
      const events = createThreadEvents(db.prisma);
      const append = () =>
        events.append({
          spaceId,
          threadId: run.threadId,
          botId: run.botId,
          runId: run.id,
          type: "effect.reconciled",
          payload: { synthetic: true },
        });
      const first = await append();
      const second = await append();
      let cursor = cut === "zero cursor" ? -1 : cut === "middle cursor" ? first.seq : second.seq;
      if (cut === "disconnect gap") {
        const controller = new AbortController();
        const stream = events.follow(run.threadId, first.seq, controller.signal);
        expect((await stream.next()).value).toMatchObject({ id: second.id });
        controller.abort();
        await stream.return(undefined);
      }
      const third = await append();
      const controller = new AbortController();
      const stream = events.follow(run.threadId, cursor, controller.signal);
      const received = [];
      try {
        while (cursor < third.seq) {
          const event = (await stream.next()).value!;
          received.push(event.id);
          cursor = event.seq;
        }
      } finally {
        controller.abort();
        await stream.return(undefined);
      }
      expect(received).toEqual(
        cut === "zero cursor"
          ? [first.id, second.id, third.id]
          : cut === "middle cursor"
            ? [second.id, third.id]
            : [third.id],
      );
    },
  );

  it.each(["completed replay", "ambiguous timeout", "concurrent claim", "foreign result"])(
    "G1 fake effect protects %s",
    async (cut) => {
      const { run } = await seed(cut);
      const key = `g1-effect:${run.id}`;
      const deps = { prisma: db.prisma, events: createThreadEvents(db.prisma) } as Parameters<
        typeof recordEffect
      >[0];
      const first = await recordEffect(deps, run, "synthetic.write", key, { fixture: true });
      let fakeCalls = 0;
      if (cut === "foreign result") {
        const other = await seed("foreign");
        await expect(recordEffect(deps, other.run, "synthetic.write", key, {})).rejects.toThrow(
          "does not belong",
        );
      } else {
        const claims = await Promise.all([
          claimIntendedEffect(db.prisma, first.effect.id),
          ...(cut === "concurrent claim" ? [claimIntendedEffect(db.prisma, first.effect.id)] : []),
        ]);
        for (const claimed of claims) if (claimed) fakeCalls++;
        expect(fakeCalls).toBe(1);
        if (cut === "ambiguous timeout") {
          await settleUncertainEffect(db.prisma, first.effect.id, "synthetic.write");
          expect(
            await completeExternalEffect(db.prisma, first.effect.id, "executing", { ok: true }),
          ).toBe(false);
        } else {
          expect(
            await completeExternalEffect(db.prisma, first.effect.id, "executing", { ok: true }),
          ).toBe(true);
        }
        const replay = await recordEffect(deps, run, "synthetic.write", key, { fixture: true });
        expect(replay.duplicate).toBe(true);
        expect(resolveDuplicateEffectGate(replay.effect, "synthetic.write").action).toBe("return");
        expect(await claimIntendedEffect(db.prisma, first.effect.id)).toBe(false);
        expect(fakeCalls).toBe(1);
      }
      expect(await db.prisma.externalEffect.count({ where: { idempotencyKey: key } })).toBe(1);
    },
  );

  it.each(["before-commit", "after-commit"])(
    "G1 actual SIGKILL %s retains atomic terminal state",
    async (cut) => {
      const { run, input } = await seed(cut);
      const child = fork(
        fileURLToPath(new URL("./fixtures/g1-finalize-child.ts", import.meta.url)),
        [],
        {
          execArgv: ["--import", path.join(platform, "node_modules/tsx/dist/loader.mjs")],
          env: {
            PATH: process.env.PATH,
            NODE_ENV: "test",
            DATABASE_URL: databaseUrl,
            ZERO_G1_CUT: cut,
            ZERO_G1_CHILD_INPUT: JSON.stringify(input),
            LOG_LEVEL: "off",
          },
          stdio: ["ignore", "ignore", "ignore", "ipc"],
        },
      );
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Child did not reach the committed boundary")),
            10_000,
          );
          child.once("message", (message) => {
            clearTimeout(timer);
            message === "boundary" ? resolve() : reject(new Error("Child boundary failed"));
          });
          child.once("exit", () => {
            clearTimeout(timer);
            reject(new Error("Child exited before boundary"));
          });
        });
        const exited = new Promise((resolve) =>
          child.once("exit", (code, signal) => resolve({ code, signal })),
        );
        child.kill("SIGKILL");
        expect(await exited).toEqual({ code: null, signal: "SIGKILL" });
        await expect
          .poll(
            async () =>
              (
                await db.pool.query(
                  "select count(*)::int as n from pg_stat_activity where datname=current_database() and state='idle in transaction'",
                )
              ).rows[0].n,
          )
          .toBe(0);
        const stored = await db.prisma.run.findUniqueOrThrow({ where: { id: run.id } });
        expect(stored.status).toBe(cut === "before-commit" ? "running" : "completed");
        expect(await finalizeRun(db.prisma, input)).toEqual(
          cut === "before-commit" ? { continuationRunId: null } : false,
        );
        expect(await db.prisma.message.count({ where: { runId: run.id } })).toBe(1);
        expect(
          await db.prisma.event.count({ where: { runId: run.id, type: "run.completed" } }),
        ).toBe(1);
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }
    },
  );

  async function restoredFixture() {
    if (!restored) {
      const { run, input } = await seed("backup");
      backupRunId = run.id;
      await finalizeRun(db.prisma, input);
      const bytes = Buffer.from("synthetic backup artifact\n");
      const store = new LocalArtifactStore(path.join(root, "original"));
      const stored = await store.put(
        { name: "fixture.txt", mimeType: "text/plain", bytes },
        context,
      );
      backupRow = await db.prisma.artifact.create({
        data: {
          spaceId,
          userId,
          runId: run.id,
          name: "fixture.txt",
          mimeType: "text/plain",
          storageKey: stored.id,
          size: bytes.length,
          hash: hash(bytes),
        },
      });
      // All fixture writers are quiesced; this is an application-consistent snapshot,
      // not a claim that the general live backup shell script is atomic.
      dump = docker([
        "pg_dump",
        "-U",
        "zero_g1_test",
        "-d",
        "zero_g1_test",
        "--no-owner",
        "--no-acl",
      ]);
      await cp(path.join(root, "original"), path.join(root, "backup"), { recursive: true });
      await db.pool.query(`CREATE DATABASE "${restoreName}"`);
      docker(
        [
          "psql",
          "-X",
          "-U",
          "zero_g1_test",
          "-d",
          restoreName,
          "-v",
          "ON_ERROR_STOP=1",
          "--single-transaction",
        ],
        dump,
      );
      const url = new URL(databaseUrl!);
      url.pathname = `/${restoreName}`;
      restored = createDb(url.toString(), { poolMax: 1 });
    }
    return restored;
  }
  it.each(["round trip", "missing blob", "changed blob", "foreign scope"])(
    "G1 DB and artifact restore detects %s",
    async (cut) => {
      const recovered = await restoredFixture();
      const directory = path.join(root, `restore-${cut.replaceAll(" ", "-")}`);
      await cp(path.join(root, "backup"), directory, { recursive: true });
      const row = await recovered.prisma.artifact.findUniqueOrThrow({
        where: { id: backupRow.id },
      });
      expect(row).toMatchObject({
        hash: backupRow.hash,
        storageKey: backupRow.storageKey,
        size: backupRow.size,
      });
      expect(
        (await recovered.prisma.run.findUniqueOrThrow({ where: { id: backupRunId } })).status,
      ).toBe("completed");
      expect(
        await recovered.prisma.event.count({
          where: { runId: backupRunId, type: "run.completed" },
        }),
      ).toBe(1);
      const file = path.join(directory, "artifacts", spaceId, row.storageKey);
      if (cut === "missing blob") await rm(file);
      if (cut === "changed blob") await writeFile(file, "modified synthetic bytes");
      const store = new LocalArtifactStore(directory);
      const load = async () => {
        const bytes = await store.get(
          row.storageKey,
          cut === "foreign scope" ? { ...context, spaceId: "foreign" } : context,
        );
        if (bytes.length !== row.size || hash(bytes) !== row.hash)
          throw new Error("Artifact integrity mismatch");
        return bytes;
      };
      if (cut === "round trip") expect(hash(await load())).toBe(row.hash);
      else await expect(load()).rejects.toThrow();
    },
  );
});
