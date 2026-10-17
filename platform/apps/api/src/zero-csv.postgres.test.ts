import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ZeroCsvPrincipal } from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import { IsolationError } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sessionCookieHeader } from "../../../packages/testkit/src/index.js";
import type { AppHandles } from "./app.js";
import { createApp } from "./app.js";
import type { ZeroCsvScopePolicy } from "./zero-csv.js";

const databaseUrl = process.env.ZERO_CSV_TEST_DATABASE_URL;
const postgres =
  process.env.VERIFY_ZERO_CSV_DATABASE === "1" && databaseUrl ? describe.sequential : describe.skip;
const origin = "http://127.0.0.1:5173";

postgres("authenticated CSV preparation application API (PostgreSQL)", () => {
  let handles: AppHandles;
  let dataDir: string;
  let cookie: string;
  let otherCookie: string;
  let principal: ZeroCsvPrincipal;
  let grant: ZeroCsvPrincipal | undefined;
  const scopeId = "csv-project-fixture";
  const policy: ZeroCsvScopePolicy = {
    resolve: async (actor, requestedScope) => {
      if (
        !grant ||
        actor.userId !== grant.userId ||
        actor.spaceId !== grant.spaceId ||
        requestedScope !== grant.scopeId
      )
        throw new IsolationError();
      return { ...grant };
    },
    authorize: async (owner) => {
      if (
        !grant ||
        (["userId", "spaceId", "scopeId", "policyRevision", "expiresAt"] as const).some(
          (key) => owner[key] !== grant![key],
        ) ||
        Date.parse(grant.expiresAt) <= Date.now()
      )
        throw new IsolationError();
    },
  };
  const prefix = `/api/zero/csv/scopes/${scopeId}`;
  const input = (extra: Record<string, unknown> = {}) => ({
    csv: 'name,value\n"one,two",3\n',
    idempotencyKey: randomUUID(),
    deadline: new Date(Date.now() + 60_000).toISOString(),
    ...extra,
  });
  const request = (
    url: string,
    options: {
      method?: string;
      body?: unknown;
      cookie?: string;
      origin?: string;
      headers?: Record<string, string>;
    } = {},
  ) =>
    handles.app.request(url, {
      method: options.method ?? "GET",
      headers: {
        cookie: options.cookie ?? cookie,
        origin: options.origin ?? origin,
        "content-type": "application/json",
        ...options.headers,
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  const signup = async (name: string) => {
    const response = await handles.app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({
        name,
        email: `${name}-${randomUUID()}@fixture.invalid`,
        password: "fixture-password-123",
      }),
    });
    expect(response.status).toBeLessThan(400);
    return sessionCookieHeader(response);
  };
  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.startsWith("/zero_csv_test"))
      throw new Error("Explicit dedicated zero_csv_test database required");
    vi.stubEnv("ZERO_PROJECT_POLICY_FILE", "");
    vi.stubEnv("DATABASE_URL", databaseUrl!);
    vi.stubEnv("REALTIME_DATABASE_URL", databaseUrl!);
    dataDir = await mkdtemp(path.join(tmpdir(), "zero-csv-api-proof-"));
    handles = await createApp({
      databaseUrl: databaseUrl!,
      dataDir,
      sandboxProvider: "fake",
      agentRuntime: "scripted",
      wakeupDriver: "memory",
      signupsEnabled: "true",
      webOrigin: origin,
      authUrl: origin,
      apiUrl: origin,
      zeroCsvScopes: policy,
    });
    cookie = await signup("csv-api-owner");
    otherCookie = await signup("csv-api-other");
    const me = await request("/rpc/me", { method: "POST", body: { json: {} } });
    expect(me.status).toBe(200);
    const actor = ((await me.json()) as { json: Actor }).json;
    principal = {
      userId: actor.userId,
      spaceId: actor.spaceId,
      scopeId,
      policyRevision: "fixture-policy-v1",
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    };
    grant = { ...principal };
  });
  afterAll(async () => {
    if (handles) await handles.stop();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("requires a real session and rejects another authenticated user's project", async () => {
    const anonymous = await request(`${prefix}/prepare`, {
      method: "POST",
      body: input(),
      cookie: "",
    });
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("cache-control")).toBe("no-store");
    expect(
      (await request(`${prefix}/prepare`, { method: "POST", body: input(), cookie: otherCookie }))
        .status,
    ).toBe(403);
  });

  it("probes backend availability only for a real authenticated project grant", async () => {
    expect((await request(`${prefix}/status`, { cookie: "" })).status).toBe(401);
    expect((await request(`${prefix}/status`, { cookie: otherCookie })).status).toBe(403);
    const response = await request(`${prefix}/status`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      profile: "d3-dsv-3.0.1/strict-table-v1",
      backend: "available",
      paidModelCalls: 0,
      execution: "csv-preparation-only",
      limits: { inputBytes: 16384, outstandingJobsPerScope: 4 },
    });
  });

  it("takes principal solely from session membership and explicit operator policy", async () => {
    for (const extra of [
      { userId: principal.userId },
      { spaceId: principal.spaceId },
      { root: "/" },
      { profile: "anything" },
    ]) {
      expect(
        (await request(`${prefix}/prepare`, { method: "POST", body: input(extra) })).status,
      ).toBe(400);
    }
    expect(
      (
        await request(`${prefix}/prepare`, {
          method: "POST",
          body: input(),
          origin: "https://attacker.invalid",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(`${prefix}/prepare`, {
          method: "POST",
          body: input(),
          headers: { "sec-fetch-site": "cross-site" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(`${prefix}/prepare`, {
          method: "POST",
          body: input(),
          headers: { "content-type": "text/plain" },
        })
      ).status,
    ).toBe(415);
    expect(
      (
        await request(`${prefix}/prepare`, {
          method: "POST",
          body: input({ csv: "x".repeat(40 * 1024) }),
        })
      ).status,
    ).toBe(413);
  });

  it("executes through the existing application worker and returns bounded hash-checked artifact pages", async () => {
    const params = input();
    const submitted = await request(`${prefix}/prepare`, { method: "POST", body: params });
    expect(submitted.status).toBe(202);
    const accepted = (await submitted.json()) as { jobId: string; requestDigest: string };
    await handles.awaitIdle!();
    const status = await request(`${prefix}/jobs/${accepted.jobId}`);
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      state: "succeeded",
      jobId: accepted.jobId,
      requestDigest: accepted.requestDigest,
      revision: 2,
    });
    const repeated = await request(`${prefix}/prepare`, { method: "POST", body: params });
    expect(await repeated.json()).toEqual(accepted);
    expect(
      (
        await request(`${prefix}/prepare`, {
          method: "POST",
          body: { ...params, csv: "different" },
        })
      ).status,
    ).toBe(409);
    const chunks: Buffer[] = [];
    let offset: number | null = 0;
    let digest = "";
    while (offset !== null) {
      const response = await request(
        `${prefix}/jobs/${accepted.jobId}/artifact?offset=${offset}&limit=1024`,
      );
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(Buffer.byteLength(text)).toBeLessThan(32 * 1024);
      const page = JSON.parse(text);
      expect(page).toMatchObject({ offset, encoding: "base64", revision: 2 });
      chunks.push(Buffer.from(page.contentBase64, "base64"));
      digest = page.sha256;
      offset = page.nextOffset;
    }
    const bytes = Buffer.concat(chunks);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest);
    expect(JSON.parse(bytes.toString())).toMatchObject({
      modelExecution: "none",
      paidModelCalls: 0,
      result: { verification: { outcome: "pass" } },
      component: { version: "3.0.1" },
    });
    expect((await request(`${prefix}/jobs/${accepted.jobId}/artifact?limit=16385`)).status).toBe(
      400,
    );
    expect((await request(`${prefix}/jobs/${accepted.jobId}/artifact?root=/`)).status).toBe(400);
    expect(
      (await request(`${prefix}/jobs/${accepted.jobId}/artifact`, { cookie: otherCookie })).status,
    ).toBe(403);
    const cancelAfterCommit = await request(`${prefix}/jobs/${accepted.jobId}/cancel`, {
      method: "POST",
      body: {},
    });
    expect(await cancelAfterCommit.json()).toMatchObject({ state: "succeeded" });
    expect(await handles.prisma.usageRecord.count({ where: { spaceId: principal.spaceId } })).toBe(
      0,
    );
  });

  it("accepts the existing authenticated bearer-session mechanism without browser Origin", async () => {
    const tokenCookie = cookie
      .split(";")
      .find((part) => part.trim().startsWith("better-auth.session_token="));
    expect(tokenCookie).toBeDefined();
    const token = tokenCookie!.trim().slice("better-auth.session_token=".length);
    const response = await handles.app.request(`${prefix}/prepare`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(input()),
    });
    expect(response.status).toBe(202);
    await handles.awaitIdle!();
  });

  it("checks grant expiry before submission and revocation again before worker dispatch", async () => {
    grant = { ...principal, expiresAt: new Date(Date.now() - 1000).toISOString() };
    expect((await request(`${prefix}/prepare`, { method: "POST", body: input() })).status).toBe(
      403,
    );
    grant = { ...principal };
    const submitted = await request(`${prefix}/prepare`, { method: "POST", body: input() });
    expect(submitted.status).toBe(202);
    const { jobId } = (await submitted.json()) as { jobId: string };
    grant = undefined;
    await handles.awaitIdle!();
    expect((await request(`${prefix}/jobs/${jobId}`)).status).toBe(403);
    grant = { ...principal };
    const status = await request(`${prefix}/jobs/${jobId}`);
    expect(await status.json()).toMatchObject({ state: "blocked" });
  });

  it("keeps execution disabled without a configured operator policy", async () => {
    const emptyDir = await mkdtemp(path.join(tmpdir(), "zero-csv-api-no-policy-"));
    const disabled = await createApp({
      databaseUrl: databaseUrl!,
      dataDir: emptyDir,
      sandboxProvider: "fake",
      agentRuntime: "scripted",
      wakeupDriver: "memory",
      webOrigin: origin,
      authUrl: origin,
      apiUrl: origin,
    });
    try {
      const response = await disabled.app.request(`${prefix}/prepare`, {
        method: "POST",
        headers: { cookie, origin, "content-type": "application/json" },
        body: JSON.stringify(input()),
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "project_policy_unavailable" });
      const status = await disabled.app.request(`${prefix}/status`, {
        headers: { cookie, origin },
      });
      expect(status.status).toBe(503);
      expect(await status.json()).toEqual({ error: "project_policy_unavailable" });
    } finally {
      await disabled.stop();
      await rm(emptyDir, { recursive: true, force: true });
    }
  });
});
