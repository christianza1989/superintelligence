import { createHash } from "node:crypto";
import { z } from "zod";
import type { ZeroJevApplicationClient } from "./zero-jev-application-client.js";
import { ZERO_JEV_LIMITS } from "./zero-jev-limits.js";

export const zeroReuseReceiptViewSchema = z.strictObject({
  jobId: z.uuid(),
  artifactId: z.string(),
  revision: z.literal(2),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  totalBytes: z.number().int().positive(),
  integrityVerified: z.literal(true),
  view: z.enum(["summary", "decision"]),
  untrustedSource: z.literal(true),
  omittedFields: z.array(z.string()),
  receipt: z.record(z.string(), z.unknown()),
});
const candidateViewSchema = z.looseObject({
  sourcePaths: z.array(z.unknown()),
  sourcePathsOmitted: z.number().optional(),
  files: z.array(
    z.looseObject({ excerpt: z.string(), excerptTruncated: z.boolean() }),
  ),
});

/** Decode complete byte pages inside the trusted client, before projecting evidence. */
export async function readZeroReuseReceipt(
  client: ZeroJevApplicationClient,
  jobId: string,
  view: "summary" | "decision" = "summary",
) {
  const job = await client.get(jobId);
  if (!("sha256" in job)) throw new Error("receipt_not_terminal");
  const chunks: Buffer[] = [];
  let offset = 0,
    totalBytes = 0;
  for (let n = 0; n < 13; n++) {
    const page = await client.artifactPage(jobId, { offset, limit: 8192 });
    const bytes = Buffer.from(page.contentBase64, "base64");
    if (
      page.artifactId !== job.artifactId ||
      page.sha256 !== job.sha256 ||
      page.revision !== job.revision ||
      page.offset !== offset ||
      (n > 0 && page.totalBytes !== totalBytes) ||
      page.totalBytes > ZERO_JEV_LIMITS.artifactBytes ||
      bytes.toString("base64") !== page.contentBase64 ||
      !bytes.length ||
      bytes.length > 8192 ||
      offset + bytes.length > page.totalBytes ||
      page.nextOffset !==
        (offset + bytes.length < page.totalBytes ? offset + bytes.length : null)
    )
      throw new Error("receipt_page_integrity_failed");
    totalBytes = page.totalBytes;
    chunks.push(bytes);
    offset += bytes.length;
    if (page.nextOffset === null) break;
  }
  const bytes = Buffer.concat(chunks);
  if (
    bytes.length !== totalBytes ||
    createHash("sha256").update(bytes).digest("hex") !== job.sha256
  )
    throw new Error("receipt_integrity_failed");
  const body = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  if (
    body.kind !== "zero.jev.receipt.v1" ||
    body.jobId !== jobId ||
    body.requestDigest !== job.requestDigest ||
    body.callId !== job.callId ||
    body.state !== job.state
  )
    throw new Error("receipt_binding_failed");
  const receipt: Record<string, unknown> = {};
  const omittedFields: string[] = [];
  if (view === "decision") {
    const selection = body.selection ? { ...body.selection } : null;
    if (selection) delete selection.proposal;
    const discovery = body.discovery;
    const proposal = body.moduleProposal
      ? structuredClone(body.moduleProposal)
      : null;
    if (proposal?.module) {
      proposal.module.source.excerpt = proposal.module.source.excerpt.slice(
        0,
        800,
      );
      proposal.module.source.excerptTruncated = true;
      proposal.module.declarations = proposal.module.declarations.slice(0, 6);
      proposal.module.imports = proposal.module.imports.slice(0, 8);
      if (proposal.module.implementationSnippets)
        proposal.module.implementationSnippets =
          proposal.module.implementationSnippets
            .slice(0, 2)
            .map((s: { offset: number; text: string }) => ({
              ...s,
              text: s.text.slice(0, 600),
              excerptTruncated: true,
            }));
      if (proposal.module.purposeEvidence)
        proposal.module.purposeEvidence.readme =
          proposal.module.purposeEvidence.readme.map(
            (f: { excerpt: string }) => ({
              ...f,
              excerpt: f.excerpt.slice(0, 800),
              excerptTruncated: true,
            }),
          );
      proposal.module.manifests = proposal.module.manifests.map(
        (m: {
          dependencies: Record<string, string>;
          dependenciesOmitted: number;
        }) => ({
          ...m,
          dependencies: Object.fromEntries(
            Object.entries(m.dependencies).slice(0, 8),
          ),
          dependenciesOmitted:
            m.dependenciesOmitted +
            Math.max(0, Object.keys(m.dependencies).length - 8),
        }),
      );
    }
    Object.assign(receipt, {
      state: body.state,
      phase: body.phase,
      ...(body.reason ? { reason: body.reason } : {}),
      selection,
      moduleProposal: proposal,
      prepared: body.prepared,
      verified: body.verified,
      ...(discovery
        ? {
            research: {
              matchedRepositories: discovery.matchedRepositories,
              inspectedRepositories: discovery.candidates.length,
              network: discovery.network,
              failures: discovery.failures,
            },
          }
        : {}),
    });
    if (
      Buffer.byteLength(JSON.stringify(receipt)) > 14000 &&
      proposal?.module
    ) {
      proposal.module.source.excerpt = "";
      proposal.module.declarations = proposal.module.declarations.slice(0, 3);
      proposal.module.implementationSnippets = [];
      proposal.module.purposeEvidence = {
        description: "Omitted in compact view; see full receipt",
        readme: [],
      };
      proposal.module.manifests = proposal.module.manifests.map(
        (m: {
          dependencies: Record<string, string>;
          dependenciesOmitted: number;
        }) => ({
          ...m,
          dependencies: Object.fromEntries(
            Object.entries(m.dependencies).slice(0, 4),
          ),
          dependenciesOmitted:
            m.dependenciesOmitted +
            Math.max(0, Object.keys(m.dependencies).length - 4),
        }),
      );
    }
    if (Buffer.byteLength(JSON.stringify(receipt)) > 14000)
      throw new Error("decision_view_limit");
    return zeroReuseReceiptViewSchema.parse({
      jobId,
      artifactId: job.artifactId,
      revision: job.revision,
      sha256: job.sha256,
      totalBytes,
      integrityVerified: true,
      view,
      untrustedSource: true,
      omittedFields: [
        "Full discovery, unselected source, usage and unabridged module evidence remain in the immutable receipt; decision excerpts/declarations/imports/dependencies are bounded.",
      ],
      receipt,
    });
  }
  for (const field of [
    "kind",
    "state",
    "phase",
    "reason",
    "selection",
    "prepared",
    "verified",
    "dispatchAttempts",
    "elapsedMs",
    "discoveryJobId",
    "discoverySha256",
    "inspection",
    "candidates",
    "moduleProposal",
    "inspectedModules",
  ])
    if (body[field] !== undefined) receipt[field] = body[field];
  if (body.discovery) {
    receipt.discovery = {
      ...body.discovery,
      candidates: body.discovery.candidates.map(
        (candidate: Record<string, unknown>) => ({
          ...candidate,
          sourcePaths: (candidate.sourcePaths as unknown[]).slice(0, 12),
          sourcePathsOmitted: Math.max(
            0,
            (candidate.sourcePaths as unknown[]).length - 12,
          ),
        }),
      ),
    };
  }
  // Prepared source bytes and provider accounting remain in the immutable raw receipt.
  for (const field of Object.keys(body))
    if (!(field in receipt)) omittedFields.push(field);
  if (Buffer.byteLength(JSON.stringify(receipt)) > 19000) {
    delete receipt.candidates;
    omittedFields.push("candidates");
    const discovery = receipt.discovery as
      { candidates?: unknown[] } | undefined;
    if (discovery?.candidates) {
      discovery.candidates = discovery.candidates.map((value) => {
        const candidate = candidateViewSchema.parse(value);
        return {
          ...candidate,
          sourcePaths: candidate.sourcePaths.slice(0, 6),
          sourcePathsOmitted:
            (candidate.sourcePathsOmitted ?? 0) +
            Math.max(0, candidate.sourcePaths.length - 6),
          files: candidate.files.map((file) => ({
            ...file,
            excerpt: file.excerpt.slice(0, 500),
            excerptTruncated:
              file.excerptTruncated || file.excerpt.length > 500,
          })),
        };
      });
      omittedFields.push(
        "discovery.candidates source paths and excerpts shortened",
      );
    }
  }
  if (
    Buffer.byteLength(JSON.stringify(receipt)) > 19000 &&
    receipt.inspection
  ) {
    const inspection = z
      .looseObject({ entries: z.array(z.record(z.string(), z.unknown())) })
      .parse(receipt.inspection);
    inspection.entries = inspection.entries.map((entry) =>
      typeof entry.excerpt === "string"
        ? {
            ...entry,
            excerpt: entry.excerpt.slice(0, 800),
            excerptTruncated:
              entry.excerptTruncated === true || entry.excerpt.length > 800,
          }
        : Array.isArray(entry.entries)
          ? {
              ...entry,
              entries: entry.entries.slice(0, 12),
              truncated: entry.truncated === true || entry.entries.length > 12,
            }
          : entry,
    );
    receipt.inspection = inspection;
    omittedFields.push("inspection excerpts or directory entries shortened");
  }
  if (Buffer.byteLength(JSON.stringify(receipt)) > 19000)
    throw new Error("receipt_view_limit");
  return zeroReuseReceiptViewSchema.parse({
    jobId,
    artifactId: job.artifactId,
    revision: job.revision,
    sha256: job.sha256,
    totalBytes,
    integrityVerified: true,
    view: "summary",
    untrustedSource: true,
    omittedFields,
    receipt,
  });
}
