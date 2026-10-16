-- Conservative finite allocations. No automatic expiry, refund or budget reset.
CREATE TABLE "zero_budget_accounts" (
  "id" TEXT PRIMARY KEY,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "callLimit" INTEGER NOT NULL CHECK ("callLimit" >= 0),
  "usdLimitMicros" BIGINT NOT NULL CHECK ("usdLimitMicros" >= 0),
  "tokenLimit" BIGINT NOT NULL CHECK ("tokenLimit" >= 0),
  "reservedCalls" INTEGER NOT NULL DEFAULT 0 CHECK ("reservedCalls" >= 0 AND "reservedCalls" <= "callLimit"),
  "reservedUsdMicros" BIGINT NOT NULL DEFAULT 0 CHECK ("reservedUsdMicros" >= 0 AND "reservedUsdMicros" <= "usdLimitMicros"),
  "reservedTokens" BIGINT NOT NULL DEFAULT 0 CHECK ("reservedTokens" >= 0 AND "reservedTokens" <= "tokenLimit"),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "zero_budget_lanes" (
  "accountId" TEXT NOT NULL REFERENCES "zero_budget_accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "callLimit" INTEGER NOT NULL CHECK ("callLimit" >= 0),
  "usdLimitMicros" BIGINT NOT NULL CHECK ("usdLimitMicros" >= 0),
  "tokenLimit" BIGINT NOT NULL CHECK ("tokenLimit" >= 0),
  "reservedCalls" INTEGER NOT NULL DEFAULT 0 CHECK ("reservedCalls" >= 0 AND "reservedCalls" <= "callLimit"),
  "reservedUsdMicros" BIGINT NOT NULL DEFAULT 0 CHECK ("reservedUsdMicros" >= 0 AND "reservedUsdMicros" <= "usdLimitMicros"),
  "reservedTokens" BIGINT NOT NULL DEFAULT 0 CHECK ("reservedTokens" >= 0 AND "reservedTokens" <= "tokenLimit"),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("accountId", "id")
);

CREATE TABLE "zero_budget_reservations" (
  "invocationId" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "laneId" TEXT NOT NULL,
  "usdMicros" BIGINT NOT NULL CHECK ("usdMicros" > 0),
  "tokens" BIGINT NOT NULL CHECK ("tokens" > 0),
  "state" TEXT NOT NULL DEFAULT 'reserved' CHECK ("state" IN ('reserved', 'held')),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "heldAt" TIMESTAMPTZ(3),
  FOREIGN KEY ("accountId", "laneId") REFERENCES "zero_budget_lanes" ("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "zero_budget_reservations_accountId_createdAt_idx" ON "zero_budget_reservations" ("accountId", "createdAt");
