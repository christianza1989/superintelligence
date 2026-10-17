import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { UI_LOCALES } from "./ui-locale";
import {
  getRepositoryMetadata,
  repositorySnapshot,
  searchRepositories,
} from "@rakazo/core/repositoryzero";
import {
  DEFAULT_LIBRARY_FILTERS,
  LIBRARY_FILTERS_KEY,
  LIBRARY_SAVED_KEY,
  hasKnownLicenseSource,
  libraryRepositories,
  librarySearchParams,
  parseLibraryFilters,
  projectRepositoryStars,
  readLibraryFilters,
  readSavedRepositories,
  rememberLibraryFilters,
  repositoryStars,
  saveRepositories,
} from "./repository-library";

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("independent human Library", () => {
  it("shows every catalog record without changing the bounded model search", () => {
    expect(libraryRepositories(DEFAULT_LIBRARY_FILTERS, [])).toHaveLength(
      repositorySnapshot.records.length,
    );
    expect(searchRepositories({ limit: 1000 })).toHaveLength(100);
    expect(
      libraryRepositories(
        { ...DEFAULT_LIBRARY_FILTERS, query: "image editor" },
        [],
      ).map((entry) => entry.repository),
    ).toEqual(["KDE/krita"]);
  });
  it("round trips query, facts filters, view, sort and selected canonical ID", () => {
    const filters = {
      ...DEFAULT_LIBRARY_FILTERS,
      query: "image editor",
      category: "images",
      source: "available",
      license: "known",
      runtime: "untested",
      archived: "active",
      language: "C++",
      sort: "indexed",
      view: "saved",
      repository: "KDE/krita",
    } as const;
    expect(parseLibraryFilters(librarySearchParams(filters))).toEqual(filters);
    const local = storage();
    rememberLibraryFilters(filters, local);
    expect(local.values.has(LIBRARY_FILTERS_KEY)).toBe(true);
    expect(readLibraryFilters(local)).toEqual(filters);
  });
  it("bounds and validates URL inputs without inventing IDs or filter facts", () => {
    const filters = parseLibraryFilters(
      `q=${"x".repeat(300)}&category=admin&source=install&license=approved&runtime=ready&archived=nope&language=InventedLanguage&sort=trending&view=cloud&repo=../../secret`,
    );
    expect(filters).toEqual({
      ...DEFAULT_LIBRARY_FILTERS,
      query: "x".repeat(256),
    });
    expect(parseLibraryFilters("repo=kde%2FKRITA").repository).toBe(
      "KDE/krita",
    );
  });
  it("persists only canonical Saved IDs between independent reads", () => {
    const local = storage();
    expect(
      saveRepositories(
        ["KDE/krita", "kde/KRITA", "missing/repo", "morluto/rea"],
        local,
      ),
    ).toBe(true);
    expect(readSavedRepositories(local)).toEqual({
      ids: ["KDE/krita", "morluto/rea"],
      persistent: true,
    });
    expect(
      libraryRepositories(
        { ...DEFAULT_LIBRARY_FILTERS, view: "saved" },
        readSavedRepositories(local).ids,
      ).map((entry) => entry.repository),
    ).toEqual(["KDE/krita", "morluto/rea"]);
    expect(saveRepositories([], local)).toBe(true);
    expect(readSavedRepositories(local).ids).toEqual([]);
  });
  it("handles malformed or blocked storage and reports writes that cannot persist", () => {
    const local = storage();
    for (const data of [
      { version: 2, repositories: ["KDE/krita"] },
      { version: 1, repositories: ["../../secret", null, 7] },
      null,
    ]) {
      local.setItem(LIBRARY_SAVED_KEY, JSON.stringify(data));
      expect(readSavedRepositories(local).ids).toEqual([]);
    }
    local.setItem(LIBRARY_SAVED_KEY, "invalid JSON");
    expect(readSavedRepositories(local).ids).toEqual([]);
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(readSavedRepositories(blocked)).toEqual({
      ids: [],
      persistent: false,
    });
    expect(saveRepositories(["KDE/krita"], blocked)).toBe(false);
    expect(saveRepositories([], null)).toBe(false);
    expect(readLibraryFilters(blocked)).toEqual(DEFAULT_LIBRARY_FILTERS);
    expect(() =>
      rememberLibraryFilters(DEFAULT_LIBRARY_FILTERS, blocked),
    ).not.toThrow();
  });
  it("applies source, license, runtime and archived facts before pagination", () => {
    const results = libraryRepositories(
      {
        ...DEFAULT_LIBRARY_FILTERS,
        source: "available",
        license: "unknown",
        runtime: "untested",
        archived: "archived",
      },
      [],
    );
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every(
        (entry) =>
          entry.sourceAvailable &&
          !hasKnownLicenseSource(entry) &&
          !entry.runtimeTested &&
          entry.archived,
      ),
    ).toBe(true);
    expect(
      libraryRepositories(
        {
          ...DEFAULT_LIBRARY_FILTERS,
          query: "demucs/demucs",
          source: "available",
        },
        [],
      ),
    ).toEqual([]);
    expect(
      libraryRepositories(
        { ...DEFAULT_LIBRARY_FILTERS, runtime: "tested" },
        [],
      ),
    ).toEqual([]);
  });
  it("joins only actual canonical dated cumulative-star observations", () => {
    expect(repositoryStars.size).toBe(89);
    expect(repositoryStars.get("react/react")).toMatchObject({
      stars: 251066,
      observedAt: "2026-10-15T21:15:51.732703+00:00",
    });
    expect(repositoryStars.get("KDE/krita")).toBeUndefined();
    const sorted = libraryRepositories(
      { ...DEFAULT_LIBRARY_FILTERS, sort: "stars" },
      [],
    );
    expect(
      sorted
        .slice(0, 89)
        .every((entry) => repositoryStars.has(entry.repository)),
    ).toBe(true);
    expect(
      sorted.slice(89).every((entry) => !repositoryStars.has(entry.repository)),
    ).toBe(true);
  });
  it("uses latest successful evidence with timezone offsets and rejects failed or non-star facts", () => {
    const source = "https://github.com/search?q=fixture";
    const observations = [
      {
        repo: "REACT/react",
        kind: "cumulative_stars",
        stars: 10,
        source,
        retrieved_at_utc: "2026-10-15T20:00:00Z",
      },
      {
        repo: "react/react",
        kind: "cumulative_stars",
        stars: 11,
        source,
        retrieved_at_utc: "2026-10-15T23:30:00+03:00",
      },
      {
        repo: "react/react",
        kind: "cumulative_stars",
        stars: 999,
        source,
        retrieved_at_utc: "2026-10-16T20:00:00Z",
      },
      {
        repo: "KDE/krita",
        kind: "trending",
        stars: 500,
        source,
        retrieved_at_utc: "2026-10-15T20:00:00Z",
      },
      {
        repo: "missing/repo",
        kind: "cumulative_stars",
        stars: 500,
        source,
        retrieved_at_utc: "2026-10-15T20:00:00Z",
      },
      {
        repo: "morluto/rea",
        kind: "cumulative_stars",
        stars: -1,
        source,
        retrieved_at_utc: "2026-10-15T20:00:00Z",
      },
    ];
    const sources = observations.slice(0, 3).map((row, i) => ({
      url: source,
      kind: "cumulative_stars",
      status: i === 2 ? 503 : 200,
      retrieved_at_utc: row.retrieved_at_utc,
    }));
    expect([...projectRepositoryStars({ observations, sources })]).toEqual([
      [
        "react/react",
        { stars: 11, source, observedAt: "2026-10-15T23:30:00+03:00" },
      ],
    ]);
  });
  it("filters only known primary languages and keeps unknown metadata visible", () => {
    const known = libraryRepositories(
      { ...DEFAULT_LIBRARY_FILTERS, language: "C++" },
      [],
    );
    expect(known.length).toBeGreaterThan(0);
    expect(known.some((entry) => entry.repository === "KDE/krita")).toBe(true);
    expect(
      known.every(
        (entry) => getRepositoryMetadata(entry.repository)?.language === "C++",
      ),
    ).toBe(true);
    const unknown = libraryRepositories(
      { ...DEFAULT_LIBRARY_FILTERS, language: "unknown" },
      [],
    );
    expect(unknown).toHaveLength(71);
    expect(
      unknown.some((entry) => entry.repository === "get-convex/agent"),
    ).toBe(true);
    expect(
      unknown.every(
        (entry) => !getRepositoryMetadata(entry.repository)?.language,
      ),
    ).toBe(true);
    expect(
      libraryRepositories(
        {
          ...DEFAULT_LIBRARY_FILTERS,
          query: "image editor",
          language: "Python",
        },
        [],
      ),
    ).toEqual([]);
    const params = parseLibraryFilters(
      "language=C%2B%2B&sort=indexed&repo=KDE%2Fkrita",
    );
    expect(params.language).toBe("C++");
    expect(parseLibraryFilters(librarySearchParams(params))).toEqual(params);
  });
  it("sorts actual first Git index events with a stable tie break", () => {
    const rows = libraryRepositories(
      { ...DEFAULT_LIBRARY_FILTERS, sort: "indexed" },
      [],
    );
    expect(rows).toHaveLength(796);
    expect(rows.map((entry) => entry.repository)).toEqual(
      rows.map((entry) => entry.repository).sort((a, b) => a.localeCompare(b)),
    );
    for (const entry of rows)
      expect(
        getRepositoryMetadata(entry.repository)?.firstIndexed?.status,
      ).toBe("first-git-presence");
  });
  it("requires no API or model to browse, filter or save", () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("offline"));
    try {
      const local = storage();
      saveRepositories(["KDE/krita"], local);
      expect(
        libraryRepositories(
          { ...DEFAULT_LIBRARY_FILTERS, view: "saved" },
          readSavedRepositories(local).ids,
        ),
      ).toHaveLength(1);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it("provides every Library message in all existing UI locale catalogs", () => {
    const page = ["RepositoryDirectory", "LibraryProjectHandoff"]
      .map((name) =>
        readFileSync(
          fileURLToPath(new URL("../pages/" + name + ".tsx", import.meta.url)),
          "utf8",
        ),
      )
      .join("\n");
    const messages = new Set(
      [
        ...page.matchAll(/t`([^`]+)`/gu),
        ...page.matchAll(/<Trans>([^<]+)<\/Trans>/gu),
      ].map((match) => match[1]!.replace(/\s+/gu, " ").trim()),
    );
    for (const locale of UI_LOCALES) {
      const catalog = readFileSync(
        fileURLToPath(
          new URL(`../locales/${locale}/messages.po`, import.meta.url),
        ),
        "utf8",
      );
      for (const message of messages) {
        const encoded = JSON.stringify(message).replace(
          /[.*+?^${}()|[\]\\]/gu,
          "\\$&",
        );
        const entry = catalog.match(
          new RegExp(`^msgid ${encoded}\\nmsgstr (".*")$`, "m"),
        );
        expect(entry, `${locale}: ${message}`).not.toBeNull();
        expect(JSON.parse(entry![1]!), `${locale}: ${message}`).not.toBe("");
      }
    }
  });
});
