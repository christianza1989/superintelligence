import { describe, expect, it } from "vitest";
import { listRepositories, searchRepositories } from "./zero-catalog.js";
import { repositoryNeedDevelopmentCorpus } from "./zero-need-development-corpus.js";

describe("development-only LT/EN need corpus", () => {
  it("declares 48 distinct queries split 24/24 without claiming an independent holdout", () => {
    expect(repositoryNeedDevelopmentCorpus).toHaveLength(48);
    for (const locale of ["lt", "en"]) {
      const records = repositoryNeedDevelopmentCorpus.filter(
        (p) => p.locale === locale,
      );
      expect(records).toHaveLength(24);
      expect(records.filter((p) => p.expected.length > 0)).toHaveLength(16);
      expect(records.filter((p) => p.expected.length === 0)).toHaveLength(8);
    }
    expect(new Set(repositoryNeedDevelopmentCorpus.map((p) => p.id)).size).toBe(
      48,
    );
  });
  it("includes a genuinely singleton source category without relaxing fit", () => {
    const probe = repositoryNeedDevelopmentCorpus.find(
      (p) => p.id === "category-en",
    )!;
    expect(listRepositories({ ...probe.options, query: "" })).toHaveLength(1);
    expect(searchRepositories(probe.options)).toEqual([]);
  });
  it.each(repositoryNeedDevelopmentCorpus)("$id: $options.query", (probe) => {
    expect(
      searchRepositories(probe.options).map((entry) => entry.repository),
    ).toEqual(probe.expected);
  });
});
