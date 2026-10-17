import { describe, expect, it } from "vitest";
import {
  repositorySnapshot,
  repositorySourceUrl,
  searchRepositories,
} from "./zero-catalog.js";
import { repositoryNeedDevProbes } from "./zero-catalog.dev-probes.js";

describe("repository discovery boundaries", () => {
  it("finds known user candidates without promoting source research to runtime support", () => {
    const [rea] = searchRepositories({ query: "morluto/rea" });
    if (!rea) throw new Error("Missing known source candidate");
    expect(rea.repository).toBe("morluto/rea");
    expect(rea.runtimeTested).toBe(false);
    expect(rea.licenseApproved).toBe(false);
  });
  it("applies category and availability constraints before ranking and bounds output", () => {
    const results = searchRepositories({
      category: "documents",
      sourceOnly: true,
      limit: 3,
    });
    expect(results).toHaveLength(3);
    expect(
      results.every((r) => r.category === "documents" && r.sourceAvailable),
    ).toBe(true);
    expect(searchRepositories({ query: "no-such-zero-tool-8364781" })).toEqual(
      [],
    );
  });
  it("keeps canonical identities unique and source links pinned", () => {
    expect(
      new Set(repositorySnapshot.records.map((r) => r.repository.toLowerCase()))
        .size,
    ).toBe(repositorySnapshot.records.length);
    const [rakazo] = searchRepositories({ query: "elie222/rakazo" });
    if (!rakazo) throw new Error("Missing known source candidate");
    expect(repositorySourceUrl(rakazo)).toMatch(
      /github.com\/elie222\/rakazo\/tree\/[a-f0-9]{40}$/,
    );
    expect(searchRepositories({ limit: 1_000 })).toHaveLength(100);
  });

  it.each(repositoryNeedDevProbes)(
    "development need probe: $query",
    ({ query, expected }) => {
      expect(
        searchRepositories({ query }).map((entry) => entry.repository),
      ).toEqual(expected);
    },
  );

  it("normalizes punctuation, identity case and Lithuanian diacritics", () => {
    for (const query of [
      "I need an IMAGE-editor, please!",
      "Reikia paveiksleliu redaktoriaus",
    ])
      expect(
        searchRepositories({ query }).map((entry) => entry.repository),
      ).toEqual(["KDE/krita"]);
    expect(
      searchRepositories({ query: "ELIE222 / RAKAZO" }).map(
        (entry) => entry.repository,
      ),
    ).toEqual(["elie222/rakazo"]);
    expect(
      searchRepositories({ query: "DEMUCS/DEMUCS" }).map(
        (entry) => entry.repository,
      ),
    ).toEqual(["demucs/demucs"]);
    expect(
      searchRepositories({
        query: "looking for a table-transformation library",
      }).map((entry) => entry.repository),
    ).toEqual(["pandas-dev/pandas"]);
  });

  it("keeps category and source availability hard constraints for needs and exact names", () => {
    expect(
      searchRepositories({
        query: "image editor",
        category: "images",
        sourceOnly: true,
      }).map((entry) => entry.repository),
    ).toEqual(["KDE/krita"]);
    expect(
      searchRepositories({ query: "image editor", category: "agent-platform" }),
    ).toEqual([]);
    expect(
      searchRepositories({
        query: "image editor",
        category: "popularity-discovery",
        limit: 1,
      }),
    ).toEqual([]);
    expect(
      searchRepositories({ query: "demucs/demucs", sourceOnly: true }),
    ).toEqual([]);
    expect(
      searchRepositories({ query: "elie222/rakazo", category: "data" }),
    ).toEqual([]);
  });

  it("does not relax missing constraints, use disclaimer notes as capabilities or promote blank capabilities", () => {
    for (const query of [
      "image editor CSV",
      "image editor offline",
      "missing license audit",
      "tool please",
      "---",
    ])
      expect(searchRepositories({ query, limit: 1 })).toEqual([]);
    expect(
      searchRepositories({
        query: "image editor",
        category: "image-editing-consistency",
      }),
    ).toEqual([]);
    expect(
      searchRepositories({
        query: "editor",
        category: "image-editing-consistency",
      }),
    ).toEqual([]);
    expect(
      searchRepositories({ query: "stepfun-ai/Step1X-Edit" }),
    ).toHaveLength(1);
  });

  it("preserves original source facts and deterministic order for repeated need queries", () => {
    const before = JSON.stringify(repositorySnapshot);
    const first = searchRepositories({ query: "image editor" });
    expect(searchRepositories({ query: "IMAGE editor" })).toEqual(first);
    expect(first[0]).toBe(
      repositorySnapshot.records.find(
        (entry) => entry.repository === "KDE/krita",
      ),
    );
    expect(first[0]).toMatchObject({
      runtimeTested: false,
      licenseApproved: false,
    });
    expect(JSON.stringify(repositorySnapshot)).toBe(before);
    expect(searchRepositories({ limit: 0 })).toHaveLength(1);
    expect(searchRepositories({ limit: Number.NaN })).toHaveLength(30);
  });
});
