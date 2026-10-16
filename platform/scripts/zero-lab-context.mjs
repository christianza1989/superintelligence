/** Pure source-index compaction. Structural validation is not integration verification. */
import { createHash } from "node:crypto";

export const COMPACT_CONTEXT_VERSION = 2;
const hash = value => createHash("sha256").update(value).digest("hex");
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, bound, empty = false) => typeof value === "string" && (empty || value.trim().length > 0) && Buffer.byteLength(value) <= bound;
const sourcePattern = /^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9_.-]{1,100}$/i;
const defaults = Object.freeze({ sourceAvailable: true, runtimeTested: false, runtimeStatus: "NOT_RUN", archived: false });

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function candidate(value) {
  if (!record(value) || !text(value.repository, 140) || !sourcePattern.test(value.repository) ||
      [".", ".."].includes(value.repository.split("/")[1]) ||
      !text(value.category, 320) || !text(value.capability, 2048, true) || !text(value.licenseSource, 2048) ||
      ![value.sourceAvailable, value.licenseApproved, value.runtimeTested, value.archived].every(flag => typeof flag === "boolean") ||
      !(value.sourceRevision === null || (typeof value.sourceRevision === "string" && /^[a-f0-9]{40}$/i.test(value.sourceRevision))) ||
      !text(value.source, 512)) return null;
  const repository = value.repository.toLowerCase(), revision = value.sourceRevision?.toLowerCase() ?? null;
  let url;
  try { url = new URL(value.source); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.port || url.search || url.hash ||
      url.pathname.toLowerCase() !== `/${repository}${revision ? `/tree/${revision}` : ""}`) return null;
  return { repository, revision, category: value.category, capability: value.capability, licenseSource: value.licenseSource,
    licenseApproved: value.licenseApproved, sourceAvailable: value.sourceAvailable, runtimeTested: value.runtimeTested, archived: value.archived };
}
function eligibility(value) {
  if (!value.sourceAvailable) return "unavailable";
  if (!value.revision) return "unpinned";
  if (value.archived) return "archived";
  // The search boolean carries no suite/profile receipt. Do not convert it into verification.
  if (value.runtimeTested) return "runtimeEvidenceNeeded";
  return null;
}
function exactName(repository, query) {
  const normalized = query.trim().toLowerCase();
  return repository === normalized || repository.split("/")[1] === normalized;
}
function serializeInput(value) {
  let nodes = 0, stringBytes = 0;
  const serialized = JSON.stringify(value, (key, item) => {
    if (++nodes > 4096 || key.length > 256) throw new RangeError("Repository input exceeds its structural bound.");
    stringBytes += Buffer.byteLength(key);
    if (typeof item === "string") {
      if (item.length > 131072) throw new RangeError("Repository input exceeds its byte bound.");
      stringBytes += Buffer.byteLength(item);
    }
    if (stringBytes > 131072 || ["bigint", "function", "symbol"].includes(typeof item) ||
        (typeof item === "number" && !Number.isFinite(item))) throw new TypeError("Repository context must be bounded serializable data.");
    return item;
  });
  if (Buffer.byteLength(serialized) > 131072) throw new RangeError("Repository input exceeds its byte bound.");
  return serialized;
}

/**
 * Input is the existing {guidance, searches:[{query,...repositorySearchFromTool()}]}.
 * No catalog imports, network, model, file access, installs or grading outcomes.
 * The returned text is the entire prompt payload; metrics remain outside it.
 */
export function buildCompactRepositoryContext(input, options = {}) {
  const maxBytes = options.maxBytes ?? 4096, maxCandidates = options.maxCandidates ?? 5;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024 || maxBytes > 8192 ||
      !Number.isSafeInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 5)
    throw new RangeError("Invalid compact context limits.");
  if (!record(input) || !text(input.guidance, 4096) || !Array.isArray(input.searches) || input.searches.length > 8)
    throw new TypeError("Invalid bounded repository context input.");
  const queries = [], evaluations = [], records = new Map(), perQuery = [];
  const omitted = { invalid: 0, conflicting: 0, unavailable: 0, unpinned: 0, archived: 0, runtimeEvidenceNeeded: 0, candidateLimit: 0, byteLimit: 0 };
  let occurrences = 0, duplicateOccurrences = 0;
  for (let queryIndex = 0; queryIndex < input.searches.length; queryIndex++) {
    const search = input.searches[queryIndex];
    if (!record(search) || !text(search.query, 1024) || search.query.length > 256)
      throw new TypeError("Invalid repository search response.");
    if (text(search.error, 1024) && search.status === undefined && search.candidates === undefined) {
      queries.push([search.query, "error", null]); perQuery.push([]); continue;
    }
    if (!["source_candidates", "missing"].includes(search.status) || !validDate(search.researchDate) ||
        !text(search.evaluation, 2048) || !Array.isArray(search.candidates) || search.candidates.length > 5 ||
        (search.status === "missing") !== (search.candidates.length === 0))
      throw new TypeError("Invalid repository search response.");
    queries.push([search.query, search.status, search.researchDate]);
    if (!evaluations.includes(search.evaluation)) evaluations.push(search.evaluation);
    const identifiers = [];
    for (const raw of search.candidates) {
      occurrences++;
      const normalized = candidate(raw);
      if (!normalized) { omitted.invalid++; continue; }
      const identifier = `${normalized.repository}@${normalized.revision ?? "unpinned"}`;
      if (records.has(identifier)) {
        duplicateOccurrences++;
        const previous = records.get(identifier);
        if (JSON.stringify(previous.value) !== JSON.stringify(normalized)) previous.conflicting = true;
        previous.queryIndexes.add(queryIndex);
      } else records.set(identifier, { value: normalized, queryIndexes: new Set([queryIndex]), conflicting: false });
      if (!identifiers.includes(identifier)) identifiers.push(identifier);
    }
    perQuery.push(identifiers);
  }
  // Serialize only after known data bounds; unknown/cyclic input is never a prompt fallback.
  let original;
  try { original = serializeInput(input); } catch { throw new TypeError("Repository context must be bounded serializable data."); }
  const eligible = new Set();
  for (const [identifier, entry] of records) {
    if (entry.conflicting) { omitted.conflicting++; continue; }
    const reason = eligibility(entry.value);
    if (reason) omitted[reason]++; else eligible.add(identifier);
  }
  const queues = perQuery.map((identifiers, index) => identifiers.filter(id => eligible.has(id))
    .map((id, position) => ({ id, position, exact: exactName(records.get(id).value.repository, queries[index][0]) }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || a.position - b.position).map(entry => entry.id));
  const selected = [], seen = new Set();
  // Preserve query coverage; this lexical rule is not a quality ranking or model decision.
  while (queues.some(queue => queue.length)) {
    for (const queue of queues) {
      let id;
      while (queue.length && id === undefined) { const next = queue.shift(); if (!seen.has(next)) id = next; }
      if (id !== undefined) { seen.add(id); selected.push(id); }
    }
  }
  omitted.candidateLimit = Math.max(0, selected.length - maxCandidates);
  selected.length = Math.min(selected.length, maxCandidates);
  const row = id => {
    const { value, queryIndexes } = records.get(id);
    return [value.repository, value.revision, value.category, value.capability, value.licenseSource, value.licenseApproved, [...queryIndexes].sort((a, b) => a - b)];
  };
  const payload = {
    version: COMPACT_CONTEXT_VERSION, scope: "SOURCE_ONLY_INDEX_CLAIMS", untrusted: true,
    guidance: input.guidance, evaluations, grants: "none", rowDefaults: defaults,
    sourceUrl: "https://github.com/{repository}/tree/{sourceRevision}",
    querySchema: ["query", "status", "researchDate"], queries,
    rowSchema: ["repository", "sourceRevision", "category", "capability", "licenseSource", "licenseApproved", "queryIndexes"],
    selection: "exact_name_then_query_round_robin_not_quality", rows: selected.map(row), omitted,
  };
  let serialized = JSON.stringify(payload);
  while (Buffer.byteLength(serialized) > maxBytes && selected.length) {
    selected.pop(); omitted.byteLimit++; payload.rows = selected.map(row); serialized = JSON.stringify(payload);
  }
  if (Buffer.byteLength(serialized) > maxBytes)
    throw new RangeError("Context cap cannot preserve guidance, evidence limits and query provenance.");
  const selectedSet = new Set(selected);
  // Compare against legacy JSON containing the same retained rows and query references.
  const equivalent = { guidance: input.guidance, searches: input.searches.map(search => {
    if (!Array.isArray(search.candidates)) return search;
    return { ...search, candidates: search.candidates.filter(raw => {
      const normalized = candidate(raw);
      return normalized && selectedSet.has(`${normalized.repository}@${normalized.revision ?? "unpinned"}`);
    }) };
  }) };
  const inputBytes = Buffer.byteLength(original), outputBytes = Buffer.byteLength(serialized);
  const retainedLegacyBytes = Buffer.byteLength(JSON.stringify(equivalent));
  return {
    version: COMPACT_CONTEXT_VERSION, status: selected.length ? "source_candidates" : "missing", text: serialized, payload,
    inputBytes, outputBytes, savedBytes: inputBytes - outputBytes,
    reductionPercent: 100 * (inputBytes - outputBytes) / inputBytes,
    retainedLegacyBytes, structuralSavedBytes: retainedLegacyBytes - outputBytes,
    structuralReductionPercent: 100 * (retainedLegacyBytes - outputBytes) / retainedLegacyBytes,
    inputSha256: hash(original), outputSha256: hash(serialized), qualityEvidence: "NOT_RUN",
    selection: { policy: payload.selection, inputOccurrences: occurrences, uniqueSources: records.size,
      duplicateOccurrences, eligibleSources: eligible.size, retainedCandidates: selected.length, omitted: { ...omitted } },
  };
}
