import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ZeroCsvPrincipal, ZeroJevProfile } from "@rakazo/adapters";
import {
  createZeroJevApplicationClient,
  EncryptedSecretStore,
  LocalArtifactStore,
} from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import type { Pool } from "@rakazo/db";
import { createBudgetAllocation, createPool } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sessionCookieHeader } from "../../../packages/testkit/src/index.js";
import type { AppHandles } from "./app.js";
import { createApp } from "./app.js";

const databaseUrl = process.env.ZERO_JEV_TEST_DATABASE_URL;
const postgres =
  process.env.VERIFY_ZERO_JEV_DATABASE === "1" && databaseUrl ? describe.sequential : describe.skip;
const origin = "http://127.0.0.1:5173",
  scopeId = "jev-project-fixture";
const encryptionKey = "fixture-encryption-key-only-never-live";
postgres(
  "authenticated Jev application/default operator policy (PostgreSQL, offline provider)",
  () => {
    let handles: AppHandles,
      dataDir: string,
      file: string,
      cookie: string,
      otherCookie: string,
      pool: Pool;
    let principal: ZeroCsvPrincipal, profile: ZeroJevProfile;
    const dispatch = vi.fn<typeof fetch>(async (_url, options) => {
      expect(String(_url)).toBe("https://openrouter.ai/api/v1/systemone");
      expect(options?.headers).toMatchObject({
        authorization: "Bearer fixture-openrouter-secret-no-live",
      });
      expect(JSON.stringify(options?.body)).not.toContain("PRIVATE_LOCAL_PAYLOAD");
      const packet = JSON.parse(String(options?.body));
      const goal: string = packet.state.task;
      const choice = goal.includes("photograph")
        ? "abstain"
        : goal.includes("JSON")
          ? "json.normalize"
          : "csv.parse";
      return Response.json({
        answers: { tool: { type: "choice", choice } },
        id: "fixture-provider-receipt",
        usage: { input_tokens: 12, output_tokens: 1, cost: 0.00001 },
      });
    });
    const grant = async (value: unknown = { ...principal, jev: profile }) =>
      writeFile(file, JSON.stringify({ version: 1, grants: value ? [value] : [] }), {
        mode: 0o600,
      });
    const common = () => ({
      databaseUrl: databaseUrl!,
      dataDir,
      sandboxProvider: "fake" as const,
      agentRuntime: "scripted" as const,
      wakeupDriver: "memory" as const,
      signupsEnabled: "true",
      encryptionKey,
      webOrigin: origin,
      authUrl: origin,
      apiUrl: origin,
      zeroJevFetch: dispatch,
    });
    const request = (
      suffix: string,
      options: {
        method?: string;
        body?: unknown;
        cookie?: string;
        origin?: string;
        headers?: Record<string, string>;
      } = {},
    ) =>
      handles.app.request(`/api/zero/jev/scopes/${scopeId}${suffix}`, {
        method: options.method ?? "GET",
        headers: {
          cookie: options.cookie ?? cookie,
          origin: options.origin ?? origin,
          "content-type": "application/json",
          ...options.headers,
        },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
    const input = (patch: Record<string, unknown> = {}) => ({
      goal: "Parse a CSV table",
      data: "name,value\nPRIVATE_LOCAL_PAYLOAD,2\n",
      deadline: new Date(Date.now() + 60000).toISOString(),
      idempotencyKey: randomUUID(),
      ...patch,
    });
    const signup = async (name: string) => {
      const response = await handles.app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({
          name,
          email: `${name}-${randomUUID()}@fixture.invalid`,
          password: "fixture-password-123",
        }),
      });
      expect(response.status).toBeLessThan(400);
      return sessionCookieHeader(response);
    };
    const allocate = async (accountId: string, calls: number) => {
      const limits = { calls, usdMicros: 1000000n, tokens: 100000n };
      await createBudgetAllocation(pool, { accountId, total: limits, lanes: { routing: limits } });
    };
    beforeAll(async () => {
      if (!new URL(databaseUrl!).pathname.startsWith("/zero_jev_test"))
        throw new Error("Dedicated zero_jev_test database required");
      dataDir = await mkdtemp(path.join(tmpdir(), "zero-jev-api-"));
      file = path.join(dataDir, "operator.json");
      await writeFile(file, JSON.stringify({ version: 1, grants: [] }), { mode: 0o600 });
      vi.stubEnv("DATABASE_URL", databaseUrl!);
      vi.stubEnv("REALTIME_DATABASE_URL", databaseUrl!);
      vi.stubEnv("ZERO_PROJECT_POLICY_FILE", file);
      pool = createPool(databaseUrl!, { poolMax: 2 });
      handles = await createApp(common());
      cookie = await signup("jev-owner");
      otherCookie = await signup("jev-other");
      const me = await handles.app.request("/rpc/me", {
        method: "POST",
        headers: { cookie, origin, "content-type": "application/json" },
        body: '{"json":{}}',
      });
      expect(me.status).toBe(200);
      const actor = ((await me.json()) as { json: Actor }).json;
      principal = {
        spaceId: actor.spaceId,
        userId: actor.userId,
        scopeId,
        policyRevision: "fixture-grant-v1",
        expiresAt: new Date(Date.now() + 10 * 60000).toISOString(),
      };
      const secretId = `secret-${randomUUID()}`,
        credentialId = `credential-${randomUUID()}`;
      const store = new EncryptedSecretStore(encryptionKey);
      const secret = await store.put(
        "fixture-openrouter-secret-no-live",
        {
          ...principal,
          operationId: "fixture-seed",
          traceId: "fixture-seed",
          signal: AbortSignal.timeout(1000),
        },
        { recordId: secretId },
      );
      await handles.prisma.secret.create({
        data: { id: secretId, userId: principal.userId, kind: "model", ciphertext: secret.ref },
      });
      await handles.prisma.userModelCredential.create({
        data: {
          id: credentialId,
          userId: principal.userId,
          provider: "openrouter",
          label: "Fixture",
          secretId,
        },
      });
      await handles.prisma.spaceModelPreference.create({
        data: {
          spaceId: principal.spaceId,
          userId: principal.userId,
          credentialId,
          modelId: "fixture/jev",
        },
      });
      profile = {
        revision: "fixture-profile-v1",
        credentialId,
        model: "fixture/jev",
        payerAccountId: `payer-${randomUUID()}`,
        lane: "routing",
        reserveUsdMicros: "10000",
        reserveTokens: "100",
        timeoutMs: 10000,
        expiresAt: principal.expiresAt,
        enabled: true,
        allowTaskDataToOpenRouter: true,
        tools: ["csv.parse", "json.normalize"],
      };
      await allocate(profile.payerAccountId, 10);
      await grant();
    });
    afterAll(async () => {
      if (handles) await handles.stop();
      await pool?.end();
      if (dataDir) await rm(dataDir, { recursive: true, force: true });
      vi.unstubAllEnvs();
    });

    it("requires real BetterAuth, scoped membership and trusted origin without forwarding host credentials", async () => {
      const before = dispatch.mock.calls.length;
      expect((await request("/status", { cookie: "" })).status).toBe(401);
      expect(
        (
          await request("/status", {
            cookie: "",
            headers: { authorization: "Bearer host-subscription-marker-not-Zero" },
          })
        ).status,
      ).toBe(401);
      expect((await request("/status", { cookie: otherCookie })).status).toBe(403);
      expect((await request("/status", { origin: "https://external.invalid" })).status).toBe(403);
      const status = await request("/status");
      expect(status.status).toBe(200);
      const body = await status.json();
      expect(body).toMatchObject({ backend: "available", model: "fixture/jev", paidModelCalls: 0 });
      expect(JSON.stringify(body)).not.toContain("payer-");
      expect(JSON.stringify(body)).not.toContain("fixture-openrouter-secret-no-live");
      expect(dispatch).toHaveBeenCalledTimes(before);
    });
    it.each(["userId", "spaceId", "scopeId", "model", "accountId", "apiKey", "root"])(
      "denies tool-supplied %s without dispatch",
      async (field) => {
        const before = dispatch.mock.calls.length;
        expect(
          (
            await request("/execute", {
              method: "POST",
              body: input({ [field]: "host-secret-marker" }),
            })
          ).status,
        ).toBe(400);
        expect(dispatch).toHaveBeenCalledTimes(before);
      },
    );
    it("uses the real authenticated application client, encrypted credential, existing worker and bounded receipt pages", async () => {
      const sessionToken = cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("better-auth.session_token="))!
        .slice("better-auth.session_token=".length);
      const fetcher: typeof fetch = async (url, options) => {
        const parsed = new URL(String(url));
        return handles.app.request(parsed.pathname + parsed.search, options);
      };
      const client = createZeroJevApplicationClient(
        {
          apiUrl: "http://127.0.0.1:12345",
          spaceId: principal.spaceId,
          scopeId,
          sessionToken,
          expiresAt: principal.expiresAt,
        },
        { fetch: fetcher, timeoutMs: 15000 },
      );
      expect((await client.status()).backend).toBe("available");
      const params = input();
      const accepted = await client.execute(params);
      await handles.awaitIdle!();
      const summary = await client.get(accepted.jobId);
      expect(summary).toMatchObject({ state: "succeeded", callId: accepted.callId, revision: 2 });
      expect(summary).not.toHaveProperty("tool");
      expect(await client.execute(params)).toEqual(accepted);
      const chunks: Buffer[] = [];
      let offset = 0;
      for (let count = 0; count < 20; count++) {
        const page = await client.artifactPage(accepted.jobId, { offset, limit: 512 });
        chunks.push(Buffer.from(page.contentBase64, "base64"));
        if (page.nextOffset === null) break;
        offset = page.nextOffset;
      }
      const bytes = Buffer.concat(chunks);
      const result = JSON.parse(bytes.toString());
      expect(result).toMatchObject({
        state: "succeeded",
        tool: { id: "csv.parse", result: { verification: { outcome: "pass" } } },
      });
      if ("sha256" in summary)
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(summary.sha256);
      expect(await handles.prisma.usageRecord.count({ where: { callId: accepted.callId } })).toBe(
        1,
      );
      expect(dispatch).toHaveBeenCalledOnce();
      expect((await request(`/jobs/${accepted.jobId}`, { cookie: otherCookie })).status).toBe(403);
      expect(
        (await request(`/jobs/${accepted.jobId}/artifact`, { cookie: otherCookie })).status,
      ).toBe(403);
    });
    it("executes JSON and a meaningful abstention through the same authenticated path", async () => {
      for (const [goal, data, state, tool] of [
        ["Normalize JSON", '{"z":2,"a":1}', "succeeded", "json.normalize"],
        ["Describe a photograph", "opaque input", "abstained", null],
      ] as const) {
        const response = await request("/execute", { method: "POST", body: input({ goal, data }) });
        expect(response.status).toBe(202);
        const { jobId } = (await response.json()) as { jobId: string };
        await handles.awaitIdle!();
        expect(await (await request(`/jobs/${jobId}`)).json()).toMatchObject({ state });
        const page = (await (await request(`/jobs/${jobId}/artifact`)).json()) as {
          contentBase64: string;
        };
        const receipt = JSON.parse(Buffer.from(page.contentBase64, "base64").toString());
        if (tool) expect(receipt.tool.id).toBe(tool);
        else expect(receipt.tool).toBeNull();
      }
    });
    it("rejects cap0 before enqueue and rechecks policy expiry/revocation without private byte reads", async () => {
      const original = profile;
      profile = { ...original, payerAccountId: `cap-zero-${randomUUID()}` };
      await allocate(profile.payerAccountId, 0);
      await grant();
      const before = dispatch.mock.calls.length;
      expect((await request("/status")).status).toBe(503);
      expect((await request("/execute", { method: "POST", body: input() })).status).toBe(503);
      profile = original;
      await grant({ ...principal, expiresAt: new Date(0).toISOString(), jev: profile });
      expect((await request("/status")).status).toBe(403);
      await grant(null);
      const reads = vi.spyOn(LocalArtifactStore.prototype, "get");
      try {
        expect((await request(`/jobs/${randomUUID()}/artifact`)).status).toBe(403);
        expect(reads).not.toHaveBeenCalled();
      } finally {
        reads.mockRestore();
        await grant();
      }
      expect(dispatch).toHaveBeenCalledTimes(before);
    });
    it("remains unavailable when no operator policy is configured", async () => {
      vi.stubEnv("ZERO_PROJECT_POLICY_FILE", "");
      const disabled = await createApp(common());
      try {
        const response = await disabled.app.request(`/api/zero/jev/scopes/${scopeId}/status`, {
          headers: { cookie, origin },
        });
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "routing_profile_unavailable" });
      } finally {
        await disabled.stop();
        vi.stubEnv("ZERO_PROJECT_POLICY_FILE", file);
      }
    });
  },
);
