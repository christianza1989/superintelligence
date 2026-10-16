import { Trans, useLingui } from "@lingui/react/macro";
import type { RepositoryCandidate } from "@rakazo/core/repositoryzero";
import {
  repositoryCategories,
  repositorySnapshot,
  repositorySourceUrl,
  searchRepositories,
} from "@rakazo/core/repositoryzero";
import { Button, Input } from "@rakazo/ui-web";
import { ArrowLeft, ExternalLink, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getUiAppearancePreference, setUiAppearance } from "../lib/ui-appearance";

export function RepositoryDirectoryPage() {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<RepositoryCandidate | null>(null);
  const [appearance, setAppearance] = useState(getUiAppearancePreference);
  const results = useMemo(
    () => searchRepositories({ query, category, limit: 30 }),
    [query, category],
  );
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-5">
        <Link to="/" className="flex items-center gap-3 font-semibold">
          <span className="size-6 rounded-full border-4 border-primary" aria-hidden="true" />
          RepositoryZero
        </Link>
        <nav className="flex items-center gap-3" aria-label={t`Directory navigation`}>
          <select
            aria-label={t`Appearance`}
            className="rounded-lg border border-border bg-card px-3 py-2"
            value={appearance}
            onChange={(e) => {
              const next = e.target.value as typeof appearance;
              setAppearance(next);
              setUiAppearance(next);
            }}
          >
            <option value="dark">
              <Trans>Black / lime</Trans>
            </option>
            <option value="light">
              <Trans>Light</Trans>
            </option>
            <option value="system">
              <Trans>System</Trans>
            </option>
          </select>
          <Link to="/app" className="text-sm">
            <Trans>Open workspace</Trans>
          </Link>
        </nav>
      </header>
      <main className="mx-auto grid max-w-[1600px] gap-6 p-6 lg:grid-cols-[210px_minmax(0,1fr)_320px]">
        <aside className="space-y-5">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowLeft size={16} />
            <Trans>Back</Trans>
          </Link>
          <label className="block text-sm font-medium" htmlFor="category">
            <Trans>Category</Trans>
          </label>
          <select
            id="category"
            className="w-full rounded-lg border border-border bg-card p-3"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setSelected(null);
            }}
          >
            <option value="">
              <Trans>All categories</Trans>
            </option>
            {repositoryCategories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <p className="text-sm leading-relaxed text-muted-foreground">
            <Trans>
              Research candidates. Integration and local availability are evaluated separately.
            </Trans>
          </p>
        </aside>
        <section aria-labelledby="directory-title" className="min-w-0">
          <h1 id="directory-title" className="text-3xl font-semibold tracking-tight">
            <Trans>Find what is already built</Trans>
          </h1>
          <p className="mt-3 text-muted-foreground">
            <Trans>Start with existing work. Compare evidence. Build what is missing.</Trans>
          </p>
          <div className="relative my-6">
            <Search className="absolute left-4 top-3.5 text-muted-foreground" size={18} />
            <Input
              aria-label={t`Search repositories`}
              className="h-12 pl-11"
              placeholder={t`Search repositories, capabilities, or categories`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
            />
          </div>
          <p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
            {results.length} <Trans>shown</Trans> · {repositorySnapshot.records.length}{" "}
            <Trans>research candidates</Trans> · {repositorySnapshot.researchDate}
          </p>
          <div className="space-y-3">
            {results.map((entry) => (
              <button
                key={entry.repository}
                type="button"
                className={`w-full rounded-xl border bg-card p-5 text-left transition hover:border-primary focus-visible:outline-2 focus-visible:outline-primary ${selected?.repository === entry.repository ? "border-primary" : "border-border"}`}
                onClick={() => setSelected(entry)}
              >
                <h2 className="break-words font-medium">{entry.repository}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {entry.capability || entry.category}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-muted px-3 py-1">{entry.category}</span>
                  <span className="rounded-full bg-muted px-3 py-1">
                    {entry.sourceAvailable ? t`Source only` : t`Source unavailable`}
                  </span>
                  <span className="rounded-full bg-muted px-3 py-1">
                    {entry.runtimeTested ? t`See test evidence` : t`Not evaluated in runtime`}
                  </span>
                </div>
              </button>
            ))}
          </div>
          {results.length === 0 && (
            <p role="status" className="rounded-xl border border-border p-6">
              <Trans>No matching candidate. Try another capability or category.</Trans>
            </p>
          )}
        </section>
        <aside
          aria-label={t`Repository details`}
          className="self-start rounded-xl border border-border bg-card p-5 lg:sticky lg:top-6"
        >
          {selected ? (
            <>
              <h2 className="break-words text-lg font-medium">{selected.repository}</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                {selected.note || selected.capability}
              </p>
              <dl className="my-5 space-y-3 text-sm">
                <dt className="text-muted-foreground">
                  <Trans>License source</Trans>
                </dt>
                <dd>{selected.license}</dd>
                <dt className="text-muted-foreground">
                  <Trans>Integration</Trans>
                </dt>
                <dd>
                  <Trans>Pending evaluation</Trans>
                </dd>
                <dt className="text-muted-foreground">
                  <Trans>Source revision</Trans>
                </dt>
                <dd className="break-all font-mono text-xs">
                  {selected.sourceRevision || t`Unknown`}
                </dd>
              </dl>
              <p className="mb-5 text-sm text-muted-foreground">
                <Trans>A tested module profile is required before installation or execution.</Trans>
              </p>
              <Button
                render={<a href={repositorySourceUrl(selected)} target="_blank" rel="noreferrer" />}
                className="w-full"
              >
                <Trans>Open source</Trans>
                <ExternalLink size={16} />
              </Button>
            </>
          ) : (
            <>
              <h2 className="font-medium">
                <Trans>Compare the evidence</Trans>
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                <Trans>
                  Select a candidate to inspect its source, license notes and evaluation status.
                </Trans>
              </p>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
