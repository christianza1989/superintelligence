import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createZeroProjectPolicy, ZeroProjectPolicyError } from "./zero-project-policy.js";
import {
  ZERO_CSV_APPLICATION_PROFILE,
  ZERO_CSV_APPLICATION_RECIPE,
} from "./zero-csv-application-contract.js";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
describe.skipIf(process.platform !== "linux")("application operator policy", () => {
  it("loads exact installed attribution and reopens the operator binding", async () => {
    const root = await mkdtemp("/tmp/zero-application-policy-");
    roots.push(root);
    const file = path.join(root, "policy.json");
    const principal = {
      spaceId: "space",
      userId: "owner",
      scopeId: "scope",
      policyRevision: "v1",
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    };
    const application = {
      profile: ZERO_CSV_APPLICATION_PROFILE,
      recipe: ZERO_CSV_APPLICATION_RECIPE,
      runtime: {
        dockerExecutable: "/usr/bin/docker",
        dockerConfigDirectory: "/tmp/empty-config",
        imageId: "sha256:" + "a".repeat(64),
        buildInputLockSha256: "b".repeat(64),
      },
    };
    const save = (csvApplication: unknown) =>
      writeFile(file, JSON.stringify({ version: 1, grants: [{ ...principal, csvApplication }] }), {
        mode: 0o600,
      });
    await save(application);
    const policy = createZeroProjectPolicy(file);
    const first = await policy.resolveApplication(principal);
    expect(first?.runtime.attribution).toEqual({
      license: await readFile(new URL("../../../../LICENSE", import.meta.url), "utf8"),
      notice: await readFile(new URL("../../../../NOTICE", import.meta.url), "utf8"),
    });
    expect(await policy.resolve(principal, "scope")).toEqual(principal);
    await save({
      ...application,
      runtime: { ...application.runtime, imageId: "sha256:" + "c".repeat(64) },
    });
    expect((await policy.resolveApplication(principal))?.runtime.imageId).toBe(
      "sha256:" + "c".repeat(64),
    );
    for (const invalid of [
      { ...application, command: "anything" },
      { ...application, recipe: "general-installer" },
      {
        ...application,
        runtime: { ...application.runtime, dockerExecutable: "/mnt/private/docker" },
      },
      {
        ...application,
        runtime: {
          ...application.runtime,
          attribution: { license: "Apache License\nVersion 2.0 fabricated", notice: "fabricated" },
        },
      },
    ]) {
      await save(invalid);
      await expect(policy.resolveApplication(principal)).rejects.toBeInstanceOf(
        ZeroProjectPolicyError,
      );
    }
  });
});
