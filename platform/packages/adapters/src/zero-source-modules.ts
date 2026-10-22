/** Static source proposals. No source evaluation, installation or execution. */
import path from "node:path";
import type { GithubModuleNeed } from "./zero-github-contract.js";
import { githubSourcePathSchema } from "./zero-github-contract.js";

export type ModuleFileFacts = {
  declarations: string[];
  imports: string[];
  implementationSnippets?: { offset: number; text: string }[];
  manifest?: {
    name: string | null;
    version: string | null;
    entrypoints: string[];
    dependencies: Record<string, string>;
    dependenciesOmitted: number;
    lifecycleScripts: string[];
  };
};
type SourceFile = {
  path: string;
  sha256: string;
  excerpt: string;
  excerptTruncated: boolean;
  moduleFacts?: ModuleFileFacts;
};
type SourceCandidate = {
  repository: string;
  sourceRevision: string;
  language: string | null;
  licenseSpdx: string | null;
  description?: string;
  files: SourceFile[];
};
const codeExtension =
  /\.(?:[cm]?[jt]sx?|py|rs|go|[ch](?:pp|xx)?|java|swift|cs|vue|svelte)$/i;
const infrastructure =
  /(?:^|\/)(?:node_modules|vendor|third_party|third-party|dist|build|generated|\.git|\.vs|fixtures?|__tests__|tests?|examples?|docs?)(?:\/|$)|(?:^|\/)(?:layout|page|config|setup|conftest)\.[^/]+$/i;
const declaration =
  /^\s*(?:(?:export\s+(?:default\s+)?)|(?:pub\s+(?:\([^)]*\)\s*)?)|(?:async\s+)?(?:def|class)\s+|(?:[A-Z][A-Z_]+_API\s+)|(?:module\.exports|exports\.[A-Za-z_$][\w$]*)\s*=|[A-Z][\w$]*\.[A-Za-z_$][\w$]*\s*=\s*(?:function\b|[A-Za-z_$][\w$]*\s*;)|func\s+(?:\([^)]*\)\s*)?[A-Z]\w*\s*\()/;

/** Text observations, explicitly not a parser/conformance claim. Never inspect README as code. */
export function moduleFileFacts(file: string, text: string): ModuleFileFacts {
  const facts: ModuleFileFacts = { declarations: [], imports: [] };
  if (path.posix.basename(file) === "package.json") {
    try {
      const value: unknown = JSON.parse(text);
      if (!value || typeof value !== "object" || Array.isArray(value))
        return facts;
      const m = value as Record<string, unknown>;
      const strings = (v: unknown, depth = 0): string[] => {
        if (typeof v === "string") return [v.slice(0, 256)];
        if (!v || typeof v !== "object" || depth > 4) return [];
        return Object.values(v)
          .slice(0, 24)
          .flatMap((x) => strings(x, depth + 1));
      };
      const dependencies = [
        m.dependencies,
        m.peerDependencies,
        m.optionalDependencies,
      ]
        .flatMap((v) =>
          v && typeof v === "object" && !Array.isArray(v)
            ? Object.entries(v)
            : [],
        )
        .filter((v): v is [string, string] => typeof v[1] === "string");
      facts.manifest = {
        name: typeof m.name === "string" ? m.name.slice(0, 200) : null,
        version: typeof m.version === "string" ? m.version.slice(0, 100) : null,
        entrypoints: [
          ...new Set(
            [m.main, m.module, m.types, m.exports].flatMap((v) => strings(v)),
          ),
        ].slice(0, 12),
        dependencies: Object.fromEntries(
          dependencies
            .slice(0, 24)
            .map(([k, v]) => [k.slice(0, 200), v.slice(0, 200)]),
        ),
        dependenciesOmitted: Math.max(0, dependencies.length - 24),
        lifecycleScripts:
          m.scripts &&
          typeof m.scripts === "object" &&
          !Array.isArray(m.scripts)
            ? Object.keys(m.scripts).filter((k) =>
                /^(?:preinstall|install|postinstall|prepare)$/.test(k),
              )
            : [],
      };
    } catch {
      /* Invalid/incomplete manifests remain evidence gaps. */
    }
    return facts;
  }
  if (!codeExtension.test(file)) return facts;
  const lines = text.split(/\r?\n/u);
  facts.declarations = lines
    .filter((line) => declaration.test(line))
    .slice(0, 12)
    .map((line) => line.trim().slice(0, 240));
  // Follow observed public alias assignments to their actual function definitions.
  const aliases = facts.declarations.flatMap((line) => {
    const match = line.match(/=\s*([A-Za-z_$][\w$]*)\s*;$/);
    return match ? [match[1]!] : [];
  });
  facts.implementationSnippets = [...new Set(aliases)]
    .slice(0, 2)
    .flatMap((name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = new RegExp(`\\bfunction\\s+${escaped}\\s*\\(`).exec(text);
      return match
        ? [
            {
              offset: match.index,
              text: text.slice(match.index, match.index + 900),
            },
          ]
        : [];
    });
  facts.imports = [
    ...new Set(
      lines.flatMap((line) => {
        const match = line.match(
          /(?:\bfrom\s+|\brequire\s*\(\s*|\bimport\s*)["']([^"']+)["']|^\s*(?:from|import)\s+([\w.]+)|^\s*#include\s*[<"]([^>"]+)|^\s*(?:pub\s+)?(?:use|mod)\s+([\w:]+)/,
        );
        return match
          ? [match[1] ?? match[2] ?? match[3] ?? match[4] ?? ""]
          : [];
      }),
    ),
  ]
    .filter(Boolean)
    .slice(0, 16)
    .map((v) => v.slice(0, 200));
  return facts;
}

export function moduleCodePaths<
  T extends { path: string; type: string; mode?: string },
>(
  paths: readonly T[],
  queries: readonly string[],
  manifests: readonly SourceFile[],
) {
  const terms = queries
    .join(" ")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((s) => s.length > 2);
  const publicPaths = manifests.flatMap((file) =>
    (file.moduleFacts?.manifest?.entrypoints ?? []).map((p) =>
      path.posix.join(path.posix.dirname(file.path), p),
    ),
  );
  const score = (p: string) =>
    (publicPaths.includes(p) ? 50 : 0) +
    terms.reduce(
      (n, t) =>
        n +
        (path.posix.basename(p).toLowerCase().includes(t)
          ? 8
          : p.toLowerCase().includes(t)
            ? 2
            : 0),
      0,
    ) +
    (/(?:^|\/)(?:index|lib|__init__)\.[^/]+$/.test(p) ? 5 : 0) +
    (/(?:^|\/)(?:include|core|lib|api)\//.test(p) ? 3 : 0);
  return paths
    .filter(
      (f) =>
        f.type === "blob" &&
        f.mode !== "120000" &&
        codeExtension.test(f.path) &&
        githubSourcePathSchema.safeParse(f.path).success &&
        !f.path.split("/").some((part) => part.startsWith(".")) &&
        !infrastructure.test(f.path),
    )
    .sort(
      (a, b) => score(b.path) - score(a.path) || a.path.localeCompare(b.path),
    )
    .slice(0, 2);
}

export function sourceModuleOptions(
  candidates: readonly SourceCandidate[],
  need: GithubModuleNeed,
) {
  return candidates
    .flatMap((candidate) =>
      candidate.files
        .filter(
          (f) =>
            (f.moduleFacts?.declarations.length ?? 0) > 0 &&
            !infrastructure.test(f.path),
        )
        .slice(0, 2)
        .map((file) => ({
          id: `${candidate.repository}:${file.path}`,
          repository: candidate.repository,
          sourceRevision: candidate.sourceRevision,
          path: file.path,
          language: candidate.language,
          licenseSpdx: candidate.licenseSpdx,
          purposeEvidence: {
            description: candidate.description?.slice(0, 600) ?? "",
            readme: candidate.files
              .filter((f) => /(?:^|\/)readme(?:\.[^/]+)?$/i.test(f.path))
              .slice(0, 1)
              .map((f) => ({
                path: f.path,
                sha256: f.sha256,
                excerpt: f.excerpt.slice(0, 1400),
                excerptTruncated: f.excerptTruncated || f.excerpt.length > 1400,
              })),
          },
          need,
          declarations: file.moduleFacts!.declarations,
          imports: file.moduleFacts!.imports,
          implementationSnippets:
            file.moduleFacts!.implementationSnippets ?? [],
          source: {
            path: file.path,
            sha256: file.sha256,
            excerpt: file.excerpt,
            excerptTruncated: file.excerptTruncated,
          },
          manifests: candidate.files
            .filter((f) => f.moduleFacts?.manifest)
            .slice(0, 2)
            .map((f) => ({
              path: f.path,
              sha256: f.sha256,
              ...f.moduleFacts!.manifest!,
            })),
          dependencyEvidence: candidate.files
            .filter((f) =>
              /(?:^|\/)(?:pyproject\.toml|Cargo\.toml|requirements\.txt|go\.mod|CMakeLists\.txt)$/.test(
                f.path,
              ),
            )
            .slice(0, 2)
            .map((f) => ({
              path: f.path,
              sha256: f.sha256,
              excerpt: f.excerpt.slice(0, 1000),
              excerptTruncated: f.excerptTruncated || f.excerpt.length > 1000,
            })),
          licenseEvidence: candidate.files
            .filter((f) =>
              /(?:^|\/)(?:licen[sc]e|copying)(?:\.[^/]+)?$/i.test(f.path),
            )
            .map((f) => ({ path: f.path, sha256: f.sha256 })),
        })),
    )
    .slice(0, 5);
}
export type SourceModuleOption = ReturnType<typeof sourceModuleOptions>[number];

/** The selected source API is concrete; the integration is a proposal, never a fabricated run. */
export function moduleIntegrationProposal(
  module: SourceModuleOption,
  strategy: "package-api" | "process-adapter" | "source-adapter",
) {
  return {
    status: "proposed" as const,
    module,
    integration: {
      strategy,
      entrypoint: module.path,
      inputs: module.need.inputs,
      outputs: module.need.outputs,
      runtime: module.need.runtime,
      steps: [
        `Review the pinned declarations at ${module.path} and their imports; resolve the complete dependency closure before adopting this source unit.`,
        strategy === "package-api"
          ? "Use a compatible published package API only after matching its release to the inspected source; a repository manifest version is not release provenance."
          : strategy === "process-adapter"
            ? "Confirm a supported executable/protocol in the pinned source, then wrap it behind the requested input/output adapter; do not invent CLI flags."
            : "Retain the source module with its required local files and notices; do not copy an isolated function without its dependency closure.",
        "Implement a thin host adapter for the declared inputs and outputs, errors and lifecycle; keep application state outside the upstream module.",
      ],
      checks: [
        "Run an independently specified representative input through the real upstream entrypoint and validate the output.",
        "Exercise invalid input, cancellation where applicable, offline behavior and target-platform/resource constraints.",
        "Compare whole-task build, verification and repair effort with the baseline; importing or hashing a file does not prove useful invocation.",
      ],
      unresolved: [
        "Declarations/imports are static text observations; public API semantics and dependency closure need review.",
        "Target-runtime compatibility, transitive licenses, packaging and performance are unqualified.",
        "Adaptation cost and time saved are unknown until integration and comparable measurement.",
      ],
    },
    prepared: false,
    runtimeTested: false,
    licenseApproved: false,
  };
}
