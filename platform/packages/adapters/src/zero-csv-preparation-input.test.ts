import { describe, expect, it, vi } from "vitest";
import { createZeroCsvPreparationService } from "./zero-csv-preparation.js";

const invalid = "2026-10-17T12:00:00+99:99";
const principal = () => ({
  spaceId: "fixture-space",
  userId: "fixture-user",
  scopeId: "fixture-project",
  policyRevision: "fixture-v1",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
});
describe("finite CSV request timestamps", () => {
  const dependencies = () => ({
    prisma: {
      spaceMember: { findUnique: vi.fn(async () => ({ id: "fixture-member" })) },
      artifact: { findUnique: vi.fn(async () => null) },
    },
    artifacts: {
      put: vi.fn(async () => {
        throw new Error("Storage must not be reached");
      }),
    },
    jobs: { enqueue: vi.fn() },
    authorize: vi.fn(async () => undefined),
  });
  it("rejects an offset accepted lexically but not representable as an expiry", () => {
    expect(Number.isNaN(Date.parse(invalid))).toBe(true);
    const deps = dependencies();
    expect(() =>
      createZeroCsvPreparationService(deps as never, { ...principal(), expiresAt: invalid }),
    ).toThrowError(expect.objectContaining({ name: "ZodError" }));
    expect(deps.authorize).not.toHaveBeenCalled();
  });
  it("rejects a non-finite deadline before artifact lookup, storage or dispatch", async () => {
    const deps = dependencies();
    const service = createZeroCsvPreparationService(deps as never, principal());
    await expect(
      service.submit({ csv: "a,b\n1,2\n", idempotencyKey: "fixture-key", deadline: invalid }),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(deps.prisma.artifact.findUnique).not.toHaveBeenCalled();
    expect(deps.artifacts.put).not.toHaveBeenCalled();
    expect(deps.jobs.enqueue).not.toHaveBeenCalled();
  });
});
