import snapshot from "./zero-catalog-data.json" with { type: "json" };
import { getRepositoryMetadata } from "./zero-library-metadata.js";
import {
  normalizeRepositoryNeed,
  normalizeRepositoryText,
  repositoryConcepts,
  repositoryWords,
} from "./zero-need-normalization.js";
import type { RepositoryRequirements } from "./zero-need-normalization.js";
export type { RepositoryRequirements } from "./zero-need-normalization.js";

export type RepositoryCandidate = (typeof snapshot.records)[number];
export const repositorySnapshot = snapshot;
export type SearchOptions = {
  query?: string;
  category?: string;
  sourceOnly?: boolean;
  limit?: number;
  requirements?: RepositoryRequirements;
};

/** Bundled source-catalog retrieval, not prepared-profile discovery.
 * Relevance is source text overlap, never verified fit. */
export function searchRepositories(
  options: SearchOptions = {},
): RepositoryCandidate[] {
  const limit = Number.isFinite(options.limit)
    ? Math.max(1, Math.min(100, Math.trunc(options.limit!)))
    : 30;
  return listRepositories(options).slice(0, limit);
}

/** Full bundled matching set for human Library counts and pagination. */
export function listRepositories(
  options: Omit<SearchOptions, "limit"> = {},
): RepositoryCandidate[] {
  const need = normalizeRepositoryNeed(
    options.query ?? "",
    options.requirements,
  );
  if (!need || (!need.empty && need.terms.length === 0)) return [];
  const { terms, literalTerms, identity, requirements } = need;
  return snapshot.records
    .filter((entry) => !options.category || entry.category === options.category)
    .filter((entry) => !options.sourceOnly || entry.sourceAvailable)
    .filter((entry) => {
      // Apply independent hard facts before any relevance ranking. Unknown OS
      // support never becomes true from source, a pin, a name or a description.
      if (requirements.operatingSystem) return false;
      if (requirements.runtimeTested && !entry.runtimeTested) return false;
      if (requirements.licenseApproved && !entry.licenseApproved) return false;
      const metadata = getRepositoryMetadata(entry.repository);
      if (
        requirements.primaryLanguage &&
        (!metadata?.language ||
          normalizeRepositoryText(metadata.language) !==
            normalizeRepositoryText(requirements.primaryLanguage.trim()))
      )
        return false;
      return (
        !requirements.sourcePinPresent ||
        metadata?.sourcePin.status === "present"
      );
    })
    .map((entry) => {
      const name = repositoryConcepts(entry.repository);
      const literalName = new Set(repositoryWords(entry.repository));
      const capability = repositoryConcepts(entry.capability);
      // Categories remain literal filters/discovery words. An image-editing
      // category with an empty capability must not imply an image editor.
      const category = new Set(repositoryWords(entry.category));
      const weights = terms.map((term) =>
        name.has(term)
          ? 6
          : capability.has(term)
            ? 3
            : category.has(term)
              ? 1
              : 0,
      );
      // A name fragment plus a broad category does not establish a capability.
      // Keep direct name/category lookup, but require capability evidence for a
      // mixed need query instead of promoting an unannotated singleton.
      const hasEvidence =
        terms.some((term) => capability.has(term)) ||
        literalTerms.every((term) => literalName.has(term)) ||
        terms.every((term) => category.has(term));
      return {
        entry,
        matches:
          weights.every((weight) => weight > 0) &&
          hasEvidence &&
          (!identity || normalizeRepositoryText(entry.repository) === identity),
        relevance: weights.reduce<number>((sum, weight) => sum + weight, 0),
      };
    })
    .filter((result) => result.matches)
    .sort(
      (a, b) =>
        b.relevance - a.relevance ||
        a.entry.repository.localeCompare(b.entry.repository),
    )
    .map(({ entry }) => entry);
}

export function repositorySourceUrl(entry: RepositoryCandidate): string {
  return `https://github.com/${entry.repository}${entry.sourceRevision ? `/tree/${entry.sourceRevision}` : ""}`;
}

export const repositoryCategories = [
  ...new Set(snapshot.records.map((entry) => entry.category)),
].sort();

export {
  getRepositoryMetadata,
  projectRepositoryMetadata,
  repositoryLanguages,
  repositoryMetadataSnapshot,
} from "./zero-library-metadata.js";
export type {
  RepositoryMetadata,
  RepositoryMetadataInput,
  RepositoryPinStatus,
} from "./zero-library-metadata.js";

export {
  createRepositoryReusePlan,
  InvalidRepositoryReusePlan,
} from "./zero-reuse-plan.js";
