/** Scripted, read-only demonstration of the real repository_search tool. No LLM or network. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { repositorySearchFromTool } from "../packages/adapters/src/zero-repository-tools.ts";

const root = new URL("../../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const queries = ["agent platform", "rakazo", "llm proxy", "budget", "LLM observability"];
const searches = queries.map((query) => ({ query, result: repositorySearchFromTool({ query }) }));
const base = searches
  .find((search) => search.query === "rakazo")
  ?.result.candidates?.find((candidate) => candidate.repository === "elie222/rakazo");
const provenance = await readFile(new URL("platform/UPSTREAM.md", root), "utf8");
if (!base?.sourceRevision || !provenance.includes(base.sourceRevision))
  throw new Error("The discovered base does not match the documented adaptation pin.");

const components = [];
for (const component of [
  {
    name: "React workspace",
    repository: "facebook/react",
    manifest: "platform/apps/web/package.json",
    dependency: "react",
  },
  {
    name: "Hono API",
    repository: "honojs/hono",
    manifest: "platform/apps/api/package.json",
    dependency: "hono",
  },
  {
    name: "Graphile worker",
    repository: "graphile/worker",
    manifest: "platform/packages/adapters/package.json",
    dependency: "graphile-worker",
  },
  {
    name: "Prisma database layer",
    repository: "prisma/prisma",
    manifest: "platform/packages/db/package.json",
    dependency: "@prisma/client",
  },
  {
    name: "Astro website",
    repository: "withastro/astro",
    manifest: "platform/apps/www/package.json",
    dependency: "astro",
  },
  {
    name: "Vitest verification",
    repository: "vitest-dev/vitest",
    manifest: "platform/package.json",
    dependency: "vitest",
  },
  {
    name: "Playwright browser checks",
    repository: "microsoft/playwright",
    manifest: "platform/apps/web/package.json",
    dependency: "@playwright/test",
  },
]) {
  const manifest = await readJson(component.manifest);
  const version =
    manifest.dependencies?.[component.dependency] ??
    manifest.devDependencies?.[component.dependency];
  if (typeof version !== "string") throw new Error(`Missing declared component: ${component.name}`);
  components.push({
    ...component,
    declaredVersion: version,
    source: `https://github.com/${component.repository}`,
  });
}

const evidence = await readJson("catalog/implementation-checks.json");
const report = {
  generatedAtUtc: new Date().toISOString(),
  executionKind: "scripted_local_reuse_demonstration",
  scope:
    "Actual repository_search calls and local source manifests; no autonomous model selection, fetch, new build or test run is claimed by this script.",
  paidModelCalls: 0,
  networkCalls: 0,
  brief:
    "Build RepositoryZero from an existing agent workspace and focused maintained components, keeping one runtime and verifiable results.",
  searches,
  decision: {
    madeBy: "human-directed implementation with assisting agents",
    foundation: base,
    reason:
      "Reuse one existing React/API/PostgreSQL/worker workspace instead of starting a second orchestration stack.",
    sourceCandidateStatus:
      "The research index remains source-only. The local adaptation has separate, narrowly scoped implementation evidence.",
  },
  reusedComponents: components,
  newWork: [
    "Repository catalog and read-only executor search tool",
    "Shared RepositoryZero appearance and source directory",
    "Jev selector boundary, not paid activation",
    "Finite account/lane allocation glue using existing PostgreSQL transactions",
    "Project-specific documentation, website adaptation and verification scripts",
  ],
  priorRecordedChecks: { checkedAtUtc: evidence.checked_at_utc, checks: evidence.checks },
  limitations: [
    "This script does not ask Jev or a main model to choose or build software.",
    "Upstream README, stars and an accessible source tree are not our integration PASS.",
    "LiteLLM, Helicone and Langfuse are source-reviewed alternatives, not installed modules.",
    "Dependency-specific license and distribution scope still require their own review.",
    "A full automatic source-fetch, isolated build and independent acceptance cycle remains unfinished.",
    "No claim of perfect code, artificial superintelligence, or measured token/time savings.",
  ],
};
await mkdir(new URL(".artifacts/", root), { recursive: true });
await writeFile(
  new URL(".artifacts/self-reuse-run.json", root),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  "[reuse] Actual local searches: " +
    searches.map((search) => `${search.query}=${search.result.candidates?.length ?? 0}`).join(", "),
);
console.log(
  "[reuse] Pinned foundation matches platform/UPSTREAM.md; " +
    components.length +
    " existing component declarations read.",
);
console.log(
  "[reuse] Wrote .artifacts/self-reuse-run.json; zero model/network calls. Prior recorded checks were not rerun by this script.",
);
