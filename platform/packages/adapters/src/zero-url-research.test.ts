import { randomUUID } from "node:crypto";
import { IsolationError } from "@rakazo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { zeroComponentDigest, zeroComponentHash } from "./zero-component-jobs.js";
import { ZERO_URL_DOCUMENT_MODE, ZERO_URL_DOCUMENT_PROFILE } from "./zero-url-document-contract.js";
import type { ZeroUrlResearchResolve } from "./zero-url-research.js";
import { createZeroUrlResearchService, runZeroUrlResearch } from "./zero-url-research.js";
import type { ZeroUrlResearchBinding } from "./zero-url-research-contract.js";
import {
  isZeroResearchSourceUrl,
  ZERO_URL_DOCUMENT_RESOURCE_PROFILE,
  ZERO_URL_RESEARCH_LIMITS,
  ZERO_URL_RESEARCH_MODE,
  ZERO_URL_RESEARCH_PROFILE,
  zeroUrlResearchBindingSchema,
  zeroUrlResearchDocumentBindingSchema,
} from "./zero-url-research-contract.js";

const render = vi.hoisted(() => vi.fn());
const renderDocument = vi.hoisted(() => vi.fn());
vi.mock("./zero-url-document-runtime.js", () => ({ executeZeroUrlDocument: renderDocument }));
vi.mock("./zero-browser-static-runtime.js", () => ({ executeZeroBrowser: render }));
const html = "<title>Approved schedule</title><p>Saturday 10:00-14:00</p>";
const url = "https://research-fixture.example/hours";
type Row = { id: string; [key: string]: unknown };
function fixture() {
  const principal = {
    spaceId: "space",
    userId: "user",
    scopeId: "scope",
    policyRevision: "rev",
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
  };
  const binding: ZeroUrlResearchBinding = {
    profile: ZERO_URL_RESEARCH_PROFILE,
    tasks: [{ taskId: "hours", sourceId: "schedule", url }],
    runtime: {
      dockerExecutable: "/usr/bin/docker",
      dockerConfigDirectory: "/tmp/research-config",
      imageId: "sha256:" + "a".repeat(64),
      buildInputLockSha256: "b".repeat(64),
    },
  };
  const rows = new Map<string, Row>(),
    storage = new Map<string, Uint8Array>();
  const artifacts = {
    put: vi.fn(async (input: { bytes: Uint8Array }) => {
      const id = randomUUID();
      storage.set(id, input.bytes);
      return { id };
    }),
    get: vi.fn(async (id: string) => {
      const value = storage.get(id);
      if (!value) throw Error("missing");
      return value;
    }),
    remove: vi.fn(async (id: string) => {
      storage.delete(id);
    }),
  };
  let revoked = false;
  const authorize = vi.fn(async () => {
    if (revoked) throw new IsolationError();
  });
  const prisma = {
    spaceMember: { findUnique: vi.fn(async () => ({ id: "membership" })) },
    artifact: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null),
      findUnique: vi.fn(
        async ({ where }: { where: { spaceId_userId_clientNonce: { clientNonce: string } } }) =>
          [...rows.values()].find(
            (row) => row.clientNonce === where.spaceId_userId_clientNonce.clientNonce,
          ) ?? null,
      ),
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: randomUUID(), rootArtifactId: null, ...data } as Row;
        rows.set(row.id, row);
        return row;
      }),
    },
    $queryRaw: vi.fn(async () => [{ now: new Date() }]),
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(prisma),
  };
  const fetch = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }),
  );
  const resolveHostname = vi.fn(async () => [{ address: "93.184.216.34", family: 4 as const }]);
  const deps = {
    prisma,
    artifacts,
    authorize,
    jobs: { enqueue: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined) },
    resolveUrlResearch: vi.fn<ZeroUrlResearchResolve>(async () => binding),
    testOnlyTransport: { fetch: fetch as never, resolveHostname },
  };
  const service = createZeroUrlResearchService(deps as never, principal);
  const submit = () =>
    service.submit({
      taskId: "hours",
      idempotencyKey: "same",
      deadline: new Date(Date.now() + 60_000).toISOString(),
    });
  return {
    principal,
    binding,
    rows,
    storage,
    artifacts,
    authorize,
    deps,
    service,
    fetch,
    resolveHostname,
    submit,
    revoke: () => {
      revoked = true;
    },
  };
}

function documentFixture() {
  const f = fixture();
  const documentBinding = zeroUrlResearchDocumentBindingSchema.parse({
    ...f.binding,
    profile: ZERO_URL_DOCUMENT_PROFILE,
    resourceProfile: ZERO_URL_DOCUMENT_RESOURCE_PROFILE,
    runtime: {
      ...f.binding.runtime,
      runnerDirectory: "/tmp/document-release",
      runnerSha256: "f".repeat(64),
    },
  });
  f.deps.resolveUrlResearch.mockImplementation(async () => documentBinding);
  return {
    ...f,
    documentBinding,
    submit: () =>
      f.service.submit({
        profile: ZERO_URL_DOCUMENT_PROFILE,
        taskId: "hours",
        idempotencyKey: "same",
        deadline: new Date(Date.now() + 60_000).toISOString(),
      }),
  };
}
beforeEach(() => {
  renderDocument.mockReset();
  renderDocument.mockImplementation(async (config, input, signal) => {
    await config.authorize(signal);
    return {
      state: "succeeded",
      cleanup: "confirmed_absent",
      runnerSha256: config.runnerSha256,
      imageId: config.imageId,
      buildInputLockSha256: config.buildInputLockSha256,
      output: {
        profile: ZERO_URL_DOCUMENT_PROFILE,
        source: input.source,
        navigation: {
          requestedUrl: input.source.url,
          responseUrl: input.source.url,
          finalUrl: input.source.url,
          fulfilledBodySha256: input.source.sha256,
        },
        documentSha256: "d".repeat(64),
        answer: {
          kind: "first-visible-paragraph",
          sourceUrl: input.source.url,
          quote: "Saturday 10:00-14:00",
        },
        screenshot: { sha256: "e".repeat(64), mimeType: "image/png" },
      },
    };
  });
  render.mockReset();
  render.mockImplementation(async (_config, input) => ({
    state: "succeeded",
    output: {
      profile: "zero-browser-static-v1",
      sourceSha256: zeroComponentHash(input.bytes),
      renderedSha256: "c".repeat(64),
      url: "https://zero-static.invalid/input",
      title: "Approved schedule",
      visibleText: "Saturday 10:00-14:00",
    },
  }));
});
describe("closed URL research request and registry", () => {
  it.each([
    "http://example.com/",
    "https://user:password@example.com/",
    "https://example.com:444/",
    "https://example.com/?q=private",
    "https://example.com/#part",
    "https://EXAMPLE.com/",
    "https://example.com/a/../b",
    "https://127.0.0.1/",
    "https://169.254.169.254/",
    "https://localhost/",
    "https://service.internal/",
    "file:///private",
    "javascript:alert(1)",
  ])("rejects noncanonical or forbidden operator URL %s", (value) =>
    expect(isZeroResearchSourceUrl(value)).toBe(false),
  );
  it("accepts canonical public HTTPS while requiring actual DNS checks at fetch", () => {
    expect(isZeroResearchSourceUrl(url)).toBe(true);
    expect(isZeroResearchSourceUrl("https://example.com:443/")).toBe(false);
  });
  it.each([
    { url: "https://example.com/" },
    { path: "/private" },
    { js: "readPrivate()" },
    { selector: "#secret" },
    { sourceId: "arbitrary" },
    { taskId: "unapproved" },
  ])("rejects caller authority and unknown task IDs before network", async (extra) => {
    const f = fixture();
    await expect(
      f.service.submit({
        taskId: "hours",
        idempotencyKey: "a",
        deadline: new Date(Date.now() + 60_000).toISOString(),
        ...extra,
      }),
    ).rejects.toThrow();
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.deps.jobs.enqueue).not.toHaveBeenCalled();
  });
  it("rejects duplicate registry IDs and transport knobs in production binding schema", () => {
    const f = fixture();
    expect(
      zeroUrlResearchBindingSchema.safeParse({
        ...f.binding,
        tasks: [...f.binding.tasks, ...f.binding.tasks],
      }).success,
    ).toBe(false);
    expect(
      zeroUrlResearchBindingSchema.safeParse({
        ...f.binding,
        testOnlyTransport: { fetch: "override" },
      }).success,
    ).toBe(false);
  });
});
describe("URL source capture on the shared job lifecycle (mocked renderer, synthetic transport)", () => {
  it("captures exact fetched bytes and URL separately from inert rendering", async () => {
    const f = fixture(),
      job = await f.submit();
    await runZeroUrlResearch(f.deps as never, job.jobId);
    const receipt = JSON.parse((await f.service.artifact(job.jobId)).content);
    expect(receipt).toMatchObject({
      state: "succeeded",
      mode: ZERO_URL_RESEARCH_MODE,
      paidModelCalls: 0,
      source: {
        url,
        sha256: zeroComponentHash(html),
        bytes: Buffer.byteLength(html),
        sourceId: "schedule",
      },
      extraction: { url: "https://zero-static.invalid/input" },
    });
    expect(Buffer.from(receipt.sourceContent.contentBase64, "base64").toString()).toBe(html);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
    expect(f.fetch.mock.calls[0]?.[0]).toBe(url);
    expect(
      [...f.rows.values()].filter((row) => row.name === "zero-research-source.html"),
    ).toHaveLength(1);
  });
  it("reuses immutable raw source after a real worker-stage exception", async () => {
    const f = fixture(),
      job = await f.submit();
    render.mockRejectedValueOnce(Error("synthetic worker crash"));
    await expect(runZeroUrlResearch(f.deps as never, job.jobId)).rejects.toThrow(
      "synthetic worker crash",
    );
    f.fetch.mockResolvedValue(
      new Response("changed", { headers: { "content-type": "text/html" } }),
    );
    await runZeroUrlResearch(f.deps as never, job.jobId);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse((await f.service.artifact(job.jobId)).content).source.sha256).toBe(
      zeroComponentHash(html),
    );
  });
  it("blocks a changed source registry before reading private request storage", async () => {
    const f = fixture(),
      job = await f.submit();
    f.binding.tasks[0]!.url = "https://research-fixture.example/changed";
    await expect(f.service.get(job.jobId)).rejects.toBeInstanceOf(IsolationError);
    expect(f.artifacts.get).not.toHaveBeenCalled();
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("blocks revocation during the private request read before fetch", async () => {
    const f = fixture(),
      job = await f.submit(),
      get = f.artifacts.get.getMockImplementation()!;
    f.artifacts.get.mockImplementationOnce(async (id) => {
      const bytes = await get(id);
      f.revoke();
      return bytes;
    });
    await runZeroUrlResearch(f.deps as never, job.jobId);
    expect(f.fetch).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });
  it("preserves cancellation before worker reconnect and dispatches no network", async () => {
    const f = fixture(),
      job = await f.submit();
    await f.service.cancel(job.jobId);
    await runZeroUrlResearch(f.deps as never, job.jobId);
    expect((await f.service.get(job.jobId)).state).toBe("cancelled");
    expect(f.fetch).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });
  it("rechecks source registry after fetch before storing private bytes", async () => {
    const f = fixture(),
      job = await f.submit();
    f.fetch.mockImplementation(async () => {
      f.binding.tasks[0]!.sourceId = "changed";
      return new Response(html, { headers: { "content-type": "text/html" } });
    });
    await runZeroUrlResearch(f.deps as never, job.jobId);
    expect(render).not.toHaveBeenCalled();
    expect(
      [...f.rows.values()].filter((row) => row.name === "zero-research-source.html"),
    ).toHaveLength(0);
  });
  it.each(["redirect", "oversize", "privateDNS", "wrongHash"])(
    "fails closed on %s without rendering",
    async (kind) => {
      const f = fixture();
      if (kind === "redirect")
        f.fetch.mockResolvedValue(
          new Response(null, { status: 302, headers: { location: "https://other.example/" } }),
        );
      if (kind === "oversize")
        f.fetch.mockResolvedValue(
          new Response("x".repeat(ZERO_URL_RESEARCH_LIMITS.sourceBytes + 1), {
            headers: { "content-type": "text/html" },
          }),
        );
      if (kind === "privateDNS")
        f.resolveHostname.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
      if (kind === "wrongHash") f.binding.tasks[0]!.expectedSha256 = "d".repeat(64);
      const job = await f.submit();
      await runZeroUrlResearch(f.deps as never, job.jobId);
      expect(render).not.toHaveBeenCalled();
      expect((await f.service.get(job.jobId)).state).toBe("failed");
      expect(f.fetch.mock.calls.length).toBeLessThanOrEqual(1);
      if (kind === "privateDNS") expect(f.fetch).not.toHaveBeenCalled();
    },
  );
  it("detects retained source corruption before renderer reuse", async () => {
    const f = fixture(),
      job = await f.submit();
    render.mockRejectedValueOnce(Error("synthetic crash"));
    await expect(runZeroUrlResearch(f.deps as never, job.jobId)).rejects.toThrow();
    const source = [...f.rows.values()].find((row) => row.name === "zero-research-source.html")!;
    f.storage.set(String(source.storageKey), Buffer.from("tampered"));
    await runZeroUrlResearch(f.deps as never, job.jobId);
    expect(render).toHaveBeenCalledTimes(1);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect((await f.service.get(job.jobId)).state).toBe("failed");
  });
});

describe("captured-document research seam (mocked runtime; no browser qualification)", () => {
  it("requires explicit new profile and rejects cross-profile submissions before storage or network", async () => {
    const f = documentFixture();
    await expect(
      f.service.submit({
        taskId: "hours",
        idempotencyKey: "old-client",
        deadline: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(IsolationError);
    const old = fixture();
    await expect(
      old.service.submit({
        profile: ZERO_URL_DOCUMENT_PROFILE,
        taskId: "hours",
        idempotencyKey: "new-client",
        deadline: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(IsolationError);
    expect(f.artifacts.put).not.toHaveBeenCalled();
    expect(f.fetch).not.toHaveBeenCalled();
    expect(old.deps.jobs.enqueue).not.toHaveBeenCalled();
  });
  it.each([
    "url",
    "contentBase64",
    "runnerDirectory",
    "runnerSha256",
    "headers",
    "command",
    "resourceProfile",
  ])("rejects caller-controlled %s", async (field) => {
    const f = documentFixture();
    await expect(
      f.service.submit({
        profile: ZERO_URL_DOCUMENT_PROFILE,
        taskId: "hours",
        idempotencyKey: "invalid",
        deadline: new Date(Date.now() + 60_000).toISOString(),
        [field]: "caller-controlled",
      }),
    ).rejects.toThrow();
    expect(f.artifacts.put).not.toHaveBeenCalled();
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("keeps old registry serialization and request kind exactly on the inert path", async () => {
    const f = fixture(),
      job = await f.submit();
    const row = f.rows.get(job.jobId)!;
    const request = JSON.parse(Buffer.from(f.storage.get(String(row.storageKey))!).toString());
    expect(request.registrySha256).toBe(
      zeroComponentHash(
        JSON.stringify({
          profile: f.binding.profile,
          tasks: f.binding.tasks,
          imageId: f.binding.runtime.imageId,
          buildInputLockSha256: f.binding.runtime.buildInputLockSha256,
        }),
      ),
    );
    expect(request.kind).toBe("zero.research.request.v1");
    expect(request).not.toHaveProperty("runnerSha256");
    expect(request).not.toHaveProperty("resourceProfile");
    expect(await f.service.status()).toEqual({
      profile: ZERO_URL_RESEARCH_PROFILE,
      backend: "available",
      paidModelCalls: 0,
      execution: ZERO_URL_RESEARCH_MODE,
      limits: ZERO_URL_RESEARCH_LIMITS,
    });
  });
  it("pins new kind, runner, resource profile and registry onto the same shared Graphile job", async () => {
    const f = documentFixture(),
      job = await f.submit();
    const row = f.rows.get(job.jobId)!;
    const request = JSON.parse(Buffer.from(f.storage.get(String(row.storageKey))!).toString());
    const { requestDigest, ...body } = request;
    expect(zeroComponentDigest(body)).toBe(requestDigest);
    expect(request).toMatchObject({
      kind: "zero.research.document.request.v1",
      profile: ZERO_URL_DOCUMENT_PROFILE,
      resourceProfile: ZERO_URL_DOCUMENT_RESOURCE_PROFILE,
      runnerSha256: f.documentBinding.runtime.runnerSha256,
      url,
    });
    expect(request.registrySha256).toBe(
      zeroComponentHash(
        JSON.stringify({
          profile: f.documentBinding.profile,
          tasks: f.documentBinding.tasks,
          imageId: f.documentBinding.runtime.imageId,
          buildInputLockSha256: f.documentBinding.runtime.buildInputLockSha256,
          runnerSha256: f.documentBinding.runtime.runnerSha256,
          resourceProfile: f.documentBinding.resourceProfile,
        }),
      ),
    );
    expect(f.deps.jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "zero.research.extract",
        payload: { requestArtifactId: job.jobId },
      }),
    );
    expect(f.fetch).not.toHaveBeenCalled();
    expect(await f.service.status()).toMatchObject({
      profile: ZERO_URL_DOCUMENT_PROFILE,
      execution: ZERO_URL_DOCUMENT_MODE,
      resourceProfile: ZERO_URL_DOCUMENT_RESOURCE_PROFILE,
      limits: { scratchFileBytes: 16_777_216, cpus: 1, memoryMiB: 512 },
    });
  });
  it("passes exact captured bytes and original URL to the fixed runner and retains distinct evidence", async () => {
    const f = documentFixture(),
      job = await f.submit();
    await runZeroUrlResearch(f.deps as never, job.jobId);
    expect(render).not.toHaveBeenCalled();
    expect(renderDocument).toHaveBeenCalledTimes(1);
    const [config, input] = renderDocument.mock.calls[0]!;
    expect(config.runnerSha256).toBe(f.documentBinding.runtime.runnerSha256);
    expect(input.source).toEqual({
      url,
      sha256: zeroComponentHash(html),
      bytes: Buffer.byteLength(html),
    });
    expect(Buffer.from(input.contentBase64, "base64").toString()).toBe(html);
    const receipt = JSON.parse((await f.service.artifact(job.jobId)).content);
    expect(receipt).toMatchObject({
      profile: ZERO_URL_DOCUMENT_PROFILE,
      mode: ZERO_URL_DOCUMENT_MODE,
      state: "succeeded",
      runnerSha256: f.documentBinding.runtime.runnerSha256,
      resourceProfile: ZERO_URL_DOCUMENT_RESOURCE_PROFILE,
      sourceCapture: { kind: "synthetic_fixture_transport" },
      source: { url, sha256: zeroComponentHash(html) },
      extraction: {
        navigation: {
          requestedUrl: url,
          responseUrl: url,
          finalUrl: url,
          fulfilledBodySha256: zeroComponentHash(html),
        },
        documentSha256: "d".repeat(64),
        screenshot: { sha256: "e".repeat(64) },
      },
      paidModelCalls: 0,
    });
    expect(receipt.limitations.join(" ")).toContain("truth grading is separate");
  });
  it("blocks changed runner binding before any private request or receipt read", async () => {
    const f = documentFixture(),
      job = await f.submit();
    f.documentBinding.runtime.runnerSha256 = "c".repeat(64);
    await expect(f.service.get(job.jobId)).rejects.toBeInstanceOf(IsolationError);
    expect(f.artifacts.get).not.toHaveBeenCalled();
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("rechecks the current binding after source fetch and stores no bytes after revocation", async () => {
    const f = documentFixture(),
      job = await f.submit();
    f.fetch.mockImplementation(async () => {
      f.documentBinding.runtime.runnerSha256 = "c".repeat(64);
      return new Response(html, { headers: { "content-type": "text/html" } });
    });
    await runZeroUrlResearch(f.deps as never, job.jobId);
    expect(renderDocument).not.toHaveBeenCalled();
    expect([...f.rows.values()].some((row) => row.name === "zero-research-source.html")).toBe(
      false,
    );
  });
  it("suppresses a runtime result after grant revocation and retains only blocked terminal evidence", async () => {
    const f = documentFixture(),
      job = await f.submit();
    const original = renderDocument.getMockImplementation()!;
    renderDocument.mockImplementation(async (...args) => {
      const result = await original(...args);
      f.revoke();
      return result;
    });
    await runZeroUrlResearch(f.deps as never, job.jobId);
    const row = [...f.rows.values()].find((row) => row.name === "zero-research-receipt.json")!;
    expect(JSON.parse(String(row.description)).state).toBe("blocked");
    await expect(f.service.artifact(job.jobId)).rejects.toBeInstanceOf(IsolationError);
  });
  it("preserves cancellation through worker reconnect without fetch or dispatch", async () => {
    const f = documentFixture(),
      job = await f.submit();
    await f.service.cancel(job.jobId);
    await runZeroUrlResearch(f.deps as never, job.jobId);
    expect((await f.service.get(job.jobId)).state).toBe("cancelled");
    expect(f.fetch).not.toHaveBeenCalled();
    expect(renderDocument).not.toHaveBeenCalled();
  });
  it("blocks uncertain cleanup rather than publishing execution success", async () => {
    const f = documentFixture(),
      job = await f.submit();
    renderDocument.mockResolvedValue({
      state: "unknown",
      code: "URL_DOCUMENT_CLEANUP_UNKNOWN",
      quarantineId: "synthetic-container",
    });
    await runZeroUrlResearch(f.deps as never, job.jobId);
    expect((await f.service.get(job.jobId)).state).toBe("blocked");
    expect(JSON.parse((await f.service.artifact(job.jobId)).content)).toMatchObject({
      reason: "URL_DOCUMENT_CLEANUP_UNKNOWN",
      cleanup: { state: "unknown", quarantineId: "synthetic-container" },
    });
  });
  it("uses the existing four-total quota rather than creating a separate document quota", async () => {
    const f = documentFixture();
    f.deps.prisma.artifact.findMany.mockResolvedValue([{}, {}, {}, {}] as never);
    await expect(f.submit()).rejects.toThrow("scope_job_limit_exceeded");
    expect(f.deps.jobs.enqueue).not.toHaveBeenCalled();
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("reuses immutable captured source after a worker failure instead of fetching a new revision", async () => {
    const f = documentFixture(),
      job = await f.submit();
    renderDocument.mockRejectedValueOnce(Error("synthetic document worker crash"));
    await expect(runZeroUrlResearch(f.deps as never, job.jobId)).rejects.toThrow(
      "synthetic document worker crash",
    );
    f.fetch.mockResolvedValue(
      new Response("changed", { headers: { "content-type": "text/html" } }),
    );
    await runZeroUrlResearch(f.deps as never, job.jobId);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(renderDocument.mock.calls[1]![1].source.sha256).toBe(zeroComponentHash(html));
  });
});

describe("captured research current-authority and fetch guards", () => {
  it("rechecks runner binding after private request storage I/O", async () => {
    const f = documentFixture(),
      job = await f.submit();
    const original = f.artifacts.get.getMockImplementation()!;
    f.artifacts.get.mockImplementationOnce(async (id) => {
      const value = await original(id);
      f.documentBinding.runtime.runnerSha256 = "c".repeat(64);
      return value;
    });
    await expect(f.service.get(job.jobId)).rejects.toBeInstanceOf(IsolationError);
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each(["redirect", "oversize", "privateDNS", "wrongHash"])(
    "retains the bounded source guard for %s on the new execution kind",
    async (kind) => {
      const f = documentFixture();
      if (kind === "redirect")
        f.fetch.mockResolvedValue(
          new Response(null, {
            status: 302,
            headers: { location: "https://foreign.invalid/" },
          }),
        );
      if (kind === "oversize")
        f.fetch.mockResolvedValue(
          new Response("x".repeat(16_385), {
            headers: { "content-type": "text/html" },
          }),
        );
      if (kind === "privateDNS")
        f.resolveHostname.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
      if (kind === "wrongHash") f.documentBinding.tasks[0]!.expectedSha256 = "d".repeat(64);
      const job = await f.submit();
      await runZeroUrlResearch(f.deps as never, job.jobId);
      expect((await f.service.get(job.jobId)).state).toBe("failed");
      expect(renderDocument).not.toHaveBeenCalled();
      expect(render).not.toHaveBeenCalled();
      if (kind === "privateDNS") expect(f.fetch).not.toHaveBeenCalled();
    },
  );
});
