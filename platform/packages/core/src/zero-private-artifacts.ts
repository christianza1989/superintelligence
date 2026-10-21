/** Internal bounded-job artifacts have their own current-grant readers and writers. */
export const ZERO_PRIVATE_ARTIFACT_NAMES = Object.freeze([
  "zero-application-request.json",
  "zero-application-receipt.json",
  "zero-application-workspace.json",
  "zero-csv-request.json",
  "zero-csv-receipt.json",
  "zero-pdf-request.json",
  "zero-pdf-receipt.json",
  "zero-pdf-input.pdf",
  "zero-browser-request.json",
  "zero-browser-receipt.json",
  "zero-browser-input.html",
  "zero-research-request.json",
  "zero-research-receipt.json",
  "zero-research-source.html",
  "zero-jev-request.json",
  "zero-jev-receipt.json",
]);
export const ZERO_PRIVATE_ARTIFACT_NONCE_PREFIXES = Object.freeze([
  "zero.application.",
  "zero.csv.",
  "zero.pdf.",
  "zero.browser.",
  "zero.research.",
  "zero.jev.",
]);
const names = new Set<string>(ZERO_PRIVATE_ARTIFACT_NAMES);
export function isZeroPrivateArtifact(artifact: {
  name?: string | null;
  clientNonce?: string | null;
}): boolean {
  return (
    names.has(artifact.name?.trim().toLowerCase() ?? "") ||
    ZERO_PRIVATE_ARTIFACT_NONCE_PREFIXES.some((prefix) =>
      artifact.clientNonce?.toLowerCase().startsWith(prefix),
    )
  );
}
