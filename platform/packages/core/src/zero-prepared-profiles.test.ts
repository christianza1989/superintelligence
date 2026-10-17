import { describe, expect, it } from "vitest";
import { repositorySnapshot, retrieveRepositoryNeed, searchRepositories } from "./zero-catalog.js";
import type { RepositoryRequirements } from "./zero-need-normalization.js";
import {
  preparedProfiles,
  searchPreparedProfiles,
  ZERO_CSV_PROFILE,
  ZERO_CSV_SOURCE_PINS,
} from "./zero-prepared-profiles.js";

describe("bounded prepared-profile overlay", () => {
  it.each([
    "CSV",
    "I need a CSV parser",
    "parse strict CSV table",
    "Reikia CSV lentelių nuskaitymo",
    "CSV nuskaityti",
    "d3-dsv",
    "D3 / D3-DSV",
  ])("discovers the exact scoped CSV profile for %s", (query) => {
    const result = retrieveRepositoryNeed({ query });
    expect(result.preparedProfiles).toEqual(preparedProfiles);
    expect(result.preparedProfiles[0]?.profileId).toBe(ZERO_CSV_PROFILE);
  });

  it.each([
    "CSV TSV",
    "CSV streaming",
    "CSV write",
    "CSV Excel",
    "CSV OCR",
    "CSV offline",
    "CSV unknown",
    "CSV semicolon",
    "CSV general transformations",
    "parser",
    "table",
    "image editor CSV",
    "tool please",
    "---",
    "CSV windows",
    "runtime tested CSV",
    "approved license CSV",
  ])("keeps an unsupported or ambiguous need as no-fit: %s", (query) => {
    expect(searchPreparedProfiles({ query })).toEqual([]);
  });

  it("keeps independent repository requirements distinct from scoped conformance", () => {
    for (const requirements of [
      { sourcePinPresent: true },
      { runtimeTested: true },
      { licenseApproved: true },
      { primaryLanguage: "JavaScript" },
      { operatingSystem: "linux" },
    ] satisfies RepositoryRequirements[])
      expect(searchPreparedProfiles({ query: "d3/d3-dsv", requirements })).toEqual([]);
    expect(searchPreparedProfiles({ query: "CSV", category: "documents" })).toEqual([]);
    expect(
      searchPreparedProfiles({ query: "CSV", requirements: { invented: true } as never }),
    ).toEqual([]);
  });

  it("rejects overflow and never truncates away an unsupported constraint", () => {
    expect(searchPreparedProfiles({ query: `CSV ${" ".repeat(252)}Windows` })).toEqual([]);
    expect(searchPreparedProfiles({ query: "CSV " + "x".repeat(65) })).toEqual([]);
    expect(searchPreparedProfiles({ query: "CSV", limit: 1000 })).toHaveLength(1);
  });

  it("keeps frozen source-only CSV no-fit and independent catalog results unchanged", () => {
    const before = JSON.stringify(repositorySnapshot);
    expect(searchRepositories({ query: "CSV parser" })).toEqual([]);
    const image = searchRepositories({ query: "image editor" });
    expect(retrieveRepositoryNeed({ query: "image editor" })).toEqual({
      preparedProfiles: [],
      sourceCandidates: image,
    });
    expect(repositorySnapshot.records).toHaveLength(796);
    expect(JSON.stringify(repositorySnapshot)).toBe(before);
    const selected = searchPreparedProfiles({ query: "CSV parser" });
    selected.pop();
    expect(searchPreparedProfiles({ query: "CSV parser" })).toEqual(preparedProfiles);
  });

  it("exposes exact source facts and scoped evidence without global approval fields", () => {
    const profile = preparedProfiles[0]!;
    expect(profile.sourceFiles).toBe(ZERO_CSV_SOURCE_PINS);
    expect(Object.keys(profile.sourceFiles)).toEqual(["src/csv.js", "src/dsv.js", "LICENSE"]);
    expect(profile.conformance.holdout).toBe("NOT_RUN");
    expect(profile).not.toHaveProperty("runtimeTested");
    expect(profile).not.toHaveProperty("runtimeReady");
    expect(profile).not.toHaveProperty("licenseApproved");
    expect(profile).not.toHaveProperty("grant");
    expect(Object.isFrozen(profile.sourceFiles)).toBe(true);
  });
});
