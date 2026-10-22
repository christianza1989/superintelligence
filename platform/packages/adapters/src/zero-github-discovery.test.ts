import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { selectRepositoryWithJev } from "./zero-repository-selector.js";
import {
  discoverGithubSources,
  githubRepositoryOptions,
  inspectGithubSource,
} from "./zero-github-discovery.js";
import {
  githubQueriesSchema,
  githubSourcePathSchema,
} from "./zero-github-contract.js";

import { githubFixture } from "./zero-github-discovery.test-fixture.js";

describe("bounded live public GitHub discovery (offline transport)", () => {
  it("uses a private worker credential for public fixed-origin GETs and denies a newly private repository", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "zero-github-access-"));
    const tokenFile = path.join(dir, "token");
    await writeFile(tokenFile, "x".repeat(40), { mode: 0o600 });
    try {
      const fixture = githubFixture(true);
      const result = await discoverGithubSources(["inventory"], {
        ...fixture.boundary,
        tokenFile,
      });
      expect(result.network.access).toBe("authenticated-public-only");
      expect(
        result.candidates[0]!.implementationEvidence.inspectedCodePaths,
      ).toEqual(["src/model.ts"]);
      expect(JSON.stringify(result)).not.toContain("x".repeat(40));
      fixture.fetch.mockImplementation(async () =>
        Response.json({ ...fixture.entry, private: true }),
      );
      await expect(
        inspectGithubSource(
          { repository: "example/unindexed", sourceRevision: fixture.pin },
          ["src/model.ts"],
          { ...fixture.boundary, tokenFile },
        ),
      ).rejects.toThrow();
      await writeFile(tokenFile, "invalid\nheader");
      fixture.fetch.mockClear();
      const denied = await discoverGithubSources(["inventory"], {
        ...fixture.boundary,
        tokenFile,
      });
      expect(denied.candidates).toEqual([]);
      expect(fixture.fetch).not.toHaveBeenCalled();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("finds an unindexed low-star fork, resolves an exact commit and verifies actual document blob hashes", async () => {
    const fixture = githubFixture();
    const result = await discoverGithubSources(
      ["inventory foundation", "parts stock"],
      fixture.boundary,
    );
    expect(result.matchedRepositories).toBe(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      repository: "example/unindexed",
      sourceRevision: fixture.pin,
      prepared: false,
      runtimeTested: false,
      licenseApproved: false,
      stars: 3,
    });
    expect(result.candidates[0]!.files).toHaveLength(3);
    expect(result.candidates[0]!.files[0]!.sha256).toBe(
      createHash("sha256").update(fixture.docs[0]!.text).digest("hex"),
    );
    expect(result.network.requests).toBe(7);
    expect(fixture.authorize).toHaveBeenCalledTimes(15);
    expect(
      result.candidates[0]!.implementationEvidence.inspectedCodePaths,
    ).toEqual(["src/model.ts"]);
    const option = githubRepositoryOptions(result.candidates)[0]!;
    expect(option.capability).toContain("UNTRUSTED_SOURCE_MARKER");
    expect(option.capability).toContain("untrusted claims");
    expect(option.licenseSource).toContain("not license approval");
  });
  it("reads an actual pinned code file or directory without installing or executing it", async () => {
    const fixture = githubFixture();
    const result = await inspectGithubSource(
      { repository: "example/unindexed", sourceRevision: fixture.pin },
      ["src", "src/model.ts"],
      fixture.boundary,
    );
    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "file",
          path: "src/model.ts",
          excerpt: fixture.docs[2]!.text,
        }),
      ]),
    );
    expect(result).toMatchObject({
      prepared: false,
      runtimeTested: false,
      licenseApproved: false,
    });
  });
  it("lists the pinned root and preserves valid code reads alongside a missing path", async () => {
    const fixture = githubFixture();
    const result = await inspectGithubSource(
      { repository: "example/unindexed", sourceRevision: fixture.pin },
      ["missing.ts", ".", "src/model.ts"],
      fixture.boundary,
    );
    expect(result.entries).toContainEqual(
      expect.objectContaining({ path: ".", type: "directory" }),
    );
    expect(result.entries).toContainEqual(
      expect.objectContaining({
        path: "src/model.ts",
        type: "file",
        excerpt: fixture.docs[2]!.text,
      }),
    );
    expect(result.failures).toEqual([
      { path: "missing.ts", reason: "source_unavailable" },
    ]);
    expect(result.runtimeTested).toBe(false);
    const missing = await inspectGithubSource(
      { repository: "example/unindexed", sourceRevision: fixture.pin },
      ["missing.ts"],
      fixture.boundary,
    );
    expect(missing.entries).toEqual([]);
    expect(missing.failures).toHaveLength(1);
  });
  it.each([
    "../secret",
    "/etc/passwd",
    "a/../b",
    "a\\b",
    "https://example.invalid/file",
    "a\nfile",
    "C:/Users/private",
  ])("rejects unsafe relative source path %s", (path) => {
    expect(githubSourcePathSchema.safeParse(path).success).toBe(false);
  });
  it("rejects arbitrary URLs, advanced scope qualifiers and duplicate search phrases before network", async () => {
    for (const queries of [
      ["https://example.invalid"],
      ["repo:private/secret"],
      ["inventory", "inventory"],
      ["local offline software import export database roles permissions"],
      Array(4).fill("stock"),
    ])
      expect(githubQueriesSchema.safeParse(queries).success).toBe(false);
  });
  it("denies private DNS and changed grants before any public request", async () => {
    const fixture = githubFixture();
    await discoverGithubSources(["inventory"], {
      ...fixture.boundary,
      testOnlyTransport: {
        ...fixture.boundary.testOnlyTransport,
        resolveHostname: async () => [{ address: "127.0.0.1", family: 4 }],
      },
    });
    expect(fixture.fetch).not.toHaveBeenCalled();
    fixture.authorize.mockRejectedValue(new Error("fixture denied"));
    await expect(
      discoverGithubSources(["inventory"], fixture.boundary),
    ).rejects.toThrow("fixture denied");
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it("keeps rate limits and incomplete search visible without retries or fabricated candidates", async () => {
    const fixture = githubFixture();
    fixture.fetch.mockResolvedValue(new Response(null, { status: 429 }));
    const result = await discoverGithubSources(
      ["inventory", "repair"],
      fixture.boundary,
    );
    expect(result.candidates).toEqual([]);
    expect(result.failures[0]?.reason).toBe("rate_or_access_limit");
    expect(result.network.rateLimited).toBe(true);
    expect(fixture.fetch).toHaveBeenCalledOnce();
  });
  it("preserves finished source evidence when its research budget expires, but propagates parent cancellation", async () => {
    const fixture = githubFixture();
    const research = new AbortController();
    const parent = new AbortController();
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    const spy = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation((ms) =>
        ms === 12000 ? research.signal : timeout(ms),
      );
    const original = fixture.fetch.getMockImplementation()!;
    fixture.fetch.mockImplementation(async (input, options) => {
      const url = String(input);
      if (url.includes("/repos/example/second/")) {
        research.abort(
          new DOMException("Research budget expired", "TimeoutError"),
        );
        return new Response(null, { status: 404 });
      }
      const response = await original(input, options);
      if (url.includes("/search/repositories"))
        return Response.json({
          total_count: 2,
          incomplete_results: false,
          items: [
            fixture.entry,
            { ...fixture.entry, full_name: "example/second" },
          ],
        });
      return response;
    });
    try {
      const result = await discoverGithubSources(["inventory"], {
        ...fixture.boundary,
        signal: parent.signal,
      });
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]!.files).toHaveLength(3);
      expect(result.network.researchDeadlineReached).toBe(true);
      expect(result.failures).toContainEqual(
        expect.objectContaining({ reason: "research_deadline" }),
      );
      parent.abort();
      await expect(
        discoverGithubSources(["inventory"], {
          ...fixture.boundary,
          signal: parent.signal,
        }),
      ).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
  it("does not follow a public API redirect to another address", async () => {
    const fixture = githubFixture();
    fixture.fetch.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private" },
      }),
    );
    const result = await discoverGithubSources(["inventory"], fixture.boundary);
    expect(result.candidates).toEqual([]);
    expect(fixture.fetch).toHaveBeenCalledOnce();
  });
  it("rejects a blob whose bytes do not match its Git identity", async () => {
    const fixture = githubFixture();
    const original = fixture.fetch.getMockImplementation()!;
    fixture.fetch.mockImplementation(async (input, options) =>
      String(input).includes("/git/blobs/")
        ? Response.json({
            sha: fixture.docs[0]!.sha,
            size: 3,
            encoding: "base64",
            content: "YmFk",
          })
        : original(input, options),
    );
    const result = await discoverGithubSources(["inventory"], fixture.boundary);
    expect(result.candidates[0]?.files).toEqual([]);
    expect(result.failures).toHaveLength(3);
  });
  it("bounds multi-directory Unicode output while retaining exact source identity and explicit truncation", async () => {
    const fixture = githubFixture();
    fixture.fetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = decodeURIComponent(url.pathname.split("/contents/")[1]!);
      return Response.json(
        Array.from({ length: 800 }, (_, index) => ({
          path: `${path}/${"界".repeat(235)}${index}.ts`,
          type: "file",
          sha: "c".repeat(40),
        })),
      );
    });
    const result = await inspectGithubSource(
      { repository: "example/unindexed", sourceRevision: fixture.pin },
      ["src", "lib", "modules", "app"],
      fixture.boundary,
    );
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(
      65536,
    );
    expect(result.entries).toHaveLength(4);
    expect(
      result.entries.every(
        (entry) => entry.type === "directory" && entry.truncated,
      ),
    ).toBe(true);
    expect(result.sourceRevision).toBe(fixture.pin);
  });
  it("fits five Unicode source alternatives into the real paid-transport payload bound without repeating descriptions in criteria", async () => {
    const fixture = githubFixture();
    const source = (
      await discoverGithubSources(["inventory"], fixture.boundary)
    ).candidates[0]!;
    const candidates = Array.from({ length: 5 }, (_, index) => ({
      ...source,
      repository: `example/source${index}`,
      description: "界".repeat(1000),
      files: source.files.map((file) => ({
        ...file,
        excerpt: "界".repeat(1800),
        excerptTruncated: true,
      })),
      sourcePaths: Array.from({ length: 60 }, (_, index) => ({
        path: `src/${"界".repeat(240)}${index}.ts`,
        sha: "c".repeat(40),
        type: "blob" as const,
      })),
    }));
    const options = githubRepositoryOptions(candidates);
    expect(
      options.every((option) => Buffer.byteLength(option.capability) <= 4096),
    ).toBe(true);
    const dispatch = vi.fn<typeof fetch>(async (_input, init) => {
      expect(Buffer.byteLength(String(init?.body))).toBeLessThanOrEqual(32768);
      return Response.json({
        answers: { repository: { type: "choice", choice: "abstain" } },
        usage: { input_tokens: 20, output_tokens: 1 },
      });
    });
    const result = await selectRepositoryWithJev(
      { apiKey: "fixture", model: "fixture/jev", timeoutMs: 1000 },
      {
        fetch: dispatch,
        authorizeDispatch: async () => true,
        stillEligible: async () => true,
        reserve: async (invocationId) => ({
          invocationId,
          hold: async () => {},
        }),
        onUsage: async () => {},
      },
      {
        invocationId: "fixture-unicode",
        generation: 0,
        goal: "Offline inventory with SQLite",
        candidates: options,
      },
    );
    expect(result.status).toBe("abstained");
    expect(dispatch).toHaveBeenCalledOnce();
  });
});
