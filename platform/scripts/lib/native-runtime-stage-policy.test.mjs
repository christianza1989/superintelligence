import assert from "node:assert/strict";
import { test } from "node:test";
import { nativeRuntimeLicenseEvidence, nativeRuntimeStageArguments, requireNativeRuntimeLicenseEvidence } from "./native-runtime-stage-policy.mjs";

const notices = [{ package: "example", version: "1", license: "MIT", files: [] }];
const packages = new Map([["example@1", { packageJsonSha256: "exact-identity" }]]);
test("strict default gate fails missing text and only explicit experimental flag permits a local incomplete stage", () => {
  const evidence = nativeRuntimeLicenseEvidence({ notices, packages });
  assert.throws(() => requireNativeRuntimeLicenseEvidence(nativeRuntimeStageArguments([]), evidence), /incomplete/);
  const mode = nativeRuntimeStageArguments(["--experimental-stage"]);
  assert.doesNotThrow(() => requireNativeRuntimeLicenseEvidence(mode, evidence));
  assert.deepEqual(mode, { experimentalStage: true, localOnly: true, doNotPublish: true, distributionReady: false, runtimeQualified: false });
  assert.equal(evidence.releaseLicenseEvidenceGate, "blocked");
  assert.equal(evidence.unresolvedLicenseEvidence[0].package, "example");
  assert.equal(evidence.licenseApproval, "unknown");
  for (const args of [["--release"], ["--experimental-stage=true"], ["--experimental-stage", "--experimental-stage"], ["--experimental-stage", "--skip-hashes"]]) assert.throws(() => nativeRuntimeStageArguments(args));
});
test("partial or conflicting evidence stays blocked even when some text exists", () => {
  const knownUnresolved = [{ package: "example", version: "1", packageJsonSha256: "exact-identity", reason: "Required secondary license remains unresolved." }];
  const evidence = nativeRuntimeLicenseEvidence({ notices: [{ ...notices[0], files: ["original-partial-license"] }], packages, knownUnresolved });
  assert.equal(evidence.unresolvedLicenseEvidence[0].reason, knownUnresolved[0].reason);
  assert.throws(() => requireNativeRuntimeLicenseEvidence(nativeRuntimeStageArguments([]), evidence));
  assert.doesNotThrow(() => requireNativeRuntimeLicenseEvidence(nativeRuntimeStageArguments(["--experimental-stage"]), evidence));
});
test("experimental mode never permits stale unresolved-package identity", () => {
  assert.throws(() => nativeRuntimeLicenseEvidence({ notices, packages, knownUnresolved: [{ package: "example", version: "1", packageJsonSha256: "different" }] }), /identity mismatch/);
});
