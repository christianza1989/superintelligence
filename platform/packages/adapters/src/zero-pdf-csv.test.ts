import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ZERO_PDF_BUNDLE_SHA256,
  ZERO_PDF_IMAGE,
  ZERO_PDF_JOB_LIMITS,
  ZERO_PDF_PROFILE,
} from "./zero-pdf-contract.js";
import { projectZeroPdfCsv, projectZeroPdfCsvPage, ZERO_PDF_CSV_LIMITS, zeroPdfCsvMetadataSchema, zeroPdfCsvPageSchema } from "./zero-pdf-csv.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const jobId = "11111111-1111-4111-8111-111111111111";
const sourceSha = "a".repeat(64);
function table(rows: string[][], page = 1) {
  return {
    data: {
      num_rows: rows.length,
      num_cols: rows[0]!.length,
      table_cells: rows.flatMap((row, y) => row.map((text, x) => ({
        text,
        start_row_offset_idx: y,
        end_row_offset_idx: y + 1,
        start_col_offset_idx: x,
        end_col_offset_idx: x + 1,
        bbox: { l: x * 100, t: y * 100, r: (x + 1) * 100, b: (y + 1) * 100, coord_origin: "TOPLEFT" },
      }))).reverse(),
    },
    provenance: [{ page_no: page, bbox: { l: 0, t: 0, r: rows[0]!.length * 100, b: rows.length * 100, coord_origin: "TOPLEFT" } }],
  };
}
function receipt(rows = [["name", "value"], ["fixture", "001"]]) {
  return {
    kind: "zero.pdf.receipt.v1", jobId, profile: ZERO_PDF_PROFILE, state: "succeeded",
    requestDigest: "b".repeat(64), inputSha256: sourceSha,
    source: { artifactId: "input-fixture", sha256: sourceSha, bytes: 1000 },
    imageId: ZERO_PDF_IMAGE, bundleSha256: ZERO_PDF_BUNDLE_SHA256,
    extraction: { profile: ZERO_PDF_PROFILE, sourceSha256: sourceSha, pages: 1, tables: [table(rows)] },
    paidModelCalls: 0, modelExecution: "none", finishedAt: "2026-10-20T12:00:00.000Z",
  };
}
function artifact(value = receipt()) {
  const content = JSON.stringify(value);
  return { artifactId: "receipt-fixture", revision: 3, sha256: hash(content), content };
}
const denied = (run: () => unknown, code: string) =>
  expect(run).toThrowError(expect.objectContaining({ name: "ZeroPdfCsvError", code }));

describe("authenticated PDF receipt CSV projection", () => {
  it("preserves literal cells, quotes, CR/LF, blanks, Unicode and numeric strings in coordinate order", () => {
    const input = artifact(receipt([
      ["name", "001", "1.20", "(4)"],
      ["one,two", 'say "yes"', "line\nbreak", "=SUM(A1:A2)"],
      ["", "-0", "café", "carriage\rreturn"],
    ]));
    const original = structuredClone(input);
    const result = projectZeroPdfCsv(input, jobId, "0");
    const expected = 'name,001,1.20,(4)\n"one,two","say ""yes""","line\nbreak",=SUM(A1:A2)\n,-0,café,"carriage\rreturn"';
    expect(result.csv).toBe(expected);
    expect(result.metadata).toEqual({
      profile: ZERO_PDF_PROFILE, sourceSha256: sourceSha,
      receipt: { artifactId: "receipt-fixture", revision: 3, sha256: input.sha256 },
      csv: { sha256: hash(expected), bytes: Buffer.byteLength(expected), encoding: "utf-8", delimiter: ",", lineTerminator: "\n" },
      table: { index: 0, count: 1, rows: 3, columns: 4, provenance: [{ page_no: 1, bbox: { l: 0, t: 0, r: 400, b: 300, coord_origin: "TOPLEFT" } }] },
    });
    expect(input).toEqual(original);
  });

  it("keeps single empty fields and trailing blank rows explicit in CSV", () => {
    expect(projectZeroPdfCsv(artifact(receipt([[""], ["000"], [""]])), jobId, "0").csv).toBe('""\n000\n""');
  });

  it("selects only the requested table and carries its own page provenance", () => {
    const value = receipt();
    value.extraction.pages = 2;
    value.extraction.tables.push(table([["second", "2.00"]], 2));
    const result = projectZeroPdfCsv(artifact(value), jobId, "1");
    expect(result.csv).toBe("second,2.00");
    expect(result.metadata.table).toMatchObject({ index: 1, count: 2, rows: 1, columns: 2, provenance: [{ page_no: 2 }] });
  });

  it.each(["", "-1", "00", "01", "1.0", "1e0", "32", "999999999999999999999", "../0", "0.csv"])(
    "rejects noncanonical or out-of-bound table index %j",
    (index) => denied(() => projectZeroPdfCsv(artifact(), jobId, index), "pdf_csv_invalid_index"),
  );
  it("distinguishes a missing table from an invalid index", () => {
    denied(() => projectZeroPdfCsv(artifact(), jobId, "1"), "pdf_csv_table_missing");
    const value = receipt(); value.extraction.tables = [];
    denied(() => projectZeroPdfCsv(artifact(value), jobId, "0"), "pdf_csv_table_missing");
  });

  it.each(["failed", "blocked", "cancelled"])("never exports a %s receipt", (state) => {
    const value = { ...receipt(), state };
    denied(() => projectZeroPdfCsv(artifact(value), jobId, "0"), "pdf_csv_unavailable");
  });

  it("rejects nonterminal, foreign-family, foreign-job and independently mismatched source bindings", () => {
    const cases = [
      { ...receipt(), state: "running" },
      { ...receipt(), kind: "zero.browser.receipt.v1" },
      { ...receipt(), jobId: "22222222-2222-4222-8222-222222222222" },
      { ...receipt(), inputSha256: "c".repeat(64) },
      { ...receipt(), source: { ...receipt().source, sha256: "c".repeat(64) } },
      { ...receipt(), extraction: { ...receipt().extraction, sourceSha256: "c".repeat(64) } },
      { ...receipt(), profile: "unqualified-profile" },
      { ...receipt(), paidModelCalls: 1 },
    ];
    for (const value of cases)
      denied(() => projectZeroPdfCsv(artifact(value as ReturnType<typeof receipt>), jobId, "0"), "pdf_csv_invalid_receipt");
  });

  it("rejects tampered receipt bytes, bad metadata, malformed JSON and invalid UTF-8 cell text", () => {
    const input = artifact();
    for (const item of [
      { ...input, content: input.content + " " },
      { ...input, revision: 0 },
      { ...input, sha256: "x".repeat(64) },
      { ...input, content: "{", sha256: hash("{") },
      { ...input, artifactId: "../foreign" },
    ]) denied(() => projectZeroPdfCsv(item, jobId, "0"), "pdf_csv_invalid_receipt");
    denied(() => projectZeroPdfCsv(artifact(receipt([["\ud800"]])), jobId, "0"), "pdf_csv_invalid_receipt");
  });

  it("independently rejects duplicated, merged, incomplete or oversized table geometry and page provenance", () => {
    const cases = Array.from({ length: 6 }, () => receipt());
    cases[0]!.extraction.tables[0]!.data.table_cells[1] = structuredClone(cases[0]!.extraction.tables[0]!.data.table_cells[0]!);
    cases[1]!.extraction.tables[0]!.data.table_cells[0]!.end_col_offset_idx += 1;
    cases[2]!.extraction.tables[0]!.data.table_cells.pop();
    cases[3]!.extraction.tables[0]!.data.num_rows = 129;
    cases[4]!.extraction.tables[0]!.provenance[0]!.page_no = 2;
    cases[5]!.extraction.tables = Array.from({ length: 33 }, () => table([["value"]]));
    for (const value of cases)
      denied(() => projectZeroPdfCsv(artifact(value), jobId, "0"), "pdf_csv_invalid_receipt");
  });

  it("rejects receipt and CSV byte overflow, including quote expansion after serialization", () => {
    const input = artifact();
    denied(() => projectZeroPdfCsv({ ...input, content: "x".repeat(ZERO_PDF_JOB_LIMITS.artifactBytes + 1) }, jobId, "0"), "pdf_csv_limit_exceeded");
    for (const cell of ["x".repeat(600), '"'.repeat(400)]) {
      const value = artifact(receipt(Array.from({ length: 16 }, () => Array<string>(32).fill(cell))));
      expect(Buffer.byteLength(value.content)).toBeLessThan(ZERO_PDF_JOB_LIMITS.artifactBytes);
      denied(() => projectZeroPdfCsv(value, jobId, "0"), "pdf_csv_limit_exceeded");
    }
  });
});
