/**
 * Server-only finite allocations, shared by all workers using one account ID.
 * Reservations are conservative debits, not provider invoices. No expiry,
 * automatic refund, billing reconciliation or paid-provider activation here.
 */
import type { Pool, PoolClient } from "pg";

export type BudgetLimits = Readonly<{
  calls: number;
  usdMicros: bigint;
  tokens: bigint;
}>;
export type BudgetRequest = Readonly<{
  accountId: string;
  lane: string;
  invocationId: string;
  usdMicros: bigint;
  tokens: bigint;
}>;
export type BudgetReservation = { invocationId: string; hold: () => Promise<void> };
type AllocationRow = {
  enabled: boolean;
  callLimit: number;
  usdLimitMicros: string;
  tokenLimit: string;
  reservedCalls: number;
  reservedUsdMicros: string;
  reservedTokens: string;
};
const MAX_BIGINT = 9_223_372_036_854_775_807n;
const validId = (id: string) => typeof id === "string" && /^[a-zA-Z0-9_.:-]{1,128}$/.test(id);
const validAmount = (value: bigint) =>
  typeof value === "bigint" && value >= 0n && value <= MAX_BIGINT;

function validateLimits(limits: BudgetLimits): void {
  if (
    !Number.isSafeInteger(limits.calls) ||
    limits.calls < 0 ||
    limits.calls > 2_147_483_647 ||
    !validAmount(limits.usdMicros) ||
    !validAmount(limits.tokens)
  )
    throw new Error("Invalid finite budget limits.");
}

async function transaction<T>(pool: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let failed = false;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    failed = true;
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release(failed);
  }
}

/** Trusted composition/operator entry point. Never expose as an agent tool. */
export async function createBudgetAllocation(
  pool: Pool,
  input: {
    accountId: string;
    total: BudgetLimits;
    lanes: Readonly<Record<string, BudgetLimits>>;
  },
): Promise<void> {
  if (!validId(input.accountId) || !Object.keys(input.lanes).length)
    throw new Error("Invalid budget allocation.");
  validateLimits(input.total);
  for (const [lane, limits] of Object.entries(input.lanes)) {
    if (!validId(lane)) throw new Error("Invalid budget lane.");
    validateLimits(limits);
  }
  // Copy before waiting: mutable caller objects cannot alter an allocation mid-transaction.
  const accountId = input.accountId;
  const total = { ...input.total };
  const lanes = Object.entries(input.lanes).map(([lane, limits]) => [lane, { ...limits }] as const);
  await transaction(pool, async (client) => {
    // Insert-only: repeated startup must never reset consumed counters or replace policy.
    await client.query(
      `INSERT INTO zero_budget_accounts (id, "callLimit", "usdLimitMicros", "tokenLimit")
       VALUES ($1, $2, $3, $4)`,
      [accountId, total.calls, total.usdMicros.toString(), total.tokens.toString()],
    );
    for (const [lane, limits] of lanes) {
      await client.query(
        `INSERT INTO zero_budget_lanes ("accountId", id, "callLimit", "usdLimitMicros", "tokenLimit")
         VALUES ($1, $2, $3, $4, $5)`,
        [accountId, lane, limits.calls, limits.usdMicros.toString(), limits.tokens.toString()],
      );
    }
  });
}

function fits(row: AllocationRow, request: BudgetRequest): boolean {
  return (
    row.enabled &&
    row.reservedCalls < row.callLimit &&
    request.usdMicros <= BigInt(row.usdLimitMicros) - BigInt(row.reservedUsdMicros) &&
    request.tokens <= BigInt(row.tokenLimit) - BigInt(row.reservedTokens)
  );
}

/** A successful result is granted once; a retry must never dispatch again. */
export async function reserveBudgetInvocation(
  pool: Pool,
  request: BudgetRequest,
): Promise<BudgetReservation | null> {
  request = { ...request };
  if (
    !validId(request.accountId) ||
    !validId(request.lane) ||
    !validId(request.invocationId) ||
    !validAmount(request.usdMicros) ||
    request.usdMicros === 0n ||
    !validAmount(request.tokens) ||
    request.tokens === 0n
  )
    return null;
  let admitted: boolean;
  try {
    admitted = await transaction(pool, async (client) => {
      // Every writer takes account then lane. One shared account lock serializes
      // competing routing/coding workers, including calls from separate pools.
      const account = await client.query<AllocationRow>(
        `SELECT * FROM zero_budget_accounts WHERE id = $1 FOR UPDATE`,
        [request.accountId],
      );
      if (!account.rows[0] || !fits(account.rows[0], request)) return false;
      const lane = await client.query<AllocationRow>(
        `SELECT * FROM zero_budget_lanes WHERE "accountId" = $1 AND id = $2 FOR UPDATE`,
        [request.accountId, request.lane],
      );
      if (!lane.rows[0] || !fits(lane.rows[0], request)) return false;
      const inserted = await client.query(
        `INSERT INTO zero_budget_reservations
           ("invocationId", "accountId", "laneId", "usdMicros", tokens)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT ("invocationId") DO NOTHING`,
        [
          request.invocationId,
          request.accountId,
          request.lane,
          request.usdMicros.toString(),
          request.tokens.toString(),
        ],
      );
      if (inserted.rowCount !== 1) return false;
      await client.query(
        `UPDATE zero_budget_accounts SET "reservedCalls" = "reservedCalls" + 1,
          "reservedUsdMicros" = "reservedUsdMicros" + $2, "reservedTokens" = "reservedTokens" + $3
         WHERE id = $1`,
        [request.accountId, request.usdMicros.toString(), request.tokens.toString()],
      );
      await client.query(
        `UPDATE zero_budget_lanes SET "reservedCalls" = "reservedCalls" + 1,
          "reservedUsdMicros" = "reservedUsdMicros" + $3, "reservedTokens" = "reservedTokens" + $4
         WHERE "accountId" = $1 AND id = $2`,
        [request.accountId, request.lane, request.usdMicros.toString(), request.tokens.toString()],
      );
      return true;
    });
  } catch {
    // A lost commit acknowledgement is ambiguous. Do not retry or mint a permit.
    throw new Error("Budget reservation unavailable; dispatch is not permitted.");
  }
  if (!admitted) return null;
  const snapshot = request;
  return {
    invocationId: snapshot.invocationId,
    hold: async () => {
      const result = await pool.query(
        `UPDATE zero_budget_reservations SET state = 'held', "heldAt" = COALESCE("heldAt", clock_timestamp())
         WHERE "invocationId" = $1 AND "accountId" = $2 AND "laneId" = $3`,
        [snapshot.invocationId, snapshot.accountId, snapshot.lane],
      );
      if (result.rowCount !== 1)
        throw new Error("Budget receipt is unavailable; retain the debit.");
    },
  };
}
