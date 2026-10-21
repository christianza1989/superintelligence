import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createZeroProjectPolicy, ZeroProjectPolicyError } from "./zero-project-policy.js";
import { ZERO_URL_DOCUMENT_PROFILE } from "./zero-url-document-contract.js";
import {
  ZERO_URL_DOCUMENT_RESOURCE_PROFILE,
  ZERO_URL_RESEARCH_PROFILE,
} from "./zero-url-research-contract.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
describe.skipIf(process.platform !== "linux")("trusted operator URL research policy", () => {
  it("reopens registry on each resolve and never mixes task URLs into principal", async () => {
    const root = await mkdtemp("/tmp/zero-research-policy-");
    roots.push(root);
    const file = path.join(root, "policy.json");
    const principal = {
      spaceId: "space",
      userId: "user",
      scopeId: "scope",
      policyRevision: "v1",
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    };
    const profile = {
      profile: ZERO_URL_RESEARCH_PROFILE,
      tasks: [
        { taskId: "hours", sourceId: "source", url: "https://research-fixture.example/hours" },
      ],
      runtime: {
        dockerExecutable: "/usr/bin/docker",
        dockerConfigDirectory: "/tmp/docker-profile",
        imageId: "sha256:" + "a".repeat(64),
        buildInputLockSha256: "b".repeat(64),
      },
    };
    const save = async (value: unknown) =>
      writeFile(
        file,
        JSON.stringify({ version: 1, grants: [{ ...principal, urlResearch: value }] }),
        { mode: 0o600 },
      );
    await save(profile);
    const policy = createZeroProjectPolicy(file);
    expect(await policy.resolve(principal, "scope")).toEqual(principal);
    expect(await policy.resolveUrlResearch(principal)).toEqual(profile);
    await save({
      ...profile,
      tasks: [{ ...profile.tasks[0], url: "https://research-fixture.example/new" }],
    });
    expect((await policy.resolveUrlResearch(principal))?.tasks[0]?.url).toBe(
      "https://research-fixture.example/new",
    );
    for (const changed of [
      { ...profile, testOnlyTransport: {} },
      { ...profile, tasks: [{ ...profile.tasks[0], url: "https://localhost/private" }] },
      { ...profile, runtime: { ...profile.runtime, dockerExecutable: "/mnt/private/docker" } },
      { ...profile, tasks: [...profile.tasks, ...profile.tasks] },
    ]) {
      await save(changed);
      await expect(policy.resolveUrlResearch(principal)).rejects.toBeInstanceOf(
        ZeroProjectPolicyError,
      );
    }
    await writeFile(file, JSON.stringify({ version: 1, grants: [principal] }));
    expect(await policy.resolveUrlResearch(principal)).toBeUndefined();
  });
  it("reopens the captured profile runner pins and rejects operator transport or resource overrides", async () => {
    const root = await mkdtemp("/tmp/zero-document-policy-");
    roots.push(root);
    const file = path.join(root, "policy.json");
    const principal = {
      spaceId: "space",
      userId: "user",
      scopeId: "scope",
      policyRevision: "v1",
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    };
    const profile = {
      profile: ZERO_URL_DOCUMENT_PROFILE,
      resourceProfile: ZERO_URL_DOCUMENT_RESOURCE_PROFILE,
      tasks: [
        {
          taskId: "hours",
          sourceId: "source",
          url: "https://research-fixture.example/hours",
          expectedSha256: "c".repeat(64),
        },
      ],
      runtime: {
        dockerExecutable: "/usr/bin/docker",
        dockerConfigDirectory: "/tmp/docker-profile",
        imageId: "sha256:" + "a".repeat(64),
        buildInputLockSha256: "b".repeat(64),
        runnerDirectory: "/tmp/document-release",
        runnerSha256: "d".repeat(64),
      },
    };
    const save = (value: unknown) =>
      writeFile(
        file,
        JSON.stringify({
          version: 1,
          grants: [{ ...principal, urlResearch: value }],
        }),
        { mode: 0o600 },
      );
    await save(profile);
    const policy = createZeroProjectPolicy(file);
    expect(await policy.resolve(principal, "scope")).toEqual(principal);
    expect(await policy.resolveUrlResearch(principal)).toEqual(profile);
    await save({ ...profile, runtime: { ...profile.runtime, runnerSha256: "e".repeat(64) } });
    const current = await policy.resolveUrlResearch(principal);
    expect(current?.profile).toBe(ZERO_URL_DOCUMENT_PROFILE);
    if (current?.profile !== ZERO_URL_DOCUMENT_PROFILE)
      throw new Error("Expected document profile");
    expect(current.runtime.runnerSha256).toBe("e".repeat(64));
    for (const changed of [
      { ...profile, resourceProfile: "unbounded" },
      { ...profile, resourceProfile: undefined },
      { ...profile, testOnlyTransport: { fetch: "override" } },
      { ...profile, runtime: { ...profile.runtime, runnerDirectory: "/mnt/private/release" } },
      { ...profile, runtime: { ...profile.runtime, runnerDirectory: "../release" } },
      { ...profile, runtime: { ...profile.runtime, runnerSha256: "not-a-pin" } },
      { ...profile, runtime: { ...profile.runtime, argv: ["caller"] } },
      { ...profile, tasks: [{ ...profile.tasks[0], url: "https://93.184.216.34/hours" }] },
    ]) {
      await save(changed);
      await expect(policy.resolveUrlResearch(principal)).rejects.toBeInstanceOf(
        ZeroProjectPolicyError,
      );
    }
  });
});
