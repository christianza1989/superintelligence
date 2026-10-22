/** Bounded public GitHub discovery. Source text is evidence, never authority to execute. */
import { createHash } from "node:crypto";
import { z } from "zod";
import { fetchSafeWebBytes, withAbort } from "./web-ssrf.js";
import type { SafeWebFetchOptions } from "./web-ssrf.js";
import type { RepositoryOption } from "./zero-repository-selector.js";
import { readZeroOperatorFile } from "./zero-operator-file.js";
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
    async json(path: string) {
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
          timeoutMs: 8000,
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
  return {
    path: file.path,
    gitBlobSha: file.sha,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    source: `https://github.com/${repo}/blob/${pin}/${file.path}`,
    excerpt: text.slice(0, ZERO_GITHUB_LIMITS.excerptChars),
    excerptTruncated: text.length > ZERO_GITHUB_LIMITS.excerptChars,
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
};
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
export async function discoverGithubSources(
  queries: string[],
  boundary: Boundary,
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
    totalCount: number;
    incomplete: boolean;
    returned: number;
  }[] = [];
  for (const query of queries) {
    if (researchSignal.aborted) break;
    try {
      const q = `${query} in:name,description is:public archived:false fork:true`;
      const response = z
        .object({
          total_count: z.number().int().min(0),
          incomplete_results: z.boolean(),
          items: z.array(repositorySchema).max(10),
        })
        .parse(
          await api.json(
            `/search/repositories?q=${encodeURIComponent(q)}&per_page=10`,
          ),
        );
      searches.push({
        query,
        totalCount: response.total_count,
        incomplete: response.incomplete_results,
        returned: response.items.length,
      });
      response.items.forEach((entry, rank) => {
        if (entry.archived) return;
        const key = entry.full_name.toLowerCase(),
          old = found.get(key);
        found.set(key, { entry, score: (old?.score ?? 0) + 1 / (rank + 10) });
      });
    } catch (error) {
      boundary.signal.throwIfAborted();
      failures.push({ query, stage: "search", reason: reason(error) });
    }
  }
  const candidates: GithubSourceCandidate[] = [];
  for (const { entry } of [...found.values()].sort(
    (a, b) =>
      b.score - a.score || a.entry.full_name.localeCompare(b.entry.full_name),
  )) {
    if (
      researchSignal.aborted ||
      candidates.length >= ZERO_GITHUB_LIMITS.inspectedRepositories
    )
      break;
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
      try {
        tree = treeSchema.parse(
          await api.json(
            `/repos/${repo}/git/trees/${commit.commit.tree.sha}?recursive=1`,
          ),
        );
      } catch {
        partial = true;
        tree = treeSchema.parse(
          await api.json(`/repos/${repo}/git/trees/${commit.commit.tree.sha}`),
        );
      }
      if (tree.sha !== commit.commit.tree.sha)
        throw new Error("github_tree_pin_mismatch");
      const files: FileEvidence[] = [];
      for (const pattern of [
        /^readme(?:\.[^/]+)?$/i,
        /^(?:licen[sc]e|copying)(?:\.[^/]+)?$/i,
      ]) {
        const file = tree.tree.find(
          (file) =>
            file.type === "blob" &&
            file.mode !== "120000" &&
            pattern.test(file.path),
        );
        if (!file) continue;
        try {
          files.push(await fileEvidence(api, repo, commit.sha, file));
        } catch (error) {
          boundary.signal.throwIfAborted();
          failures.push({
            repository: repo,
            stage: "document",
            reason: reason(error),
          });
        }
      }
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
      const code = paths.find((file) =>
        implementationFiles.some((item) => item.path === file.path),
      );
      if (code) {
        try {
          files.push(await fileEvidence(api, repo, commit.sha, code));
        } catch (error) {
          boundary.signal.throwIfAborted();
          failures.push({
            repository: repo,
            stage: "code",
            reason: reason(error),
          });
        }
      }
      candidates.push({
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
        prepared: false,
        runtimeTested: false,
        licenseApproved: false,
        implementationEvidence: {
          observedCodeFiles: implementationFiles.length,
          treeComplete: !partial && !tree.truncated,
          inspectedCodePaths: files
            .filter((file) =>
              implementationFiles.some((item) => item.path === file.path),
            )
            .map((file) => file.path),
        },
      });
    } catch (error) {
      boundary.signal.throwIfAborted();
      failures.push({
        repository: repo,
        stage: "inspect",
        reason: reason(error),
      });
      if (api.stats.requests >= ZERO_GITHUB_LIMITS.requests) break;
    }
  }
  boundary.signal.throwIfAborted();
  await withAbort(boundary.authorize(), boundary.signal);
  const result = {
    kind: "public-github-source-discovery-v1" as const,
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
