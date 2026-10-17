import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sessionCookieHeader } from "../../../packages/testkit/src/index.js";
import type { AppHandles } from "./app.js";
import { createApp } from "./app.js";

const databaseUrl = process.env.LIBRARY_HANDOFF_TEST_DATABASE_URL;
const postgres =
  process.env.VERIFY_LIBRARY_HANDOFF_DATABASE === "1" && databaseUrl
    ? describe.sequential
    : describe.skip;
const origin = "http://127.0.0.1:5173";
postgres("Library artifact and existing task handoff (PostgreSQL)", () => {
  let handles: AppHandles;
  let dataDir: string;
  let cookie: string;
  let otherCookie: string;
  let botId: string;
  let threadId: string;
  const request = (endpoint: string, input: unknown, auth = cookie) =>
    handles.app.request("/rpc/" + endpoint, {
      method: "POST",
      headers: { cookie: auth, origin, "content-type": "application/json" },
      body: JSON.stringify({ json: input }),
    });
  const signup = async (name: string) => {
    const response = await handles.app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        name,
        email: name + "-" + randomUUID() + "@fixture.invalid",
        password: "fixture-password-123",
      }),
    });
    expect(response.status).toBeLessThan(400);
    return sessionCookieHeader(response);
  };
  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.startsWith("/zero_library_test"))
      throw Error("Dedicated zero_library_test database required");
    vi.stubEnv("ZERO_PROJECT_POLICY_FILE", "");
    vi.stubEnv("DATABASE_URL", databaseUrl!);
    vi.stubEnv("REALTIME_DATABASE_URL", databaseUrl!);
    dataDir = await mkdtemp(path.join(tmpdir(), "zero-library-handoff-"));
    // Graphile publisher only: no worker/model is started by this API fixture.
    handles = await createApp({
      databaseUrl: databaseUrl!,
      dataDir,
      sandboxProvider: "fake",
      agentRuntime: "scripted",
      wakeupDriver: "graphile",
      signupsEnabled: "true",
      webOrigin: origin,
      authUrl: origin,
      apiUrl: origin,
    });
    cookie = await signup("library-owner");
    otherCookie = await signup("library-other");
    const created = await request("bots/create", {
      name: "Project planning",
      spawnKey: "library-handoff-fixture",
    });
    expect(created.status).toBe(200);
    const bot = (
      (await created.json()) as { json: { id: string; threadId: string } }
    ).json;
    botId = bot.id;
    threadId = bot.threadId;
  });
  afterAll(async () => {
    if (handles) await handles.stop();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });
  const intent = () => ({
    botId,
    candidateId: "KDE/krita",
    role: "reference",
    brief: "Investigate a local image workflow before integration.",
    clientNonce: randomUUID(),
  });
  it("requires a session, target ownership and canonical untampered input", async () => {
    const input = intent();
    expect((await request("library/prepare", input, "")).status).toBe(401);
    expect(
      (await request("library/prepare", input, otherCookie)).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (
        await request("library/prepare", {
          ...input,
          candidateId: "missing/repository",
        })
      ).status,
    ).toBe(400);
    for (const extra of [
      { sourceRevision: "f".repeat(40) },
      { runtimeTested: true },
      { artifactId: "foreign-artifact" },
      { spaceId: "foreign-space" },
    ])
      expect(
        (await request("library/prepare", { ...input, ...extra })).status,
      ).toBe(400);
    expect(await handles.prisma.artifact.count()).toBe(0);
    expect(await handles.prisma.task.count()).toBe(0);
    expect(await handles.prisma.run.count()).toBe(0);
  });
  it("persists one hash-checked plan before an explicitly requested durable task receipt", async () => {
    const input = intent();
    const response = await request("library/prepare", input);
    expect(response.status).toBe(200);
    const prepared = (
      (await response.json()) as {
        json: {
          artifactId: string;
          botId: string;
          threadId: string;
          planSha256: string;
        };
      }
    ).json;
    expect(prepared).toMatchObject({ botId, threadId });
    expect(await handles.prisma.task.count()).toBe(0);
    const stored = await request("artifacts/get", {
      botId,
      artifactId: prepared.artifactId,
    });
    expect(stored.status).toBe(200);
    const artifact = (
      (await stored.json()) as { json: { contentBase64: string } }
    ).json;
    const content = Buffer.from(artifact.contentBase64, "base64");
    expect(createHash("sha256").update(content).digest("hex")).toBe(
      prepared.planSha256,
    );
    expect(JSON.parse(content.toString())).toMatchObject({
      planningOnly: true,
      requestedRole: "reference",
      sourceFacts: {
        repository: "KDE/krita",
        runtimeTested: false,
        licenseApproved: false,
      },
    });
    const replay = await request("library/prepare", input);
    expect(((await replay.json()) as { json: unknown }).json).toEqual(prepared);
    expect(
      (await request("library/prepare", { ...input, brief: "Changed intent." }))
        .status,
    ).toBe(409);
    expect(await handles.prisma.artifact.count()).toBe(1);
    const send = {
      botId,
      text: input.brief,
      artifactIds: [prepared.artifactId],
      clientNonce: "library-task-" + input.clientNonce,
    };
    const submitted = await request("threads/send", send);
    expect(submitted.status).toBe(200);
    const receipt = (
      (await submitted.json()) as {
        json: { taskId: string; runId: string; seq: number };
      }
    ).json;
    const task = await handles.prisma.task.findUniqueOrThrow({
      where: { id: receipt.taskId },
    });
    const run = await handles.prisma.run.findUniqueOrThrow({
      where: { id: receipt.runId },
    });
    expect(task).toMatchObject({ threadId, botId });
    expect(task.prompt).toContain(input.brief);
    expect(run).toMatchObject({
      threadId,
      botId,
      taskId: receipt.taskId,
      status: "queued",
    });
    expect((await request("threads/send", send)).status).toBe(200);
    expect(await handles.prisma.task.count()).toBe(1);
    expect(await handles.prisma.run.count()).toBe(1);
    const queued = await handles.prisma.$queryRaw<{ count: bigint }[]>`select count(*) as count from graphile_worker._private_jobs where payload::text like ${"%" + receipt.runId + "%"}`;
    expect(Number(queued[0]?.count)).toBe(1);
    const message = await handles.prisma.message.findFirstOrThrow({
      where: { threadId, clientNonce: send.clientNonce },
    });
    expect(JSON.stringify(message.blocks)).toContain(prepared.artifactId);
  });
});
