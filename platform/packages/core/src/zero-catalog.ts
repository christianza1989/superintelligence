import snapshot from "./zero-catalog-data.json" with { type: "json" };

export type RepositoryCandidate = (typeof snapshot.records)[number];
export const repositorySnapshot = snapshot;
export type SearchOptions = {
  query?: string;
  category?: string;
  sourceOnly?: boolean;
  limit?: number;
};

// Small bilingual vocabulary grounded in existing capability text. These translate
// words, never assign new capabilities to a repository or infer format support.
const needVocabulary = [
  [
    "image",
    "images",
    "vaizdai",
    "vaizdu",
    "grafika",
    "grafikos",
    "paveiksleliai",
    "paveiksleliu",
  ],
  ["raster", "rastrine", "rastrines", "rastriniu"],
  [
    "edit",
    "editing",
    "editor",
    "editable",
    "redaguojama",
    "redaguojamos",
    "redaguojami",
    "redaguoti",
    "redagavimas",
    "redaktorius",
    "redaktoriaus",
  ],
  ["processing", "apdorojimas"],
  ["table", "tables", "tabular", "lentele", "lenteliu"],
  [
    "transform",
    "transformation",
    "transformations",
    "transformacijos",
    "transformavimas",
  ],
  ["data", "duomenys", "duomenu"],
  ["analysis", "analize", "analizei"],
  ["browser", "narsykle", "narsykles"],
  ["automation", "automatizacija"],
  ["slides", "slide", "skaidres"],
  ["document", "documents", "dokumentai", "dokumentu", "dokumentui"],
  ["agent", "agents", "agentu", "agentas", "agento", "agentinius", "agentiniu"],
] as const;
const needTerms = new Map<string, string>(
  needVocabulary.flatMap(([term, ...aliases]) =>
    [term, ...aliases].map((alias) => [alias, term]),
  ),
);
// Request scaffolding only. Constraints such as local, browser, CSV, license and
// unsupported terms remain mandatory; do not relax an unmatched need to one hit.
const requestWords = new Set([
  "i",
  "me",
  "my",
  "a",
  "an",
  "the",
  "to",
  "for",
  "please",
  "need",
  "want",
  "find",
  "looking",
  "tool",
  "tools",
  "library",
  "software",
  "with",
  "and",
  "man",
  "reikia",
  "noriu",
  "ieskau",
  "prasau",
  "irankis",
  "irankio",
  "iranki",
  "ir",
  "su",
]);

function normalizeText(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

function words(text: string): string[] {
  return normalizeText(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}

function concepts(text: string): Set<string> {
  return new Set(words(text).map((word) => needTerms.get(word) ?? word));
}

/** Local all-terms retrieval. Relevance is source text overlap, never verified fit. */
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
  const query = (options.query ?? "").trim().slice(0, 256);
  const identity = normalizeText(query).replace(/\s*\/\s*/gu, "/");
  const isIdentity = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/u.test(identity);
  const literalTerms = words(query).filter((word) => !requestWords.has(word));
  const terms = [
    ...new Set(literalTerms.map((word) => needTerms.get(word) ?? word)),
  ];
  // Empty input retains catalog browsing; a nonempty but content-free request is no-fit.
  if (query && terms.length === 0) return [];
  return snapshot.records
    .filter((entry) => !options.category || entry.category === options.category)
    .filter((entry) => !options.sourceOnly || entry.sourceAvailable)
    .map((entry) => {
      const name = concepts(entry.repository);
      const literalName = new Set(words(entry.repository));
      const capability = concepts(entry.capability);
      // Categories remain literal filters/discovery words. An image-editing
      // category with an empty capability must not imply an image editor.
      const category = new Set(words(entry.category));
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
          (!isIdentity || normalizeText(entry.repository) === identity),
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

export { createRepositoryReusePlan, InvalidRepositoryReusePlan } from "./zero-reuse-plan.js";
