import { RPCHandler } from "@orpc/server/fetch";
import type { RouterDeps } from "./router.js";
import { createRouter } from "./router.js";
import type { Actor } from "@rakazo/contracts";
import { IsolationError } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import {
  createOwnedArtifact,
  deleteArtifactFamily,
  getSpaceArtifactById,
  listArtifactVersions,
  listSpaceArtifacts,
  resolveSendAttachments,
} from "./artifacts.js";
const actor = {
  spaceId: "space",
  userId: "user",
  email: "owner@example.invalid",
  isDeploymentOwner: false,
} as Actor;
const privateRow = {
  id: "private",
  name: "zero-csv-request.json",
  clientNonce: "zero.csv.request:private",
  spaceId: "space",
  userId: "user",
  botId: null,
  groupId: null,
  runId: null,
  rootArtifactId: null,
  storageKey: "secret",
  description: "private-principal",
  mimeType: "application/json",
  size: 7,
  version: 1,
  createdAt: new Date(),
};
function fixture(row = privateRow) {
  const artifacts = {
    get: vi.fn(async () => Buffer.from("private")),
    put: vi.fn(async () => ({ id: "new-storage" })),
    remove: vi.fn(async () => undefined),
  };
  const artifact = {
    findFirst: vi.fn(async () => row),
    findMany: vi.fn(async () => [row]),
    create: vi.fn(),
    delete: vi.fn(),
  };
  const tx = { artifact, $queryRaw: vi.fn(async () => [{ id: row.id }]) };
  const prisma = {
    artifact,
    $queryRaw: vi.fn(async (_query: unknown) => []),
    $transaction: async <T>(fn: (value: unknown) => Promise<T>) => fn(tx),
  };
  return { deps: { prisma, artifacts }, artifacts, artifact, tx };
}
describe("generic artifact routes cannot bypass job grant boundaries", () => {
  it.each([
    { name: "zero-pdf-input.pdf", clientNonce: null },
    { name: "renamed.txt", clientNonce: "zero.jev.receipt:private" },
    { name: "zero-research-source.html", clientNonce: "zero.research.source:private" },
  ])("denies a known private ID before reading bytes even for its owner", async (item) => {
    const f = fixture({ ...privateRow, ...item } as typeof privateRow);
    await expect(
      getSpaceArtifactById(f.deps as never, actor, { artifactId: "private" }),
    ).rejects.toBeInstanceOf(IsolationError);
    expect(f.artifacts.get).not.toHaveBeenCalled();
  });
  it.each(["versions", "remove"])(
    "denies generic %s before touching a private family",
    async (operation) => {
      const f = fixture();
      await expect(
        operation === "versions"
          ? listArtifactVersions(f.deps as never, actor, { familyId: "private" })
          : deleteArtifactFamily(f.deps as never, actor, { familyId: "private" }),
      ).rejects.toBeInstanceOf(IsolationError);
      expect(f.artifact.findMany).not.toHaveBeenCalled();
      expect(f.artifacts.remove).not.toHaveBeenCalled();
      expect(f.artifact.delete).not.toHaveBeenCalled();
    },
  );
  it("checks every family member before deleting any blob", async () => {
    const f = fixture({
      ...privateRow,
      name: "ordinary.txt",
      clientNonce: "upload",
      id: "ordinary",
    });
    f.artifact.findMany.mockResolvedValue([privateRow]);
    await expect(
      deleteArtifactFamily(f.deps as never, actor, { familyId: "ordinary" }),
    ).rejects.toBeInstanceOf(IsolationError);
    expect(f.artifacts.remove).not.toHaveBeenCalled();
  });
  it.each([
    { name: "zero-csv-receipt.json" },
    { name: " ZERO-JEV-REQUEST.JSON " },
    { clientNonce: "zero.pdf.input:reserved" },
  ])("denies upload aliases and nonce preemption before DB or blob write", async (extra) => {
    const f = fixture();
    await expect(
      createOwnedArtifact(f.deps as never, actor, {
        botId: "bot",
        name: "ordinary.txt",
        mimeType: "text/plain",
        contentBase64: "b2s=",
        ...extra,
      }),
    ).rejects.toBeInstanceOf(IsolationError);
    expect(f.artifact.findFirst).not.toHaveBeenCalled();
    expect(f.artifacts.put).not.toHaveBeenCalled();
  });
  it("denies revising a known renamed private root inside version allocation", async () => {
    const f = fixture({ ...privateRow, name: "ordinary.txt", botId: "bot" });
    await expect(
      createOwnedArtifact(f.deps as never, actor, {
        botId: "bot",
        name: "ordinary.txt",
        mimeType: "text/plain",
        contentBase64: "b2s=",
      }),
    ).rejects.toBeInstanceOf(IsolationError);
    expect(f.artifact.create).not.toHaveBeenCalled();
    expect(f.artifacts.remove).toHaveBeenCalledWith("new-storage", expect.anything());
  });
  it("excludes names and nonce aliases in the database list before paging metadata", async () => {
    const f = fixture();
    await listSpaceArtifacts(f.deps as never, actor, { limit: 10 });
    const query = f.deps.prisma.$queryRaw.mock.calls[0]?.[0] as {
      strings: string[];
      values: unknown[];
    };
    expect(query.strings.join(" ")).toContain("AND NOT");
    expect(query.values).toContain("zero-jev-request.json");
    expect(query.values).toContain("zero.research.%");
    expect(query.values).toContain("zero.csv.%");
    expect(query.values).not.toContain("zero.%");
  });
  it("denies private source IDs used as ordinary send attachments", async () => {
    const f = fixture();
    await expect(
      resolveSendAttachments(f.deps as never, actor, "bot", ["private"]),
    ).rejects.toBeInstanceOf(IsolationError);
  });
  it.each([
    { name: "ordinary.txt", clientNonce: "upload-123" },
    { name: "reuse-plan-example.json", clientNonce: "library-plan-example" },
  ])("preserves normal and Library artifact byte reads", async (item) => {
    const f = fixture({ ...privateRow, ...item });
    const result = await getSpaceArtifactById(f.deps as never, actor, { artifactId: "private" });
    expect(Buffer.from(result.contentBase64, "base64").toString()).toBe("private");
    expect(f.artifacts.get).toHaveBeenCalledTimes(1);
  });
});

describe("private artifact RPC denial", () => {
  function handler() {
    const f = fixture();
    const deps = {
      ...f.deps,
      env: {},
      dataDir: "/tmp/artifact-boundary-test",
    } as unknown as RouterDeps;
    return { ...f, rpc: new RPCHandler(createRouter(deps)) };
  }
  it.each([
    ["getById", { artifactId: "private" }],
    ["listVersions", { familyId: "private" }],
    ["remove", { artifactId: "private" }],
  ])("returns a redacted forbidden response for %s", async (route, input) => {
    const f = handler();
    const { response } = await f.rpc.handle(
      new Request("http://localhost/rpc/artifacts/" + route, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: input }),
      }),
      { prefix: "/rpc", context: { actor } },
    );
    expect(response.status).toBe(403);
    const text = await response.text();
    expect(text).toContain("FORBIDDEN");
    expect(text).not.toContain("private-principal");
    expect(text).not.toContain("secret");
    expect(f.artifacts.get).not.toHaveBeenCalled();
    expect(f.artifacts.remove).not.toHaveBeenCalled();
  });
  it("keeps unrelated storage failures as internal errors", async () => {
    const f = handler();
    f.artifact.findFirst.mockRejectedValue(new Error("storage unavailable"));
    const { response } = await f.rpc.handle(
      new Request("http://localhost/rpc/artifacts/getById", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { artifactId: "private" } }),
      }),
      { prefix: "/rpc", context: { actor } },
    );
    expect(response.status).toBe(500);
  });
});
