/** Trusted reviewed source facts for advisory planning; never downloads or prepares code. */
import { getSourceProfile } from "@rakazo/core/zero-source-profiles";
import type { RepositoryOption } from "./zero-repository-selector.js";

export function sourceSelectionOptions(
  candidateIds: readonly string[],
  allowedRepositories: readonly string[],
): RepositoryOption[] {
  if (
    !candidateIds.length ||
    candidateIds.length > 5 ||
    new Set(candidateIds).size !== candidateIds.length
  )
    throw new Error("invalid_source_shortlist");
  return candidateIds.map((repository) => {
    const profile = getSourceProfile(repository);
    if (!profile || !allowedRepositories.includes(repository))
      throw new Error("source_selection_not_authorized");
    const capability = JSON.stringify({
      purpose: profile.purpose,
      modules: profile.modules.map(({ id, path, purpose }) => ({
        id,
        path,
        purpose,
      })),
      setup: profile.setup,
      gaps: profile.gaps,
      observedAt: profile.observedAt,
      reviewedFiles: profile.sourceFiles.map(({ path, sha256 }) => ({
        path,
        sha256,
      })),
      evidence:
        "Reviewed source slices only; not runtime-tested, prepared or license-approved",
    });
    if (capability.length > 6000) throw new Error("source_evidence_limit");
    return {
      repository,
      sourceRevision: profile.sourceRevision,
      sourceAvailable: profile.sourceAvailable,
      archived: false,
      capability,
      licenseSource: profile.licenseSource,
    };
  });
}
