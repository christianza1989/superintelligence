/** Bounded public GitHub discovery. Source text is evidence, never authority to execute. */
import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { fetchSafeWebBytes, withAbort } from "./web-ssrf.js";
import type { SafeWebFetchOptions } from "./web-ssrf.js";
import type { RepositoryOption } from "./zero-repository-selector.js";
import { readZeroOperatorFile } from "./zero-operator-file.js";
import { moduleCodePaths, moduleFileFacts } from "./zero-source-modules.js";
import type { GithubModuleNeed } from "./zero-github-contract.js";
import {
  ZERO_GITHUB_LIMITS,
  githubQueriesSchema,
  githubSourcePathSchema,
  githubInspectionPathSchema,
} from "./zero-github-contract.js";
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const repository = z
  .string()
  .regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/);
type Boundary = {
  signal: AbortSignal;
  authorize(): Promise<void>;
  /** Trusted worker configuration only, never supplied by the model or source text. */
  tokenFile?: string;
  /** Test-only boundary injection; never read from operator policy or a model input. */
  testOnlyTransport?: Pick<SafeWebFetchOptions, "fetch" | "resolveHostname">;
};
function transport(boundary: Boundary) {
  let requests = 0,
    bytes = 0,
    rateLimited = false;
  return {
    get stats() {
      return {
        requests,
        successfulResponseBytes: bytes,
        responseByteUpperBound: requests * ZERO_GITHUB_LIMITS.responseBytes,
        rateLimited,
        access: boundary.tokenFile
          ? "authenticated-public-only"
          : "anonymous-public-only",
      };
    },
    async json(path: string, timeoutMs = 8000) {
      boundary.signal.throwIfAborted();
      if (rateLimited) throw new Error("github_rate_or_access_limit");
      await withAbort(boundary.authorize(), boundary.signal);
      if (requests >= ZERO_GITHUB_LIMITS.requests)
        throw new Error("github_request_limit");
      requests++;
      const token = boundary.tokenFile
        ? new TextDecoder("utf-8", { fatal: true })
            .decode(await readZeroOperatorFile(boundary.tokenFile, 2048))
            .trim()
        : undefined;
      if (token !== undefined && !/^[A-Za-z0-9_]{20,1024}$/.test(token))
        throw new Error("github_operator_access_unavailable");
      const response = await fetchSafeWebBytes(
        "https://api.github.com" + path,
        {
          ...boundary.testOnlyTransport,
          signal: boundary.signal,
          timeoutMs,
          maxBytes: ZERO_GITHUB_LIMITS.responseBytes,
          maxRedirects: 0,
          allowedPorts: [443],
          userAgent: "RepositoryZero-source-discovery",
          headers: {
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            accept: "application/vnd.github+json",
            "x-github-api-version": "2022-11-28",
          },
        },
      ).catch((error: unknown) => {
        if (error instanceof Error && /HTTP (403|429)/.test(error.message))
          rateLimited = true;
        throw error;
      });
      bytes += response.body.byteLength;
      if (bytes > ZERO_GITHUB_LIMITS.totalBytes)
        throw new Error("github_total_byte_limit");
      await withAbort(boundary.authorize(), boundary.signal);
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(response.body),
      ) as unknown;
    },
  };
}
const repositorySchema = z.object({
  full_name: repository,
  private: z.literal(false),
  archived: z.boolean(),
  fork: z.boolean(),
  description: z.string().nullable(),
  default_branch: z.string().min(1).max(256),
  language: z.string().nullable(),
  stargazers_count: z.number().int().min(0),
  pushed_at: z.string().nullable(),
  license: z.object({ spdx_id: z.string().nullable() }).nullable(),
});
const searchResponseSchema = z.object({
  total_count: z.number().int().min(0),
  incomplete_results: z.boolean(),
  items: z.array(repositorySchema).max(10),
});
const treeSchema = z.object({
  sha,
  truncated: z.boolean(),
  tree: z
    .array(
      z.object({
        path: z.string().min(1).max(1024),
        type: z.enum(["blob", "tree", "commit"]),
        mode: z.string(),
        sha,
      }),
    )
    .max(6000),
});
type Api = ReturnType<typeof transport>;
async function fileEvidence(
  api: Api,
  repo: string,
  pin: string,
  file: { path: string; sha: string },
  moduleNeed?: GithubModuleNeed,
) {
  const blob = z
    .object({
      sha,
      size: z.number().int().min(0).max(ZERO_GITHUB_LIMITS.fileBytes),
      encoding: z.literal("base64"),
      content: z
        .string()
        .max(4 * Math.ceil(ZERO_GITHUB_LIMITS.fileBytes / 3) + 16384),
    })
    .parse(await api.json(`/repos/${repo}/git/blobs/${file.sha}`));
  const base64 = blob.content.replace(/\s/g, ""),
    bytes = Buffer.from(base64, "base64");
  if (
    bytes.toString("base64") !== base64 ||
    bytes.length !== blob.size ||
    blob.sha !== file.sha ||
    createHash("sha1")
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest("hex") !== file.sha
  )
    throw new Error("github_blob_integrity_failed");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const facts = moduleNeed
    ? moduleFileFacts(file.path, text, moduleNeed)
    : undefined;
  const firstDeclaration = facts?.declarations[0];
  const declarationOffset = firstDeclaration
    ? text.indexOf(firstDeclaration)
    : -1;
  const excerptOffset =
    declarationOffset > ZERO_GITHUB_LIMITS.excerptChars / 2
      ? declarationOffset
      : 0;
  return {
    path: file.path,
    gitBlobSha: file.sha,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    source: `https://github.com/${repo}/blob/${pin}/${file.path}`,
    excerpt: text.slice(
      excerptOffset,
      excerptOffset + ZERO_GITHUB_LIMITS.excerptChars,
    ),
    excerptTruncated:
      excerptOffset > 0 || text.length > ZERO_GITHUB_LIMITS.excerptChars,
    ...(facts ? { moduleFacts: facts, excerptOffset } : {}),
  };
}
type FileEvidence = Awaited<ReturnType<typeof fileEvidence>>;
export type GithubSourceCandidate = {
  repository: string;
  sourceRevision: string;
  treeSha: string;
  description: string;
  language: string | null;
  stars: number;
  pushedAt: string | null;
  licenseSpdx: string | null;
  sourcePaths: {
    path: string;
    type: "blob" | "tree" | "commit";
    sha: string;
  }[];
  treeTruncated: boolean;
  files: FileEvidence[];
  observedAt: string;
  prepared: false;
  runtimeTested: false;
  licenseApproved: false;
  implementationEvidence: {
    observedCodeFiles: number;
    treeComplete: boolean;
    inspectedCodePaths: string[];
  };
  sourceLinks?: { from: string; to: string; import: string }[];
};
function observedRelativeImports(
  file: FileEvidence,
  tree: z.infer<typeof treeSchema>["tree"],
) {
  const paths = new Map(tree.map((entry) => [entry.path, entry]));
  const linked = new Map<
    string,
    { entry: z.infer<typeof treeSchema>["tree"][number]; import: string }
  >();
  const native = /\.(?:c(?:c|pp|xx)?|h(?:h|pp|xx)?)$/i.test(file.path);
  for (const specifier of file.moduleFacts?.imports ?? []) {
    if (
      !specifier.startsWith("./") &&
      !specifier.startsWith("../") &&
      !(native && /\.h(?:h|pp|xx)?$/i.test(specifier))
    )
      continue;
    if (
      /[\\:\u0000-\u001f\u007f]/u.test(specifier) ||
      path.posix.isAbsolute(specifier)
    )
      continue;
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(file.path), specifier),
    );
    if (
      !githubSourcePathSchema.safeParse(target).success ||
      target === file.path
    )
      continue;
    const entry = paths.get(target);
    if (entry?.type === "blob" && entry.mode !== "120000")
      linked.set(target, { entry, import: specifier });
  }
  return linked;
}
export function githubSourceFailureReason(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /HTTP (403|429)|github_rate_or_access_limit/.test(message)
    ? "rate_or_access_limit"
    : /HTTP 404/.test(message)
      ? "source_unavailable"
      : /limit|large/.test(message)
        ? "resource_limit"
        : "source_read_failed";
}
const failureReason = githubSourceFailureReason;
export class GithubSourceReadError extends Error {
  constructor(readonly reason: string) {
    super("GitHub source read unavailable");
  }
}
function searchPlan(query: string) {
  const terms = query
    .match(/[\p{L}\p{N}][\p{L}\p{N}+#_.-]*/gu)!
    .filter((term) => !/^(?:AND|OR|NOT)$/i.test(term));
  const meaningful = terms.filter(
    (word) =>
      !/^(?:a|an|the|and|or|for|with|in|of|to|library|libraries|module|component|local|offline|desktop|application|app|framework|multilingual|cross-platform|reusable)$/i.test(
        word,
      ),
  );
  const dottedIdentity = (word: string) =>
    /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)+$/.test(word);
  const first = meaningful.find(dottedIdentity) ?? meaningful[0] ?? terms[0]!;
  // Dotted repository names, acronyms and mixed-case tokens are identity hints,
  // never proof of fit. A strong dotted token may follow a generic need word.
  // Do not AND a known name with every requested behavior: repo metadata rarely
  // enumerates an entire application requirement.
  const named =
    dottedIdentity(first) ||
    /^[A-Z]{2,}[a-z0-9+#_.-]*$/.test(first) ||
    /^[A-Za-z][a-z]+[A-Z][A-Za-z0-9+#_.-]*$/.test(first);
  return {
    original: query,
    primary: named ? first : terms.slice(0, 5).join(" "),
    primaryScope: named ? ("name" as const) : ("name-description" as const),
    primaryStrategy: named ? ("name-anchor" as const) : ("requested" as const),
    fallback: named
      ? [
          first,
          ...(meaningful.length ? meaningful : terms)
            .filter((word) => word.toLowerCase() !== first.toLowerCase())
            .slice(0, 1),
        ].join(" ")
      : (meaningful.length ? meaningful : terms)
          .slice(0, terms.length > 2 ? 2 : 1)
          .join(" "),
    fallbackScope: "name-description" as const,
    fallbackStrategy: named
      ? ("intent-refinement" as const)
      : ("keyword-reduction" as const),
  };
}
export async function discoverGithubSources(
  queries: string[],
  boundary: Boundary,
  moduleNeed?: GithubModuleNeed,
) {
  queries = githubQueriesSchema.parse(queries);
  // Research has its own smaller budget. Expiry preserves completed evidence;
  // cancellation/revocation of the enclosing job still fails closed.
  const researchSignal = AbortSignal.timeout(ZERO_GITHUB_LIMITS.runtimeMs);
  const api = transport({
    ...boundary,
    signal: AbortSignal.any([boundary.signal, researchSignal]),
  });
  const reason = (error: unknown) =>
    researchSignal.aborted ? "research_deadline" : failureReason(error);
  const failures: {
    repository?: string;
    query?: string;
    stage: string;
    reason: string;
  }[] = [];
  const found = new Map<
    string,
    { entry: z.infer<typeof repositorySchema>; score: number }
  >();
  const searches: {
    query: string;
    originalQuery: string;
    originalQueries: string[];
    effectiveQuery: string;
    scope: "name" | "name-description";
    strategy:
      "requested" | "keyword-reduction" | "name-anchor" | "intent-refinement";
    relaxedFrom?: string;
    totalCount: number;
    incomplete: boolean;
    returned: number;
  }[] = [];
  const requested = new Map<
    string,
    {
      originalQueries: string[];
      response: Promise<z.infer<typeof searchResponseSchema> | undefined>;
    }
  >();
  const plans = queries.map(searchPlan);
  const search = async (
    plan: ReturnType<typeof searchPlan>,
    fallback: boolean,
  ) => {
    const phrase = fallback ? plan.fallback : plan.primary;
    const scope = fallback ? plan.fallbackScope : plan.primaryScope;
    const strategy = fallback ? plan.fallbackStrategy : plan.primaryStrategy;
    const q = `${phrase} in:${scope === "name" ? "name" : "name,description"} is:public archived:false fork:true`;
    const existing = requested.get(q.toLowerCase());
    if (existing) {
      if (!existing.originalQueries.includes(plan.original))
        existing.originalQueries.push(plan.original);
      return existing.response;
    }
    const originalQueries = [plan.original];
    const responseTask = (async () => {
      try {
        if (researchSignal.aborted) return undefined;
        const response = searchResponseSchema.parse(
          await api.json(
            `/search/repositories?q=${encodeURIComponent(q)}&per_page=10`,
            ZERO_GITHUB_LIMITS.searchTimeoutMs,
          ),
        );
        searches.push({
          query: phrase,
          originalQuery: plan.original,
          originalQueries,
          effectiveQuery: q,
          scope,
          strategy,
          ...(strategy === "keyword-reduction"
            ? { relaxedFrom: plan.original }
            : {}),
          totalCount: response.total_count,
          incomplete: response.incomplete_results,
          returned: response.items.length,
        });
        response.items.forEach((entry, rank) => {
          if (entry.archived) return;
          const key = entry.full_name.toLowerCase(),
            old = found.get(key);
          const exactName =
            scope === "name" && key.split("/")[1] === phrase.toLowerCase();
          found.set(key, {
            entry,
            score: (old?.score ?? 0) + (exactName ? 3 : 1) / (rank + 10),
          });
        });
        return response;
      } catch (error) {
        boundary.signal.throwIfAborted();
        failures.push({ query: q, stage: "search", reason: reason(error) });
        return undefined;
      }
    })();
    requested.set(q.toLowerCase(), { originalQueries, response: responseTask });
    return responseTask;
  };
  // Two bounded rounds (at most three fixed-origin requests each) leave time for
  // actual commit/tree/blob reads. Slow or incomplete searches retain their facts;
  // a broader query is a different retrieval attempt, not a retry loop.
  const initial = await Promise.all(plans.map((plan) => search(plan, false)));
  await Promise.all(
    plans.map((plan, index) => {
      const response = initial[index];
      const differs =
        plan.fallback !== plan.primary ||
        plan.fallbackScope !== plan.primaryScope;
      return differs &&
        (!response ||
          response.items.length === 0 ||
          response.incomplete_results) &&
        !api.stats.rateLimited &&
        !researchSignal.aborted
        ? search(plan, true)
        : undefined;
    }),
  );
  const candidates: GithubSourceCandidate[] = [];
  const ordered = [...found.values()]
    .sort(
      (a, b) =>
        b.score - a.score || a.entry.full_name.localeCompare(b.entry.full_name),
    )
    .slice(0, ZERO_GITHUB_LIMITS.inspectedRepositories);
  const inspect = async ({
    entry,
  }: {
    entry: z.infer<typeof repositorySchema>;
  }) => {
    if (researchSignal.aborted) return undefined;
    const repo = entry.full_name;
    try {
      // An authenticated token must never widen the public-only discovery grant.
      if (boundary.tokenFile) {
        const current = repositorySchema.parse(
          await api.json(`/repos/${repo}`),
        );
        if (
          current.full_name.toLowerCase() !== repo.toLowerCase() ||
          current.archived
        )
          throw new Error("github_public_identity_changed");
      }
      const commit = z
        .object({ sha, commit: z.object({ tree: z.object({ sha }) }) })
        .parse(
          await api.json(
            `/repos/${repo}/commits/${encodeURIComponent(entry.default_branch)}`,
          ),
        );
      let tree: z.infer<typeof treeSchema>,
        partial = false;
      if (moduleNeed) {
        // A large recursive monorepo response can spend the whole research
        // allowance before exposing any code. Start at the pinned root and
        // descend a bounded, relevant source branch instead.
        tree = treeSchema.parse(
          await api.json(
            `/repos/${repo}/git/trees/${commit.commit.tree.sha}`,
            ZERO_GITHUB_LIMITS.moduleTreeTimeoutMs,
          ),
        );
        if (tree.sha !== commit.commit.tree.sha)
          throw new Error("github_tree_pin_mismatch");
        partial =
          tree.truncated || tree.tree.some((item) => item.type === "tree");
        const terms = new Set(
          [...queries, moduleNeed.inputs, moduleNeed.outputs]
            .join(" ")
            .toLowerCase()
            .split(/[^\p{L}\p{N}]+/u)
            .filter(
              (term) =>
                term.length > 2 &&
                !/^(?:the|and|for|with|from|into|that|this|input|inputs|output|outputs|local|offline|desktop|application|app|library|libraries|module|component|framework|reusable)$/i.test(
                  term,
                ),
            ),
        );
        const directories = (entries: z.infer<typeof treeSchema>["tree"]) =>
          entries
            .filter(
              (item) =>
                item.type === "tree" &&
                githubSourcePathSchema.safeParse(item.path).success &&
                !/(?:^|\/)(?:\.[^/]+|docs?|tests?|examples?|vendor|node_modules|build|dist|assets?|data|translations?|tools|scripts|ci|release-notes|security-advisories)(?:\/|$)/i.test(
                  item.path,
                ),
            )
            .sort((a, b) => {
              const score = (value: string) => {
                const tokens = new Set(
                  value
                    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
                    .toLowerCase()
                    .split(/[^\p{L}\p{N}]+/u),
                );
                return (
                  8 * [...terms].filter((term) => tokens.has(term)).length +
                  (/^(?:include|src|source|lib[^/]*|framework|core|subprojects|packages|modules|crates|components)$/i.test(
                    value.split("/").at(-1)!,
                  )
                    ? 3
                    : 0)
                );
              };
              return (
                score(b.path) - score(a.path) || a.path.localeCompare(b.path)
              );
            });
        let frontier = directories(tree.tree);
        const visited = new Set<string>();
        let branchEntries: z.infer<typeof treeSchema>["tree"] = [];
        for (let read = 0; read < ZERO_GITHUB_LIMITS.moduleTreeReads; read++) {
          if (
            researchSignal.aborted ||
            (read > 0 &&
              moduleCodePaths(branchEntries, queries, [], moduleNeed).length >=
                1)
          )
            break;
          const directory = frontier.find((item) => !visited.has(item.path));
          if (!directory) break;
          visited.add(directory.path);
          try {
            const subtree = treeSchema.parse(
              await api.json(
                `/repos/${repo}/git/trees/${directory.sha}`,
                ZERO_GITHUB_LIMITS.moduleTreeTimeoutMs,
              ),
            );
            if (subtree.sha !== directory.sha)
              throw new Error("github_tree_pin_mismatch");
            const descendants = subtree.tree.map((item) => ({
              ...item,
              path: `${directory.path}/${item.path}`,
            }));
            branchEntries = descendants;
            tree.tree.push(...descendants);
            // Follow a relevant branch until it exposes code, retaining its
            // siblings for a later bounded read when the branch is empty.
            frontier = [...directories(descendants), ...frontier];
          } catch (error) {
            boundary.signal.throwIfAborted();
            failures.push({
              repository: repo,
              stage: "tree",
              reason: reason(error),
            });
          }
        }
      } else
        try {
          tree = treeSchema.parse(
            await api.json(
              `/repos/${repo}/git/trees/${commit.commit.tree.sha}?recursive=1`,
            ),
          );
        } catch {
          partial = true;
          tree = treeSchema.parse(
            await api.json(
              `/repos/${repo}/git/trees/${commit.commit.tree.sha}`,
            ),
          );
        }
      if (tree.sha !== commit.commit.tree.sha)
        throw new Error("github_tree_pin_mismatch");
      const files: FileEvidence[] = [];
      const documents = [
        /^readme(?:\.[^/]+)?$/i,
        /^(?:licen[sc]e|copying)(?:\.[^/]+)?$/i,
      ]
        .map((pattern) =>
          tree.tree.find(
            (file) =>
              file.type === "blob" &&
              file.mode !== "120000" &&
              pattern.test(file.path),
          ),
        )
        .filter((file) => file !== undefined);
      const manifests = moduleNeed
        ? tree.tree
            .filter(
              (file) =>
                file.type === "blob" &&
                file.mode !== "120000" &&
                /(?:^|\/)(?:package\.json|pyproject\.toml|Cargo\.toml|requirements\.txt|go\.mod|CMakeLists\.txt)$/.test(
                  file.path,
                ) &&
                !/(?:^|\/)(?:node_modules|vendor|examples?|tests?)\//.test(
                  file.path,
                ),
            )
            .sort(
              (a, b) =>
                a.path.split("/").length - b.path.split("/").length ||
                a.path.localeCompare(b.path),
            )
            .slice(0, 2)
        : [];
      const appendReads = async (
        reads: { file: { path: string; sha: string }; stage: string }[],
      ) => {
        const results = await Promise.allSettled(
          reads.map(async ({ file, stage }) => {
            try {
              return await fileEvidence(
                api,
                repo,
                commit.sha,
                file,
                moduleNeed,
              );
            } catch (error) {
              boundary.signal.throwIfAborted();
              failures.push({
                repository: repo,
                stage,
                reason: reason(error),
              });
              return undefined;
            }
          }),
        );
        for (const read of results) {
          if (read.status === "rejected") throw read.reason;
          if (read.value) files.push(read.value);
        }
      };
      await appendReads(
        manifests
          .filter((file) => /(?:^|\/)package\.json$/.test(file.path))
          .map((file) => ({ file, stage: "document" })),
      );
      const terms = queries
        .join(" ")
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((term) => term.length > 2);
      const paths = tree.tree
        .filter((file) => githubSourcePathSchema.safeParse(file.path).success)
        .sort(
          (a, b) =>
            Number(terms.some((term) => b.path.toLowerCase().includes(term))) -
              Number(
                terms.some((term) => a.path.toLowerCase().includes(term)),
              ) || a.path.localeCompare(b.path),
        )
        .slice(0, ZERO_GITHUB_LIMITS.paths)
        .map(({ path, type, sha }) => ({ path, type, sha }));
      const implementationFiles = tree.tree.filter(
        (file) =>
          file.type === "blob" &&
          file.mode !== "120000" &&
          /\.(?:[cm]?[jt]sx?|py|rs|go|[ch](?:pp|xx)?|java|swift|cs|vue|svelte)$/i.test(
            file.path,
          ),
      );
      const legacyCode = paths.find((file) =>
        implementationFiles.some((item) => item.path === file.path),
      );
      const codePaths = moduleNeed
        ? moduleCodePaths(tree.tree, queries, files, moduleNeed)
        : legacyCode
          ? [legacyCode]
          : [];
      await appendReads([
        ...codePaths.slice(0, 1).map((file) => ({ file, stage: "code" })),
        ...manifests
          .filter((file) => !/(?:^|\/)package\.json$/.test(file.path))
          .map((file) => ({ file, stage: "document" })),
        ...documents.map((file) => ({ file, stage: "document" })),
      ]);
      const primary = files.find((file) => file.path === codePaths[0]?.path);
      const linked: ReturnType<typeof observedRelativeImports> =
        moduleNeed && primary?.moduleFacts?.declarations.length === 0
          ? observedRelativeImports(primary, tree.tree)
          : new Map();
      const linkedPaths = moduleNeed
        ? moduleCodePaths(
            [...linked.values()].map((link) => link.entry),
            queries,
            files,
            moduleNeed,
          )
            .filter(
              (file) => !files.some((existing) => existing.path === file.path),
            )
            .slice(0, ZERO_GITHUB_LIMITS.moduleLinkedFiles)
        : [];
      const sourceLinks = linkedPaths.map((file) => ({
        from: primary!.path,
        to: file.path,
        import: linked.get(file.path)!.import,
      }));
      const follow = linkedPaths.length ? linkedPaths : codePaths.slice(1);
      await appendReads(follow.map((file) => ({ file, stage: "code" })));
      const evidenceOrder = [
        ...manifests,
        ...documents,
        ...codePaths,
        ...follow,
      ].map((file) => file.path);
      files.sort(
        (a, b) => evidenceOrder.indexOf(a.path) - evidenceOrder.indexOf(b.path),
      );
      return {
        repository: repo,
        sourceRevision: commit.sha,
        treeSha: tree.sha,
        description: (entry.description ?? "").slice(0, 1000),
        language: entry.language,
        stars: entry.stargazers_count,
        pushedAt: entry.pushed_at,
        licenseSpdx: entry.license?.spdx_id ?? null,
        sourcePaths: paths,
        treeTruncated:
          partial || tree.truncated || tree.tree.length > paths.length,
        files,
        observedAt: new Date().toISOString(),
        prepared: false as const,
        runtimeTested: false as const,
        licenseApproved: false as const,
        implementationEvidence: {
          observedCodeFiles: implementationFiles.length,
          treeComplete: !partial && !tree.truncated,
          inspectedCodePaths: files
            .filter((file) =>
              implementationFiles.some((item) => item.path === file.path),
            )
            .map((file) => file.path),
        },
        ...(sourceLinks.length ? { sourceLinks } : {}),
      };
    } catch (error) {
      boundary.signal.throwIfAborted();
      failures.push({
        repository: repo,
        stage: "inspect",
        reason: reason(error),
      });
      return undefined;
    }
  };
  // A slow first monorepo must not consume every other candidate's opportunity
  // to expose a callable unit. Finish the first bounded wave before spending
  // any remaining allowance on lower-ranked repositories.
  for (
    let offset = 0;
    offset < ordered.length;
    offset += ZERO_GITHUB_LIMITS.inspectionConcurrency
  ) {
    if (
      researchSignal.aborted ||
      api.stats.requests >= ZERO_GITHUB_LIMITS.requests
    )
      break;
    const wave = await Promise.all(
      ordered
        .slice(offset, offset + ZERO_GITHUB_LIMITS.inspectionConcurrency)
        .map(inspect),
    );
    for (const candidate of wave) if (candidate) candidates.push(candidate);
  }
  boundary.signal.throwIfAborted();
  await withAbort(boundary.authorize(), boundary.signal);
  const result = {
    kind: "public-github-source-discovery-v1" as const,
    requestedQueries: queries,
    searches,
    matchedRepositories: found.size,
    candidates,
    failures,
    limits: ZERO_GITHUB_LIMITS,
    network: { ...api.stats, researchDeadlineReached: researchSignal.aborted },
    evaluation:
      "Bounded GitHub search and source inspection, not exhaustive search, license approval or runtime verification",
  };
  while (
    Buffer.byteLength(JSON.stringify(result)) > ZERO_GITHUB_LIMITS.receiptBytes
  ) {
    let reduced = false;
    for (const candidate of candidates) {
      if (candidate.sourcePaths.length) {
        candidate.sourcePaths.pop();
        candidate.treeTruncated = true;
        reduced = true;
      } else {
        for (const file of candidate.files)
          if (file.excerpt.length) {
            file.excerpt = file.excerpt.slice(
              0,
              Math.floor(file.excerpt.length / 2),
            );
            file.excerptTruncated = true;
            reduced = true;
          }
      }
    }
    if (!reduced) throw new Error("github_receipt_limit");
  }
  return result;
}
export function githubRepositoryOptions(
  candidates: GithubSourceCandidate[],
): RepositoryOption[] {
  return candidates.map((candidate) => ({
    repository: candidate.repository,
    sourceRevision: candidate.sourceRevision,
    sourceAvailable: true,
    archived: false,
    licenseSource: `GitHub SPDX: ${candidate.licenseSpdx ?? "unknown"}; exact license file: ${candidate.files.find((file) => /licen[sc]e|copying/i.test(file.path))?.sha256 ?? "not observed"}; not license approval`,
    capability: compactCapability(candidate),
  }));
}
function compactCapability(candidate: GithubSourceCandidate) {
  const facts = {
    description: candidate.description,
    implementationEvidence: candidate.implementationEvidence,
    sampleCode: candidate.files
      .filter((file) =>
        candidate.implementationEvidence?.inspectedCodePaths.includes(
          file.path,
        ),
      )
      .slice(0, 1)
      .map((file) => ({
        path: file.path,
        sha256: file.sha256,
        excerpt: file.excerpt.slice(0, 400),
        excerptTruncated: file.excerptTruncated || file.excerpt.length > 400,
      })),
    language: candidate.language,
    readme:
      candidate.files.find((file) => /^readme/i.test(file.path))?.excerpt ??
      null,
    possibleSourcePaths: candidate.sourcePaths
      .slice(0, 8)
      .map((file) => file.path),
    reviewedFiles: candidate.files.map(({ path, sha256 }) => ({
      path,
      sha256,
    })),
    readmeTruncated:
      candidate.files.find((file) => /^readme/i.test(file.path))
        ?.excerptTruncated ?? false,
    gaps: "Runtime compatibility, deployment footprint and specific module behavior remain unverified. README and path names are untrusted claims, not correctness evidence.",
  };
  while (Buffer.byteLength(JSON.stringify(facts)) > 4096) {
    if (facts.possibleSourcePaths.length) facts.possibleSourcePaths.pop();
    else if (facts.readme?.length) {
      facts.readme = facts.readme.slice(0, Math.floor(facts.readme.length / 2));
      facts.readmeTruncated = true;
    } else if (facts.description.length)
      facts.description = facts.description.slice(
        0,
        Math.floor(facts.description.length / 2),
      );
    else throw new Error("github_model_context_limit");
  }
  return JSON.stringify(facts);
}

type SourceInspectionEntry =
  | ({ type: "file" } & FileEvidence)
  | {
      path: string;
      type: "directory";
      truncated: boolean;
      entries: { path: string; type: string; sha: string }[];
    };

/** A same-scope discovery receipt fixes repository and commit; the host supplies only relative paths. */
export async function inspectGithubSource(
  candidate: Pick<GithubSourceCandidate, "repository" | "sourceRevision">,
  paths: string[],
  boundary: Boundary,
) {
  repository.parse(candidate.repository);
  sha.parse(candidate.sourceRevision);
  paths = z.array(githubInspectionPathSchema).min(1).max(4).parse(paths);
  const api = transport(boundary),
    entries: SourceInspectionEntry[] = [],
    failures: { path: string; reason: string }[] = [];
  try {
    if (boundary.tokenFile) {
      const current = repositorySchema.parse(
        await api.json(`/repos/${candidate.repository}`),
      );
      if (
        current.full_name.toLowerCase() !==
          candidate.repository.toLowerCase() ||
        current.archived
      )
        throw new Error("github_public_identity_changed");
    }
  } catch (error) {
    throw new GithubSourceReadError(failureReason(error));
  }
  for (const path of paths) {
    try {
      const raw = await api.json(
        `/repos/${candidate.repository}/contents${path === "." ? "" : "/" + path.split("/").map(encodeURIComponent).join("/")}?ref=${candidate.sourceRevision}`,
      );
      if (Array.isArray(raw)) {
        const directory = z
          .array(
            z.object({
              path: githubSourcePathSchema,
              type: z.enum(["file", "dir", "symlink", "submodule"]),
              sha,
            }),
          )
          .max(1000)
          .parse(raw);
        entries.push({
          path,
          type: "directory",
          truncated: directory.length > 80,
          entries: directory.slice(0, 80),
        });
      } else {
        const file = z
          .object({
            path: githubSourcePathSchema,
            sha,
            type: z.literal("file"),
          })
          .parse(raw);
        if (file.path !== path)
          throw new Error("github_source_identity_changed");
        entries.push({
          type: "file",
          ...(await fileEvidence(
            api,
            candidate.repository,
            candidate.sourceRevision,
            file,
          )),
        });
      }
    } catch (error) {
      boundary.signal.throwIfAborted();
      failures.push({ path, reason: failureReason(error) });
    }
  }
  await withAbort(boundary.authorize(), boundary.signal);
  const result = {
    repository: candidate.repository,
    sourceRevision: candidate.sourceRevision,
    entries,
    failures,
    network: api.stats,
    prepared: false,
    runtimeTested: false,
    licenseApproved: false,
  };
  while (
    Buffer.byteLength(JSON.stringify(result)) > ZERO_GITHUB_LIMITS.receiptBytes
  ) {
    let reduced = false;
    for (const entry of entries) {
      if (entry.type === "directory" && entry.entries.length) {
        entry.entries.pop();
        entry.truncated = true;
        reduced = true;
      } else if (entry.type === "file" && entry.excerpt.length) {
        entry.excerpt = entry.excerpt.slice(
          0,
          Math.floor(entry.excerpt.length / 2),
        );
        entry.excerptTruncated = true;
        reduced = true;
      }
    }
    if (!reduced) throw new Error("github_inspection_receipt_limit");
  }
  return result;
}
