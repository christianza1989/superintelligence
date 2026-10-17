export type RepositoryRequirements = {
  /** Dated primary language, not all languages or execution support. */
  primaryLanguage?: string;
  /** Dated object existence, not code review or runtime qualification. */
  sourcePinPresent?: true;
  runtimeTested?: true;
  licenseApproved?: true;
  /** No OS qualification facts currently exist; any requested OS is no-fit. */
  operatingSystem?: "linux" | "windows" | "macos";
};

// Bounded bilingual vocabulary translates recorded source-purpose words. It
// does not attach capabilities to IDs or use catalog notes as capability facts.
const vocabulary = [
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
    "redaguojamu",
    "redaguoti",
    "redagavimas",
    "redaktorius",
    "redaktoriaus",
  ],
  ["processing", "apdorojimas", "apdorojimui"],
  ["table", "tables", "tabular", "lentele", "lenteles", "lenteliu"],
  [
    "transform",
    "transformation",
    "transformations",
    "transformacijos",
    "transformavimas",
    "transformavimo",
  ],
  ["data", "duomenys", "duomenu"],
  ["analysis", "analize", "analizei"],
  ["browser", "narsykle", "narsykles"],
  ["automation", "automatizacija", "automatizavimas"],
  ["slides", "slide", "skaidres", "skaidriu"],
  ["document", "documents", "dokumentai", "dokumentu", "dokumentui"],
  ["agent", "agents", "agentu", "agentas", "agento", "agentinius", "agentiniu"],
  ["text", "tekstas", "teksto"],
  ["operations", "operation", "operacijos"],
  ["local", "vietine", "vietinis", "vietiniu", "lokali", "lokaliu"],
  ["speech", "kalbos"],
  ["recognition", "atpazinimas"],
  ["transcription", "transcribe", "transkribavimas"],
  ["vector", "vectors", "vektorine", "vektorines", "vektoriu"],
  ["search", "paieska", "paieskos"],
  ["analytical", "analitine", "analitines"],
  ["code", "kodas", "kodo"],
  ["syntax", "sintakse", "sintakses"],
  ["tree", "trees", "medis", "medziai"],
  ["interactive", "interaktyvi", "interaktyvios"],
  ["chart", "charts", "diagrama", "diagramos"],
  ["artifact", "artifacts", "artefaktai", "artefaktu"],
  ["signing", "pasirasymas"],
  ["parametric", "parametrinis", "parametrinio"],
] as const;
const vocabularyTerms = new Map<string, string>(
  vocabulary.flatMap(([term, ...aliases]) =>
    [term, ...aliases].map((alias) => [alias, term]),
  ),
);
// Only request scaffolding. Unsupported adjectives, formats, permissions,
// locality and deployment requirements must remain mandatory substantive terms.
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
  "biblioteka",
  "ir",
  "su",
]);
export function normalizeRepositoryText(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}
export function repositoryWords(text: string): string[] {
  return normalizeRepositoryText(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}
export function repositoryConcepts(text: string): Set<string> {
  return new Set(
    repositoryWords(text).map((word) => vocabularyTerms.get(word) ?? word),
  );
}
const requirementKeys = new Set([
  "primaryLanguage",
  "sourcePinPresent",
  "runtimeTested",
  "licenseApproved",
  "operatingSystem",
]);
function validRequirements(value: RepositoryRequirements): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.keys(value).some((key) => !requirementKeys.has(key))) return false;
  for (const key of [
    "sourcePinPresent",
    "runtimeTested",
    "licenseApproved",
  ] as const)
    if (value[key] !== undefined && value[key] !== true) return false;
  if (
    value.primaryLanguage !== undefined &&
    (typeof value.primaryLanguage !== "string" ||
      value.primaryLanguage.length > 64 ||
      !value.primaryLanguage.trim())
  )
    return false;
  return (
    value.operatingSystem === undefined ||
    ["linux", "windows", "macos"].includes(value.operatingSystem)
  );
}

/** Reject overlong requests instead of silently dropping an unknown constraint. */
export function normalizeRepositoryNeed(
  query: string,
  required: RepositoryRequirements = {},
) {
  if (
    typeof query !== "string" ||
    query.length > 256 ||
    !validRequirements(required)
  )
    return null;
  const normalized = normalizeRepositoryText(query.trim());
  if (normalized.length > 1024) return null;
  const identityText = normalized.replace(/\s*\/\s*/gu, "/");
  const identity = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/u.test(identityText)
    ? identityText
    : null;
  const requirements = { ...required };
  let text = normalized.replace(/[^\p{L}\p{N}]+/gu, " ");
  // Canonical identities are literal lookups; explicit structured requirements
  // still apply. A repo name containing Windows is not an OS qualification.
  if (!identity) {
    text = text.replace(
      /\b(?:runtime (?:ready|tested|verified)|verified runtime|vykdymui (?:paruosta|paruostas|paruosti)|patikrintas vykdymas)\b/gu,
      () => {
        requirements.runtimeTested = true;
        return " ";
      },
    );
    text = text.replace(
      /\b(?:approved license|license approved|patvirtinta licencija|patvirtintos licencijos|licencija patvirtinta)\b/gu,
      () => {
        requirements.licenseApproved = true;
        return " ";
      },
    );
    text = text.replace(/\b(?:windows|linux|macos|mac os)\b/gu, (os) => {
      requirements.operatingSystem =
        os === "mac os" ? "macos" : (os as "linux" | "windows" | "macos");
      return " ";
    });
  }
  const allWords = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (allWords.length > 64 || allWords.some((word) => word.length > 64))
    return null;
  const literalTerms = allWords.filter((word) => !requestWords.has(word));
  return {
    identity,
    literalTerms,
    terms: [
      ...new Set(literalTerms.map((word) => vocabularyTerms.get(word) ?? word)),
    ],
    requirements,
    empty: query.trim().length === 0,
  };
}
