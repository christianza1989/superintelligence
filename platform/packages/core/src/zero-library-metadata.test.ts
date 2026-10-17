import { describe, expect, it } from "vitest";
import snapshot from "../../../../catalog/library-metadata.json" with { type: "json" };
import catalog from "./zero-catalog-data.json" with { type: "json" };
import {
  getRepositoryMetadata,
  projectRepositoryMetadata,
  repositoryLanguages,
} from "./zero-library-metadata.js";
import type { RepositoryMetadataInput } from "./zero-library-metadata.js";

const index = {
  id: "import",
  status: "first-git-presence",
  at: "2026-10-16T13:36:13Z",
  commit: "7542de48b07766e5ec0c18abf014a162c7b48548",
  path: "platform/packages/core/src/zero-catalog-data.json",
};
const krita = catalog.records.find(
  (entry) => entry.repository === "KDE/krita",
)!;
const observation = {
  status: "observed",
  observedAt: "2026-10-17T15:00:00Z",
  resolvedRepository: "KDE/krita",
  primaryLanguage: "C++",
};
function fixture(
  github = observation,
  sourcePin?: RepositoryMetadataInput["records"][number]["sourcePin"],
): RepositoryMetadataInput {
  return {
    indexEvents: [index],
    records: [
      {
        repository: "KDE/krita",
        firstIndexedEvent: "import",
        github: { ...github },
        sourcePin,
      },
    ],
  };
}

describe("additive repository metadata", () => {
  it("covers the existing index without changing frozen records or claiming pre-Git dates", () => {
    expect(new Set(snapshot.records.map((entry) => entry.repository))).toEqual(
      new Set(catalog.records.map((entry) => entry.repository)),
    );
    expect(snapshot.indexEvents).toHaveLength(1);
    for (const entry of catalog.records) {
      const metadata = getRepositoryMetadata(entry.repository)!;
      expect(metadata.firstIndexed).toMatchObject({
        status: "first-git-presence",
        at: index.at,
        commit: index.commit,
      });
      expect(metadata).not.toHaveProperty("runtimeTested");
      expect(metadata).not.toHaveProperty("licenseApproved");
    }
    expect(getRepositoryMetadata("missing/repository")).toBeUndefined();
    expect(getRepositoryMetadata("kde/KRITA")).toEqual(
      getRepositoryMetadata("KDE/krita"),
    );
  });
  it("uses dated exact GitHub identity for primary language; missing stays unknown", () => {
    const map = projectRepositoryMetadata(fixture());
    expect(map.get("KDE/krita")).toMatchObject({
      language: "C++",
      githubStatus: "observed",
      observedAt: observation.observedAt,
      githubSource: "https://github.com/KDE/krita",
    });
    const nullLanguage = fixture();
    nullLanguage.records[0]!.github.primaryLanguage = null;
    expect(
      projectRepositoryMetadata(nullLanguage).get("KDE/krita")?.language,
    ).toBeUndefined();
    expect(repositoryLanguages).toContain("C++");
    expect(repositoryLanguages).not.toContain("Unknown");
    expect(
      snapshot.records.filter(
        (entry) =>
          entry.github.status === "observed" && entry.github.primaryLanguage,
      ),
    ).toHaveLength(725);
  });
  it("keeps redirects, unavailable identities and unsafe results separate from canonical facts", () => {
    for (const github of [
      {
        ...observation,
        status: "identity-conflict",
        resolvedRepository: "another/repository",
      },
      {
        ...observation,
        status: "observed",
        resolvedRepository: "another/repository",
      },
      { ...observation, status: "not-found-or-inaccessible" },
      { ...observation, status: "unavailable" },
      { ...observation, observedAt: "yesterday" },
      { ...observation, resolvedRepository: "javascript:alert(1)" },
    ]) {
      const metadata = projectRepositoryMetadata(fixture(github)).get(
        "KDE/krita",
      )!;
      expect(metadata.language).toBeUndefined();
      expect(metadata.githubSource ?? "").not.toMatch(/^javascript:/u);
    }
    expect(getRepositoryMetadata("get-convex/agent")).toMatchObject({
      githubStatus: "identity-conflict",
      resolvedRepository: "convex/agent",
      sourcePin: { status: "not-checked" },
    });
    expect(getRepositoryMetadata("get-convex/agent")?.language).toBeUndefined();
    expect(
      snapshot.records.filter((entry) => entry.github.status === "not-found-or-inaccessible"),
    ).toHaveLength(39);
  });
  it("accepts pin presence only for the actual catalog revision, identity and returned OID", () => {
    const pin = {
      status: "present",
      observedAt: observation.observedAt,
      revision: krita.sourceRevision!,
      resolvedRepository: "KDE/krita",
      objectOid: krita.sourceRevision!,
    };
    expect(
      projectRepositoryMetadata(fixture(observation, pin)).get("KDE/krita")
        ?.sourcePin.status,
    ).toBe("present");
    for (const broken of [
      { ...pin, objectOid: "f".repeat(40) },
      { ...pin, resolvedRepository: "another/repository" },
    ])
      expect(
        projectRepositoryMetadata(fixture(observation, broken)).get("KDE/krita")
          ?.sourcePin.status,
      ).toBe("unavailable");
    expect(
      projectRepositoryMetadata(
        fixture(observation, { ...pin, revision: "f".repeat(40) }),
      ).get("KDE/krita")?.sourcePin.status,
    ).toBe("not-checked");
    expect(
      snapshot.records.filter((entry) => entry.sourcePin.status === "present"),
    ).toHaveLength(755);
  });
  it("distinguishes a null object from a failed lookup and an unattempted check", () => {
    for (const status of ["absent", "unavailable", "not-checked"] as const) {
      const metadata = projectRepositoryMetadata(
        fixture(observation, {
          status,
          revision: krita.sourceRevision!,
          observedAt: observation.observedAt,
          resolvedRepository: "KDE/krita",
        }),
      ).get("KDE/krita")!;
      expect(metadata.sourcePin.status).toBe(status);
    }
    const identityConflict = {
      ...observation,
      status: "identity-conflict",
      resolvedRepository: "another/repository",
    };
    expect(
      projectRepositoryMetadata(
        fixture(identityConflict, {
          status: "present",
          revision: krita.sourceRevision!,
          objectOid: krita.sourceRevision!,
          observedAt: observation.observedAt,
          resolvedRepository: "KDE/krita",
        }),
      ).get("KDE/krita")?.sourcePin.status,
    ).toBe("unavailable");
  });
  it("rejects invalid index provenance rather than inventing a recent date", () => {
    for (const bad of [
      { ...index, at: "today" },
      { ...index, commit: "missing" },
      { ...index, path: "../../private" },
      { ...index, status: "guess" },
    ]) {
      const input = fixture();
      input.indexEvents = [bad];
      expect(
        projectRepositoryMetadata(input).get("KDE/krita")?.firstIndexed,
      ).toBeUndefined();
    }
  });
});
