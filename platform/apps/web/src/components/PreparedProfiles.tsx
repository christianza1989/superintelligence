import { Trans, useLingui } from "@lingui/react/macro";
import type { PreparedProfile } from "@rakazo/core/repositoryzero";
import { ExternalLink } from "lucide-react";

/** Prior profile checks are discovery facts; this view cannot authorize jobs. */
export function PreparedProfiles({ profiles }: { profiles: readonly PreparedProfile[] }) {
  const { i18n } = useLingui();
  if (!profiles.length) return null;
  return (
    <section aria-labelledby="prepared-profiles-title" className="mt-6">
      <h2 id="prepared-profiles-title" className="text-base font-semibold">
        <Trans>Prepared components</Trans>
      </h2>
      {profiles.map((profile) => {
        const inputBytes = profile.limits.inputBytes.toLocaleString(i18n.locale);
        const rows = profile.limits.rows.toLocaleString(i18n.locale);
        const columns = profile.limits.columns.toLocaleString(i18n.locale);
        return (
          <details key={profile.profileId} className="mt-2 border-y border-border text-sm">
            <summary className="cursor-pointer rounded py-3 focus-visible:outline-2 focus-visible:outline-ring">
              <span className="font-medium">
                <Trans>CSV parser</Trans>
              </span>{" "}
              <span className="ms-3 text-muted-foreground">
                {profile.packageName} {profile.packageVersion}
              </span>
            </summary>
            <div className="grid gap-4 pb-4 text-muted-foreground">
              <p>
                <Trans>
                  Development checks passed for this profile. Your project has not been verified.
                </Trans>
              </p>
              <dl className="grid min-w-0 gap-3">
                <div>
                  <dt>
                    <Trans>Profile</Trans>
                  </dt>
                  <dd className="mt-1 break-all font-mono text-xs text-foreground">
                    {profile.profileId}
                  </dd>
                </div>
                <div>
                  <dt>
                    <Trans>Source</Trans>
                  </dt>
                  <dd className="mt-1">
                    <a
                      href={profile.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 break-all text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {profile.repository}
                      <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>
                    <Trans>License source</Trans>
                  </dt>
                  <dd className="mt-1 text-foreground">{profile.licenseSource}</dd>
                </div>
                <div>
                  <dt>
                    <Trans>Limits</Trans>
                  </dt>
                  <dd className="mt-1 text-foreground">
                    <Trans>
                      Up to {inputBytes} bytes, {rows} rows and {columns} columns.
                    </Trans>
                  </dd>
                </div>
                {Object.entries(profile.sourceFiles).map(([name, sha256]) => (
                  <div key={name}>
                    <dt className="font-mono text-xs">{name} · SHA-256</dt>
                    <dd className="mt-1 break-all font-mono text-xs text-foreground">{sha256}</dd>
                  </div>
                ))}
              </dl>
              <p>
                <Trans>
                  Project execution requires a separate grant. Independent holdout not run.
                </Trans>
              </p>
            </div>
          </details>
        );
      })}
    </section>
  );
}
