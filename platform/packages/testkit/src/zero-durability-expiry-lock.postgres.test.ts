import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createDb, finalizeRun } from "@rakazo/db";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
const qualified = process.env.VERIFY_ZERO_G1 === "1" && databaseUrl ? describe : describe.skip;

qualified("additional G1 lease expiry lock control", () => {
  it("rejects a terminal commit whose lease expires while waiting for the run row lock", async () => {
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

    const db = createDb(databaseUrl!, { poolMax: 4, applicationName: "zero-g1-expiry-lock" });
    const id = randomUUID();
    const connect = () => db.pool.connect();
    let lock: Awaited<ReturnType<typeof connect>> | undefined;
    let finalizing: ReturnType<typeof finalizeRun> | undefined;
    try {
      await db.prisma.organization.create({
        data: { id, name: "Synthetic lock fixture", slug: id, createdAt: new Date() },
      });
      await db.prisma.space.create({
        data: { id, organizationId: id, name: "Synthetic lock fixture" },
      });
      const bot = await db.prisma.bot.create({
        data: { spaceId: id, userId: id, name: "Fixture", color: "fixture" },
      });
      const thread = await db.prisma.thread.create({
        data: { spaceId: id, userId: id, botId: bot.id },
      });
      const task = await db.prisma.task.create({
        data: {
          spaceId: id,
          userId: id,
          botId: bot.id,
          threadId: thread.id,
          status: "queued",
          prompt: "Synthetic lock-wait finalization",
        },
      });
      const expiry: Date = (
        await db.pool.query("select clock_timestamp() + interval '2 seconds' as expiry")
      ).rows[0].expiry;
      const run = await db.prisma.run.create({
        data: {
          spaceId: id,
          userId: id,
          botId: bot.id,
          threadId: thread.id,
          taskId: task.id,
          status: "running",
          trigger: "user",
          leaseOwner: "expiry-fixture-worker",
          leaseFence: 4,
          leaseExpiresAt: expiry,
          startedAt: new Date(),
        },
      });
      const attempt = await db.prisma.attempt.create({
        data: { runId: run.id, fence: 4, status: "running" },
      });
      lock = await db.pool.connect();
      await lock.query("BEGIN");
      await lock.query("SELECT id FROM runs WHERE id = $1 FOR UPDATE", [run.id]);
      const lockPid = (await lock.query("select pg_backend_pid() as pid")).rows[0].pid;
      finalizing = finalizeRun(db.prisma, {
        spaceId: id,
        threadId: thread.id,
        botId: bot.id,
        runId: run.id,
        taskId: task.id,
        attemptId: attempt.id,
        leaseOwner: "expiry-fixture-worker",
        leaseFence: 4,
        outcome: "completed",
        blocks: [{ kind: "text", text: "must never commit after expiry" }],
      });
      // Prove a real SQL lock wait, rather than relying on an arbitrary sleep.
      await expect
        .poll(
          async () =>
            (
              await db.pool.query(
                "select count(*)::int as n from pg_stat_activity where application_name='zero-g1-expiry-lock' and wait_event_type='Lock' and pid <> $1",
                [lockPid],
              )
            ).rows[0].n,
          { timeout: 1000, interval: 10 },
        )
        .toBe(1);
      expect(
        (await db.pool.query("select clock_timestamp() < $1::timestamptz as live", [expiry]))
          .rows[0].live,
      ).toBe(true);
      await expect
        .poll(
          async () =>
            (
              await db.pool.query("select clock_timestamp() >= $1::timestamptz as expired", [
                expiry,
              ])
            ).rows[0].expired,
          { timeout: 4000, interval: 20 },
        )
        .toBe(true);
      await lock.query("COMMIT");
      lock.release();
      lock = undefined;
      expect(await finalizing).toBe(false);
      expect(await db.prisma.run.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({
        status: "running",
        leaseOwner: "expiry-fixture-worker",
        leaseFence: 4,
      });
      expect(
        await db.prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } }),
      ).toMatchObject({ status: "running", finishedAt: null });
      expect(await db.prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
        status: "queued",
      });
      expect(await db.prisma.message.count({ where: { runId: run.id } })).toBe(0);
      expect(await db.prisma.event.count({ where: { runId: run.id } })).toBe(0);
    } finally {
      if (lock) {
        await lock.query("ROLLBACK");
        lock.release();
      }
      await finalizing?.catch(() => undefined);
      await db.prisma.$disconnect();
      await db.pool.end();
    }
  });
});
