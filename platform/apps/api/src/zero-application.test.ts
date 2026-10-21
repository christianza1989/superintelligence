import { Hono } from "hono";
import type { Actor } from "@rakazo/contracts";
import { IsolationError } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { loadZeroCsvApplicationAttribution } from "../../../packages/adapters/src/zero-csv-application-attribution.js";
import {
  ZERO_CSV_APPLICATION_PROFILE,
  ZERO_CSV_APPLICATION_RECIPE,
} from "../../../packages/adapters/src/zero-csv-application-contract.js";
import { mountZeroComponentRoutes } from "./zero-components.js";
async function fixture() {
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
  let signedIn = true;
  const row = {
    id: "source",
    spaceId: "space",
    userId: "owner",
    name: "zero-application-workspace.json",
    mimeType: "text/csv",
    hash: "a".repeat(64),
    size: 1,
    storageKey: "private",
  };
  const get = vi.fn(),
    enqueue = vi.fn(),
    findFirst = vi.fn(async () => row);
  const app = new Hono();
  mountZeroComponentRoutes(app, {
    prisma: {
      artifact: { findFirst },
      spaceMember: { findUnique: async () => ({ id: "member" }) },
      $queryRaw: async () => [{ now: new Date() }],
    } as never,
    artifacts: { get } as never,
    jobs: { enqueue } as never,
    authenticate: async () => (signedIn ? actor : null),
    trustedOrigin: (origin) => origin === "https://product.invalid",
    policy: {
      resolve: async (_actor, scope) => {
        if (scope !== principal.scopeId) throw new IsolationError();
        return principal;
      },
      authorize: async () => undefined,
      resolveApplication: async () => ({
        profile: ZERO_CSV_APPLICATION_PROFILE,
        recipe: ZERO_CSV_APPLICATION_RECIPE,
        runtime: {
          dockerExecutable: "/usr/bin/docker",
          dockerConfigDirectory: "/tmp/config",
          imageId: "sha256:" + "a".repeat(64),
          buildInputLockSha256: "b".repeat(64),
          attribution: await loadZeroCsvApplicationAttribution(),
        },
      }),
    },
  });
  const input = {
    recipe: ZERO_CSV_APPLICATION_RECIPE,
    inputArtifactId: "source",
    expectedInputSha256: "a".repeat(64),
    idempotencyKey: "once",
    deadline: new Date(Date.now() + 60_000).toISOString(),
  };
  const call = (route: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.request("/api/zero/application/scopes/scope" + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin: "https://product.invalid",
        "content-type": "application/json",
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return {
    app,
    get,
    enqueue,
    findFirst,
    call,
    input,
    signOut: () => {
      signedIn = false;
    },
  };
}
describe("bounded application HTTP composition", () => {
  it("advertises only the fixed expense profile and no model dispatch", async () => {
    const f = await fixture(),
      response = await f.call("/status");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      profile: ZERO_CSV_APPLICATION_PROFILE,
      paidModelCalls: 0,
      execution: "native-esm-expense-build+opaque-browser-check",
    });
    expect(f.get).not.toHaveBeenCalled();
    expect(f.enqueue).not.toHaveBeenCalled();
  });
  it.each(["signed-out", "origin", "cross-site"])(
    "requires %s authorization before input access",
    async (kind) => {
      const f = await fixture();
      if (kind === "signed-out") f.signOut();
      const response = await f.call(
        "/create",
        f.input,
        kind === "origin"
          ? { origin: "https://foreign.invalid" }
          : kind === "cross-site"
            ? { "sec-fetch-site": "cross-site" }
            : {},
      );
      expect(response.status).toBe(kind === "signed-out" ? 401 : 403);
      expect(f.findFirst).not.toHaveBeenCalled();
      expect(f.get).not.toHaveBeenCalled();
      expect(f.enqueue).not.toHaveBeenCalled();
    },
  );
  it("denies private internal artifacts through the new create route", async () => {
    const f = await fixture(),
      response = await f.call("/create", f.input);
    expect(response.status).toBe(403);
    expect(f.get).not.toHaveBeenCalled();
    expect(f.enqueue).not.toHaveBeenCalled();
  });
  it("rejects commands and exposes no generic extract or executable preview route", async () => {
    const f = await fixture();
    expect((await f.call("/create", { ...f.input, command: "anything" })).status).toBe(400);
    expect((await f.call("/extract", f.input)).status).toBe(404);
    expect((await f.call("/jobs/example/preview.html")).status).toBe(404);
    expect(f.get).not.toHaveBeenCalled();
  });
  it.each(["?offset=0&offset=1", "?limit=16385", "?offset=-1", "?path=private", "?limit=0"])(
    "rejects invalid bounded workspace pages %s before private I/O",
    async (query) => {
      const f = await fixture(),
        response = await f.call("/jobs/example/workspace" + query);
      expect(response.status).toBe(400);
      expect(f.findFirst).not.toHaveBeenCalled();
      expect(f.get).not.toHaveBeenCalled();
    },
  );
});
