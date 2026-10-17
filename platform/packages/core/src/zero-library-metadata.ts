import catalog from "./zero-catalog-data.json" with { type: "json" };
import snapshot from "../../../../catalog/library-metadata.json" with { type: "json" };

/** Exact additive snapshot for provenance; never replaces the frozen catalog. */
export const repositoryMetadataSnapshot = snapshot;

type GithubStatus =
  "observed" | "identity-conflict" | "not-found-or-inaccessible" | "unavailable";
export type RepositoryPinStatus =
  "present" | "absent" | "unavailable" | "not-recorded" | "not-checked";
export type RepositoryMetadataInput = {
  indexEvents: readonly {
    id: string;
    status: string;
    at: string;
    commit: string;
    path: string;
  }[];
  records: readonly {
    repository: string;
    firstIndexedEvent: string | null;
    github: {
      status: string;
      observedAt: string;
      resolvedRepository?: string;
      primaryLanguage?: string | null;
    };
    sourcePin?: {
      status: string;
      observedAt?: string;
      revision?: string;
      resolvedRepository?: string;
      objectOid?: string;
      reason?: string;
    };
  }[];
};
export type RepositoryMetadata = {
  firstIndexed?: {
    status: "first-git-presence";
    at: string;
    commit: string;
    source: string;
  };
  language?: string;
  githubStatus: GithubStatus | "unknown";
  observedAt?: string;
  resolvedRepository?: string;
  githubSource?: string;
  sourcePin: {
    status: RepositoryPinStatus;
    observedAt?: string;
    revision?: string;
    reason?: string;
  };
};
const identities = new Map(
  catalog.records.map((entry) => [entry.repository.toLowerCase(), entry]),
);
const catalogPath = "platform/packages/core/src/zero-catalog-data.json";
const validDate = (value: string) =>
  /(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value));
const validId = (value: string) => /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/iu.test(value);

/** Dated repository facts, independent of frozen source, license and runtime claims. */
export function projectRepositoryMetadata(
  input: RepositoryMetadataInput = snapshot,
): Map<string, RepositoryMetadata> {
  const result = new Map<string, RepositoryMetadata>();
  for (const entry of input.records) {
    const canonical = identities.get(entry.repository.toLowerCase());
    if (!canonical || result.has(canonical.repository)) continue;
    const id = canonical.repository;
    const projected: RepositoryMetadata = {
      githubStatus: "unknown",
      sourcePin: {
        status: canonical.sourceRevision ? "not-checked" : "not-recorded",
      },
    };
    const index = input.indexEvents.find(
      (event) => event.id === entry.firstIndexedEvent,
    );
    if (
      index?.status === "first-git-presence" &&
      validDate(index.at) &&
      /^[a-f0-9]{40}$/u.test(index.commit) &&
      index.path === catalogPath
    )
      projected.firstIndexed = {
        status: "first-git-presence",
        at: index.at,
        commit: index.commit,
        source: `https://github.com/christianza1989/superintelligence/blob/${index.commit}/${catalogPath}`,
      };
    const github = entry.github;
    if (
      validDate(github.observedAt) &&
      ["observed", "identity-conflict", "not-found-or-inaccessible", "unavailable"].includes(
        github.status,
      )
    ) {
      projected.githubStatus = github.status as GithubStatus;
      projected.observedAt = github.observedAt;
      if (github.resolvedRepository && validId(github.resolvedRepository)) {
        projected.resolvedRepository = github.resolvedRepository;
        projected.githubSource = `https://github.com/${github.resolvedRepository}`;
      }
      const exactIdentity =
        github.resolvedRepository?.toLowerCase() === id.toLowerCase();
      if (github.status === "observed" && !exactIdentity)
        projected.githubStatus = "identity-conflict";
      if (
        projected.githubStatus === "observed" &&
        exactIdentity &&
        typeof github.primaryLanguage === "string" &&
        github.primaryLanguage.trim() &&
        github.primaryLanguage.length <= 64
      )
        projected.language = github.primaryLanguage;
    }
    const pin = entry.sourcePin;
    if (
      pin &&
      canonical.sourceRevision &&
      pin.revision === canonical.sourceRevision
    ) {
      if (pin.status === "not-checked")
        projected.sourcePin = {
          status: "not-checked",
          revision: canonical.sourceRevision,
          reason: pin.reason,
        };
      else if (
        ["present", "absent", "unavailable"].includes(pin.status) &&
        pin.observedAt &&
        validDate(pin.observedAt)
      ) {
        const sameRepository =
          pin.resolvedRepository?.toLowerCase() === id.toLowerCase() &&
          projected.githubStatus === "observed";
        const supportedStatus =
          sameRepository &&
          (pin.status !== "present" ||
            pin.objectOid === canonical.sourceRevision)
            ? (pin.status as RepositoryPinStatus)
            : "unavailable";
        projected.sourcePin = {
          status: supportedStatus,
          observedAt: pin.observedAt,
          revision: canonical.sourceRevision,
          ...(pin.reason ? { reason: pin.reason } : {}),
        };
      }
    }
    result.set(id, projected);
  }
  return result;
}
const metadata = projectRepositoryMetadata();

/** Missing or conflicted facts remain absent; this performs no I/O. */
export function getRepositoryMetadata(
  repository: string,
): RepositoryMetadata | undefined {
  const id = identities.get(repository.toLowerCase())?.repository;
  return id ? metadata.get(id) : undefined;
}
export const repositoryLanguages = [
  ...new Set(
    [...metadata.values()]
      .map((entry) => entry.language)
      .filter((language): language is string => language !== undefined),
  ),
].sort((a, b) => a.localeCompare(b));
