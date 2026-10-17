import type { RepositoryRequirements } from "./zero-need-normalization.js";
import { normalizeRepositoryNeed } from "./zero-need-normalization.js";

// Shared preparation facts, not repository-wide approval or an execution grant.
export const ZERO_CSV_PROFILE = "d3-dsv-3.0.1/strict-table-v1";
export const ZERO_CSV_LIMITS = Object.freeze({
  inputBytes: 16_384,
  rows: 512,
  columns: 64,
  cellChars: 4096,
  artifactBytes: 98_304,
  runtimeMs: 5000,
  outstandingJobsPerScope: 4,
});
export const ZERO_CSV_SOURCE_PINS = Object.freeze({
  "src/csv.js": "b5dcb2a30eb68c069b7e058771a445add9bd9ab006ab74fa7fa939c1ed7c3fc2",
  "src/dsv.js": "955def3fd0dfcb744c7ad3d4f7f071f368aa2021e68ac44eeb73952e25625947",
  LICENSE: "7842a82012622e5a37bfe4f6c1b67cd3bae6350716b5bf87f36cea0bdc1319dc",
});

/** One existing bounded preparer. This is not a general component registry. */
export const preparedProfiles = Object.freeze([
  Object.freeze({
    profileId: ZERO_CSV_PROFILE,
    repository: "d3/d3-dsv",
    category: "data",
    capability: "Parse comma-separated CSV into rectangular string rows",
    packageName: "d3-dsv",
    packageVersion: "3.0.1",
    source: "https://github.com/d3/d3-dsv",
    sourceFiles: ZERO_CSV_SOURCE_PINS,
    licenseSource: "ISC",
    entrypoint: "src/csv.js#csvParseRows",
    limits: ZERO_CSV_LIMITS,
    conformance: Object.freeze({
      status: "development-conformance" as const,
      scope:
        "Strict rectangular CSV parsing checked by an independent decoder; bounded native CSV preparation and project verification",
      evidence: Object.freeze([
        "platform/packages/adapters/src/zero-csv-profile.test.ts",
        "docs/experiments/MCP-PREVIEW-2026-10-17.md",
      ]),
      holdout: "NOT_RUN" as const,
    }),
  }),
]);
export type PreparedProfile = (typeof preparedProfiles)[number];
export type PreparedProfileSearchOptions = {
  query?: string;
  category?: string;
  limit?: number;
  requirements?: RepositoryRequirements;
};

// Only aliases for this narrow parser purpose. Unrecognized words remain hard
// constraints; TSV, streaming, writing, Excel and arbitrary transformations do
// not become supported because there is only one prepared profile.
const parserTerms = new Set([
  "parse",
  "parser",
  "parsing",
  "nuskaitymas",
  "nuskaitymo",
  "nuskaityti",
  "skaitymas",
]);
const concept = (term: string) => (parserTerms.has(term) ? "parse" : term);
const supported = new Set([
  "csv",
  "parse",
  "strict",
  "table",
  "comma",
  "separated",
  "string",
  "rows",
  "d3",
  "dsv",
]);

/** Deterministic discovery facts only. The backend still authorizes every job. */
export function searchPreparedProfiles(
  options: PreparedProfileSearchOptions = {},
): PreparedProfile[] {
  const need = normalizeRepositoryNeed(options.query ?? "", options.requirements);
  if (!need || (!need.empty && need.terms.length === 0)) return [];
  // Existing requirement names describe repository-wide/datestamped facts.
  // File hashes and scoped conformance cannot satisfy those different claims.
  if (Object.values(need.requirements).some((value) => value !== undefined)) return [];
  if (options.category && options.category !== preparedProfiles[0]!.category) return [];
  if (need.identity)
    return need.identity === preparedProfiles[0]!.repository ? [...preparedProfiles] : [];
  const terms = need.terms.map(concept);
  if (!terms.every((term) => supported.has(term))) return [];
  // A generic parser/table request does not establish a CSV parsing need.
  if (!need.empty && !terms.includes("csv") && !(terms.includes("d3") && terms.includes("dsv")))
    return [];
  return [...preparedProfiles];
}
