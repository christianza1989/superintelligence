import { createHash } from "node:crypto";
import { z } from "zod";

export const ZERO_PDF_PROFILE = "pdfplumber-0.11.10-born-digital-lines-v1" as const;
export const ZERO_PDF_IMAGE =
  "sha256:d016f2d236645626f243ca8fbf31778b1206f00af3d6e0661c33f2831db83f98" as const;
export const ZERO_PDF_LIMITS = Object.freeze({
  inputBytes: 1_048_576,
  pages: 5,
  outputBytes: 1_048_576,
  runtimeMs: 30_000,
  memoryBytes: 536_870_912,
  threads: 2,
  deadlineMs: 600_000,
  allowlistedFiles: 10,
  stagingBytes: 2_097_152,
});
export const ZERO_PDF_BUNDLE = Object.freeze([
  {
    name: "profile.json",
    bytes: 2135,
    sha256: "cdee312815b6b76967b8935f3d4cf636703af1691c1405a65f494d05b490af55",
  },
  {
    name: "runner.py",
    bytes: 6184,
    sha256: "b8a5721c1874af7dd8d044aee8ad914f2ac7fcb1003b2fd2b81c59f3924a4942",
  },
  {
    name: "wheels.lock.json",
    bytes: 3847,
    sha256: "fad81432bacdbc47ed04bbafc2330e2800f13539679360618efb0f9125d1e478",
  },
] as const);
/** SHA-256 of JSON.stringify(ZERO_PDF_BUNDLE), preserving declared entry/key order. */
export const ZERO_PDF_BUNDLE_SHA256 =
  "375aa6b7fefa20875f984b6e3750940d06e110550123f09f225d90609223d841" as const;
export const zeroPdfHash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
export const zeroPdfSubmitSchema = z
  .object({
    fileId: id,
    idempotencyKey: z.string().min(1).max(128),
    deadline: z.string().datetime({ offset: true }),
  })
  .strict();
/** Authenticated application context only. Never a request/tool argument. */
export const zeroPdfPrincipalSchema = z
  .object({
    spaceId: id,
    userId: id,
    scopeId: id,
    policyRevision: id,
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type ZeroPdfPrincipal = z.infer<typeof zeroPdfPrincipalSchema>;
/** Existing owned Artifact ID, not an upload API or permission grant. */
export const zeroPdfInputRefSchema = z
  .object({
    artifactId: id,
    sha256: hash,
    bytes: z.number().int().min(5).max(ZERO_PDF_LIMITS.inputBytes),
  })
  .strict();
export type ZeroPdfInputRef = z.infer<typeof zeroPdfInputRefSchema>;
export const zeroPdfRequestSchema = z
  .object({
    kind: z.literal("zero.pdf.request.v1"),
    principal: zeroPdfPrincipalSchema,
    fileId: id,
    source: zeroPdfInputRefSchema,
    profile: z.literal(ZERO_PDF_PROFILE),
    imageId: z.literal(ZERO_PDF_IMAGE),
    bundleSha256: z.literal(ZERO_PDF_BUNDLE_SHA256),
    deadline: z.string().datetime({ offset: true }),
  })
  .strict();
export type ZeroPdfRequest = z.infer<typeof zeroPdfRequestSchema>;
/** Stable serialization binds every authority/profile/input field; the service owns unique insertion. */
export function zeroPdfRequestDigest(input: unknown, now: number): string {
  const request = zeroPdfRequestSchema.parse(input);
  const deadline = Date.parse(request.deadline);
  if (
    !Number.isFinite(now) ||
    deadline <= now ||
    deadline - now > ZERO_PDF_LIMITS.deadlineMs ||
    deadline > Date.parse(request.principal.expiresAt)
  )
    throw new Error("PDF_REQUEST_DENIED");
  return zeroPdfHash(JSON.stringify(request));
}
const coordinate = z.number().finite().min(0).max(14400);
const bbox = z
  .object({
    l: coordinate,
    t: coordinate,
    r: coordinate,
    b: coordinate,
    coord_origin: z.literal("TOPLEFT"),
  })
  .strict()
  .refine((box) => box.l < box.r && box.t < box.b);
const cell = z
  .object({
    text: z.string().max(4096),
    start_row_offset_idx: z.number().int().min(0).max(127),
    end_row_offset_idx: z.number().int().min(1).max(128),
    start_col_offset_idx: z.number().int().min(0).max(31),
    end_col_offset_idx: z.number().int().min(1).max(32),
    bbox,
  })
  .strict();
const table = z
  .object({
    data: z
      .object({
        num_rows: z.number().int().min(1).max(128),
        num_cols: z.number().int().min(1).max(32),
        table_cells: z.array(cell).max(512),
      })
      .strict(),
    provenance: z
      .array(
        z
          .object({
            page_no: z.number().int().min(1).max(ZERO_PDF_LIMITS.pages),
            bbox,
          })
          .strict(),
      )
      .length(1),
  })
  .strict()
  .superRefine((table, context) => {
    const { num_rows: rows, num_cols: cols, table_cells: cells } = table.data;
    const parent = table.provenance[0]?.bbox;
    const indices = new Set<string>();
    if (rows * cols > 512 || cells.length !== rows * cols || !parent)
      context.addIssue({ code: "custom", message: "Invalid rectangular table" });
    for (const cell of cells) {
      const key = `${cell.start_row_offset_idx}:${cell.start_col_offset_idx}`;
      if (
        indices.has(key) ||
        cell.start_row_offset_idx >= rows ||
        cell.start_col_offset_idx >= cols ||
        cell.end_row_offset_idx !== cell.start_row_offset_idx + 1 ||
        cell.end_col_offset_idx !== cell.start_col_offset_idx + 1 ||
        !parent ||
        cell.bbox.l < parent.l ||
        cell.bbox.r > parent.r ||
        cell.bbox.t < parent.t ||
        cell.bbox.b > parent.b
      )
        context.addIssue({ code: "custom", message: "Invalid cell provenance" });
      indices.add(key);
    }
  });
export const zeroPdfExtractionSchema = z
  .object({
    profile: z.literal(ZERO_PDF_PROFILE),
    sourceSha256: hash,
    pages: z.number().int().min(1).max(ZERO_PDF_LIMITS.pages),
    tables: z.array(table).max(32),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.tables.some((table) => (table.provenance[0]?.page_no ?? Infinity) > value.pages))
      context.addIssue({ code: "custom", message: "Invalid source page" });
  });
export type ZeroPdfExtraction = z.infer<typeof zeroPdfExtractionSchema>;
/** Proposed durable service boundary. No implementation, registration, retention or upload is implied. */
export interface ZeroPdfScopedService {
  submit(
    principal: ZeroPdfPrincipal,
    input: z.infer<typeof zeroPdfSubmitSchema>,
  ): Promise<{ jobId: string; state: "queued" }>;
  get(principal: ZeroPdfPrincipal, jobId: string): Promise<ZeroPdfJob>;
  cancel(principal: ZeroPdfPrincipal, jobId: string): Promise<ZeroPdfJob>;
}
export type ZeroPdfJob =
  | { jobId: string; state: "queued" | "running" | "unknown" }
  | { jobId: string; state: "failed" | "blocked" | "cancelled"; reason: string }
  | {
      jobId: string;
      state: "succeeded";
      output: ZeroPdfInputRef;
      profile: typeof ZERO_PDF_PROFILE;
    };
