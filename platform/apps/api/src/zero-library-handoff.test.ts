import type * as ArtifactsModule from "./artifacts.js";
import type * as ThreadTargetModule from "./thread-target.js";
import { createHash } from "node:crypto";
import { createRouterClient } from "@orpc/server";
import type { Actor } from "@rakazo/contracts";
import { PrepareLibraryHandoffInput } from "@rakazo/contracts";
import { IsolationError } from "@rakazo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOwnedArtifact } from "./artifacts.js";
import { resolveThreadTarget } from "./thread-target.js";
import { prepareLibraryHandoff } from "./zero-library-handoff.js";
import { createRouter } from "./router.js";
import type { RouterDeps } from "./router.js";

vi.mock("./artifacts.js", async (original) => ({
  ...(await original<typeof ArtifactsModule>()),
  createOwnedArtifact: vi.fn(),
}));
vi.mock("./thread-target.js", async (original) => ({
  ...(await original<typeof ThreadTargetModule>()),
  resolveThreadTarget: vi.fn(),
}));
const actor = {
  spaceId: "space-owner",
  userId: "user-owner",
  email: "owner@fixture.invalid",
  isDeploymentOwner: true,
} satisfies Actor;
const input = {
  botId: "bot-owner",
  candidateId: "KDE/krita",
  role: "reference" as const,
  brief: "Investigate a local image workflow.",
  clientNonce: "intent-one",
};
type Row = {
  id: string;
  botId: string;
  groupId: null;
  spaceId: string;
  userId: string;
  clientNonce: string;
  hash: string;
  content: string;
};
function fixture() {
  const rows: Row[] = [];
  const findFirst = vi.fn(
    async ({ where }: { where: Record<string, string> }) =>
      rows.find((row) =>
        Object.entries(where).every(
          ([key, value]) => row[key as keyof Row] === value,
        ),
      ) ?? null,
  );
  const jobs = { enqueue: vi.fn() };
  const artifacts = { put: vi.fn() };
  const taskCreate = vi.fn();
  const deps = {
    prisma: { artifact: { findFirst }, task: { create: taskCreate } },
    artifacts,
    jobs,
    dataDir: "/tmp/library-handoff-fixture",
    env: { agentRuntime: "scripted" },
  } as unknown as RouterDeps;
  vi.mocked(resolveThreadTarget).mockImplementation(
    async (_db, who, target) => {
      if (
        who.spaceId !== actor.spaceId ||
        who.userId !== actor.userId ||
        target.botId !== input.botId
      )
        throw new IsolationError();
      return {
        kind: "bot",
        botId: input.botId,
        threadId: "thread-owner",
        bot: {},
      } as never;
    },
  );
  vi.mocked(createOwnedArtifact).mockImplementation(
    async (_deps, who, upload) => {
      let row = rows.find((r) => r.clientNonce === upload.clientNonce);
      if (!row) {
        artifacts.put();
        const bytes = Buffer.from(upload.contentBase64, "base64");
        row = {
          id: "artifact-" + rows.length,
          botId: upload.botId,
          groupId: null,
          userId: who.userId,
          spaceId: who.spaceId,
          clientNonce: upload.clientNonce!,
          hash: createHash("sha256").update(bytes).digest("hex"),
          content: bytes.toString("utf8"),
        };
        rows.push(row);
      }
      return { id: row.id } as never;
    },
  );
  return { rows, jobs, artifacts, taskCreate, deps };
}
beforeEach(() => vi.clearAllMocks());

describe("canonical Library artifact handoff", () => {
  it("requires auth before target or artifact work", async () => {
    const { deps, artifacts } = fixture();
    const client = createRouterClient(createRouter(deps), {
      context: { actor: null },
    });
    await expect(client.library.prepare(input)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(resolveThreadTarget).not.toHaveBeenCalled();
    expect(artifacts.put).not.toHaveBeenCalled();
  });
  it("validates canonical facts and returns the durable target and artifact digest without dispatch", async () => {
    const { deps, rows, jobs, taskCreate } = fixture();
    const client = createRouterClient(createRouter(deps), {
      context: { actor },
    });
    const result = await client.library.prepare(input);
    expect(result).toMatchObject({
      artifactId: "artifact-0",
      threadId: "thread-owner",
      botId: input.botId,
      candidateId: input.candidateId,
      role: "reference",
      planningOnly: true,
    });
    expect(result.planSha256).toBe(rows[0]!.hash);
    const plan = JSON.parse(rows[0]!.content);
    expect(plan.sourceFacts).toMatchObject({
      repository: "KDE/krita",
      runtimeTested: false,
      licenseApproved: false,
    });
    expect(plan.sourceFacts.revision).toMatch(/^[a-f0-9]{40}$/u);
    expect(jobs.enqueue).not.toHaveBeenCalled();
    expect(taskCreate).not.toHaveBeenCalled();
  });
  it("replays one unchanged nonce and rejects changed intent or target", async () => {
    const { deps, rows, artifacts } = fixture();
    const first = await prepareLibraryHandoff(deps, actor, input);
    expect(await prepareLibraryHandoff(deps, actor, input)).toEqual(first);
    expect(rows).toHaveLength(1);
    expect(artifacts.put).toHaveBeenCalledTimes(1);
    for (const changed of [
      { brief: "A different project." },
      { role: "component" as const },
      { candidateId: "morluto/rea" },
    ])
      await expect(
        prepareLibraryHandoff(deps, actor, { ...input, ...changed }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      prepareLibraryHandoff(deps, actor, { ...input, botId: "foreign-bot" }),
    ).rejects.toBeInstanceOf(IsolationError);
  });
  it("refuses another actor or unknown canonical repository before artifact writes", async () => {
    const { deps, artifacts } = fixture();
    await expect(
      prepareLibraryHandoff(deps, { ...actor, userId: "other-user" }, input),
    ).rejects.toBeInstanceOf(IsolationError);
    await expect(
      prepareLibraryHandoff(deps, actor, {
        ...input,
        candidateId: "missing/repository",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(artifacts.put).not.toHaveBeenCalled();
  });
  it("rejects caller-supplied pin, authorization and artifact fields", () => {
    for (const extra of [
      { sourceRevision: "f".repeat(40) },
      { runtimeTested: true },
      { licenseApproved: true },
      { artifactId: "foreign-artifact" },
      { spaceId: "foreign-space" },
      { role: "execute" },
      { brief: " " },
      { brief: "x".repeat(2001) },
    ])
      expect(
        PrepareLibraryHandoffInput.safeParse({ ...input, ...extra }).success,
      ).toBe(false);
  });
});
