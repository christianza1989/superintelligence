import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createZeroProjectPolicy } from "./zero-project-policy.js";

const principal = {
  spaceId: "fixture-space",
  userId: "fixture-user",
  scopeId: "fixture-project",
  policyRevision: "fixture-grant-v1",
  expiresAt: new Date(Date.now() + 60000).toISOString(),
};
const profile = {
  revision: "fixture-jev-v1",
  credentialId: "fixture-credential",
  model: "fixture/jev",
  payerAccountId: "fixture-shared-payer",
  lane: "routing",
  reserveUsdMicros: "10000",
  reserveTokens: "1000",
  timeoutMs: 1000,
  expiresAt: principal.expiresAt,
  enabled: true,
  allowTaskDataToOpenRouter: true,
  tools: ["csv.parse", "json.normalize"],
};
const linux = process.platform === "linux" ? describe : describe.skip;
linux("shared project policy optional Jev grant", () => {
  let directory: string, file: string;
  const write = async (grant: unknown) =>
    writeFile(file, JSON.stringify({ version: 1, grants: [grant] }), { mode: 0o600 });
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "zero-jev-policy-"));
    file = path.join(directory, "operator.json");
  });
  afterEach(async () => rm(directory, { recursive: true, force: true }));
  it("keeps principal identity separate from trusted model/account settings", async () => {
    await write({ ...principal, jev: profile });
    const policy = createZeroProjectPolicy(file);
    const actual = await policy.resolve(principal, principal.scopeId);
    expect(actual).toEqual(principal);
    expect(Object.keys(actual)).toHaveLength(5);
    await expect(policy.authorize(actual)).resolves.toBeUndefined();
    expect(await policy.resolveJev(actual)).toEqual(profile);
    await expect(
      policy.authorize({ ...actual, payerAccountId: "tool-supplied" } as typeof actual),
    ).rejects.toThrow();
  });
  it("missing Jev never enables paid execution while ordinary scope authorization works", async () => {
    await write(principal);
    const policy = createZeroProjectPolicy(file);
    await expect(policy.authorize(principal)).resolves.toBeUndefined();
    await expect(policy.resolveJev(principal)).rejects.toThrow();
  });
  it.each(["delete", "revision", "expiry", "revoke-profile"])(
    "rechecks %s without cached success",
    async (mode) => {
      await write({ ...principal, jev: profile });
      const policy = createZeroProjectPolicy(file);
      await policy.resolveJev(principal);
      if (mode === "delete") await unlink(file);
      else if (mode === "revision")
        await write({ ...principal, policyRevision: "fixture-grant-v2", jev: profile });
      else if (mode === "expiry")
        await write({ ...principal, jev: { ...profile, expiresAt: new Date(0).toISOString() } });
      else await write(principal);
      await expect(policy.resolveJev(principal)).rejects.toThrow(
        "Project policy unavailable or scope denied",
      );
    },
  );
  it.each([
    { enabled: false },
    { reserveUsdMicros: "0" },
    { apiKey: "host-subscription-marker" },
    { allowTaskDataToOpenRouter: false },
    { tools: ["shell"] },
  ])("fails closed for invalid operator profile %j", async (invalid) => {
    await write({ ...principal, jev: { ...profile, ...invalid } });
    const policy = createZeroProjectPolicy(file);
    await expect(policy.resolveJev(principal)).rejects.toThrow(
      "Project policy unavailable or scope denied",
    );
  });
});
