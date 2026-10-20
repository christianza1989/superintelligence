import { randomUUID } from "node:crypto";
import { IsolationError } from "@rakazo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { zeroComponentHash } from "./zero-component-jobs.js";
import {
  isZeroResearchSourceUrl,
  ZERO_URL_RESEARCH_MODE,
  ZERO_URL_RESEARCH_PROFILE,
  ZERO_URL_RESEARCH_LIMITS,
  zeroUrlResearchBindingSchema,
} from "./zero-url-research-contract.js";
import type { ZeroUrlResearchBinding } from "./zero-url-research-contract.js";
import { createZeroUrlResearchService, runZeroUrlResearch } from "./zero-url-research.js";
const render = vi.hoisted(() => vi.fn());
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
    resolveUrlResearch: vi.fn(async () => binding),
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
beforeEach(() => {
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
