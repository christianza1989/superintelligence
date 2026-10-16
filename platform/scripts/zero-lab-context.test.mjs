import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCompactRepositoryContext } from "./zero-lab-context.mjs";

const guidance = "Reuse existing foundations and focused components. Inspect source, community evidence, license and compatibility. Source-only is not verified integration. Do not install or execute from discovery alone; task permissions and budget still apply. If nothing fits, build the necessary code. Jev routing is separate.";
const evaluation = "Source evidence only; no install or execution grant. Human/community validation must be inspected separately.";
const pin = "a".repeat(40), otherPin = "b".repeat(40);
const repo = (repository, changes = {}) => ({ repository, category: "foundation", capability: "Reusable source candidate",
  source: `https://github.com/${repository}/tree/${pin}`, sourceRevision: pin, sourceAvailable: true,
  licenseSource: "MIT", licenseApproved: false, runtimeTested: false, archived: false, ...changes });
const search = (query, candidates, changes = {}) => ({ query, status: candidates.length ? "source_candidates" : "missing",
  researchDate: "2026-10-16", evaluation, candidates, ...changes });
const context = searches => ({ guidance, searches });

test("keeps evidence, license, pin, source URL semantics and original constraints while reducing repeated JSON", () => {
  const input = context([
    search("one", [repo("org/one"), repo("org/two")]),
    search("two", [repo("org/two"), repo("org/three")]),
    search("three", [repo("org/three"), repo("org/four")]),
  ]);
  const result = buildCompactRepositoryContext(input, { maxBytes: 3000, maxCandidates: 5 });
  assert.equal(result.text, JSON.stringify(result.payload)); assert.equal(result.inputBytes, Buffer.byteLength(JSON.stringify(input)));
  assert.equal(result.outputBytes, Buffer.byteLength(result.text)); assert.ok(result.outputBytes <= 3000);
  assert.ok(result.savedBytes > 0); assert.ok(result.structuralSavedBytes > 0);
  assert.equal(result.payload.guidance, guidance); assert.deepEqual(result.payload.evaluations, [evaluation]);
  assert.deepEqual(result.payload.rowDefaults, { sourceAvailable: true, runtimeTested: false, runtimeStatus: "NOT_RUN", archived: false });
  assert.equal(result.payload.grants, "none"); assert.equal(result.payload.untrusted, true); assert.equal(result.qualityEvidence, "NOT_RUN");
  for (const row of result.payload.rows) {
    const original = input.searches.flatMap(item => item.candidates).find(entry => entry.repository === row[0]);
    assert.equal(row[1], original.sourceRevision); assert.equal(row[4], original.licenseSource); assert.equal(row[5], original.licenseApproved);
    assert.equal(result.payload.sourceUrl.replace("{repository}", row[0]).replace("{sourceRevision}", row[1]), original.source);
  }
});

test("deduplicates only the same canonical repository and revision and merges query provenance", () => {
  const input = context([search("first", [repo("Org/Project")]), search("second", [repo("org/project")]),
    search("version", [repo("org/project", { sourceRevision: otherPin, source: `https://github.com/org/project/tree/${otherPin}` })])]);
  const result = buildCompactRepositoryContext(input);
  assert.equal(result.payload.rows.length, 2); assert.equal(result.selection.duplicateOccurrences, 1);
  assert.deepEqual(result.payload.rows.find(row => row[1] === pin)[6], [0, 1]);
  assert.ok(result.payload.rows.some(row => row[1] === otherPin));
});

test("conflicting license or status metadata excludes the whole identity instead of picking a convenient claim", () => {
  for (const change of [{ licenseSource: "AGPL-3.0" }, { licenseApproved: true }, { runtimeTested: true }]) {
    const result = buildCompactRepositoryContext(context([search("first", [repo("org/conflict")]), search("second", [repo("org/conflict", change)])]));
    assert.equal(result.status, "missing"); assert.equal(result.payload.rows.length, 0); assert.equal(result.selection.omitted.conflicting, 1);
  }
});

test("uses exact names and round robin for lexical coverage without claiming a quality rank", () => {
  const result = buildCompactRepositoryContext(context([
    search("hono", [repo("honojs/hono")]),
    search("sqlite", [repo("simonw/sqlite-utils"), repo("sqlite/sqlite"), repo("sqlitebrowser/sqlitebrowser")]),
    search("react", [repo("other/reaction-diffusion"), repo("react/react")]),
  ]), { maxCandidates: 3 });
  assert.deepEqual(result.payload.rows.map(row => row[0]), ["honojs/hono", "sqlite/sqlite", "react/react"]);
  assert.equal(result.selection.omitted.candidateLimit, 3); assert.match(result.selection.policy, /not_quality/);
});

test("unavailable, unpinned, archived and unscoped runtime claims remain explicit omissions", () => {
  const result = buildCompactRepositoryContext(context([search("source", [
    repo("org/unavailable", { sourceAvailable: false }),
    repo("org/unpinned", { sourceRevision: null, source: "https://github.com/org/unpinned" }),
    repo("org/archived", { archived: true }), repo("org/runtime", { runtimeTested: true }), repo("org/unknown-license", { licenseSource: "Unknown — review required" }),
  ])]));
  assert.equal(result.payload.rows.length, 1); assert.equal(result.payload.rows[0][4], "Unknown — review required");
  assert.equal(result.payload.rows[0][5], false);
  for (const key of ["unavailable", "unpinned", "archived", "runtimeEvidenceNeeded"]) assert.equal(result.selection.omitted[key], 1);
});

test("rejects URL/SHA substitution and coerced status types without inventing source availability", () => {
  for (const changes of [
    { source: "https://evil.example/org/repo" }, { source: `https://github.com/org/repo/tree/${otherPin}` },
    { source: `https://user:pass@github.com/org/repo/tree/${pin}` }, { source: `https://github.com/org/repo/tree/${pin}?download=1` },
    { sourceRevision: 12 }, { runtimeTested: "false" }, { licenseApproved: 0 },
  ]) {
    const result = buildCompactRepositoryContext(context([search("repo", [repo("org/repo", changes)])]));
    assert.equal(result.payload.rows.length, 0); assert.equal(result.selection.omitted.invalid, 1);
  }
});

test("retains differing evaluations and search dates and does not forward raw errors or unrelated grading data", () => {
  const input = context([search("old", [repo("org/old")], { researchDate: "2026-10-15", evaluation: "Additional source restriction: inspect attribution." }),
    search("missing", []), { query: "error", error: "SYNTHETIC_PRIVATE_ERROR" }]);
  input.searches[0].gradingResult = "SYNTHETIC_GRADER_PASS";
  const result = buildCompactRepositoryContext(input);
  assert.equal(result.payload.queries[0][2], "2026-10-15"); assert.equal(result.payload.queries[1][1], "missing");
  assert.deepEqual(result.payload.queries[2], ["error", "error", null]); assert.equal(result.payload.evaluations.length, 2);
  assert.ok(!result.text.includes("SYNTHETIC_PRIVATE_ERROR")); assert.ok(!result.text.includes("SYNTHETIC_GRADER_PASS"));
});

test("enforces UTF-8 byte caps by removing complete rows rather than truncating license or scope", () => {
  const candidates = Array.from({ length: 5 }, (_, i) => repo(`org/item${i}`, { capability: "Žąsis 🦢 ".repeat(40), licenseSource: "MIT with retained notice" }));
  const result = buildCompactRepositoryContext(context([search("unicode", candidates)]), { maxBytes: 2000 });
  assert.ok(result.outputBytes <= 2000); assert.equal(result.outputBytes, Buffer.byteLength(result.text));
  assert.ok(result.selection.omitted.byteLimit > 0);
  for (const row of result.payload.rows) { assert.equal(row[3], candidates[0].capability); assert.equal(row[4], candidates[0].licenseSource); }
  assert.equal(result.payload.guidance, guidance); assert.equal(result.payload.rowDefaults.runtimeStatus, "NOT_RUN");
});

test("does not promise byte reduction for tiny or empty searches and never mutates the source", () => {
  const input = context([search("empty", [])]); const before = JSON.stringify(input);
  const first = buildCompactRepositoryContext(input), second = buildCompactRepositoryContext(input);
  assert.equal(first.status, "missing"); assert.ok(first.savedBytes < 0); assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), before);
});

test("fails before a prompt can silently lose required constraints or accept malformed result packets", () => {
  assert.throws(() => buildCompactRepositoryContext(context([search("x", [])]), { maxBytes: "3000" }), /limits/);
  assert.throws(() => buildCompactRepositoryContext(context([search("x", [])]), { maxCandidates: 0 }), /limits/);
  assert.throws(() => buildCompactRepositoryContext({ guidance: "x".repeat(2500), searches: [] }, { maxBytes: 1024 }), /preserve/);
  assert.throws(() => buildCompactRepositoryContext(context([search("x", [], { status: "source_candidates" })])), /response/);
  assert.throws(() => buildCompactRepositoryContext(context([search("x", [], { researchDate: "2026-02-30" })])), /response/);
  assert.throws(() => buildCompactRepositoryContext(context(Array.from({ length: 9 }, () => search("x", [])))), /input/);
});

test("bounds unrelated metadata and rejects non-JSON or cyclic data without forwarding it", () => {
  for (const extra of ["x".repeat(131073), 1n, () => "not data", Number.NaN, Array(5000).fill(null)]) {
    const input = context([search("empty", [])]); input.extra = extra;
    assert.throws(() => buildCompactRepositoryContext(input), /bounded serializable/);
  }
  const input = context([search("empty", [])]); input.cycle = input;
  assert.throws(() => buildCompactRepositoryContext(input), /bounded serializable/);
});

test("retains an index license-approved flag without converting it into runtime verification or execution permission", () => {
  const input = context([search("approved", [repo("org/approved", { licenseApproved: true, licenseSource: "Apache-2.0" })])]);
  const result = buildCompactRepositoryContext(input);
  assert.equal(result.payload.rows[0][5], true); assert.equal(result.payload.rows[0][4], "Apache-2.0");
  assert.equal(result.payload.rowDefaults.runtimeTested, false); assert.equal(result.payload.grants, "none");
  assert.equal(result.payload.scope, "SOURCE_ONLY_INDEX_CLAIMS");
});
