import { repositorySnapshot } from "@rakazo/core/repositoryzero";
import { existsSync, readFileSync } from "node:fs";
import { posix, resolve } from "node:path";

const roots = [resolve(process.cwd(), "../../.."), process.cwd(), resolve(process.cwd(), ".."), resolve(process.cwd(), "../..")];
const repositoryRoot = roots.find((root) => existsSync(resolve(root, "catalog/research-run.json")));
export function repositoryFile(path: string): string {
  if (!repositoryRoot) throw new Error("Repository source data is unavailable. Build from the complete RepositoryZero checkout.");
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}
const research = JSON.parse(repositoryFile("catalog/research-run.json"));
export const snapshot = {
  date: String(research.research_date),
  repositories: Number(research.stats.unique_accessible_repositories),
  runtimeTests: Number(research.stats.runtime_tests),
};
export type SourceCandidate = { repository: string; category: string; revision: string; license: string; capability: string };
const candidates = new Map<string, SourceCandidate>();
for (const entry of repositorySnapshot.records) {
  if (!entry.sourceAvailable || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(entry.repository)) continue;
  candidates.set(entry.repository.toLowerCase(), {
    repository: entry.repository,
    category: String(entry.category || "other"),
    revision: String(entry.sourceRevision || ""),
    license: String(entry.license || "").slice(0, 180) || "License not established",
    capability: entry.capability,
  });
}
export const sourceCandidates = [...candidates.values()].sort((a, b) => a.repository.localeCompare(b.repository));
export const categories = [...new Set(sourceCandidates.map((entry) => entry.category))].sort();
export function categoryLabel(value: string) { return value.replaceAll("-", " ").replaceAll("_", " "); }
export const documentation = [
  {
    "id": "start",
    "title": "Documentation entry point",
    "source": "docs/README.md",
    "copy": "Current guidance, planned specifications and dated evidence, clearly separated."
  },
  {
    "id": "implementation",
    "title": "Implementation status",
    "source": "docs/IMPLEMENTATION.md",
    "copy": "What works, open acceptance gates and local startup commands."
  },
  {
    "id": "architecture",
    "title": "Architecture plan",
    "source": "PLAN.md",
    "copy": "One Rakazo runtime, thin reuse functions and independent repository discovery."
  },
  {
    "id": "decisions",
    "title": "Accepted decisions",
    "source": "docs/DECISIONS.md",
    "copy": "Reviewed architecture choices and the alternatives they supersede."
  },
  {
    "id": "mvp-roadmap",
    "title": "MVP roadmap",
    "source": "MVP-ROADMAP.md",
    "copy": "MCP setup, one native pilot, three-workflow acceptance and an independent Library."
  },
  {
    "id": "full-roadmap",
    "title": "Full roadmap",
    "source": "ROADMAP.md",
    "copy": "One checkbox authority, preserved acceptance gates and later product stages."
  },
  {
    "id": "mcp-integration",
    "title": "MCP and native plugins — planned",
    "source": "docs/MCP-INTEGRATION.md",
    "copy": "Accepted host boundaries, one shared worker and a verified setup flow. Server implementation remains open."
  },
  {
    "id": "native-codex-benchmark",
    "title": "Native Codex comparison — not run",
    "source": "docs/NATIVE-CODEX-BENCHMARK.md",
    "copy": "Fresh projects, identical task prompts and independent results, with and without Zero."
  },
  {
    "id": "integration-research",
    "title": "MCP and plugin research — dated",
    "source": "docs/research/MCP-AND-PLUGINS-2026-10-17.md",
    "copy": "Official integration and installation paths checked on 2026-10-17."
  },
  {
    "id": "local-lab",
    "title": "Run locally with WSL2",
    "source": "docs/LOCAL-LAB.md",
    "copy": "Claude subscription CLI experiments, Docker graders and versioned profiles."
  },
  {
    "id": "calibration",
    "title": "Calibration method",
    "source": "docs/CALIBRATION.md",
    "copy": "Quality, total time, tokens, cache and cost measured without a fixed improvement claim."
  },
  {
    "id": "claude-calibration",
    "title": "Sonnet experiments — historical",
    "source": "docs/experiments/CLAUDE-CALIBRATION.md",
    "copy": "Recorded pairs, repetitions and compact failures, with their original limits."
  },
  {
    "id": "stockdesk-calibration",
    "title": "Haiku StockDesk — historical",
    "source": "docs/experiments/STOCKDESK-CALIBRATION.md",
    "copy": "API, persistence and UI results; v1/v2 epochs and actual reuse evidence."
  },
  {
    "id": "lean-calibration",
    "title": "Lean configuration — historical",
    "source": "docs/experiments/LEAN-CALIBRATION.md",
    "copy": "A complete configuration comparison; not an isolated Jev benefit claim."
  },
  {
    "id": "jev-applications",
    "title": "Jev role and qualification",
    "source": "docs/JEV-APPLICATIONS.md",
    "copy": "Offline adapters, the selected live worker profile and measured benefit are separate gates."
  },
  {
    "id": "zero-lab",
    "title": "Zero Lab",
    "source": "docs/ZERO-LAB.md",
    "copy": "Supported CLI experiments and graders; product Lab UI remains planned."
  },
  {
    "id": "paired-benchmark",
    "title": "Controlled comparison",
    "source": "docs/PAIRED-BENCHMARK.md",
    "copy": "Frozen task and grader, matched model profiles, preserved failures."
  },
  {
    "id": "project-creation",
    "title": "Reuse-first project creation — planned",
    "source": "docs/PROJECT-CREATION.md",
    "copy": "Prepare an existing foundation or component, then build and independently verify."
  },
  {
    "id": "ui-foundations",
    "title": "UI foundation — specification",
    "source": "docs/UI-FOUNDATIONS.md",
    "copy": "Rakazo code reuse and shared tokens; concepts do not qualify product flows."
  },
  {
    "id": "ui-concepts",
    "title": "UI concepts",
    "source": "docs/assets/ui/README.md",
    "copy": "Seven illustrative screens, including independent Library discovery."
  },
  {
    "id": "why-repozero",
    "title": "Why RepoZero",
    "source": "docs/WHY-REPOZERO.md",
    "copy": "The intended value of reuse and the situations where it adds overhead."
  },
  {
    "id": "self-reuse",
    "title": "Building RepoZero with reuse",
    "source": "docs/SELF-REUSE.md",
    "copy": "Recorded local discovery and reused components; autonomous creation remains open."
  },
  {
    "id": "hosted-and-byok",
    "title": "Model connections — specification",
    "source": "docs/HOSTED-AND-BYOK.md",
    "copy": "Provider-neutral connections, supported auth and planned hosted billing."
  },
  {
    "id": "community-quality",
    "title": "Community quality — planned",
    "source": "docs/COMMUNITY-QUALITY.md",
    "copy": "Opt-in evidence, version-specific quality and upstream contributions."
  },
  {
    "id": "agent-identity",
    "title": "Agent identity — planned",
    "source": "docs/AGENT-IDENTITY.md",
    "copy": "Publishing identity, attribution and explicit permissions."
  },
  {
    "id": "project-v1",
    "title": "Product vision — specification",
    "source": "docs/PROJECT-V1.md",
    "copy": "The broader product requirements; current status is tracked separately."
  }
] as const;
export const documentSources = Object.fromEntries(documentation.map(({ id, source }) => [id, source]));

export function publicDocument(source: string): string {
  const routes = new Map(documentation.map((entry) => [entry.source as string, entry.id]));
  return repositoryFile(source).replace(/(!?\[[^\]\n]*\]\()([^\s)]+)(\))/g, (original, open, href, close) => {
    if (/^(?:[a-z][\w+.-]*:|#|\/)/i.test(href)) return original;
    const [file, fragment] = href.split(/#(.*)/s);
    const target = posix.normalize(posix.join(posix.dirname(source), file));
    const route = routes.get(target);
    const encoded = target.split('/').map(encodeURIComponent).join('/');
    const url = route ? '/docs/' + route + '.md' : 'https://github.com/christianza1989/superintelligence/blob/main/' + encoded;
    return open + url + (fragment ? '#' + fragment : '') + close;
  });
}
