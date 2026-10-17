import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createZeroCsvApplicationClient,
  createZeroCsvApplicationClientFromFile,
  ZeroCsvApplicationError,
} from "./zero-csv-application-client.js";
import { ZERO_CSV_LIMITS, ZERO_CSV_PROFILE } from "./zero-csv-profile.js";

const token = "fixture-zero-session-token-only";
const jobId = "11111111-1111-4111-8111-111111111111";
const sha256 = "a".repeat(64);
const status = {
  profile: ZERO_CSV_PROFILE,
  backend: "available",
  paidModelCalls: 0,
  execution: "csv-preparation-only",
  limits: ZERO_CSV_LIMITS,
};
const binding = () => ({
  apiUrl: "http://127.0.0.1:3100",
  spaceId: "fixture-space",
  scopeId: "fixture-project",
  sessionToken: token,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
});
const input = () => ({
  csv: "a,b\n1,2",
  idempotencyKey: "fixture-key",
  deadline: new Date(Date.now() + 30_000).toISOString(),
});
const terminal = (state: "blocked" | "failed" | "succeeded" | "cancelled" = "blocked") => ({
  jobId,
  state,
  profile: ZERO_CSV_PROFILE,
  requestDigest: sha256,
  artifactId: "receipt_fixture",
});
const response = (value: unknown, code = 200) =>
  new Response(JSON.stringify(value), {
    status: code,
    headers: { "content-type": "application/json" },
  });
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function errorCode(operation: Promise<unknown>, code: string) {
  const error = await operation.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ZeroCsvApplicationError);
  expect((error as ZeroCsvApplicationError).code).toBe(code);
  expect(String(error)).not.toContain(token);
}

describe("bounded authenticated CSV application client", () => {
  it("reads current freshness separately and rejects contradictory or foreign snapshot evidence", async () => {
    const evidence = {
      jobId, artifactId: "receipt_fixture", revision: 2, receiptSha256: sha256,
      verifiedSnapshotSha256: sha256, currentSnapshotSha256: sha256,
      state: "unchanged", checkedAt: new Date().toISOString(),
    };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response(evidence));
    const client = createZeroCsvApplicationClient(binding(), { fetch });
    expect(await client.freshness(jobId)).toEqual(evidence);
    expect(fetch.mock.calls[0]?.[0].toString()).toMatch(/\/jobs\/[^/]+\/freshness$/u);
    expect(fetch.mock.calls[0]?.[1]?.method).toBe("GET");
    for (const patch of [
      { state: "changed" },
      { currentSnapshotSha256: "b".repeat(64) },
      { jobId: "22222222-2222-4222-8222-222222222222" },
      { projectRoot: "/private" },
      { checkedAt: "2026-10-17T00:00:00+99:99" },
    ]) {
      fetch.mockResolvedValueOnce(response({ ...evidence, ...patch }));
      await errorCode(client.freshness(jobId), "invalid_response");
    }
    fetch.mockResolvedValueOnce(response({ ...evidence, currentSnapshotSha256: "b".repeat(64), state: "changed" }));
    expect((await client.freshness(jobId)).state).toBe("changed");
    const calls = fetch.mock.calls.length;
    await errorCode(client.freshness("../foreign"), "invalid_request");
    expect(fetch).toHaveBeenCalledTimes(calls);
  });
  it("submits verification IDs only and reads either trusted stored job profile", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (url, options) => {
      calls.push({
        url: String(url),
        body: options?.body ? JSON.parse(String(options.body)) : null,
      });
      if (String(url).endsWith("/verify")) return response({ jobId, requestDigest: sha256 }, 202);
      return response({
        ...terminal("succeeded"),
        profile: "zero-csv-project-v1",
        revision: 2,
        sha256,
      });
    });
    const client = createZeroCsvApplicationClient(binding(), { fetch });
    const verify = {
      preparationJobId: jobId,
      idempotencyKey: "verify-fixture",
      deadline: input().deadline,
    };
    expect(await client.verify(verify)).toEqual({ jobId, requestDigest: sha256 });
    expect(calls[0]).toMatchObject({ url: expect.stringMatching(/\/verify$/u), body: verify });
    expect(await client.get(jobId)).toMatchObject({
      profile: "zero-csv-project-v1",
      state: "succeeded",
    });
    await errorCode(
      client.verify({ ...verify, projectRoot: "/" } as typeof verify),
      "invalid_request",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("uses the actual local HTTP path, selected space and existing Zero session authentication", async () => {
    const seen: Array<{
      path: string;
      method: string;
      auth?: string;
      space?: string;
      body: string;
    }> = [];
    const server = createServer(async (request, reply) => {
      let body = "";
      for await (const chunk of request) body += chunk.toString();
      seen.push({
        path: request.url!,
        method: request.method!,
        auth: request.headers.authorization,
        space: request.headers["x-rakazo-space-id"] as string | undefined,
        body,
      });
      const url = request.url!;
      const result = url.endsWith("/status")
        ? status
        : url.endsWith("/prepare")
          ? { jobId, requestDigest: sha256 }
          : url.endsWith("/cancel")
            ? terminal("succeeded")
            : url.includes("/artifact?")
              ? {
                  artifactId: "receipt_fixture",
                  revision: 2,
                  sha256,
                  totalBytes: 2,
                  offset: 0,
                  nextOffset: null,
                  encoding: "base64",
                  contentBase64: Buffer.from("{}").toString("base64"),
                }
              : { ...terminal("blocked"), revision: 2, sha256 };
      reply.writeHead(url.endsWith("/prepare") ? 202 : 200, { "content-type": "application/json" });
      reply.end(JSON.stringify(result));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No fixture port");
    try {
      const client = createZeroCsvApplicationClient({
        ...binding(),
        apiUrl: `http://127.0.0.1:${address.port}`,
      });
      expect(await client.status()).toEqual(status);
      const submitted = input();
      expect(await client.prepare(submitted)).toEqual({ jobId, requestDigest: sha256 });
      expect((await client.get(jobId)).state).toBe("blocked");
      expect((await client.cancel(jobId)).state).toBe("succeeded");
      expect((await client.artifactPage(jobId)).contentBase64).toBe("e30=");
      expect(seen).toHaveLength(5);
      for (const call of seen) {
        expect(call.auth).toBe(`Bearer ${token}`);
        expect(call.space).toBe("fixture-space");
        expect(call.path).toContain("/api/zero/csv/scopes/fixture-project/");
      }
      expect(seen[1]!.body).toBe(JSON.stringify(submitted));
      expect(JSON.parse(seen[1]!.body)).not.toHaveProperty("userId");
      expect(seen[3]!.body).toBe("{}");
      expect(seen[4]!.path).toContain("limit=8192");
      expect(JSON.stringify(client)).not.toContain(token);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it.each([
    "https://127.0.0.1:3100",
    "http://example.test:3100",
    "http://localhost:3100",
    "http://127.0.0.1",
    "http://127.0.0.1:3100/path",
    "http://user:pass@127.0.0.1:3100",
    "http://127.0.0.1:3100?secret=x",
    "http://127.0.0.1:65536",
  ])("refuses unsafe API binding %s before sending credentials", (apiUrl) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(() => createZeroCsvApplicationClient({ ...binding(), apiUrl }, { fetch })).toThrow(
      "invalid_binding",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects expired/malformed private bindings without dispatch", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = createZeroCsvApplicationClient(
      { ...binding(), expiresAt: new Date(Date.now() - 1).toISOString() },
      { fetch },
    );
    await errorCode(client.status(), "binding_expired");
    for (const changes of [
      { sessionToken: "bad\r\nheader" },
      { scopeId: ".." },
      { expiresAt: "2099-01-01T00:00:00+99:99" },
    ])
      expect(() => createZeroCsvApplicationClient({ ...binding(), ...changes }, { fetch })).toThrow(
        "invalid_binding",
      );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects model-supplied identity, invalid jobs and resource bounds locally", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = createZeroCsvApplicationClient(binding(), { fetch });
    await errorCode(
      client.prepare({ ...input(), userId: "other" } as ReturnType<typeof input>),
      "invalid_request",
    );
    await errorCode(client.prepare(inputWithCsv("値".repeat(6000))), "invalid_request");
    await errorCode(
      client.prepare({ ...input(), deadline: "2099-01-01T00:00:00Z" }),
      "invalid_request",
    );
    await errorCode(client.get("../arbitrary"), "invalid_request");
    await errorCode(client.cancel("not-a-job"), "invalid_request");
    await errorCode(client.artifactPage(jobId, { offset: -1, limit: 16385 }), "invalid_request");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["blocked", "failed", "succeeded", "cancelled"] as const)(
    "preserves terminal %s without manufacturing success",
    async (state) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(response({ ...terminal(state), revision: 2, sha256 }));
      expect((await createZeroCsvApplicationClient(binding(), { fetch }).get(jobId)).state).toBe(
        state,
      );
      expect(fetch.mock.calls[0]![1]).toMatchObject({
        redirect: "error",
        cache: "no-store",
        method: "GET",
      });
    },
  );
  it("preserves unknown missing-receipt state", async () => {
    const unknown = { jobId, state: "unknown", attempts: null, reason: "queue_and_receipt_absent" };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response(unknown));
    expect(await createZeroCsvApplicationClient(binding(), { fetch }).get(jobId)).toEqual(unknown);
  });
  it.each([
    "authentication_required",
    "project_scope_rejected",
    "project_policy_unavailable",
    "idempotency_key_conflict",
  ])("returns only known redacted API error %s", async (code) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(response({ error: code }, 403));
    await errorCode(createZeroCsvApplicationClient(binding(), { fetch }).status(), code);
  });
  it("redacts unknown response data and thrown network details", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ error: `private:${token}` }, 503))
      .mockRejectedValueOnce(new Error(`connection path and ${token}`));
    const client = createZeroCsvApplicationClient(binding(), { fetch });
    await errorCode(client.status(), "application_unavailable");
    await errorCode(client.status(), "application_unavailable");
  });
  it.each(["declared", "streamed"])("bounds %s response bodies before parsing", async (kind) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response("x".repeat(32768), {
        headers: {
          "content-type": "application/json",
          ...(kind === "declared" ? { "content-length": "32768" } : {}),
        },
      }),
    );
    await errorCode(
      createZeroCsvApplicationClient(binding(), { fetch }).status(),
      "response_too_large",
    );
  });
  it.each([
    new Response(Buffer.from([0xc0, 0xaf]), { headers: { "content-type": "application/json" } }),
    new Response("not json", { headers: { "content-type": "application/json" } }),
    response({ ...status, sessionToken: token }),
  ])("rejects invalid UTF8/JSON/output schema", async (value) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(value);
    await errorCode(
      createZeroCsvApplicationClient(binding(), { fetch }).status(),
      "invalid_response",
    );
  });
  it("cancels malformed UTF8 streams instead of leaving a provider connection open", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([0xc0, 0xaf]));
      },
      cancel,
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(stream, { headers: { "content-type": "application/json" } }));
    await errorCode(
      createZeroCsvApplicationClient(binding(), { fetch }).status(),
      "invalid_response",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(["fetch", "stream"])(
    "times out a stalled %s without leaking credentials",
    async (phase) => {
      const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () =>
        phase === "fetch"
          ? new Promise<Response>(() => undefined)
          : new Response(new ReadableStream({ start() {} }), {
              headers: { "content-type": "application/json" },
            }),
      );
      await errorCode(
        createZeroCsvApplicationClient(binding(), { fetch, timeoutMs: 20 }).status(),
        "request_timeout",
      );
    },
  );
  it("validates page correlation, base64 length, continuation and job identity", async () => {
    const page = {
      artifactId: "receipt_fixture",
      revision: 2,
      sha256,
      totalBytes: 2,
      offset: 0,
      nextOffset: null,
      encoding: "base64",
      contentBase64: "e30=",
    };
    for (const changes of [
      { offset: 1 },
      { nextOffset: 1 },
      { contentBase64: "invalid" },
      { totalBytes: 1 },
    ]) {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(response({ ...page, ...changes }));
      await errorCode(
        createZeroCsvApplicationClient(binding(), { fetch }).artifactPage(jobId),
        "invalid_response",
      );
    }
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      response({
        ...terminal(),
        jobId: "22222222-2222-4222-8222-222222222222",
        revision: 2,
        sha256,
      }),
    );
    await errorCode(
      createZeroCsvApplicationClient(binding(), { fetch }).get(jobId),
      "invalid_response",
    );
  });
  it("does not follow an actual HTTP redirect or forward session authentication", async () => {
    let destinationCalls = 0;
    const destination = createServer((_request, reply) => {
      destinationCalls++;
      reply.end("unexpected");
    });
    destination.listen(0, "127.0.0.1");
    await once(destination, "listening");
    const target = destination.address();
    if (!target || typeof target === "string") throw new Error("No destination port");
    const source = createServer((_request, reply) => {
      reply.writeHead(302, { location: `http://127.0.0.1:${target.port}/capture` });
      reply.end();
    });
    source.listen(0, "127.0.0.1");
    await once(source, "listening");
    const address = source.address();
    if (!address || typeof address === "string") throw new Error("No source port");
    try {
      await errorCode(
        createZeroCsvApplicationClient({
          ...binding(),
          apiUrl: `http://127.0.0.1:${address.port}`,
        }).status(),
        "application_unavailable",
      );
      expect(destinationCalls).toBe(0);
    } finally {
      source.closeAllConnections();
      destination.closeAllConnections();
      await Promise.all([
        new Promise<void>((resolve) => source.close(() => resolve())),
        new Promise<void>((resolve) => destination.close(() => resolve())),
      ]);
    }
  });
  it.skipIf(process.platform !== "linux")(
    "rereads private binding files and fails closed after deletion or expiry",
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), "zero-session-binding-test-"));
      roots.push(root);
      const file = path.join(root, "binding.json");
      await writeFile(file, JSON.stringify(binding()), { mode: 0o600 });
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(async () => response(status));
      const client = createZeroCsvApplicationClientFromFile(file, { fetch });
      expect(await client.status()).toEqual(status);
      await writeFile(
        file,
        JSON.stringify({ ...binding(), expiresAt: new Date(Date.now() - 1).toISOString() }),
      );
      await errorCode(client.status(), "binding_expired");
      await rm(file);
      await errorCode(client.status(), "invalid_binding");
      expect(fetch).toHaveBeenCalledOnce();
    },
  );
});
function inputWithCsv(csv: string) {
  return { ...input(), csv };
}
