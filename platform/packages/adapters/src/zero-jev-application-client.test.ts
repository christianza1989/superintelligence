import { describe, expect, it, vi } from "vitest";
import { createZeroJevApplicationClient } from "./zero-jev-application-client.js";
import { ZERO_JEV_LIMITS } from "./zero-jev-worker.js";

const binding = {
  apiUrl: "http://127.0.0.1:12345",
  spaceId: "fixture-space",
  scopeId: "fixture-project",
  sessionToken: "fixture-Zero-BetterAuth-session-only",
  expiresAt: new Date(Date.now() + 60000).toISOString(),
};
const jobId = "f5578b99-8ed1-42fc-81ef-f3e2fe3ab930",
  callId = "5674dcb2-1b90-459e-aea0-f7d1fab3cc0c";
const input = () => ({
  goal: "Normalize JSON",
  data: '{"z":2,"a":1}',
  idempotencyKey: "fixture-request",
  deadline: new Date(Date.now() + 30000).toISOString(),
});
const status = {
  profile: "jev-tool-selector-v1",
  backend: "available",
  execution: "jev-tool-selection",
  paidModelCalls: 0,
  profileRevision: "fixture-profile-v1",
  model: "fixture/jev",
  tools: ["json.normalize"],
  limits: ZERO_JEV_LIMITS,
};
const submitted = { jobId, callId, requestDigest: "a".repeat(64) };
const setup = (body: unknown = status, statusCode = 200) => {
  const dispatch = vi.fn<typeof fetch>(async () => Response.json(body, { status: statusCode }));
  return {
    dispatch,
    client: createZeroJevApplicationClient(binding, { fetch: dispatch, timeoutMs: 100 }),
  };
};
describe("bounded authenticated Jev application client", () => {
  it("uses only the trusted Zero session and selected project in one loopback request", async () => {
    const s = setup();
    expect(await s.client.status()).toEqual(status);
    const [url, options] = s.dispatch.mock.calls[0]!;
    expect(String(url)).toBe(`${binding.apiUrl}/api/zero/jev/scopes/fixture-project/status`);
    expect(options).toMatchObject({
      method: "GET",
      redirect: "error",
      cache: "no-store",
      headers: {
        authorization: `Bearer ${binding.sessionToken}`,
        "x-rakazo-space-id": binding.spaceId,
      },
    });
    expect(JSON.stringify(await s.client.status())).not.toContain(binding.sessionToken);
  });
  it("submits only bounded goal/data/deadline/idempotencyKey and validates durable IDs", async () => {
    const s = setup(submitted, 202);
    const body = input();
    expect(await s.client.execute(body)).toEqual(submitted);
    expect(JSON.parse(String(s.dispatch.mock.calls[0]![1]?.body))).toEqual(body);
    expect(String(s.dispatch.mock.calls[0]![0])).toContain("/execute");
  });
  it.each(["userId", "spaceId", "scopeId", "model", "accountId", "apiKey", "sessionToken", "root"])(
    "never accepts tool-supplied %s",
    async (field) => {
      const s = setup();
      await expect(
        s.client.execute({ ...input(), [field]: "host-secret-marker" }),
      ).rejects.toMatchObject({ code: "invalid_request" });
      expect(s.dispatch).not.toHaveBeenCalled();
    },
  );
  it.each([
    "http://example.invalid:1234",
    "https://127.0.0.1:1234",
    "http://localhost:1234",
    "http://127.0.0.1:1234/private",
    "http://127.0.0.1",
  ])("rejects non-pinned API URL %s", (apiUrl) => {
    expect(() => createZeroJevApplicationClient({ ...binding, apiUrl })).toThrow("invalid_binding");
  });
  it.each([
    { data: "x".repeat(16385) },
    { goal: "x".repeat(2001) },
    { deadline: "2026-01-01T00:00:00+99:99" },
    { deadline: new Date(0).toISOString() },
    { deadline: new Date(Date.now() + 180000).toISOString() },
  ])("rejects invalid finite request %j before fetch", async (patch) => {
    const s = setup();
    await expect(s.client.execute({ ...input(), ...patch })).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect(s.dispatch).not.toHaveBeenCalled();
  });
  it("preserves unknown as unknown and rejects job correlation changes", async () => {
    const s = setup({ jobId, callId, state: "unknown", reason: "no_terminal_receipt" });
    expect((await s.client.get(jobId)).state).toBe("unknown");
    s.dispatch.mockResolvedValue(
      Response.json({ jobId: callId, callId, state: "unknown", reason: "no_terminal_receipt" }),
    );
    await expect(s.client.get(jobId)).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("redacts arbitrary auth/backend/network details and keeps known denial codes", async () => {
    const s = setup({ error: "authentication_required" }, 401);
    await expect(s.client.status()).rejects.toMatchObject({ code: "authentication_required" });
    s.dispatch.mockResolvedValue(Response.json({ error: "host-secret-marker" }, { status: 503 }));
    await expect(s.client.status()).rejects.toThrow(/^application_unavailable$/);
    s.dispatch.mockRejectedValue(new Error("host-secret-marker"));
    await expect(s.client.status()).rejects.toThrow(/^application_unavailable$/);
  });
  it("rejects redirects, oversized streaming JSON and invalid UTF8", async () => {
    const s = setup();
    s.dispatch.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://external.invalid" } }),
    );
    await expect(s.client.status()).rejects.toMatchObject({ code: "redirect_rejected" });
    s.dispatch.mockResolvedValue(
      new Response(`"${"x".repeat(32768)}"`, {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(s.client.status()).rejects.toMatchObject({ code: "response_too_large" });
    s.dispatch.mockResolvedValue(
      new Response(new Uint8Array([0xff]), { headers: { "content-type": "application/json" } }),
    );
    await expect(s.client.status()).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("times out once and cancels a late response without retries", async () => {
    let finish!: (response: Response) => void;
    const cancel = vi.fn();
    const dispatch = vi.fn<typeof fetch>(
      async () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const client = createZeroJevApplicationClient(binding, { fetch: dispatch, timeoutMs: 5 });
    await expect(client.status()).rejects.toMatchObject({ code: "request_timeout" });
    finish(
      new Response(new ReadableStream({ cancel }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    expect(dispatch).toHaveBeenCalledOnce();
  });
  it("bounds and validates base64 artifact pages without exporting credentials", async () => {
    const body = {
      artifactId: "fixture-artifact",
      revision: 2,
      sha256: "b".repeat(64),
      totalBytes: 2,
      offset: 0,
      nextOffset: null,
      encoding: "base64",
      contentBase64: Buffer.from("{}").toString("base64"),
    };
    const s = setup(body);
    expect(await s.client.artifactPage(jobId, { limit: 2 })).toEqual(body);
    s.dispatch.mockResolvedValue(Response.json({ ...body, offset: 1 }));
    await expect(s.client.artifactPage(jobId)).rejects.toMatchObject({ code: "invalid_response" });
    await expect(s.client.artifactPage(jobId, { limit: 16385 })).rejects.toMatchObject({
      code: "invalid_request",
    });
  });
});
