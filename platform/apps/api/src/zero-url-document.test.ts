import type { Actor } from "@rakazo/contracts";
import { IsolationError } from "@rakazo/db";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { zeroExtractionSchemas } from "../../../packages/adapters/src/zero-component-application-client.js";
import {
  ZERO_URL_DOCUMENT_MODE,
  ZERO_URL_DOCUMENT_PROFILE,
} from "../../../packages/adapters/src/zero-url-document-contract.js";
import type { ZeroUrlResearchBinding } from "../../../packages/adapters/src/zero-url-research-contract.js";
import {
  ZERO_URL_DOCUMENT_RESOURCE_PROFILE,
  ZERO_URL_RESEARCH_LIMITS,
  ZERO_URL_RESEARCH_MODE,
  ZERO_URL_RESEARCH_PROFILE,
} from "../../../packages/adapters/src/zero-url-research-contract.js";
import { mountZeroComponentRoutes } from "./zero-components.js";

function fixture() {
  const actor = {
    spaceId: "space",
    userId: "owner",
    email: "owner@example.invalid",
    isDeploymentOwner: false,
  } as Actor;
  const principal = {
    spaceId: "space",
    userId: "owner",
    scopeId: "scope",
    policyRevision: "v1",
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
  };
  const runtime = {
    dockerExecutable: "/usr/bin/docker",
    dockerConfigDirectory: "/tmp/document-config",
    imageId: "sha256:" + "a".repeat(64),
    buildInputLockSha256: "b".repeat(64),
  };
  const tasks = [
    { taskId: "hours", sourceId: "source", url: "https://document-fixture.invalid/hours" },
  ];
  let binding: ZeroUrlResearchBinding = {
    profile: ZERO_URL_DOCUMENT_PROFILE,
    resourceProfile: ZERO_URL_DOCUMENT_RESOURCE_PROFILE,
    tasks,
    runtime: { ...runtime, runnerDirectory: "/tmp/document-release", runnerSha256: "c".repeat(64) },
  };
  let revoked = false,
    signedIn = true;
  const get = vi.fn(),
    put = vi.fn(),
    enqueue = vi.fn();
  const resolveUrlResearch = vi.fn(async (): Promise<ZeroUrlResearchBinding> => binding);
  const app = new Hono();
  mountZeroComponentRoutes(app, {
    prisma: { spaceMember: { findUnique: async () => ({ id: "member" }) } } as never,
    artifacts: { get, put } as never,
    jobs: { enqueue } as never,
    authenticate: async () => (signedIn ? actor : null),
    trustedOrigin: (origin) => origin === "https://product.invalid",
    policy: {
      resolve: async (_actor, scope) => {
        if (scope !== principal.scopeId) throw new IsolationError();
        return principal;
      },
      authorize: async () => {
        if (revoked) throw new IsolationError();
      },
      resolveUrlResearch,
    },
  });
  const input = {
    profile: ZERO_URL_DOCUMENT_PROFILE,
    taskId: "hours",
    idempotencyKey: "once",
    deadline: new Date(Date.now() + 60_000).toISOString(),
  };
  const call = (route: string, value?: unknown, headers: Record<string, string> = {}) =>
    app.request("/api/zero/research/scopes/scope" + route, {
      method: value === undefined ? "GET" : "POST",
      headers: {
        origin: "https://product.invalid",
        "content-type": "application/json",
        ...headers,
      },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    });
  return {
    input,
    call,
    get,
    put,
    enqueue,
    resolveUrlResearch,
    inert: () => {
      binding = { profile: ZERO_URL_RESEARCH_PROFILE, tasks, runtime };
    },
    revoke: () => {
      revoked = true;
    },
    signOut: () => {
      signedIn = false;
    },
  };
}
describe("captured-document research HTTP seam (offline; no API/worker qualification)", () => {
  it("reports the currently authorized explicit profile and leaves the old MCP client closed", async () => {
    const f = fixture(),
      response = await f.call("/status");
    expect(response.status).toBe(200);
    const value = await response.json();
    expect(value).toMatchObject({
      profile: ZERO_URL_DOCUMENT_PROFILE,
      execution: ZERO_URL_DOCUMENT_MODE,
      resourceProfile: ZERO_URL_DOCUMENT_RESOURCE_PROFILE,
      backend: "available",
      paidModelCalls: 0,
      limits: { scratchFileBytes: 16_777_216, sourceBytes: 16_384, cpus: 1, memoryMiB: 512 },
    });
    expect(JSON.stringify(value)).not.toContain("runnerDirectory");
    expect(zeroExtractionSchemas("research").status.safeParse(value).success).toBe(false);
    f.inert();
    expect(await (await f.call("/status")).json()).toEqual({
      profile: ZERO_URL_RESEARCH_PROFILE,
      execution: ZERO_URL_RESEARCH_MODE,
      backend: "available",
      paidModelCalls: 0,
      limits: ZERO_URL_RESEARCH_LIMITS,
    });
    expect(f.get).not.toHaveBeenCalled();
    expect(f.put).not.toHaveBeenCalled();
  });
  it("rejects an old implicit-profile submission against a captured-document scope", async () => {
    const f = fixture(),
      { profile: _profile, ...oldInput } = f.input;
    const response = await f.call("/extract", oldInput);
    expect(response.status).toBe(403);
    expect(f.put).not.toHaveBeenCalled();
    expect(f.enqueue).not.toHaveBeenCalled();
  });
  it.each([
    "url",
    "contentBase64",
    "runnerDirectory",
    "runnerSha256",
    "headers",
    "command",
    "resourceProfile",
  ])("rejects caller %s before storage or dispatch", async (field) => {
    const f = fixture(),
      response = await f.call("/extract", { ...f.input, [field]: "caller" });
    expect(response.status).toBe(400);
    expect(f.put).not.toHaveBeenCalled();
    expect(f.enqueue).not.toHaveBeenCalled();
  });
  it("requires current authority after resolving dynamic status", async () => {
    const f = fixture(),
      original = f.resolveUrlResearch.getMockImplementation()!;
    f.resolveUrlResearch.mockImplementation(async () => {
      const value = await original();
      f.revoke();
      return value;
    });
    expect((await f.call("/status")).status).toBe(403);
  });
  it.each(["signed-out", "origin", "cross-site"])(
    "rejects %s before status advertises availability",
    async (kind) => {
      const f = fixture();
      if (kind === "signed-out") f.signOut();
      const response = await f.call(
        "/status",
        undefined,
        kind === "origin"
          ? { origin: "https://foreign.invalid" }
          : kind === "cross-site"
            ? { "sec-fetch-site": "cross-site" }
            : {},
      );
      expect(response.status).toBe(kind === "signed-out" ? 401 : 403);
      expect(f.resolveUrlResearch).not.toHaveBeenCalled();
    },
  );
  it("keeps the shared eight-KiB HTTP body bound", async () => {
    const f = fixture(),
      response = await f.call("/extract", { ...f.input, padding: "x".repeat(8193) });
    expect(response.status).toBe(413);
    expect(f.put).not.toHaveBeenCalled();
    expect(f.enqueue).not.toHaveBeenCalled();
  });
});
