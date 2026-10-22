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
  /\.(?:[cm]?[jt]sx?|py|rs|go|c(?:c|pp|xx)?|h(?:h|pp|xx)?|java|swift|cs|vue|svelte)$/i;
const infrastructure =
  /(?:^|\/)(?:node_modules|vendor|third_party|third-party|dist|build|generated|\.git|\.vs|fixtures?|__tests__|tests?|examples?|docs?)(?:\/|$)|(?:^|\/)(?:layout|page|config|setup|conftest)\.[^/]+$/i;
const declaration =
  /^\s*(?:(?:export\s+(?:default\s+)?)|(?:pub\s+(?:\([^)]*\)\s*)?)|(?:async\s+)?(?:def|class)\s+|(?:[A-Z][A-Z_]+_API\s+)|(?:module\.exports|exports\.[A-Za-z_$][\w$]*)\s*=|[A-Z][\w$]*\.[A-Za-z_$][\w$]*\s*=\s*(?:function\b|[A-Za-z_$][\w$]*\s*;)|func\s+(?:\([^)]*\)\s*)?[A-Z]\w*\s*\()/;

/** Header signatures are source observations, not proof of a linkable public API. */
function nativeHeaderDeclarations(text: string): string[] {
  // Keep offsets/newlines so each returned signature is an exact source span.
  const masked = text.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    (match) => match.replace(/[^\r\n]/g, " "),
  );
  const lines = masked.split(/\r?\n/u);
  const starts: number[] = [];
  let offset = 0;
  for (const line of text.split(/\r?\n/u)) {
    starts.push(offset);
    offset += line.length + (text[offset + line.length] === "\r" ? 2 : 1);
  }
  const scopes: {
    kind: "class" | "container" | "block";
    public: boolean;
    name: string | null;
  }[] = [];
  const signatures: string[] = [];
  let boundary = 0;
  let matchedThrough = -1;
  let continuedDirective = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const start = starts[i]!;
    const directive: boolean = continuedDirective || /^\s*#/.test(line);
    continuedDirective = directive && /\\\s*$/.test(line);
    if (directive) {
      boundary = start + line.length;
      continue;
    }
    const access = line.match(/^\s*(public|private|protected)\s*:/);
    const scope = scopes.at(-1);
    if (access && scope?.kind === "class")
      scope.public = access[1] === "public";
    const accessible = scopes.every((s) => s.kind !== "block" && s.public);
    if (i > matchedThrough && accessible && line.trim() && !access) {
      let end = i;
      let signature = line;
      while (
        !/[;{}]/.test(signature) &&
        end < i + 7 &&
        end + 1 < lines.length &&
        signature.length < 1200
      ) {
        end++;
        signature = masked.slice(start, starts[end]! + lines[end]!.length);
      }
      const match =
        signature.length <= 1200
          ? signature.match(
              /^\s*([\w\s:*&<>,\[\]~]+?)\s*\(([^;{}]*)\)\s*(?:(?:const|noexcept|override|final)\s*|[&]\s*|=\s*(?:0|default|delete)\s*)*;/,
            )
          : null;
      if (match && match[0].length <= 1200) {
        const prefix = match[1]!.trim();
        const name = prefix.match(/([\w:~]+)$/)?.[1];
        const returnType = name ? prefix.slice(0, -name.length).trim() : "";
        const constructor =
          scope?.kind === "class" &&
          scope.name !== null &&
          (prefix === scope.name || prefix === `~${scope.name}`);
        // A function-pointer data member is a callback slot, not a function
        // this source unit provides. Do not mistake its return type for a ctor.
        const callbackMember = /^\s*[*&]/.test(match[2]!);
        if (
          name &&
          (returnType || constructor) &&
          !callbackMember &&
          !(scope?.kind !== "class" && /^static\b/.test(prefix)) &&
          !/^(?:typedef\b|using\b|return\b|if\b|for\b|while\b|switch\b|catch\b|sizeof\b|alignof\b|static_assert\b)/.test(
            prefix,
          )
        ) {
          const leading = match[0].length - match[0].trimStart().length;
          const sourceStart = start + leading;
          signatures.push(
            text
              .slice(sourceStart, start + match[0].length)
              .trim()
              .slice(0, 240),
          );
          matchedThrough = end;
        }
      }
    }
    for (let j = 0; j < line.length; j++) {
      const index = start + j;
      if (line[j] === "{") {
        const prefix = masked.slice(Math.max(boundary, index - 1200), index);
        const classMatch = prefix.match(/\b(class|struct)\s+([^;{}]+)$/);
        const className =
          classMatch?.[2]
            ?.split(/(?<!:):(?!:)/)[0]
            ?.replace(/\bfinal\s*$/, "")
            .trim()
            .match(/([A-Za-z_]\w*)$/)?.[1] ?? null;
        const container =
          /\bnamespace\s*[\w:]*\s*$/.test(prefix) ||
          /\bextern\s+"C"\s*$/.test(
            text.slice(Math.max(boundary, index - 1200), index),
          );
        scopes.push({
          kind: classMatch ? "class" : container ? "container" : "block",
          public: classMatch ? classMatch[1] === "struct" : true,
          name: className,
        });
        boundary = index + 1;
      } else if (line[j] === "}") {
        scopes.pop();
        boundary = index + 1;
      } else if (line[j] === ";") boundary = index + 1;
    }
    if (signatures.length >= 12) break;
  }
  return signatures;
}

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
  facts.declarations = /\.(?:h|hh|hpp|hxx)$/i.test(file)
    ? nativeHeaderDeclarations(text)
    : lines
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
  const tokens = (value: string) =>
    value
      .replace(/([a-z\d])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
  const terms = [
    ...new Set(queries.flatMap(tokens).filter((s) => s.length > 2)),
  ];
  const publicPaths = manifests.flatMap((file) =>
    (file.moduleFacts?.manifest?.entrypoints ?? []).map((p) =>
      path.posix.join(path.posix.dirname(file.path), p),
    ),
  );
  const score = (p: string) => {
    const stem = path.posix.basename(p, path.posix.extname(p));
    const basenameTokens = tokens(stem);
    const pathTokens = tokens(p);
    const parent = path.posix.basename(path.posix.dirname(p)).toLowerCase();
    const withoutLib = (name: string) => name.replace(/^lib(?=[a-z\d])/, "");
    const header = /\.(?:h|hh|hpp|hxx)$/i.test(p);
    // A same-name native library header is often its API facade, as opposed to
    // a format-specific implementation. This is only a path heuristic.
    const facade =
      header &&
      !/^(?:src|include|api|core|lib)$/.test(parent) &&
      withoutLib(stem.toLowerCase()) === withoutLib(parent);
    return (
      (publicPaths.includes(p) ? 50 : 0) +
      terms.reduce(
        (n, t) =>
          n + (basenameTokens.includes(t) ? 8 : pathTokens.includes(t) ? 2 : 0),
        0,
      ) +
      (facade ? 24 : 0) +
      (/(?:^|\/)(?:index|lib|__init__)\.[^/]+$/.test(p) ? 5 : 0) +
      (/(?:^|\/)(?:include|core|lib|api)\//.test(p) ? 3 : 0) +
      (header ? 5 : 0) -
      (/(?:^|\/)(?:internal|private|detail)(?:\/|\.)|(?:^|\/)(?:version|exports?|macros?|config|types|fwd)(?:[._-]|$)/i.test(
        p,
      )
        ? 10
        : 0)
    );
  };
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
  const byRepository = candidates.map((candidate) =>
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
        implementationSnippets: file.moduleFacts!.implementationSnippets ?? [],
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
  );
  // The shortlist is bounded, but one repository's second file must not crowd
  // out a genuinely different inspected repository's first usable source unit.
  return [0, 1]
    .flatMap((index) =>
      byRepository.flatMap((modules) =>
        modules[index] ? [modules[index]!] : [],
      ),
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
            : /\.(?:h|hh|hpp|hxx)$/i.test(module.path)
              ? "This unit is a header declaration surface: locate and build/link its matching implementation and transitive requirements from the same pin; copying the header alone does not provide the capability. Retain required notices."
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
