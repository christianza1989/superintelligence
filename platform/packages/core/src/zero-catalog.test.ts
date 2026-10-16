import { describe, expect, it } from "vitest";
import { repositorySnapshot, repositorySourceUrl, searchRepositories } from "./zero-catalog.js";

describe("repository discovery boundaries", () => {
  it("finds known user candidates without promoting source research to runtime support", () => {
    const [rea] = searchRepositories({ query: "morluto/rea" });
    expect(rea.repository).toBe("morluto/rea");
    expect(rea.runtimeTested).toBe(false);
    expect(rea.licenseApproved).toBe(false);
  });
  it("applies category and availability constraints before ranking and bounds output", () => {
    const results = searchRepositories({ category: "documents", sourceOnly: true, limit: 3 });
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.category === "documents" && r.sourceAvailable)).toBe(true);
    expect(searchRepositories({ query: "no-such-zero-tool-8364781" })).toEqual([]);
  });
  it("keeps canonical identities unique and source links pinned", () => {
    expect(new Set(repositorySnapshot.records.map((r) => r.repository.toLowerCase())).size).toBe(
      repositorySnapshot.records.length,
    );
    const [rakazo] = searchRepositories({ query: "elie222/rakazo" });
    expect(repositorySourceUrl(rakazo)).toMatch(/github.com\/elie222\/rakazo\/tree\/[a-f0-9]{40}$/);
    expect(searchRepositories({ limit: 1_000 })).toHaveLength(100);
  });
});
