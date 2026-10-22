import data from "../../../../catalog/source-profiles.json" with { type: "json" };
import {
  normalizeRepositoryNeed,
  repositoryConcepts,
} from "./zero-need-normalization.js";

export const sourceProfileSnapshot = data;
export const sourceProfiles = data.profiles;
export type SourceProfile = (typeof sourceProfiles)[number];

const genericTerms = new Set([
  "application",
  "app",
  "data",
  "web",
  "model",
  "source",
  "module",
  "local",
  "business",
  "program",
  "programa",
  "programos",
]);

export function getSourceProfile(
  candidateId: string,
): SourceProfile | undefined {
  return sourceProfiles.find((profile) => profile.repository === candidateId);
}

/** Partial source recall, never complete task compatibility or runtime approval.
 * Keep strict historical retrieval unchanged and surface unmatched requirements. */
export function discoverSourceProfiles(query: string, category?: string) {
  if (
    category &&
    !["business", "foundation", "data", "web", "infrastructure"].includes(
      category,
    )
  )
    return [];
  const need = normalizeRepositoryNeed(query);
  if (!need || need.empty) return [];
  const required = need.requirements;
  // Repo-wide language/OS/license/runtime qualification was not established by
  // the reviewed source slices. A pinned source object satisfies only its pin.
  if (
    required.runtimeTested ||
    required.licenseApproved ||
    required.operatingSystem ||
    required.primaryLanguage
  )
    return [];
  return sourceProfiles
    .map((profile) => {
      const matchedModules = profile.modules.filter((module) => {
        const concepts = repositoryConcepts(module.keywords.join(" "));
        return need.terms.some(
          (term) => !genericTerms.has(term) && concepts.has(term),
        );
      });
      const evidenceTerms = new Set(
        matchedModules.flatMap((module) => [
          ...repositoryConcepts(module.keywords.join(" ")),
        ]),
      );
      const matchedTerms = need.terms.filter(
        (term) => !genericTerms.has(term) && evidenceTerms.has(term),
      );
      return {
        profile,
        matchedModules,
        matchedTerms,
        unmatchedTerms: need.terms.filter(
          (term) => !matchedTerms.includes(term),
        ),
      };
    })
    .filter((match) => match.matchedTerms.length > 0)
    .sort(
      (a, b) =>
        b.matchedTerms.length +
          b.matchedModules.length * 3 -
          (a.matchedTerms.length + a.matchedModules.length * 3) ||
        a.profile.repository.localeCompare(b.profile.repository),
    )
    .slice(0, 3);
}

export function sourceProfileSearchFacts(
  match: ReturnType<typeof discoverSourceProfiles>[number],
) {
  const profile = match.profile;
  return {
    candidateId: profile.repository,
    repository: profile.repository,
    kind: profile.kind,
    purpose: profile.purpose,
    sourceRevision: profile.sourceRevision,
    observedAt: profile.observedAt,
    licenseSource: profile.licenseSource,
    matchedModules: match.matchedModules.map(({ id, purpose, path }) => ({
      id,
      purpose,
      path,
    })),
    unmatchedTerms: match.unmatchedTerms,
    fit: "partial source recall; complete task constraints unverified" as const,
    prepared: false as const,
    runtimeTested: false as const,
    licenseApproved: false as const,
  };
}
