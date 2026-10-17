import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { createStoredZeroJevResolver } from "./zero-jev-profile.js";
import { normalizeZeroJson } from "./zero-jev-worker.js";

const principal = {
  userId: "fixture-user",
  spaceId: "fixture-space",
  scopeId: "fixture-scope",
  policyRevision: "grant-v1",
  expiresAt: new Date(Date.now() + 60000).toISOString(),
};
const profile = {
  revision: "profile-v1",
  credentialId: "fixture-credential",
  model: "fixture/jev",
  payerAccountId: "shared-fixture-payer",
  lane: "routing",
  reserveUsdMicros: "10000",
  reserveTokens: "1000",
  timeoutMs: 1000,
  expiresAt: principal.expiresAt,
  enabled: true,
  allowTaskDataToOpenRouter: true,
  tools: ["csv.parse", "json.normalize"],
};
function setup() {
  const preference = {
    id: "fixture-preference",
    modelId: profile.model,
    updatedAt: new Date(0),
    credential: {
      id: profile.credentialId,
      userId: principal.userId,
      provider: "openrouter",
      secretId: "fixture-secret",
      updatedAt: new Date(0),
    },
  };
  const prisma = {
    spaceMember: { findUnique: vi.fn(async () => ({ id: "fixture-member" })) },
    spaceModelPreference: { findUnique: vi.fn(async () => preference) },
    secret: { findFirst: vi.fn(async () => ({ id: "fixture-secret", ciphertext: "fixture-ref" })) },
  };
  const load = vi.fn(async () => "fixture-not-a-key");
  const policy = vi.fn(async () => ({ ...profile }));
  const resolve = createStoredZeroJevResolver({
    prisma: prisma as unknown as PrismaClient,
    secretStore: { load },
    policy,
  });
  return { prisma, preference, load, policy, resolve };
}
describe("trusted stored Jev profile", () => {
  it("resolves scoped generic settings and secret, preserving the operator payer", async () => {
    const s = setup();
    const connection = await s.resolve(principal);
    expect(connection.profile.payerAccountId).toBe(profile.payerAccountId);
    expect(connection.apiKey).toBe("fixture-not-a-key");
    expect(connection.connectionDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(s.prisma.secret.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "fixture-secret", userId: principal.userId, spaceId: null },
      }),
    );
    expect(s.load).toHaveBeenCalledExactlyOnceWith("fixture-ref", "fixture-secret");
  });
  it.each(["disabled", "expired", "revoked", "recipient", "zero reserve", "unknown tool"])(
    "fails closed for %s operator policy",
    async (mode) => {
      const s = setup();
      const changed: Record<string, unknown> = { ...profile };
      if (mode === "disabled") changed.enabled = false;
      if (mode === "expired") changed.expiresAt = new Date(0).toISOString();
      if (mode === "recipient") changed.allowTaskDataToOpenRouter = false;
      if (mode === "zero reserve") changed.reserveUsdMicros = "0";
      if (mode === "unknown tool") changed.tools = ["shell"];
      s.policy.mockImplementation(async () => {
        if (mode === "revoked") throw new Error("private detail");
        return changed as typeof profile;
      });
      await expect(s.resolve(principal)).rejects.toThrow("Routing profile unavailable");
      expect(s.load).not.toHaveBeenCalled();
    },
  );
  it.each(["member", "model", "provider", "owner", "secret", "oauth"])(
    "denies invalid %s binding without leaking internals",
    async (mode) => {
      const s = setup();
      if (mode === "member") s.prisma.spaceMember.findUnique.mockResolvedValue(null as never);
      if (mode === "model") s.preference.modelId = "other-model";
      if (mode === "provider") s.preference.credential.provider = "codex";
      if (mode === "owner") s.preference.credential.userId = "other-user";
      if (mode === "secret") s.load.mockRejectedValue(new Error("private token marker"));
      if (mode === "oauth")
        s.load.mockResolvedValue(
          JSON.stringify({
            kind: "oauth",
            provider: "openai-codex",
            access: "fixture",
            refresh: "fixture",
            expires: 0,
          }),
        );
      await expect(s.resolve(principal)).rejects.toThrow("Routing profile unavailable");
    },
  );
  it("reopens policy and credentials on every check; rotation changes binding", async () => {
    const s = setup();
    const before = await s.resolve(principal);
    s.preference.credential.updatedAt = new Date(1);
    expect((await s.resolve(principal)).connectionDigest).not.toBe(before.connectionDigest);
    s.policy.mockRejectedValue(new Error("revoked"));
    await expect(s.resolve(principal)).rejects.toThrow("Routing profile unavailable");
    expect(s.policy).toHaveBeenCalledTimes(3);
  });
  it("rejects invalid finite expiry before a credential can dispatch", async () => {
    const s = setup();
    await expect(
      s.resolve({ ...principal, expiresAt: "2026-01-01T00:00:00+99:99" }),
    ).rejects.toThrow("Routing profile unavailable");
    expect(s.load).not.toHaveBeenCalled();
  });
});
describe("bounded deterministic JSON tool", () => {
  it("sorts nested keys, preserves array order and treats prototype-like keys as data", () => {
    expect(normalizeZeroJson('{"z":2,"a":{"z":1,"a":false},"__proto__":null}')).toMatchObject({
      output: '{"__proto__":null,"a":{"a":false,"z":1},"z":2}',
      verification: { outcome: "pass" },
    });
    expect(normalizeZeroJson("[2,1,null]")).toMatchObject({ output: "[2,1,null]" });
  });
  it.each([
    '{"a":}',
    "1e999",
    `${"[".repeat(10)}1${"]".repeat(10)}`,
    JSON.stringify(Array.from({ length: 129 }, () => 1)),
    "x".repeat(16385),
  ])("rejects unsupported or excessive JSON %i", (text) => {
    expect(() => normalizeZeroJson(text)).toThrow();
  });
});
