import type { RepositoryCandidate } from "@rakazo/core/repositoryzero";
import {
  getRepositoryMetadata,
  repositoryLanguages,
  listRepositories,
  repositoryCategories,
  repositorySnapshot,
} from "@rakazo/core/repositoryzero";
import popularity from "../../../../../catalog/popularity.json" with { type: "json" };
import { LIBRARY_FILTERS_KEY } from "./repository-library-navigation";
export { LIBRARY_FILTERS_KEY };

export const LIBRARY_SAVED_KEY = "repositoryzero.library.saved.v1";
export const LIBRARY_PAGE_SIZE = 30;
type LocalStore = Pick<Storage, "getItem" | "setItem">;
export type LibraryFilters = {
  query: string;
  category: string;
  source: "" | "available" | "unavailable";
  license: "" | "known" | "unknown";
  runtime: "" | "tested" | "untested";
  archived: "" | "active" | "archived";
  language: string;
  sort: "relevance" | "stars" | "name" | "indexed";
  view: "all" | "saved";
  repository: string;
};
export const DEFAULT_LIBRARY_FILTERS: LibraryFilters = {
  query: "",
  category: "",
  source: "",
  license: "",
  runtime: "",
  archived: "",
  language: "",
  sort: "relevance",
  view: "all",
  repository: "",
};
const canonicalIds = new Map(
  repositorySnapshot.records.map((entry) => [
    entry.repository.toLowerCase(),
    entry.repository,
  ]),
);

export function parseLibraryFilters(
  input: URLSearchParams | string,
): LibraryFilters {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  const choice = <T extends string>(
    key: string,
    choices: readonly T[],
    fallback: T,
  ): T => {
    const value = params.get(key);
    return choices.includes(value as T) ? (value as T) : fallback;
  };
  return {
    query: (params.get("q") ?? "").slice(0, 256),
    category: choice("category", repositoryCategories, ""),
    source: choice("source", ["", "available", "unavailable"], ""),
    license: choice("license", ["", "known", "unknown"], ""),
    runtime: choice("runtime", ["", "tested", "untested"], ""),
    archived: choice("archived", ["", "active", "archived"], ""),
    language: choice("language", ["", "unknown", ...repositoryLanguages], ""),
    sort: choice(
      "sort",
      ["relevance", "stars", "name", "indexed"],
      "relevance",
    ),
    view: choice("view", ["all", "saved"], "all"),
    repository:
      canonicalIds.get((params.get("repo") ?? "").toLowerCase()) ?? "",
  };
}

export function librarySearchParams(filters: LibraryFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  for (const key of [
    "category",
    "source",
    "license",
    "runtime",
    "archived",
    "language",
    "sort",
    "view",
  ] as const)
    if (filters[key] !== DEFAULT_LIBRARY_FILTERS[key])
      params.set(key, filters[key]);
  if (filters.repository) params.set("repo", filters.repository);
  return params;
}

export function browserLibraryStorage(
  kind: "local" | "session",
): LocalStore | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readLibraryFilters(storage: LocalStore | null): LibraryFilters {
  try {
    return parseLibraryFilters(storage?.getItem(LIBRARY_FILTERS_KEY) ?? "");
  } catch {
    return { ...DEFAULT_LIBRARY_FILTERS };
  }
}

export function rememberLibraryFilters(
  filters: LibraryFilters,
  storage: LocalStore | null,
): void {
  try {
    storage?.setItem(
      LIBRARY_FILTERS_KEY,
      librarySearchParams(filters).toString(),
    );
  } catch {
    /* URL state remains usable when browser storage is blocked. */
  }
}

export function readSavedRepositories(storage: LocalStore | null): {
  ids: string[];
  persistent: boolean;
} {
  if (!storage) return { ids: [], persistent: false };
  try {
    const text = storage.getItem(LIBRARY_SAVED_KEY);
    if (!text || text.length > 128 * 1024) return { ids: [], persistent: true };
    const data: unknown = JSON.parse(text);
    if (
      !data ||
      typeof data !== "object" ||
      !("version" in data) ||
      data.version !== 1 ||
      !("repositories" in data) ||
      !Array.isArray(data.repositories)
    )
      return { ids: [], persistent: true };
    const ids = data.repositories
      .filter((id): id is string => typeof id === "string")
      .map((id) => canonicalIds.get(id.toLowerCase()))
      .filter((id): id is string => id !== undefined);
    return {
      ids: [...new Set(ids)].slice(0, canonicalIds.size),
      persistent: true,
    };
  } catch {
    return { ids: [], persistent: false };
  }
}

export function saveRepositories(
  ids: readonly string[],
  storage: LocalStore | null,
): boolean {
  if (!storage) return false;
  try {
    const repositories = [
      ...new Set(
        ids
          .map((id) => canonicalIds.get(id.toLowerCase()))
          .filter((id): id is string => id !== undefined),
      ),
    ].sort();
    storage.setItem(
      LIBRARY_SAVED_KEY,
      JSON.stringify({ version: 1, repositories }),
    );
    return true;
  } catch {
    return false;
  }
}

export type RepositoryStars = {
  stars: number;
  source: string;
  observedAt: string;
};
type PopularityInput = {
  observations: readonly {
    repo: string;
    kind: string;
    source: string;
    retrieved_at_utc: string;
    stars?: number;
  }[];
  sources: readonly {
    url: string;
    kind: string;
    status: number;
    retrieved_at_utc: string;
  }[];
};

/** Join canonical IDs and successful cumulative-star sources. Never infer growth. */
export function projectRepositoryStars(
  input: PopularityInput = popularity,
): Map<string, RepositoryStars> {
  const result = new Map<string, RepositoryStars>();
  for (const observation of input.observations) {
    const id = canonicalIds.get(observation.repo.toLowerCase());
    const observed = Date.parse(observation.retrieved_at_utc);
    if (
      !id ||
      observation.kind !== "cumulative_stars" ||
      !Number.isSafeInteger(observation.stars) ||
      observation.stars! < 0 ||
      !Number.isFinite(observed) ||
      !/(?:[zZ]|[+-]\d{2}:\d{2})$/u.test(observation.retrieved_at_utc)
    )
      continue;
    const source = input.sources.find(
      (entry) =>
        entry.status === 200 &&
        entry.kind === "cumulative_stars" &&
        entry.url === observation.source &&
        Date.parse(entry.retrieved_at_utc) === observed,
    );
    if (!source || !observation.source.startsWith("https://github.com/search?"))
      continue;
    const previous = result.get(id);
    if (
      !previous ||
      observed > Date.parse(previous.observedAt) ||
      (observed === Date.parse(previous.observedAt) &&
        observation.source < previous.source)
    )
      result.set(id, {
        stars: observation.stars!,
        source: observation.source,
        observedAt: observation.retrieved_at_utc,
      });
  }
  return result;
}
export const repositoryStars = projectRepositoryStars();

export function hasKnownLicenseSource(entry: RepositoryCandidate): boolean {
  return (
    Boolean(entry.license.trim()) &&
    !/unknown|licenseref|manual.review/iu.test(entry.license)
  );
}

export function libraryRepositories(
  filters: LibraryFilters,
  saved: readonly string[],
): RepositoryCandidate[] {
  const savedIds = new Set(saved);
  const results = listRepositories({
    query: filters.query,
    category: filters.category,
  })
    .filter(
      (entry) => filters.view !== "saved" || savedIds.has(entry.repository),
    )
    .filter(
      (entry) =>
        !filters.source ||
        entry.sourceAvailable === (filters.source === "available"),
    )
    .filter(
      (entry) =>
        !filters.license ||
        hasKnownLicenseSource(entry) === (filters.license === "known"),
    )
    .filter(
      (entry) =>
        !filters.runtime ||
        entry.runtimeTested === (filters.runtime === "tested"),
    )
    .filter(
      (entry) =>
        !filters.archived ||
        entry.archived === (filters.archived === "archived"),
    );
  const languageFiltered = results.filter(
    (entry) =>
      !filters.language ||
      (filters.language === "unknown"
        ? !getRepositoryMetadata(entry.repository)?.language
        : getRepositoryMetadata(entry.repository)?.language ===
          filters.language),
  );
  if (filters.sort === "stars")
    languageFiltered.sort(
      (a, b) =>
        (repositoryStars.get(b.repository)?.stars ?? -1) -
          (repositoryStars.get(a.repository)?.stars ?? -1) ||
        a.repository.localeCompare(b.repository),
    );
  if (filters.sort === "name")
    languageFiltered.sort((a, b) => a.repository.localeCompare(b.repository));
  if (filters.sort === "indexed")
    languageFiltered.sort((a, b) =>
      compareFirstIndexed(a.repository, b.repository),
    );
  return languageFiltered;
}

function compareFirstIndexed(a: string, b: string): number {
  const aDate = getRepositoryMetadata(a)?.firstIndexed?.at;
  const bDate = getRepositoryMetadata(b)?.firstIndexed?.at;
  return (
    (bDate ? Date.parse(bDate) : -Infinity) -
      (aDate ? Date.parse(aDate) : -Infinity) || a.localeCompare(b)
  );
}
