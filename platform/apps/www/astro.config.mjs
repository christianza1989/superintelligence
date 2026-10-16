import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { resolveWwwPort } from "./www-port.mjs";

const port = resolveWwwPort();
// A production domain has not been selected. Do not manufacture canonical URLs.
const site = process.env.PUBLIC_SITE_URL?.trim() || undefined;
export default defineConfig({
  ...(site ? { site } : {}),
  output: "static",
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
  server: { host: "127.0.0.1", port, strictPort: true },
  preview: { host: "127.0.0.1", port },
});
