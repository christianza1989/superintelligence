export const LIBRARY_FILTERS_KEY = "repositoryzero.library.filters.v1";

/** A navigation link must not load the catalog or popularity data into the workspace. */
export function libraryReturnPath(): string {
  try {
    const stored = window.sessionStorage.getItem(LIBRARY_FILTERS_KEY);
    if (!stored || stored.length > 2048) return "/discover";
    const previous = new URLSearchParams(stored);
    const params = new URLSearchParams();
    for (const key of [
      "q",
      "category",
      "source",
      "license",
      "runtime",
      "archived",
      "language",
      "sort",
      "view",
      "repo",
    ]) {
      const value = previous.get(key);
      if (value) params.set(key, value);
    }
    // The destination stays fixed. Library validates all supplied filters and IDs.
    return `/discover${params.size ? `?${params}` : ""}`;
  } catch {
    return "/discover";
  }
}
