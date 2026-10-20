import { csvFormatRows } from "d3-dsv";
import { z } from "zod";
import {
  ZERO_PDF_BUNDLE_SHA256,
  ZERO_PDF_IMAGE,
  ZERO_PDF_JOB_LIMITS,
  ZERO_PDF_PROFILE,
  zeroPdfExtractionSchema,
  zeroPdfHash,
  zeroPdfInputRefSchema,
} from "./zero-pdf-contract.js";

import { ZERO_PDF_CSV_LIMITS, zeroPdfCsvMetadataSchema, zeroPdfCsvPageSchema } from "./zero-pdf-csv-contract.js";
export { ZERO_PDF_CSV_LIMITS, zeroPdfCsvMetadataSchema, zeroPdfCsvPageSchema } from "./zero-pdf-csv-contract.js";
export class ZeroPdfCsvError extends Error {
  constructor(
    public readonly code:
      | "pdf_csv_invalid_page"
      | "pdf_csv_invalid_index"
      | "pdf_csv_table_missing"
      | "pdf_csv_unavailable"
      | "pdf_csv_limit_exceeded"
      | "pdf_csv_invalid_receipt",
  ) {
    super(code);
    this.name = "ZeroPdfCsvError";
  }
}
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const artifactSchema = z.object({
  artifactId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/u),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sha256: hash,
  content: z.string(),
}).strict();
export type ZeroPdfCsvArtifact = z.infer<typeof artifactSchema>;
const headerSchema = z.object({
  kind: z.literal("zero.pdf.receipt.v1"),
  jobId: z.string().uuid(),
  profile: z.literal(ZERO_PDF_PROFILE),
  state: z.enum(["succeeded", "failed", "blocked", "cancelled"]),
});
const succeededSchema = headerSchema.extend({
  state: z.literal("succeeded"),
  requestDigest: hash,
  inputSha256: hash,
  source: zeroPdfInputRefSchema,
  imageId: z.literal(ZERO_PDF_IMAGE),
  bundleSha256: z.literal(ZERO_PDF_BUNDLE_SHA256),
  extraction: zeroPdfExtractionSchema,
  paidModelCalls: z.literal(0),
  modelExecution: z.literal("none"),
  finishedAt: z.string().max(64).datetime({ offset: true }),
});

/** Pure projection of a receipt returned by the current scoped PDF reader, never a grant. */
export function projectZeroPdfCsv(
  artifact: ZeroPdfCsvArtifact,
  expectedJobId: string,
  tableIndex: string,
) {
  if (
    !/^(?:0|[1-9][0-9]?)$/u.test(tableIndex) ||
    Number(tableIndex) >= ZERO_PDF_CSV_LIMITS.tables
  ) throw new ZeroPdfCsvError("pdf_csv_invalid_index");
  if (typeof artifact?.content !== "string") throw new ZeroPdfCsvError("pdf_csv_invalid_receipt");
  if (Buffer.byteLength(artifact.content) > ZERO_PDF_JOB_LIMITS.artifactBytes)
    throw new ZeroPdfCsvError("pdf_csv_limit_exceeded");
  try {
    artifactSchema.parse(artifact);
    z.string().uuid().parse(expectedJobId);
    if (zeroPdfHash(artifact.content) !== artifact.sha256)
      throw new ZeroPdfCsvError("pdf_csv_invalid_receipt");
    const value: unknown = JSON.parse(artifact.content);
    const header = headerSchema.parse(value);
    if (header.jobId !== expectedJobId) throw new ZeroPdfCsvError("pdf_csv_invalid_receipt");
    if (header.state !== "succeeded") throw new ZeroPdfCsvError("pdf_csv_unavailable");
    const receipt = succeededSchema.parse(value);
    if (
      receipt.inputSha256 !== receipt.source.sha256 ||
      receipt.extraction.sourceSha256 !== receipt.source.sha256
    ) throw new ZeroPdfCsvError("pdf_csv_invalid_receipt");
    const index = Number(tableIndex), table = receipt.extraction.tables[index];
    if (!table) throw new ZeroPdfCsvError("pdf_csv_table_missing");
    const { num_rows: rowCount, num_cols: columnCount, table_cells: cells } = table.data;
    const rows = Array.from({ length: rowCount }, () => Array<string>(columnCount).fill(""));
    let rawBytes = 0;
    for (const cell of cells) {
      if (Buffer.from(cell.text, "utf8").toString("utf8") !== cell.text)
        throw new ZeroPdfCsvError("pdf_csv_invalid_receipt");
      rawBytes += Buffer.byteLength(cell.text);
      if (rawBytes > ZERO_PDF_CSV_LIMITS.csvBytes)
        throw new ZeroPdfCsvError("pdf_csv_limit_exceeded");
      rows[cell.start_row_offset_idx]![cell.start_col_offset_idx] = cell.text;
    }
    const csv = rows.map((row) => row.length === 1 && row[0] === "" ? '""' : csvFormatRows([row])).join("\n");
    const bytes = Buffer.byteLength(csv);
    if (bytes > ZERO_PDF_CSV_LIMITS.csvBytes)
      throw new ZeroPdfCsvError("pdf_csv_limit_exceeded");
    return {
      csv,
      metadata: zeroPdfCsvMetadataSchema.parse({
        profile: ZERO_PDF_PROFILE,
        sourceSha256: receipt.source.sha256,
        receipt: {
          artifactId: artifact.artifactId,
          revision: artifact.revision,
          sha256: artifact.sha256,
        },
        csv: { sha256: zeroPdfHash(csv), bytes, encoding: "utf-8" as const, delimiter: "," as const, lineTerminator: "\n" as const },
        table: {
          index,
          count: receipt.extraction.tables.length,
          rows: rowCount,
          columns: columnCount,
          provenance: table.provenance,
        },
      }),
    };
  } catch (error) {
    if (error instanceof ZeroPdfCsvError) throw error;
    throw new ZeroPdfCsvError("pdf_csv_invalid_receipt");
  }
}
export type ZeroPdfCsvProjection = ReturnType<typeof projectZeroPdfCsv>;

export function projectZeroPdfCsvPage(
  artifact: ZeroPdfCsvArtifact,
  expectedJobId: string,
  tableIndex: string,
  offset: number,
  limit: number,
) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > ZERO_PDF_CSV_LIMITS.pageBytes)
    throw new ZeroPdfCsvError("pdf_csv_invalid_page");
  const projection = projectZeroPdfCsv(artifact, expectedJobId, tableIndex);
  const bytes = Buffer.from(projection.csv);
  if (offset > bytes.length) throw new ZeroPdfCsvError("pdf_csv_invalid_page");
  const end = Math.min(offset + limit, bytes.length);
  return zeroPdfCsvPageSchema.parse({
    metadata: projection.metadata,
    totalBytes: bytes.length,
    offset,
    nextOffset: end < bytes.length ? end : null,
    encoding: "base64",
    contentBase64: bytes.subarray(offset, end).toString("base64"),
  });
}
