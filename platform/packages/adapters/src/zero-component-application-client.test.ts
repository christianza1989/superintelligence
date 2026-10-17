import { once } from "node:events";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ZeroApplicationTransportError } from "./zero-application-transport.js";
import {
  createZeroComponentApplicationClient,
  createZeroComponentApplicationClientFromFile,
  zeroExtractionSchemas,
} from "./zero-component-application-client.js";

const token = "synthetic-extraction-session-token";
const jobId = "11111111-1111-4111-8111-111111111111";
const digest = "a".repeat(64);
const binding = () => ({
  apiUrl: "http://127.0.0.1:3100",
  spaceId: "space",
  scopeId: "scope",
  sessionToken: token,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
});
const input = () => ({
  fileId: "approved-input",
  idempotencyKey: "fixture-key",
  deadline: new Date(Date.now() + 30_000).toISOString(),
});
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
const page = {
  artifactId: "receipt",
  revision: 2,
  sha256: digest,
  totalBytes: 2,
  offset: 0,
  nextOffset: null,
  encoding: "base64",
  contentBase64: "e30=",
};
const statusFor = (family: "pdf" | "browser") =>
  family === "pdf"
    ? {
        profile: "pdfplumber-0.11.10-born-digital-lines-v1",
        backend: "available",
        paidModelCalls: 0,
        execution: "pdf-extraction",
        limits: {
          inputBytes: 1048576,
          runtimeMs: 30000,
          artifactBytes: 1064960,
          outstandingJobsPerScope: 4,
        },
      }
    : {
        profile: "zero-browser-static-v1",
        backend: "available",
        paidModelCalls: 0,
        execution: "browser-static-extraction",
        limits: {
          inputBytes: 16384,
          runtimeMs: 20000,
          artifactBytes: 2097152,
          outstandingJobsPerScope: 4,
        },
      };

describe.each(["pdf", "browser"] as const)("fixed %s application transport", (family) => {
  it("uses real loopback HTTP, existing session/space headers and fixed route family", async () => {
    const seen: Array<{
      url: string;
      method: string;
      body: string;
      auth: unknown;
      space: unknown;
    }> = [];
    const terminal = {
      jobId,
      state: "succeeded",
      profile: statusFor(family).profile,
      requestDigest: digest,
      artifactId: "receipt",
    };
    const server = createServer(async (request, reply) => {
      let body = "";
      for await (const chunk of request) body += chunk.toString();
      const url = request.url!;
      seen.push({
        url,
        body,
        method: request.method!,
        auth: request.headers.authorization,
        space: request.headers["x-rakazo-space-id"],
      });
      reply.writeHead(url.endsWith("/extract") ? 202 : 200, { "content-type": "application/json" });
      reply.end(
        JSON.stringify(
          url.endsWith("/status")
            ? statusFor(family)
            : url.endsWith("/extract")
              ? { jobId, requestDigest: digest }
              : url.endsWith("/cancel")
                ? terminal
                : url.includes("/artifact?")
                  ? page
                  : { ...terminal, revision: 2, sha256: digest },
        ),
      );
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No fixture port");
    try {
      const client = createZeroComponentApplicationClient(family, {
        ...binding(),
        apiUrl: `http://127.0.0.1:${address.port}`,
      });
      expect(await client.status()).toEqual(statusFor(family));
      const submitted = input();
      expect(await client.extract(submitted)).toEqual({ jobId, requestDigest: digest });
      expect((await client.get(jobId)).state).toBe("succeeded");
      expect((await client.cancel(jobId)).state).toBe("succeeded");
      expect(await client.artifactPage(jobId)).toEqual(page);
      expect(seen).toHaveLength(5);
      for (const call of seen) {
        expect(call.auth).toBe(`Bearer ${token}`);
        expect(call.space).toBe("space");
        expect(call.url).toContain(`/api/zero/${family}/scopes/scope/`);
      }
      expect(seen[1]?.body).toBe(JSON.stringify(submitted));
      expect(seen[3]).toMatchObject({ method: "POST", body: "{}" });
      expect(seen[4]?.url).toContain("offset=0&limit=8192");
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("rejects arbitrary paths, URLs, scopes, parser options and invalid deadlines before I/O", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = createZeroComponentApplicationClient(family, binding(), { fetch });
    for (const patch of [
      { fileId: "../secret" },
      { path: "/private" },
      { url: "https://external.invalid" },
      { scopeId: "foreign" },
      { javascript: "run()" },
      { selector: "body" },
      { deadline: "bad" },
      { deadline: new Date(Date.now() - 1).toISOString() },
      { deadline: new Date(Date.now() + 700_000).toISOString() },
    ])
      await expect(client.extract({ ...input(), ...patch })).rejects.toMatchObject({
        code: "invalid_request",
      });
    await expect(client.get("../foreign")).rejects.toMatchObject({ code: "invalid_request" });
    await expect(client.artifactPage(jobId, { limit: 8193 })).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects a foreign profile, contradictory page and foreign job rather than trusting 200", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(json(statusFor(family === "pdf" ? "browser" : "pdf")));
    const client = createZeroComponentApplicationClient(family, binding(), { fetch });
    await expect(client.status()).rejects.toMatchObject({ code: "invalid_response" });
    for (const patch of [
      { offset: 1 },
      { nextOffset: 2 },
      { contentBase64: "e31=" },
      { totalBytes: 1 },
    ]) {
      fetch.mockResolvedValueOnce(json({ ...page, ...patch }));
      await expect(client.artifactPage(jobId)).rejects.toMatchObject({ code: "invalid_response" });
    }
    fetch.mockResolvedValueOnce(
      json({
        jobId: "22222222-2222-4222-8222-222222222222",
        state: "running",
        attempts: 1,
        reason: null,
      }),
    );
    await expect(client.get(jobId)).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("preserves missing-profile status and redacts untrusted backend failures", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ error: "component_profile_unavailable" }, 503))
      .mockResolvedValueOnce(json({ error: `private-${token}` }, 500));
    const client = createZeroComponentApplicationClient(family, binding(), { fetch });
    await expect(client.status()).rejects.toMatchObject({ code: "component_profile_unavailable" });
    const error = await client.status().catch((error) => error);
    expect(error).toBeInstanceOf(ZeroApplicationTransportError);
    expect(error.code).toBe("application_unavailable");
    expect(String(error)).not.toContain(token);
  });
  it("reloads private bindings and rejects expired or broadened file permissions", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "zero-extraction-binding-"));
    const file = path.join(root, "binding.json");
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json(statusFor(family)));
    try {
      await writeFile(file, JSON.stringify(binding()), { mode: 0o600 });
      const client = createZeroComponentApplicationClientFromFile(family, file, { fetch });
      expect(await client.status()).toEqual(statusFor(family));
      await writeFile(file, JSON.stringify({ ...binding(), expiresAt: new Date(0).toISOString() }));
      await expect(client.status()).rejects.toMatchObject({ code: "binding_expired" });
      await writeFile(file, JSON.stringify(binding()));
      await chmod(file, 0o644);
      await expect(client.status()).rejects.toMatchObject({ code: "invalid_binding" });
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
it("does not accept an arbitrary extraction family", () => {
  expect(() => zeroExtractionSchemas("shell" as never)).toThrow(ZeroApplicationTransportError);
});
