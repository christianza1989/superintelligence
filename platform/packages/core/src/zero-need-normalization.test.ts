import { describe, expect, it } from "vitest";
import {
  listRepositories,
  repositorySnapshot,
  searchRepositories,
} from "./zero-catalog.js";
import type { RepositoryRequirements } from "./zero-catalog.js";
import { normalizeRepositoryNeed } from "./zero-need-normalization.js";

describe("need normalization and independent suitability constraints", () => {
  it("keeps unknown substantive words and recognized purpose words", () => {
    const parsed = normalizeRepositoryNeed(
      "Please find a private image-editor without accounts",
    );
    expect(parsed?.terms).toEqual([
      "private",
      "image",
      "edit",
      "without",
      "accounts",
    ]);
    expect(
      searchRepositories({ query: "image editor without accounts" }),
    ).toEqual([]);
    expect(searchRepositories({ query: "image editor free" })).toEqual([]);
    expect(searchRepositories({ query: "image editor offline" })).toEqual([]);
  });
  it("bounds raw text before normalization and never truncates a trailing constraint", () => {
    for (const query of [
      "image editor" + " ".repeat(245) + "Windows",
      "a ".repeat(65),
      "x".repeat(65),
      "\uFDFA".repeat(128),
    ])
      expect(normalizeRepositoryNeed(query)).toBeNull();
    expect(
      searchRepositories({
        query: "image editor" + " ".repeat(250) + "offline",
      }),
    ).toEqual([]);
    for (const query of ["tool please", "---", "with and ir su"])
      expect(searchRepositories({ query })).toEqual([]);
  });
  it("recognizes explicit runtime/license phrases while retaining other terms", () => {
    expect(
      normalizeRepositoryNeed("image editor runtime-tested")?.requirements,
    ).toEqual({ runtimeTested: true });
    expect(
      normalizeRepositoryNeed("vaizdų redaktorius su patvirtinta licencija")
        ?.requirements,
    ).toEqual({ licenseApproved: true });
    expect(
      normalizeRepositoryNeed("image editor for Mac OS")?.requirements,
    ).toEqual({ operatingSystem: "macos" });
    expect(normalizeRepositoryNeed("license audit")?.terms).toEqual([
      "license",
      "audit",
    ]);
    expect(
      searchRepositories({ query: "image editor runtime-tested" }),
    ).toEqual([]);
    expect(
      searchRepositories({
        query: "vaizdų redaktorius su patvirtinta licencija",
      }),
    ).toEqual([]);
  });
  it("never infers readiness or approval from source availability and a dated pin", () => {
    expect(
      searchRepositories({
        query: "KDE/krita",
        sourceOnly: true,
        requirements: { sourcePinPresent: true, primaryLanguage: "c++" },
      }),
    ).toHaveLength(1);
    for (const requirements of [
      { runtimeTested: true },
      { licenseApproved: true },
      { operatingSystem: "windows" },
      { operatingSystem: "linux" },
      { operatingSystem: "macos" },
      { primaryLanguage: "Python" },
    ] as const)
      expect(
        searchRepositories({
          query: "KDE/krita",
          sourceOnly: true,
          requirements,
        }),
      ).toEqual([]);
    expect(listRepositories({ requirements: { runtimeTested: true } })).toEqual(
      [],
    );
    expect(
      listRepositories({ requirements: { licenseApproved: true } }),
    ).toEqual([]);
  });
  it("keeps missing and conflicted metadata unknown even for exact identities", () => {
    for (const candidate of ["get-convex/agent", "demucs/demucs"]) {
      expect(
        searchRepositories({
          query: candidate,
          requirements: { sourcePinPresent: true },
        }),
      ).toEqual([]);
      expect(
        searchRepositories({
          query: candidate,
          requirements: { primaryLanguage: "Python" },
        }),
      ).toEqual([]);
    }
    expect(
      searchRepositories({ query: "demucs/demucs", sourceOnly: true }),
    ).toEqual([]);
    expect(
      searchRepositories({ query: "KDE/krita", category: "data" }),
    ).toEqual([]);
    expect(
      searchRepositories({
        query: "microsoft/winget-cli",
        requirements: { operatingSystem: "windows" },
      }),
    ).toEqual([]);
    expect(
      searchRepositories({ query: "Squirrel/Squirrel.Windows" }),
    ).toHaveLength(1);
  });
  it("fails closed on malformed or unknown hard requirements", () => {
    for (const requirements of [
      { primaryLanguage: "" },
      { primaryLanguage: "x".repeat(65) },
      { runtimeTested: false },
      { sourcePinPresent: false },
      { operatingSystem: "plan9" },
      { unknown: true },
      [],
    ])
      expect(
        normalizeRepositoryNeed(
          "KDE/krita",
          requirements as RepositoryRequirements,
        ),
      ).toBeNull();
  });
  it("retains singleton/category no-fit and unchanged original source objects", () => {
    const before = JSON.stringify(repositorySnapshot);
    expect(
      searchRepositories({
        query: "image editor",
        category: "image-editing-consistency",
        limit: 1,
      }),
    ).toEqual([]);
    const [candidate] = searchRepositories({ query: "image editor" });
    expect(candidate).toBe(
      repositorySnapshot.records.find((r) => r.repository === "KDE/krita"),
    );
    expect(candidate).toMatchObject({
      runtimeTested: false,
      licenseApproved: false,
    });
    expect(JSON.stringify(repositorySnapshot)).toBe(before);
    expect(searchRepositories({ limit: 1000 })).toHaveLength(100);
  });
});
