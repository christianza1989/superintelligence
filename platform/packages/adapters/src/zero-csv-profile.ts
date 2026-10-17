import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import {
  ZERO_CSV_LIMITS,
  ZERO_CSV_PROFILE,
  ZERO_CSV_SOURCE_PINS,
} from "@rakazo/core/zero-prepared-profiles";
import { csvParseRows } from "d3-dsv";

export { ZERO_CSV_LIMITS, ZERO_CSV_PROFILE } from "@rakazo/core/zero-prepared-profiles";

// Application runtime layout is fixed by its own packager, separate from plugins.
declare const ZERO_RUNTIME_BUNDLED: boolean;

export const zeroCsvHash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

/** Independent reference decoder for this profile, not a general CSV standard claim. */
export function validateZeroCsv(csv: string): string[][] {
  if (
    !csv ||
    Buffer.byteLength(csv) > ZERO_CSV_LIMITS.inputBytes ||
    csv.includes("\0") ||
    csv.startsWith("\ufeff")
  )
    throw new Error("unsupported_csv_input");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let state: "start" | "plain" | "quoted" | "closed" = "start";
  const finishField = () => {
    if (field.length > ZERO_CSV_LIMITS.cellChars || row.length >= ZERO_CSV_LIMITS.columns)
      throw new Error("csv_limit_exceeded");
    row.push(field);
    field = "";
    state = "start";
  };
  const finishRow = () => {
    finishField();
    if (rows.length >= ZERO_CSV_LIMITS.rows || (rows.length && row.length !== rows[0]!.length))
      throw new Error("unsupported_csv_shape");
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]!;
    if (state === "quoted") {
      if (c === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else state = "closed";
      } else field += c;
    } else if (c === ",") finishField();
    else if (c === "\n" || c === "\r") {
      if (c === "\r") {
        if (csv[i + 1] !== "\n") throw new Error("unsupported_bare_cr");
        i++;
      }
      finishRow();
    } else if (c === '"' && state === "start") state = "quoted";
    else {
      if (state === "closed" || c === '"') throw new Error("malformed_csv_quote");
      state = "plain";
      field += c;
    }
    if (field.length > ZERO_CSV_LIMITS.cellChars) throw new Error("csv_limit_exceeded");
  }
  if (state === "quoted") throw new Error("unterminated_csv_quote");
  if (state !== "start" || field || row.length || !rows.length) finishRow();
  return rows;
}

export function executeZeroCsv(csv: string) {
  const reference = validateZeroCsv(csv);
  const rows = csvParseRows(csv);
  return { rows, verification: verifyZeroCsvRows(reference, rows) };
}

export function verifyZeroCsvRows(reference: string[][], actual: unknown) {
  if (!Array.isArray(actual) || JSON.stringify(reference) !== JSON.stringify(actual))
    throw new Error("csv_verification_failed");
  return {
    outcome: "pass" as const,
    verifier: "independent-strict-table-decoder-v1",
    rows: reference.length,
    columns: reference[0]!.length,
    cells: reference.reduce((count, row) => count + row.length, 0),
  };
}

/** Fixed reviewed npm source files only. Never reads paths supplied by a host/model. */
export async function prepareZeroCsvComponent() {
  const entry = createRequire(import.meta.url).resolve("d3-dsv");
  const root = path.dirname(path.dirname(entry));
  const pins = ZERO_CSV_SOURCE_PINS;
  const info = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  if (info.name !== "d3-dsv" || info.version !== "3.0.1" || info.license !== "ISC")
    throw new Error("component_pin_mismatch");
  const files = [];
  for (const [name, digest] of Object.entries(pins)) {
    const content = await readFile(path.join(root, name), "utf8");
    if (zeroCsvHash(content) !== digest) throw new Error("component_source_mismatch");
    files.push({ path: name, sha256: digest, content });
  }
  const packageContent = '{"name":"zero-prepared-csv","private":true,"type":"module"}\n';
  files.push({
    path: "package.json",
    sha256: zeroCsvHash(packageContent),
    content: packageContent,
  });
  const lock = await readFile(
    new URL(
      typeof ZERO_RUNTIME_BUNDLED !== "undefined" && ZERO_RUNTIME_BUNDLED
        ? "../pnpm-lock.yaml"
        : "../../../pnpm-lock.yaml",
      import.meta.url,
    ),
    "utf8",
  );
  if (!lock.includes("d3-dsv@3.0.1:")) throw new Error("component_lock_mismatch");
  return {
    name: "d3-dsv",
    version: "3.0.1",
    license: "ISC",
    source: "https://github.com/d3/d3-dsv",
    profile: ZERO_CSV_PROFILE,
    entrypoint: "src/csv.js#csvParseRows",
    lockfileSha256: zeroCsvHash(lock),
    files,
  };
}
