import snapshot from "./zero-catalog-data.json" with { type: "json" };

export type RepositoryCandidate = (typeof snapshot.records)[number];
export const repositorySnapshot = snapshot;
export type SearchOptions = {
  query?: string;
  category?: string;
  sourceOnly?: boolean;
  limit?: number;
};

/** Local lexical discovery. Scores express text relevance, never project quality. */
export function searchRepositories(options: SearchOptions = {}): RepositoryCandidate[] {
  const query = (options.query ?? "").trim().normalize("NFKC").toLocaleLowerCase().slice(0, 256);
  const terms = query.split(/\s+/u).filter(Boolean);
  const limit = Number.isFinite(options.limit)
    ? Math.max(1, Math.min(100, Math.trunc(options.limit!)))
    : 30;
  return snapshot.records
    .filter((entry) => !options.category || entry.category === options.category)
    .filter((entry) => !options.sourceOnly || entry.sourceAvailable)
    .map((entry) => {
      const name = entry.repository.toLowerCase();
      const text = `${entry.repository} ${entry.category} ${entry.capability} ${entry.note}`
        .normalize("NFKC")
        .toLocaleLowerCase();
      return {
        entry,
        matches: terms.every((term) => text.includes(term)),
        relevance: terms.reduce((n, term) => n + (name.includes(term) ? 3 : 1), 0),
      };
    })
    .filter((result) => result.matches)
    .sort(
      (a, b) => b.relevance - a.relevance || a.entry.repository.localeCompare(b.entry.repository),
    )
    .slice(0, limit)
    .map(({ entry }) => entry);
}

export function repositorySourceUrl(entry: RepositoryCandidate): string {
  return `https://github.com/${entry.repository}${entry.sourceRevision ? `/tree/${entry.sourceRevision}` : ""}`;
}

export const repositoryCategories = [
  ...new Set(snapshot.records.map((entry) => entry.category)),
].sort();
