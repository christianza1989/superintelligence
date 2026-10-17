export function nativeRuntimeStageArguments(args) {
  if (!Array.isArray(args) || args.length > 1 || (args.length === 1 && args[0] !== "--experimental-stage")) throw new Error("Only --experimental-stage is supported");
  return { experimentalStage: args.length === 1, localOnly: true, doNotPublish: true, distributionReady: false, runtimeQualified: false };
}

/** A local experimental stage can retain gaps; it cannot turn them into approval. */
export function nativeRuntimeLicenseEvidence({ notices, packages, knownUnresolved = [] }) {
  const unresolved = new Map();
  for (const notice of notices) {
    if (!notice.files.length) unresolved.set(notice.package + "@" + notice.version, {
      package: notice.package, version: notice.version, declaredLicense: notice.license,
      reason: "No complete installed or reviewed source license text was preserved.",
    });
  }
  for (const entry of knownUnresolved) {
    const id = entry.package + "@" + entry.version;
    const pkg = packages.get(id);
    if (!pkg) continue;
    if (pkg.packageJsonSha256 !== entry.packageJsonSha256) throw new Error("Unresolved license identity mismatch");
    unresolved.set(id, entry);
  }
  return {
    releaseLicenseEvidenceGate: unresolved.size ? "blocked" : "provided-text-only-not-license-approval",
    unresolvedLicenseEvidence: [...unresolved.values()].sort((a, b) => (a.package + "@" + a.version).localeCompare(b.package + "@" + b.version)),
    licenseApproval: "unknown",
  };
}

export function requireNativeRuntimeLicenseEvidence(mode, evidence) {
  if (evidence.unresolvedLicenseEvidence.length && !mode.experimentalStage) throw new Error("Native release license evidence is incomplete; see unresolvedLicenseEvidence");
}
