# RepositoryZero website

The existing Rakazo Astro layout, components and website package are adapted for RepositoryZero. The upstream source is Apache-2.0; retain its notices. Product identity, wording, navigation and theme use the RepositoryZero direction.

From `platform/`, after the shared dependency installation:

```sh
pnpm --filter @rakazo/www dev --host 127.0.0.1 --port 4321
pnpm --filter @rakazo/www build
pnpm --filter @rakazo/www preview --host 127.0.0.1 --port 4321
```

The build reads the public root source catalog and selected Markdown documents locally. It makes no GitHub, model or paid-service requests. Build from the complete repository checkout. Shared semantic colors come from `packages/ui-tokens/src/tokens.css`.

No account login, payment collection, public deployment, external analytics, release download or integration activation is implemented here. Donation status is `NOT_CONFIGURED`. Screenshots are labeled generated concepts. Source snapshot figures are not live usage or installed module counts. `PUBLIC_SITE_URL` is optional and only supplies a real canonical production origin when one is configured.

Upstream marketing routes and contact/waitlist handlers are removed from the generated site. Obsolete upstream promotional routes, analytics and unused helper components were removed. This package name remains `@rakazo/www` to preserve the upstream workspace dependency graph during adaptation.

The source directory uses the same pure `@rakazo/core/repositoryzero` snapshot as the app. `PUBLIC_APP_URL` links to its `/discover` route when an actual HTTPS app origin is configured; development defaults to the local app origin only. Production builds do not invent an app host.
