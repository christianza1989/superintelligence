import { randomUUID } from "node:crypto";
import { IsolationError } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { loadZeroCsvApplicationAttribution } from "./zero-csv-application-attribution.js";
import {
  ZERO_CSV_APPLICATION_PROFILE,
  ZERO_CSV_APPLICATION_RECIPE,
} from "./zero-csv-application-contract.js";
import {
  createZeroCsvApplicationService,
  runZeroCsvApplication,
} from "./zero-csv-application-service.js";
import { zeroComponentHash } from "./zero-component-jobs.js";
import type { ZeroCsvApplicationBinding } from "./zero-csv-application-service-contract.js";
const verify = vi.hoisted(() => vi.fn());
vi.mock("./zero-csv-application-verifier.js", () => ({ verifyZeroCsvApplication: verify }));
type Row = { id: string; [key: string]: any };
async function fixture() {
  verify.mockReset();
  verify.mockImplementation(async (config) => {
    await config.beforeDispatch?.();
    return {
      profile: ZERO_CSV_APPLICATION_PROFILE,
      outcome: "fail",
      reason: "APPLICATION_RUNTIME_FAILED",
      cleanup: "confirmed_absent",
      paidModelCalls: 0,
    };
  });
  const principal = {
    spaceId: "space",
    userId: "owner",
    scopeId: "scope",
    policyRevision: "v1",
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
  };
  const binding: ZeroCsvApplicationBinding = {
    profile: ZERO_CSV_APPLICATION_PROFILE,
    recipe: ZERO_CSV_APPLICATION_RECIPE,
    runtime: {
      dockerExecutable: "/usr/bin/docker",
      dockerConfigDirectory: "/tmp/empty-operator-config",
      imageId: "sha256:" + "a".repeat(64),
      buildInputLockSha256: "b".repeat(64),
      attribution: await loadZeroCsvApplicationAttribution(),
    },
  };
  const csv = Buffer.from("category,amount\nTravel,1.00\n"),
    storage = new Map<string, Uint8Array>();
  const source: Row = {
    id: "source",
    name: "expenses.csv",
    spaceId: principal.spaceId,
    userId: principal.userId,
    mimeType: "text/csv",
    size: csv.length,
    hash: zeroComponentHash(csv),
    storageKey: "input",
    version: 1,
    rootArtifactId: null,
  };
  const rows = new Map<string, Row>([[source.id, source]]);
  storage.set("input", csv);
  let revoked = false;
  const authorize = vi.fn(async () => {
    if (revoked) throw new IsolationError();
  });
  const identity = (where: any) =>
    [...rows.values()].find((row) => {
      const fields = where.spaceId_userId_clientNonce ?? where;
      return Object.entries(fields).every(([key, value]) => row[key] === value);
    }) ?? null;
  const artifact = {
    findFirst: vi.fn(async ({ where }: any) => identity(where)),
    findUnique: vi.fn(async ({ where }: any) => identity(where)),
    findUniqueOrThrow: vi.fn(async ({ where }: any) => {
      const row = identity(where);
      if (!row) throw Error("missing");
      return row;
    }),
    findMany: vi.fn(async ({ where }: any) =>
      [...rows.values()]
        .filter(
          (row) =>
            row.spaceId === where.spaceId &&
            row.userId === where.userId &&
            where.OR.some(
              (clause: any) =>
                row.name === clause.name &&
                row.clientNonce?.startsWith(clause.clientNonce.startsWith),
            ) &&
            ![...rows.values()].some(
              (receipt) =>
                receipt.rootArtifactId === row.id &&
                where.versions.none.name.in.includes(receipt.name),
            ),
        )
        .slice(0, 4)
        .map((row) => ({ id: row.id })),
    ),
    create: vi.fn(async ({ data }: any) => {
      const row = { id: randomUUID(), rootArtifactId: null, createdAt: new Date(), ...data };
      rows.set(row.id, row);
      return row;
    }),
  };
  const prisma: any = {
    artifact,
    spaceMember: { findUnique: vi.fn(async () => ({ id: "member" })) },
    $queryRaw: vi.fn(async (sql: any) =>
      sql.strings?.join("").includes("clock_timestamp") ? [{ now: new Date() }] : [],
    ),
    $transaction: async (action: any) => action(prisma),
  };
  const artifacts = {
    put: vi.fn(async ({ bytes }: any) => {
      const id = randomUUID();
      storage.set(id, Buffer.from(bytes));
      return { id };
    }),
    get: vi.fn(async (id: string) => {
      const bytes = storage.get(id);
      if (!bytes) throw Error("missing");
      return bytes;
    }),
    remove: vi.fn(async (id: string) => {
      storage.delete(id);
    }),
  };
  const jobs = {
    enqueue: vi.fn(async (_job: unknown) => undefined),
    cancel: vi.fn(async (_key: string) => undefined),
  };
  const deps = {
    prisma,
    artifacts,
    jobs,
    authorize,
    resolveApplication: vi.fn(async () => binding),
  };
  const service = createZeroCsvApplicationService(deps, principal);
  const input = {
    recipe: ZERO_CSV_APPLICATION_RECIPE,
    inputArtifactId: source.id,
    expectedInputSha256: source.hash,
    idempotencyKey: "once",
    deadline: new Date(Date.now() + 60_000).toISOString(),
  };
  return {
    principal,
    binding,
    source,
    rows,
    storage,
    csv,
    deps,
    service,
    input,
    revoke: () => {
      revoked = true;
    },
  };
}
describe("application service uses existing scoped durable lifecycle", () => {
  it.each(["foreign", "private-name", "private-nonce", "wrong-hash"])(
    "rejects %s inputs before storage read or queue",
    async (kind) => {
      const f = await fixture();
      if (kind === "foreign") f.source.userId = "someone-else";
      if (kind === "private-name") f.source.name = "zero-application-workspace.json";
      if (kind === "private-nonce") f.source.clientNonce = "zero.pdf.input:private";
      if (kind === "wrong-hash") f.input.expectedInputSha256 = "d".repeat(64);
      await expect(f.service.submit(f.input)).rejects.toBeInstanceOf(IsolationError);
      expect(f.deps.artifacts.get).not.toHaveBeenCalled();
      expect(f.deps.jobs.enqueue).not.toHaveBeenCalled();
    },
  );
  it("checks actual stored bytes against the expected digest", async () => {
    const f = await fixture();
    f.storage.set("input", Buffer.from("category,amount\nChanged,9\n"));
    await expect(f.service.submit(f.input)).rejects.toThrow("component_input_integrity_failed");
    expect(f.deps.jobs.enqueue).not.toHaveBeenCalled();
  });
  it.each(["grant", "binding"])("rechecks %s after input storage I/O", async (kind) => {
    const f = await fixture();
    f.deps.artifacts.get.mockImplementationOnce(async () => {
      if (kind === "grant") f.revoke();
      else f.binding.runtime.imageId = "sha256:" + "c".repeat(64);
      return f.csv;
    });
    await expect(f.service.submit(f.input)).rejects.toBeInstanceOf(IsolationError);
    expect(f.deps.artifacts.put).not.toHaveBeenCalled();
    expect(f.deps.jobs.enqueue).not.toHaveBeenCalled();
  });
  it("keeps idempotency and immutable request payloads", async () => {
    const f = await fixture(),
      first = await f.service.submit(f.input),
      replay = await f.service.submit(f.input);
    expect(replay).toEqual(first);
    expect(
      [...f.rows.values()].filter((row) => row.name === "zero-application-request.json"),
    ).toHaveLength(1);
    expect(f.deps.jobs.enqueue.mock.calls[0]?.[0]).toMatchObject({
      name: "zero.application.create",
      payload: { requestArtifactId: first.jobId },
      keepExisting: true,
    });
    await expect(
      f.service.submit({
        ...f.input,
        deadline: new Date(Date.parse(f.input.deadline) + 1).toISOString(),
      }),
    ).rejects.toThrow("idempotency_key_conflict");
  });
  it("shares the four total outstanding slots with preexisting CSV requests", async () => {
    const f = await fixture();
    const prefix =
      "zero.csv.request:" +
      zeroComponentHash(JSON.stringify([f.principal.userId, f.principal.scopeId])) +
      ":";
    for (let i = 0; i < 4; i++)
      f.rows.set("busy-" + i, {
        id: "busy-" + i,
        name: "zero-csv-request.json",
        spaceId: "space",
        userId: "owner",
        clientNonce: prefix + i,
      });
    await expect(f.service.submit(f.input)).rejects.toThrow("scope_job_limit_exceeded");
    expect(f.deps.jobs.enqueue).not.toHaveBeenCalled();
    expect(
      [...f.rows.values()].filter((row) => row.name === "zero-application-request.json"),
    ).toHaveLength(0);
    expect(f.deps.artifacts.remove).toHaveBeenCalled();
    expect(
      f.deps.prisma.$queryRaw.mock.calls.some(([query]: any[]) =>
        query.strings?.join("").includes("pg_advisory_xact_lock"),
      ),
    ).toBe(true);
    expect(
      f.deps.prisma.artifact.findMany.mock.calls[0]?.[0].where.OR.map((item: any) => item.name),
    ).toContain("zero-application-request.json");
  });
  it("preserves cancellation across worker restart without input reads or execution", async () => {
    const f = await fixture(),
      submitted = await f.service.submit(f.input);
    await f.service.cancel(submitted.jobId);
    f.deps.artifacts.get.mockClear();
    await runZeroCsvApplication(f.deps, submitted.jobId);
    expect(verify).not.toHaveBeenCalled();
    expect(f.deps.artifacts.get).not.toHaveBeenCalled();
    expect((await f.service.get(submitted.jobId)).state).toBe("cancelled");
  });
  it("rejects a changed policy binding before private request bytes are read", async () => {
    const f = await fixture(),
      submitted = await f.service.submit(f.input);
    f.binding.runtime.buildInputLockSha256 = "e".repeat(64);
    f.deps.artifacts.get.mockClear();
    await expect(f.service.get(submitted.jobId)).rejects.toBeInstanceOf(IsolationError);
    expect(f.deps.artifacts.get).not.toHaveBeenCalled();
    await runZeroCsvApplication(f.deps, submitted.jobId);
    expect(f.deps.artifacts.get).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });
  it("does not allow an application request to omit its required header binding", async () => {
    const f = await fixture(),
      submitted = await f.service.submit(f.input),
      row = f.rows.get(submitted.jobId)!;
    const metadata = JSON.parse(row.description);
    delete metadata.bindingSha256;
    row.description = JSON.stringify(metadata);
    f.deps.artifacts.get.mockClear();
    await expect(f.service.get(submitted.jobId)).rejects.toBeInstanceOf(IsolationError);
    expect(f.deps.artifacts.get).not.toHaveBeenCalled();
  });
  it("retains the candidate workspace and failed verification with honest status", async () => {
    const f = await fixture(),
      submitted = await f.service.submit(f.input);
    await runZeroCsvApplication(f.deps, submitted.jobId);
    expect((await f.service.get(submitted.jobId)).state).toBe("failed");
    const saved = await f.service.workspace(submitted.jobId),
      workspace = JSON.parse(saved.content);
    expect(workspace.workspace.manifest.inputSha256).toBe(f.source.hash);
    expect(
      workspace.workspace.files.some((file: any) => file.path === "vendor/d3-dsv/LICENSE"),
    ).toBe(true);
    const receipt = JSON.parse((await f.service.artifact(submitted.jobId)).content);
    expect(receipt.workspace.sha256).toBe(saved.sha256);
    expect(receipt.verification.outcome).toBe("fail");
    expect(receipt.paidModelCalls).toBe(0);
    expect(verify).toHaveBeenCalledTimes(1);
  });
  it("rechecks current grants before publishing a runtime result", async () => {
    const f = await fixture(),
      submitted = await f.service.submit(f.input);
    verify.mockImplementationOnce(async (config) => {
      await config.beforeDispatch();
      f.revoke();
      return { profile: ZERO_CSV_APPLICATION_PROFILE, outcome: "pass", paidModelCalls: 0 };
    });
    await runZeroCsvApplication(f.deps, submitted.jobId);
    const receipt = [...f.rows.values()].find(
      (row) => row.name === "zero-application-receipt.json",
    )!;
    expect(JSON.parse(receipt.description).state).toBe("blocked");
    await expect(f.service.workspace(submitted.jobId)).rejects.toBeInstanceOf(IsolationError);
  });
  it("removes a workspace blob if its grant is revoked during storage before row publication", async () => {
    const f = await fixture(),
      submitted = await f.service.submit(f.input);
    const put = f.deps.artifacts.put.getMockImplementation()!;
    f.deps.artifacts.put.mockImplementation(async (value) => {
      const stored = await put(value);
      if (value.name === "zero-application-workspace.json") f.revoke();
      return stored;
    });
    await runZeroCsvApplication(f.deps, submitted.jobId);
    expect([...f.rows.values()].some((row) => row.name === "zero-application-workspace.json")).toBe(
      false,
    );
    expect(f.deps.artifacts.remove).toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });
  it("rejects stale workspace bytes and rechecks grants after workspace storage I/O", async () => {
    const f = await fixture(),
      submitted = await f.service.submit(f.input);
    await runZeroCsvApplication(f.deps, submitted.jobId);
    const row = [...f.rows.values()].find(
      (entry) => entry.name === "zero-application-workspace.json",
    )!;
    const original = f.storage.get(row.storageKey)!;
    f.storage.set(row.storageKey, Buffer.from("stale"));
    await expect(f.service.workspace(submitted.jobId)).rejects.toThrow(
      "application_workspace_integrity_failed",
    );
    f.storage.set(row.storageKey, original);
    const get = f.deps.artifacts.get.getMockImplementation()!;
    f.deps.artifacts.get.mockImplementation(async (key) => {
      const bytes = await get(key);
      if (key === row.storageKey) f.revoke();
      return bytes;
    });
    await expect(f.service.workspace(submitted.jobId)).rejects.toBeInstanceOf(IsolationError);
  });
});
