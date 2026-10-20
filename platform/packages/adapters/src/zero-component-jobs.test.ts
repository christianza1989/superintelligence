import { randomUUID } from "node:crypto";
import { IsolationError } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import type { ZeroComponentFamily, ZeroComponentHeader } from "./zero-component-jobs.js";
import {
  assertZeroComponentActive,
  createZeroComponentReader,
  loadZeroComponentHeader,
  loadZeroComponentRequest,
  publishZeroComponent,
  submitZeroComponent,
  zeroComponentDigest,
  zeroComponentHash,
} from "./zero-component-jobs.js";
import { ZERO_CSV_PROFILE } from "./zero-csv-profile.js";
import { ZERO_PDF_PROFILE } from "./zero-pdf-contract.js";

const families = [
  ["csv", "zero.csv.request.v1", ZERO_CSV_PROFILE, "zero-csv-request.json"],
  ["research", "zero.research.request.v1", "zero-url-research-v1", "zero-research-request.json"],
  ["browser", "zero.browser.request.v1", "zero-browser-static-v1", "zero-browser-request.json"],
  ["pdf", "zero.pdf.request.v1", ZERO_PDF_PROFILE, "zero-pdf-request.json"],
] as const;
function fixture(family: ZeroComponentFamily = "csv") {
  const now = Date.now();
  const principal = {
    spaceId: "space",
    userId: "user",
    scopeId: "scope",
    policyRevision: "revision",
    expiresAt: new Date(now + 120_000).toISOString(),
  };
  const entry = families.find(([key]) => key === family)!;
  const body = {
    principal,
    kind: entry[1],
    profile: entry[2],
    deadline: new Date(now + 60_000).toISOString(),
  };
  const request = { ...body, requestDigest: zeroComponentDigest(body) };
  const bytes = Buffer.from(JSON.stringify(request));
  const id = randomUUID();
  const row = {
    id,
    spaceId: "space",
    userId: "user",
    name: entry[3],
    version: 1,
    mimeType: "application/json",
    size: bytes.length,
    hash: zeroComponentHash(bytes),
    storageKey: randomUUID(),
    description: JSON.stringify({ ...request, principal }),
  };
  let receipt: unknown = null;
  const prisma = {
    spaceMember: { findUnique: vi.fn(async () => ({ id: "membership" }) as unknown) },
    artifact: {
      findFirst: vi.fn(async () => row),
      findUnique: vi.fn(async () => receipt),
      findMany: vi.fn(async (_query: unknown) => [] as unknown[]),
      findUniqueOrThrow: vi.fn(async () => row),
      create: vi.fn(async ({ data }: { data: object }) => ({ ...data, id: randomUUID() })),
    },
    $queryRaw: vi.fn(async () => [{ now: new Date(now) }] as unknown),
    $transaction: async <T>(action: (db: unknown) => Promise<T>): Promise<T> => action(prisma),
  };
  const artifacts = {
    get: vi.fn(async () => bytes),
    put: vi.fn(async () => ({ id: randomUUID() })),
    remove: vi.fn(async () => undefined),
  };
  const authorize = vi.fn(async () => undefined);
  const jobs = { enqueue: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined) };
  const deps = { prisma, artifacts, authorize, jobs };
  return {
    now,
    principal,
    request,
    bytes,
    id,
    row,
    deps,
    setReceipt: (value: unknown) => {
      receipt = value;
    },
  };
}
describe("fixed component lifecycle boundaries", () => {
  it.each(families)("rechecks %s authorization after private request reads", async (family) => {
    const f = fixture(family);
    f.deps.artifacts.get.mockImplementation(async () => {
      f.deps.authorize.mockRejectedValue(new IsolationError());
      return f.bytes;
    });
    await expect(
      loadZeroComponentRequest(
        f.deps as never,
        family,
        f.id,
        f.principal,
        (value) => value as ZeroComponentHeader,
      ),
    ).rejects.toBeInstanceOf(IsolationError);
  });
  it.each(families)("rechecks %s authorization after private receipt reads", async (family) => {
    const f = fixture(family);
    const bytes = Buffer.from(JSON.stringify({ privateResult: "fixture" }));
    const storageKey = randomUUID();
    f.setReceipt({
      id: randomUUID(),
      rootArtifactId: f.id,
      version: 2,
      name: `zero-${family}-receipt.json`,
      mimeType: "application/json",
      size: bytes.length,
      hash: zeroComponentHash(bytes),
      storageKey,
    });
    f.deps.artifacts.get.mockImplementation(async (key?: string) => {
      if (key !== storageKey) return f.bytes;
      f.deps.authorize.mockRejectedValue(new IsolationError());
      return bytes;
    });
    const reader = createZeroComponentReader(
      f.deps as never,
      family,
      f.principal,
      (value) => value as ZeroComponentHeader,
    );
    await expect(reader.artifact(f.id)).rejects.toBeInstanceOf(IsolationError);
  });
  it.each(families)("rechecks %s authorization after receipt metadata reads", async (family) => {
    const f = fixture(family);
    f.deps.prisma.artifact.findUnique.mockImplementation(async () => {
      f.deps.authorize.mockRejectedValue(new IsolationError());
      return {
        id: randomUUID(),
        rootArtifactId: f.id,
        version: 2,
        name: `zero-${family}-receipt.json`,
        mimeType: "application/json",
        description: JSON.stringify({ state: "succeeded" }),
      };
    });
    const reader = createZeroComponentReader(
      f.deps as never,
      family,
      f.principal,
      (value) => value as ZeroComponentHeader,
    );
    await expect(reader.get(f.id)).rejects.toBeInstanceOf(IsolationError);
  });
  it.each(families)("rechecks %s authorization after queue state reads", async (family) => {
    const f = fixture(family);
    f.deps.prisma.$queryRaw.mockImplementation(async () => {
      f.deps.authorize.mockRejectedValue(new IsolationError());
      return [{ attempts: 0, max_attempts: 3, locked_at: null }];
    });
    const reader = createZeroComponentReader(
      f.deps as never,
      family,
      f.principal,
      (value) => value as ZeroComponentHeader,
    );
    await expect(reader.get(f.id)).rejects.toBeInstanceOf(IsolationError);
  });
  it.each(families)("checks %s metadata ownership before private input I/O", async (family) => {
    const f = fixture(family);
    await expect(
      loadZeroComponentRequest(
        f.deps as never,
        family,
        f.id,
        { ...f.principal, scopeId: "foreign" },
        (value) => value as ZeroComponentHeader,
      ),
    ).rejects.toBeInstanceOf(IsolationError);
    expect(f.deps.artifacts.get).not.toHaveBeenCalled();
    expect(f.deps.authorize).not.toHaveBeenCalled();
  });
  it.each(families)(
    "requires current membership for %s before private input I/O",
    async (family) => {
      const f = fixture(family);
      f.deps.prisma.spaceMember.findUnique.mockResolvedValue(null);
      await expect(
        loadZeroComponentRequest(
          f.deps as never,
          family,
          f.id,
          f.principal,
          (value) => value as ZeroComponentHeader,
        ),
      ).rejects.toBeInstanceOf(IsolationError);
      expect(f.deps.artifacts.get).not.toHaveBeenCalled();
    },
  );
  it.each(families)("rejects %s stored input corruption", async (family) => {
    const f = fixture(family);
    f.deps.artifacts.get.mockResolvedValue(Buffer.from("corrupt"));
    await expect(
      loadZeroComponentRequest(
        f.deps as never,
        family,
        f.id,
        f.principal,
        (value) => value as ZeroComponentHeader,
      ),
    ).rejects.toThrow("request_artifact_integrity_failed");
  });
  it("does not accept a kind from another fixed family", async () => {
    const f = fixture();
    f.row.description = JSON.stringify({ ...f.request, kind: "zero.pdf.request.v1" });
    await expect(
      loadZeroComponentHeader(f.deps as never, "csv", f.id, f.principal),
    ).rejects.toBeInstanceOf(IsolationError);
    expect(f.deps.artifacts.get).not.toHaveBeenCalled();
  });
  it("fails closed on a non-finite database clock before dispatch", async () => {
    const f = fixture();
    f.deps.prisma.$queryRaw.mockResolvedValue([{ now: new Date(NaN) }]);
    await expect(
      assertZeroComponentActive(f.deps as never, "csv", f.id, f.request),
    ).rejects.toThrow("job_clock_unavailable");
  });
  it("uses database time to reject an expired job before dispatch", async () => {
    const f = fixture();
    f.deps.prisma.$queryRaw.mockResolvedValue([{ now: new Date(f.now + 61_000) }]);
    await expect(
      assertZeroComponentActive(f.deps as never, "csv", f.id, f.request),
    ).rejects.toThrow("job_deadline_exceeded");
  });
  it("rechecks the grant after successful output storage and removes staged output", async () => {
    const f = fixture();
    f.deps.artifacts.put.mockImplementation(async () => {
      f.deps.authorize.mockRejectedValue(new IsolationError());
      return { id: randomUUID() };
    });
    await expect(
      publishZeroComponent(f.deps as never, "csv", f.id, f.request, "succeeded", {
        startedAt: new Date(f.now).toISOString(),
      }),
    ).rejects.toBeInstanceOf(IsolationError);
    expect(f.deps.prisma.artifact.create).not.toHaveBeenCalled();
    expect(f.deps.artifacts.remove).toHaveBeenCalledTimes(1);
  });
  it("rechecks membership again under the terminal row lock", async () => {
    const f = fixture();
    f.deps.prisma.spaceMember.findUnique
      .mockResolvedValueOnce({ id: "membership" })
      .mockResolvedValue(null);
    await expect(
      publishZeroComponent(f.deps as never, "csv", f.id, f.request, "succeeded", {
        startedAt: new Date(f.now).toISOString(),
      }),
    ).rejects.toBeInstanceOf(IsolationError);
    expect(f.deps.prisma.artifact.create).not.toHaveBeenCalled();
    expect(f.deps.artifacts.remove).toHaveBeenCalledTimes(1);
  });
  it("requires the current grant again after cancellation storage", async () => {
    const f = fixture();
    f.deps.artifacts.put.mockImplementation(async () => {
      f.deps.authorize.mockRejectedValue(new IsolationError());
      return { id: randomUUID() };
    });
    await expect(
      publishZeroComponent(f.deps as never, "csv", f.id, f.request, "cancelled", {}, f.principal),
    ).rejects.toBeInstanceOf(IsolationError);
    expect(f.deps.prisma.artifact.create).not.toHaveBeenCalled();
  });
  it("preserves a durable cancellation against a late successful result", async () => {
    const f = fixture();
    const receipt = {
      id: randomUUID(),
      rootArtifactId: f.id,
      version: 2,
      name: "zero-csv-receipt.json",
      mimeType: "application/json",
      description: JSON.stringify({ state: "cancelled" }),
    };
    f.setReceipt(receipt);
    await expect(
      publishZeroComponent(f.deps as never, "csv", f.id, f.request, "succeeded", {
        startedAt: new Date(f.now).toISOString(),
      }),
    ).rejects.toThrow("job_already_terminal");
    expect(
      await publishZeroComponent(f.deps as never, "csv", f.id, f.request, "failed", {
        reason: "job_already_terminal",
      }),
    ).toEqual(receipt);
    expect(f.deps.prisma.artifact.create).not.toHaveBeenCalled();
    expect(f.deps.artifacts.remove).toHaveBeenCalledTimes(2);
  });
  it("rechecks the grant after request storage before insertion or dispatch", async () => {
    const f = fixture();
    f.deps.artifacts.put.mockImplementation(async () => {
      f.deps.authorize.mockRejectedValue(new IsolationError());
      return { id: randomUUID() };
    });
    await expect(
      submitZeroComponent(f.deps as never, "csv", f.principal, f.request, "key"),
    ).rejects.toBeInstanceOf(IsolationError);
    expect(f.deps.prisma.artifact.create).not.toHaveBeenCalled();
    expect(f.deps.jobs.enqueue).not.toHaveBeenCalled();
    expect(f.deps.artifacts.remove).toHaveBeenCalledTimes(1);
  });
  it.each(families)(
    "counts all four families against the shared four-job quota for %s",
    async (family) => {
      const f = fixture(family);
      f.deps.prisma.artifact.findMany.mockResolvedValue([{}, {}, {}, {}]);
      await expect(
        submitZeroComponent(f.deps as never, family, f.principal, f.request, "key"),
      ).rejects.toThrow("scope_job_limit_exceeded");
      const query = f.deps.prisma.artifact.findMany.mock.calls[0]?.[0] as unknown as {
        where: { OR: Array<{ name: string }> };
      };
      expect(query.where.OR.map(({ name }) => name)).toEqual(families.map((entry) => entry[3]));
      expect(f.deps.prisma.artifact.create).not.toHaveBeenCalled();
      expect(f.deps.jobs.enqueue).not.toHaveBeenCalled();
    },
  );
});
