import { z } from "zod";

export const ZERO_PDF_CSV_LIMITS = Object.freeze({
  csvBytes: 262_144,
  pageBytes: 8192,
  tables: 32,
});
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
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

export const zeroPdfCsvMetadataSchema = z
  .object({
    profile: z.literal("pdfplumber-0.11.10-born-digital-lines-v1"),
    sourceSha256: hash,
    receipt: z
      .object({
        artifactId: z
          .string()
          .min(1)
          .max(128)
          .regex(/^[A-Za-z0-9_-]+$/u),
        revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        sha256: hash,
      })
      .strict(),
    csv: z
      .object({
        sha256: hash,
        bytes: z.number().int().min(1).max(ZERO_PDF_CSV_LIMITS.csvBytes),
        encoding: z.literal("utf-8"),
        delimiter: z.literal(","),
        lineTerminator: z.literal("\n"),
      })
      .strict(),
    table: z
      .object({
        index: z
          .number()
          .int()
          .min(0)
          .max(ZERO_PDF_CSV_LIMITS.tables - 1),
        count: z.number().int().min(1).max(ZERO_PDF_CSV_LIMITS.tables),
        rows: z.number().int().min(1).max(128),
        columns: z.number().int().min(1).max(32),
        provenance: z
          .array(
            z
              .object({
                page_no: z.number().int().min(1).max(5),
                bbox,
              })
              .strict(),
          )
          .length(1),
      })
      .strict()
      .refine((table) => table.index < table.count && table.rows * table.columns <= 512),
  })
  .strict();

export const zeroPdfCsvPageSchema = z
  .object({
    metadata: zeroPdfCsvMetadataSchema,
    totalBytes: z.number().int().min(1).max(ZERO_PDF_CSV_LIMITS.csvBytes),
    offset: z.number().int().min(0).max(ZERO_PDF_CSV_LIMITS.csvBytes),
    nextOffset: z.number().int().min(1).max(ZERO_PDF_CSV_LIMITS.csvBytes).nullable(),
    encoding: z.literal("base64"),
    contentBase64: z
      .string()
      .max(Math.ceil(ZERO_PDF_CSV_LIMITS.pageBytes / 3) * 4)
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u),
  })
  .strict()
  .superRefine((page, context) => {
    const padding = page.contentBase64.endsWith("==")
      ? 2
      : page.contentBase64.endsWith("=")
        ? 1
        : 0;
    const bytes = (page.contentBase64.length / 4) * 3 - padding;
    const end = page.offset + bytes;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const final = alphabet.indexOf(page.contentBase64.at(-padding - 1) ?? "");
    if (
      page.totalBytes !== page.metadata.csv.bytes ||
      page.offset > page.totalBytes ||
      bytes > ZERO_PDF_CSV_LIMITS.pageBytes ||
      end > page.totalBytes ||
      (padding === 2 && (final & 15) !== 0) ||
      (padding === 1 && (final & 3) !== 0) ||
      (end < page.totalBytes && (bytes === 0 || page.nextOffset !== end)) ||
      (end === page.totalBytes && page.nextOffset !== null)
    )
      context.addIssue({ code: "custom", message: "Invalid bounded CSV page" });
  });
export type ZeroPdfCsvMetadata = z.infer<typeof zeroPdfCsvMetadataSchema>;
export type ZeroPdfCsvPage = z.infer<typeof zeroPdfCsvPageSchema>;
