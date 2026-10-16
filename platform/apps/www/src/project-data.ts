import { repositorySnapshot } from "@rakazo/core/repositoryzero";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
export const documentSources = {
  "why-repozero": "docs/WHY-REPOZERO.md",
  "self-reuse": "docs/SELF-REUSE.md",
  "zero-lab": "docs/ZERO-LAB.md",
  "local-lab": "docs/LOCAL-LAB.md",
  "calibration": "docs/CALIBRATION.md",
  "claude-calibration": "docs/CLAUDE-CALIBRATION.md",
  "paired-benchmark": "docs/PAIRED-BENCHMARK.md",
  "hosted-and-byok": "docs/HOSTED-AND-BYOK.md",
  "jev-applications": "docs/JEV-APPLICATIONS.md",
  "community-quality": "docs/COMMUNITY-QUALITY.md",
  "agent-identity": "docs/AGENT-IDENTITY.md",
  "project-v1": "docs/PROJECT-V1.md",
  "mvp-roadmap": "MVP-ROADMAP.md",
  "full-roadmap": "ROADMAP.md",
  "architecture": "PLAN.md",
  "project-creation": "docs/PROJECT-CREATION.md",
  "ui-foundations": "docs/UI-FOUNDATIONS.md",
} as const;
