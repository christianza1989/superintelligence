export const SITE_NAME = "RepositoryZero";
export const SITE_DESCRIPTION = "Reuse what people have already built. Discover AI tools, choose the right foundation, and verify the result.";
export const GITHUB_URL = "https://github.com/christianza1989/superintelligence";
export const STAGE = "First MVP in development";
export const DONATION_STATUS = "NOT_CONFIGURED";

const configuredApp = import.meta.env.PUBLIC_APP_URL?.trim();
function appDiscoverUrl(): string | undefined {
  if (!configuredApp) return import.meta.env.DEV ? "http://127.0.0.1:5173/discover" : undefined;
  const url = new URL(configuredApp);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !(import.meta.env.DEV && local && url.protocol === "http:"))) {
    throw new Error("PUBLIC_APP_URL must be an HTTPS origin, or a loopback HTTP origin during development.");
  }
  return new URL("/discover", url).href;
}
export const APP_DISCOVER_URL = appDiscoverUrl();
