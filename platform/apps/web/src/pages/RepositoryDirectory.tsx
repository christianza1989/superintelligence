import { libraryHandoffPath } from "../lib/library-project-handoff";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  getRepositoryMetadata,
  repositoryLanguages,
  repositoryCategories,
  repositorySnapshot,
  repositorySourceUrl,
} from "@rakazo/core/repositoryzero";
import { Button, Input, NativeSelect } from "@rakazo/ui-web";
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  ExternalLink,
  Search,
  Star,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { setUiLocale } from "../lib/i18n";
import {
  browserLibraryStorage,
  DEFAULT_LIBRARY_FILTERS,
  LIBRARY_PAGE_SIZE,
  LIBRARY_SAVED_KEY,
  libraryRepositories,
  librarySearchParams,
  parseLibraryFilters,
  readSavedRepositories,
  rememberLibraryFilters,
  repositoryStars,
  saveRepositories,
} from "../lib/repository-library";
import type { LibraryFilters } from "../lib/repository-library";
import {
  getUiAppearancePreference,
  setUiAppearance,
} from "../lib/ui-appearance";
import { isUiLocale, UI_LOCALE_LABELS, UI_LOCALES } from "../lib/ui-locale";

function Filter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm text-muted-foreground">
      {label}
      <NativeSelect
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full text-foreground"
      >
        {children}
      </NativeSelect>
    </label>
  );
}

export function RepositoryDirectoryPage() {
  const { t, i18n } = useLingui();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseLibraryFilters(params), [params]);
  const [saved, setSaved] = useState(() =>
    readSavedRepositories(browserLibraryStorage("local")),
  );
  const [storageError, setStorageError] = useState(false);
  const [appearance, setAppearance] = useState(getUiAppearancePreference);
  const [visible, setVisible] = useState(LIBRARY_PAGE_SIZE);
  const [advanced, setAdvanced] = useState(
    Boolean(filters.license || filters.runtime || filters.archived),
  );
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const results = useMemo(
    () => libraryRepositories(filters, saved.ids),
    [filters, saved.ids],
  );
  const selected = repositorySnapshot.records.find(
    (entry) => entry.repository === filters.repository,
  );
  const stars = selected ? repositoryStars.get(selected.repository) : undefined;
  const metadata = selected
    ? getRepositoryMetadata(selected.repository)
    : undefined;
  const pinLabel = (status: string | undefined) =>
    status === "present"
      ? t`Found in repository`
      : status === "absent"
        ? t`Not found in repository`
        : status === "not-recorded"
          ? t`Not recorded`
          : status === "not-checked"
            ? t`Not checked`
            : t`Unavailable`;
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(value));

  useEffect(() => {
    rememberLibraryFilters(filters, browserLibraryStorage("session"));
  }, [filters]);
  useEffect(() => {
    setVisible(LIBRARY_PAGE_SIZE);
  }, [
    filters.query,
    filters.category,
    filters.source,
    filters.license,
    filters.runtime,
    filters.archived,
    filters.language,
    filters.sort,
    filters.view,
  ]);
  useEffect(() => {
    if (filters.repository) {
      detailHeading.current?.focus({ preventScroll: true });
      if (window.matchMedia("(max-width: 1279px)").matches)
        detailHeading.current?.parentElement?.scrollIntoView({
          block: "start",
        });
    }
  }, [filters.repository]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === LIBRARY_SAVED_KEY || event.key === null)
        setSaved(readSavedRepositories(browserLibraryStorage("local")));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  function change(
    key: Exclude<keyof LibraryFilters, "repository">,
    value: string,
  ) {
    const next = parseLibraryFilters(
      librarySearchParams({ ...filters, [key]: value, repository: "" }),
    );
    setParams(librarySearchParams(next), { replace: true });
  }
  function toggleSaved(id: string) {
    const ids = saved.ids.includes(id)
      ? saved.ids.filter((value) => value !== id)
      : [...saved.ids, id];
    const persistent = saveRepositories(ids, browserLibraryStorage("local"));
    setSaved({ ids, persistent });
    setStorageError(!persistent);
  }
  function closeDetails() {
    setParams(librarySearchParams({ ...filters, repository: "" }));
    requestAnimationFrame(() =>
      document.getElementById(`repository-${filters.repository}`)?.focus(),
    );
  }
  const saveLabel = (id: string) =>
    `${saved.ids.includes(id) ? t`Remove from Saved` : t`Save`} ${id}`;
  const clearFilters = () =>
    setParams(
      librarySearchParams({ ...DEFAULT_LIBRARY_FILTERS, view: filters.view }),
      { replace: true },
    );

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            to="/"
            className="flex items-center gap-3 font-semibold focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span
              className="size-6 rounded-full border-4 border-primary"
              aria-hidden="true"
            />
            RepositoryZero
          </Link>
          <nav
            aria-label={t`Library settings`}
            className="flex flex-wrap items-center gap-4"
          >
            <Link
              to="/app"
              className="text-sm underline-offset-4 hover:underline"
            >
              <Trans>Open workspace</Trans>
            </Link>
            <NativeSelect
              aria-label={t`Language`}
              value={i18n.locale}
              onChange={(event) => {
                if (isUiLocale(event.target.value))
                  void setUiLocale(event.target.value);
              }}
            >
              {UI_LOCALES.map((locale) => (
                <option value={locale} key={locale}>
                  {UI_LOCALE_LABELS[locale]}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label={t`Appearance`}
              value={appearance}
              onChange={(event) => {
                const next = event.target.value as typeof appearance;
                setAppearance(next);
                setUiAppearance(next);
              }}
            >
              <option value="dark">{t`Dark`}</option>
              <option value="light">{t`Light`}</option>
              <option value="system">{t`System`}</option>
            </NativeSelect>
          </nav>
        </div>
      </header>
      <main className="mx-auto grid max-w-[1600px] gap-8 p-5 sm:p-8 lg:grid-cols-[160px_minmax(0,1fr)] xl:grid-cols-[160px_minmax(0,1fr)_320px]">
        <aside>
          <nav
            aria-label={t`Library navigation`}
            className="flex gap-2 lg:flex-col"
          >
            <Button
              variant={filters.view === "all" ? "secondary" : "ghost"}
              className="justify-start"
              aria-current={filters.view === "all" ? "page" : undefined}
              onClick={() => change("view", "all")}
            >
              <BookOpen aria-hidden="true" />
              <Trans>Library</Trans>
            </Button>
            <Button
              variant={filters.view === "saved" ? "secondary" : "ghost"}
              className="justify-start"
              aria-label={t`Saved`}
              aria-current={filters.view === "saved" ? "page" : undefined}
              onClick={() => change("view", "saved")}
            >
              <Bookmark aria-hidden="true" />
              <Trans>Saved</Trans>
              <span className="ms-auto tabular-nums text-muted-foreground">
                {saved.ids.length}
              </span>
            </Button>
          </nav>
          <p className="mt-7 hidden text-xs leading-relaxed text-muted-foreground lg:block">
            <Trans>Source research</Trans>
            <br />
            <time dateTime={repositorySnapshot.researchDate}>
              {date(repositorySnapshot.researchDate)}
            </time>
          </p>
        </aside>
        <section
          aria-labelledby="directory-title"
          className={`min-w-0 ${selected ? "hidden xl:block" : ""}`}
        >
          <h1
            id="directory-title"
            className="text-3xl font-semibold tracking-tight"
          >
            {filters.view === "saved" ? t`Saved` : t`Library`}
          </h1>
          <p className="mt-2 text-muted-foreground">
            <Trans>Explore source candidates.</Trans>
          </p>
          <div className="relative my-6">
            <Search
              aria-hidden="true"
              className="absolute start-3.5 top-3.5 text-muted-foreground"
              size={18}
            />
            <Input
              aria-label={t`Search repositories`}
              className="h-12 ps-11"
              placeholder={t`Search repositories or capabilities`}
              maxLength={256}
              value={filters.query}
              onChange={(event) => change("query", event.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Filter
              label={t`Category`}
              value={filters.category}
              onChange={(value) => change("category", value)}
            >
              <option value="">{t`All categories`}</option>
              {repositoryCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Filter>
            <Filter
              label={t`Source`}
              value={filters.source}
              onChange={(value) => change("source", value)}
            >
              <option value="">{t`All`}</option>
              <option value="available">{t`Available`}</option>
              <option value="unavailable">{t`Unavailable`}</option>
            </Filter>
            <Filter
              label={t`Primary language`}
              value={filters.language}
              onChange={(value) => change("language", value)}
            >
              <option value="">{t`All languages`}</option>
              <option value="unknown">{t`Unknown`}</option>
              {repositoryLanguages.map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </Filter>
            <Filter
              label={t`Sort`}
              value={filters.sort}
              onChange={(value) => change("sort", value)}
            >
              <option value="relevance">{t`Relevance`}</option>
              <option value="stars">{t`Most stars`}</option>
              <option value="name">{t`Name`}</option>
              <option value="indexed">{t`Recently indexed`}</option>
            </Filter>
          </div>
          <details
            open={advanced}
            onToggle={(event) => setAdvanced(event.currentTarget.open)}
            className="mt-4 text-sm"
          >
            <summary className="w-fit cursor-pointer rounded py-1 text-muted-foreground underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
              <Trans>More filters</Trans>
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Filter
                label={t`License source`}
                value={filters.license}
                onChange={(value) => change("license", value)}
              >
                <option value="">{t`All`}</option>
                <option value="known">{t`Recorded`}</option>
                <option value="unknown">{t`Unknown`}</option>
              </Filter>
              <Filter
                label={t`Runtime`}
                value={filters.runtime}
                onChange={(value) => change("runtime", value)}
              >
                <option value="">{t`All`}</option>
                <option value="untested">{t`Not evaluated in runtime`}</option>
                <option value="tested">{t`Runtime tested`}</option>
              </Filter>
              <Filter
                label={t`Archived`}
                value={filters.archived}
                onChange={(value) => change("archived", value)}
              >
                <option value="">{t`All`}</option>
                <option value="active">{t`Active`}</option>
                <option value="archived">{t`Archived only`}</option>
              </Filter>
            </div>
          </details>
          <div className="my-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <p aria-live="polite">
              {Math.min(visible, results.length)} / {results.length}{" "}
              <Trans>repositories</Trans>
            </p>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <Trans>Clear filters</Trans>
            </Button>
          </div>
          {(storageError ||
            (!saved.persistent && filters.view === "saved")) && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-border p-3 text-sm"
            >
              <Trans>
                Browser storage is unavailable. Saved changes last until this
                page closes.
              </Trans>
            </p>
          )}
          <ul className="divide-y divide-border border-y border-border">
            {results.slice(0, visible).map((entry) => {
              const observed = repositoryStars.get(entry.repository);
              const isSaved = saved.ids.includes(entry.repository);
              return (
                <li
                  key={entry.repository}
                  className={`flex items-start gap-2 rounded-lg px-3 py-4 ${selected?.repository === entry.repository ? "bg-muted" : "hover:bg-muted/50"}`}
                >
                  <button
                    type="button"
                    id={`repository-${entry.repository}`}
                    className="min-w-0 flex-1 rounded text-start focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() =>
                      setParams(
                        librarySearchParams({
                          ...filters,
                          repository: entry.repository,
                        }),
                      )
                    }
                    aria-pressed={selected?.repository === entry.repository}
                  >
                    <span className="block break-words font-medium">
                      {entry.repository}
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                      {entry.capability || t`Capability not recorded`}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{entry.category}</span>
                      <span>
                        {getRepositoryMetadata(entry.repository)?.language ??
                          t`Unknown`}
                      </span>
                      {!entry.sourceAvailable && (
                        <span>{t`Source unavailable`}</span>
                      )}
                      {entry.archived && <span>{t`Archived`}</span>}
                    </span>
                  </button>
                  <span className="grid shrink-0 justify-items-end gap-1 pt-0.5 text-xs tabular-nums text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Star size={14} aria-hidden="true" />
                      <span className="sr-only">{t`Stars`}: </span>
                      {observed ? (
                        observed.stars.toLocaleString(i18n.locale)
                      ) : (
                        <span aria-label={t`Unknown`}>—</span>
                      )}
                    </span>
                    {observed && (
                      <time
                        dateTime={observed.observedAt}
                        title={observed.observedAt}
                        className="text-xs"
                      >
                        {date(observed.observedAt)}
                      </time>
                    )}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    aria-label={saveLabel(entry.repository)}
                    aria-pressed={isSaved}
                    onClick={() => toggleSaved(entry.repository)}
                  >
                    <Bookmark
                      size={17}
                      fill={isSaved ? "currentColor" : "none"}
                      aria-hidden="true"
                    />
                  </Button>
                </li>
              );
            })}
          </ul>
          {results.length === 0 && (
            <div
              role="status"
              className="py-12 text-center text-sm text-muted-foreground"
            >
              {filters.view === "saved" && saved.ids.length === 0 ? (
                <>
                  <p className="font-medium text-foreground">
                    <Trans>No saved repositories yet.</Trans>
                  </p>
                  <p className="mt-2">
                    <Trans>Save repositories to return to them here.</Trans>
                  </p>
                </>
              ) : (
                <Trans>
                  No matching candidate. Try another capability or category.
                </Trans>
              )}
            </div>
          )}
          {visible < results.length && (
            <Button
              variant="outline"
              className="my-6 w-full"
              onClick={() => setVisible((count) => count + LIBRARY_PAGE_SIZE)}
            >
              <Trans>Load more</Trans>
            </Button>
          )}
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            <Trans>Dated stars; missing counts are unknown.</Trans>
          </p>
        </section>
        <aside
          aria-label={t`Repository details`}
          className={`min-w-0 self-start xl:sticky xl:top-8 ${selected ? "" : "hidden xl:block"}`}
        >
          {selected ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="mb-5 xl:hidden"
                onClick={closeDetails}
              >
                <ArrowLeft aria-hidden="true" />
                <Trans>Back to results</Trans>
              </Button>
              <h2
                ref={detailHeading}
                tabIndex={-1}
                className="break-words text-xl font-semibold tracking-tight outline-none"
              >
                {selected.repository}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {selected.capability || t`Capability not recorded`}
              </p>
              <Button
                variant="outline"
                className="my-5 w-full"
                aria-label={saveLabel(selected.repository)}
                aria-pressed={saved.ids.includes(selected.repository)}
                onClick={() => toggleSaved(selected.repository)}
              >
                <Bookmark
                  aria-hidden="true"
                  fill={
                    saved.ids.includes(selected.repository)
                      ? "currentColor"
                      : "none"
                  }
                />
                {saved.ids.includes(selected.repository)
                  ? t`Remove from Saved`
                  : t`Save`}
              </Button>
              <Button
                variant="outline"
                render={<Link to={libraryHandoffPath(selected.repository)} />}
                className="mb-5 w-full"
              >{t`Start project`}</Button>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-4 border-y border-border py-5 text-sm">
                <dt className="text-muted-foreground">
                  <Trans>Source</Trans>
                </dt>
                <dd>
                  {selected.sourceAvailable
                    ? t`Source only`
                    : t`Source unavailable`}
                </dd>
                <dt className="text-muted-foreground">
                  <Trans>Source revision</Trans>
                </dt>
                <dd className="break-all font-mono text-xs">
                  {selected.sourceRevision || t`Unknown`}
                </dd>
                <dt className="text-muted-foreground">{t`Pin lookup`}</dt>
                <dd>
                  {pinLabel(metadata?.sourcePin.status)}
                  {metadata?.sourcePin.observedAt && (
                    <time
                      dateTime={metadata.sourcePin.observedAt}
                      title={metadata.sourcePin.observedAt}
                      className="mt-1 block text-xs text-muted-foreground"
                    >
                      {t`Observed`} {date(metadata.sourcePin.observedAt)}
                    </time>
                  )}
                </dd>
                <dt className="text-muted-foreground">
                  <Trans>License source</Trans>
                </dt>
                <dd className="break-words">{selected.license}</dd>
                <dt className="text-muted-foreground">
                  <Trans>License review</Trans>
                </dt>
                <dd>
                  {selected.licenseApproved
                    ? t`Approved`
                    : t`Pending evaluation`}
                </dd>
                <dt className="text-muted-foreground">
                  <Trans>Runtime</Trans>
                </dt>
                <dd>
                  {selected.runtimeTested
                    ? t`Runtime tested`
                    : t`Not evaluated in runtime`}
                </dd>
                <dt className="text-muted-foreground">
                  <Trans>Runtime ready</Trans>
                </dt>
                <dd>{t`Unknown`}</dd>
                <dt className="text-muted-foreground">{t`Primary language`}</dt>
                <dd>
                  {metadata?.language ?? t`Unknown`}
                  {metadata?.observedAt && (
                    <time
                      dateTime={metadata.observedAt}
                      title={metadata.observedAt}
                      className="mt-1 block text-xs text-muted-foreground"
                    >
                      {t`Observed`} {date(metadata.observedAt)}
                    </time>
                  )}
                  {metadata?.githubSource && (
                    <a
                      href={metadata.githubSource}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs underline underline-offset-4"
                    >{t`GitHub metadata`}</a>
                  )}
                  <span className="mt-1 block text-xs text-muted-foreground">{t`Current repository metadata; source revision may differ.`}</span>
                </dd>
                {metadata?.githubStatus !== "observed" && (
                  <>
                    <dt className="text-muted-foreground">{t`Repository identity`}</dt>
                    <dd>
                      {metadata?.githubStatus === "identity-conflict"
                        ? t`Identity conflict`
                        : metadata?.githubStatus === "not-found-or-inaccessible"
                          ? t`Not found or inaccessible`
                          : t`Unknown`}
                      {metadata?.resolvedRepository && (
                        <span className="mt-1 block break-all text-xs">
                          {metadata.resolvedRepository}
                        </span>
                      )}
                    </dd>
                  </>
                )}
                <dt className="text-muted-foreground">
                  <Trans>Archived</Trans>
                </dt>
                <dd>{selected.archived ? t`Yes` : t`No`}</dd>
                <dt className="text-muted-foreground">
                  <Trans>Metadata date</Trans>
                </dt>
                <dd>
                  <time dateTime={repositorySnapshot.researchDate}>
                    {date(repositorySnapshot.researchDate)}
                  </time>
                </dd>
                <dt className="text-muted-foreground">{t`Indexed`}</dt>
                <dd>
                  {metadata?.firstIndexed ? (
                    <>
                      <time
                        dateTime={metadata.firstIndexed.at}
                        title={metadata.firstIndexed.at}
                      >
                        {date(metadata.firstIndexed.at)}
                      </time>
                      <a
                        href={metadata.firstIndexed.source}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block text-xs underline underline-offset-4"
                      >{t`Index source`}</a>
                      <span className="mt-1 block text-xs text-muted-foreground">{t`First Git index presence; earlier addition date unknown.`}</span>
                    </>
                  ) : (
                    t`Unknown`
                  )}
                </dd>
                <dt className="text-muted-foreground">
                  <Trans>Stars</Trans>
                </dt>
                <dd>
                  {stars ? (
                    <>
                      <span className="tabular-nums">
                        {stars.stars.toLocaleString(i18n.locale)}
                      </span>
                      <time
                        dateTime={stars.observedAt}
                        title={stars.observedAt}
                        className="mt-1 block text-xs text-muted-foreground"
                      >
                        {t`Observed`} {date(stars.observedAt)}
                      </time>
                      <a
                        href={stars.source}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs underline underline-offset-4"
                      >
                        <Trans>Popularity source</Trans>
                      </a>
                    </>
                  ) : (
                    t`Unknown`
                  )}
                </dd>
              </dl>
              <p className="my-5 text-xs leading-relaxed text-muted-foreground">
                <Trans>
                  A tested module profile is required before installation or
                  execution.
                </Trans>
              </p>
              <Button
                render={
                  <a
                    href={repositorySourceUrl(selected)}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
                className="w-full"
              >
                <Trans>Open source</Trans>
                <ExternalLink size={16} aria-hidden="true" />
              </Button>
            </>
          ) : (
            <div className="border-s border-border ps-6">
              <BookOpen
                className="mb-4 text-muted-foreground"
                aria-hidden="true"
              />
              <h2 className="font-medium">
                <Trans>Select a repository</Trans>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                <Trans>Inspect source, license and evaluation facts.</Trans>
              </p>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
