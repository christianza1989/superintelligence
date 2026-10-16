import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BudgetLimits, BudgetRequest } from "./zero-budget.js";
import { createBudgetAllocation, reserveBudgetInvocation } from "./zero-budget.js";

const enabled = process.env.VERIFY_DATABASE === "1" && process.env.DATABASE_URL;
const postgres = enabled ? describe.sequential : describe.skip;
const limits = (overrides: Partial<BudgetLimits> = {}): BudgetLimits => ({
  calls: 100,
  usdMicros: 10_000n,
  tokens: 10_000n,
  ...overrides,
});
const request = (
  accountId: string,
  invocationId: string,
  overrides: Partial<BudgetRequest> = {},
): BudgetRequest => ({
  accountId,
  invocationId,
  lane: "routing",
  usdMicros: 10n,
  tokens: 20n,
  ...overrides,
});

postgres("finite budget allocations (PostgreSQL)", () => {
  let pool: Pool;
  let other: Pool;
  beforeAll(() => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      !/^\/repositoryzero_verify_[a-f0-9]+$/.test(url.pathname)
    )
      throw new Error("Budget tests require the verifier's disposable loopback database.");
    pool = new Pool({ connectionString: url.toString(), max: 8 });
    other = new Pool({ connectionString: url.toString(), max: 8 });
  });
  afterAll(async () => {
    await Promise.all([pool?.end(), other?.end()]);
  });

  it("serializes concurrent reservations at the shared account limit", async () => {
    await createBudgetAllocation(pool, {
      accountId: "shared",
      total: limits({ calls: 3 }),
      lanes: { routing: limits(), coding: limits() },
    });
    const attempts = await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        reserveBudgetInvocation(
          i % 2 ? pool : other,
          request("shared", `parallel-${i}`, {
            lane: i % 2 ? "routing" : "coding",
          }),
        ),
      ),
    );
    expect(attempts.filter(Boolean)).toHaveLength(3);
    const { rows } = await other.query("SELECT * FROM zero_budget_accounts WHERE id = $1", [
      "shared",
    ]);
    expect(rows[0]).toMatchObject({
      reservedCalls: 3,
      reservedUsdMicros: "30",
      reservedTokens: "60",
    });
    const lanes = await pool.query(
      'SELECT sum("reservedCalls")::int AS calls FROM zero_budget_lanes WHERE "accountId" = $1',
      ["shared"],
    );
    expect(lanes.rows[0].calls).toBe(3);
  });

  it("rolls back the account debit when the lane or token ceiling denies", async () => {
    await createBudgetAllocation(pool, {
      accountId: "rollback",
      total: limits(),
      lanes: { routing: limits({ calls: 0 }), coding: limits({ tokens: 10n }), fail: limits() },
    });
    expect(await reserveBudgetInvocation(pool, request("rollback", "lane-denied"))).toBeNull();
    expect(
      await reserveBudgetInvocation(
        pool,
        request("rollback", "token-denied", {
          lane: "coding",
          tokens: 11n,
        }),
      ),
    ).toBeNull();
    // Fail after the account update to prove both debits and the invocation roll back.
    await pool.query(`
      CREATE FUNCTION zero_budget_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic write failure'; END $$;
      CREATE TRIGGER zero_budget_fixture_failure BEFORE UPDATE ON zero_budget_lanes
      FOR EACH ROW WHEN (OLD."accountId" = 'rollback' AND OLD.id = 'fail')
      EXECUTE FUNCTION zero_budget_fixture_failure();
    `);
    try {
      await expect(
        reserveBudgetInvocation(
          pool,
          request("rollback", "write-failed", {
            lane: "fail",
          }),
        ),
      ).rejects.toThrow("dispatch is not permitted");
    } finally {
      await pool.query(
        "DROP TRIGGER zero_budget_fixture_failure ON zero_budget_lanes; DROP FUNCTION zero_budget_fixture_failure()",
      );
    }
    const { rows } = await other.query("SELECT * FROM zero_budget_accounts WHERE id = $1", [
      "rollback",
    ]);
    expect(rows[0]).toMatchObject({
      reservedCalls: 0,
      reservedUsdMicros: "0",
      reservedTokens: "0",
    });
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM zero_budget_reservations WHERE "accountId" = $1',
          ["rollback"],
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it("admits one globally unique invocation across competing allocations", async () => {
    for (const accountId of ["duplicate-a", "duplicate-b"]) {
      await createBudgetAllocation(pool, {
        accountId,
        total: limits(),
        lanes: { routing: limits() },
      });
    }
    const attempts = await Promise.all([
      reserveBudgetInvocation(pool, request("duplicate-a", "global-invocation")),
      reserveBudgetInvocation(other, request("duplicate-b", "global-invocation")),
    ]);
    expect(attempts.filter(Boolean)).toHaveLength(1);
    for (const accountId of ["duplicate-a", "duplicate-b"]) {
      expect(
        await reserveBudgetInvocation(
          other,
          request(accountId, "global-invocation", {
            usdMicros: 1n,
            tokens: 1n,
          }),
        ),
      ).toBeNull();
    }
    const { rows } = await pool.query(
      'SELECT sum("reservedCalls")::int AS calls FROM zero_budget_accounts WHERE id = ANY($1)',
      [["duplicate-a", "duplicate-b"]],
    );
    expect(rows[0].calls).toBe(1);
  });

  it("retains held reservations after reconnect without restoring budget", async () => {
    await createBudgetAllocation(pool, {
      accountId: "retained",
      total: limits({ calls: 1 }),
      lanes: { routing: limits() },
    });
    const transient = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      const reservation = await reserveBudgetInvocation(
        transient,
        request("retained", "held-invocation"),
      );
      expect(reservation).not.toBeNull();
      await reservation!.hold();
      await reservation!.hold();
    } finally {
      await transient.end();
    }
    // An old date never makes an unresolved reservation refundable.
    await pool.query(
      'UPDATE zero_budget_reservations SET "createdAt" = $1 WHERE "invocationId" = $2',
      ["2000-01-01T00:00:00Z", "held-invocation"],
    );
    const reconnected = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      const { rows } = await reconnected.query(
        'SELECT state, "heldAt" FROM zero_budget_reservations WHERE "invocationId" = $1',
        ["held-invocation"],
      );
      expect(rows[0].state).toBe("held");
      expect(rows[0].heldAt).toBeInstanceOf(Date);
      expect(
        await reserveBudgetInvocation(reconnected, request("retained", "held-invocation")),
      ).toBeNull();
      expect(
        await reserveBudgetInvocation(reconnected, request("retained", "new-after-reconnect")),
      ).toBeNull();
      await expect(
        createBudgetAllocation(reconnected, {
          accountId: "retained",
          total: limits(),
          lanes: { routing: limits() },
        }),
      ).rejects.toBeDefined();
      const counter = await reconnected.query(
        'SELECT "reservedCalls" FROM zero_budget_accounts WHERE id = $1',
        ["retained"],
      );
      expect(counter.rows[0].reservedCalls).toBe(1);
    } finally {
      await reconnected.end();
    }
  });

  it("denies unconfigured and zero allocations before any debit", async () => {
    expect(
      await reserveBudgetInvocation(pool, request("not-configured", "missing-allocation")),
    ).toBeNull();
    await createBudgetAllocation(pool, {
      accountId: "zero",
      total: limits({ calls: 0, usdMicros: 0n, tokens: 0n }),
      lanes: { routing: limits() },
    });
    expect(await reserveBudgetInvocation(pool, request("zero", "zero-allocation"))).toBeNull();
    await createBudgetAllocation(pool, {
      accountId: "invalid",
      total: limits(),
      lanes: { routing: limits() },
    });
    for (const override of [
      { usdMicros: 0n },
      { usdMicros: -1n },
      { tokens: 0n },
      { tokens: 9_223_372_036_854_775_808n },
      { lane: "not-granted" },
    ]) {
      expect(
        await reserveBudgetInvocation(pool, request("invalid", "invalid-input", override)),
      ).toBeNull();
    }
    await pool.query("UPDATE zero_budget_accounts SET enabled = false WHERE id = $1", ["invalid"]);
    expect(
      await reserveBudgetInvocation(pool, request("invalid", "disabled-allocation")),
    ).toBeNull();
    const { rows } = await pool.query(
      'SELECT sum("reservedCalls")::int AS calls FROM zero_budget_accounts WHERE id = ANY($1)',
      [["zero", "invalid"]],
    );
    expect(rows[0].calls).toBe(0);
    await expect(
      createBudgetAllocation(pool, {
        accountId: "bad-amount",
        total: limits({ usdMicros: 9_223_372_036_854_775_808n }),
        lanes: { routing: limits() },
      }),
    ).rejects.toThrow("Invalid finite budget limits");
  });

  it("keeps monetary reservations within the finite account ceiling", async () => {
    await createBudgetAllocation(pool, {
      accountId: "money",
      total: limits({ usdMicros: 25n }),
      lanes: { routing: limits() },
    });
    const attempts = await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        reserveBudgetInvocation(i % 2 ? pool : other, request("money", `money-${i}`)),
      ),
    );
    expect(attempts.filter(Boolean)).toHaveLength(2);
    expect(
      await reserveBudgetInvocation(pool, request("money", "exceeds-remainder", { usdMicros: 6n })),
    ).toBeNull();
    expect(
      await reserveBudgetInvocation(pool, request("money", "exact-remainder", { usdMicros: 5n })),
    ).not.toBeNull();
    const { rows } = await other.query(
      'SELECT "reservedUsdMicros", "reservedCalls" FROM zero_budget_accounts WHERE id = $1',
      ["money"],
    );
    expect(rows[0]).toMatchObject({ reservedUsdMicros: "25", reservedCalls: 3 });
  });
});
