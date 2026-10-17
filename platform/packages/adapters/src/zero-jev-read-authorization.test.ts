import type { ArtifactStore } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { IsolationError } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import type { ZeroCsvPrincipal } from "./zero-csv-preparation.js";
import { zeroCsvHash } from "./zero-csv-profile.js";
import type { ZeroJevConnection } from "./zero-jev-profile.js";
import { createZeroJevToolService, runZeroJevTool } from "./zero-jev-worker.js";

const principal: ZeroCsvPrincipal = {
  spaceId: "fixture-space",
  userId: "fixture-user",
  scopeId: "fixture-project",
  policyRevision: "grant-v1",
  expiresAt: new Date(Date.now() + 60000).toISOString(),
};
const jobId = "f5578b99-8ed1-42fc-81ef-f3e2fe3ab930";
const callId = "5674dcb2-1b90-459e-aea0-f7d1fab3cc0c";
const resolved: ZeroJevConnection = {
  profile: {
    revision: "fixture-profile-v1",
    credentialId: "fixture-credential",
    model: "fixture/jev",
    payerAccountId: "fixture-shared-payer",
    lane: "routing",
    reserveUsdMicros: "10000",
    reserveTokens: "100",
    timeoutMs: 1000,
    expiresAt: principal.expiresAt,
    enabled: true,
    allowTaskDataToOpenRouter: true,
    tools: ["csv.parse"],
  },
  connectionDigest: "a".repeat(64),
  apiKey: "fixture-never-live",
};
function setup() {
  const header = {
    principal,
    digest: "b".repeat(64),
    callId,
    model: resolved.profile.model,
    profileRevision: resolved.profile.revision,
    deadline: principal.expiresAt,
    profileDigest: zeroCsvHash(JSON.stringify(resolved.profile)),
    connectionDigest: resolved.connectionDigest,
  };
  const row = {
    id: jobId,
    name: "zero-jev-request.json",
    spaceId: principal.spaceId,
    userId: principal.userId,
    size: 100,
    storageKey: "private-request-bytes",
    hash: "c".repeat(64),
    description: JSON.stringify(header),
  };
  const get = vi.fn(async () => {
    throw new Error("Private input read forbidden");
  });
  const put = vi.fn(async (_input: { bytes: Uint8Array }) => ({ id: "staged-receipt" }));
  const remove = vi.fn(async () => {});
  const create = vi.fn(async (input: unknown) => input);
  const tx = {
    $queryRaw: vi.fn(async () => []),
    artifact: { findUnique: vi.fn(async () => null), create },
  };
  const prisma = {
    artifact: { findFirst: vi.fn(async () => row), findUnique: vi.fn(async () => null) },
    $transaction: async (run: (input: typeof tx) => Promise<unknown>) => run(tx),
  };
  const dispatch = vi.fn<typeof fetch>(async () => {
    throw new Error("Provider dispatch forbidden");
  });
  const resolve = vi.fn(async (_owner: ZeroCsvPrincipal): Promise<ZeroJevConnection> => {
    throw new IsolationError();
  });
  const deps = {
    prisma: prisma as unknown as PrismaClient,
    artifacts: { get, put, remove } as unknown as ArtifactStore,
    resolve,
    fetch: dispatch,
  };
  return { header, row, get, put, dispatch, resolve, deps };
}
describe("Jev metadata-first private request authorization", () => {
  it.each(["revoked", "expired", "changed-profile", "changed-credential", "legacy-header"])(
    "%s denies before private bytes and emits only metadata",
    async (mode) => {
      const s = setup();
      if (mode !== "revoked") s.resolve.mockResolvedValue(resolved);
      if (mode === "expired")
        s.header.principal = { ...principal, expiresAt: new Date(0).toISOString() };
      if (mode === "changed-profile") s.header.profileDigest = "d".repeat(64);
      if (mode === "changed-credential") s.header.connectionDigest = "d".repeat(64);
      s.row.description =
        mode === "legacy-header"
          ? JSON.stringify({ principal, digest: s.header.digest })
          : JSON.stringify(s.header);
      await runZeroJevTool(s.deps, jobId);
      expect(s.get).not.toHaveBeenCalled();
      expect(s.dispatch).not.toHaveBeenCalled();
      expect(s.put).toHaveBeenCalledOnce();
      const body = JSON.parse(Buffer.from(s.put.mock.calls[0]![0].bytes).toString());
      expect(body).toMatchObject({
        state: "blocked",
        reason: "project_scope_rejected",
        dispatchAttempts: 0,
        tool: null,
        usage: null,
      });
      expect(body).not.toHaveProperty("inputSha256");
      expect(body).not.toHaveProperty("input");
      expect(body).not.toHaveProperty("data");
    },
  );
  it("rejects foreign ownership before either private request or receipt reads", async () => {
    const s = setup();
    s.resolve.mockResolvedValue(resolved);
    const service = createZeroJevToolService(
      {
        ...s.deps,
        jobs: {
          enqueue: vi.fn(async () => {}),
          cancel: vi.fn(async () => {}),
          close: vi.fn(async () => {}),
        },
      },
      { ...principal, userId: "foreign-user" },
    );
    await expect(service.get(jobId)).rejects.toThrow();
    await expect(service.job(jobId)).rejects.toThrow();
    await expect(service.artifact(jobId)).rejects.toThrow();
    expect(s.get).not.toHaveBeenCalled();
    expect(s.dispatch).not.toHaveBeenCalled();
    expect(s.put).not.toHaveBeenCalled();
  });
});
