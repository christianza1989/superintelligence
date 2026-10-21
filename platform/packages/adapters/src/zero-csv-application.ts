import { createHash } from "node:crypto";
import { ZERO_CSV_PROFILE, ZERO_CSV_SOURCE_PINS } from "@rakazo/core/zero-prepared-profiles";
import {
  ZERO_CSV_APPLICATION_LIMITS,
  ZERO_CSV_APPLICATION_PROFILE,
  ZERO_CSV_APPLICATION_RECIPE,
  zeroCsvApplicationManifestSchema,
} from "./zero-csv-application-contract.js";
import {
  ZERO_CSV_EXPENSE_APP_SOURCE,
  ZERO_CSV_EXPENSE_BODY,
  ZERO_CSV_EXPENSE_STYLE,
} from "./zero-csv-application-source.js";
import type { prepareZeroCsvComponent } from "./zero-csv-profile.js";
import { validateZeroCsv } from "./zero-csv-profile.js";

type PreparedComponent = Awaited<ReturnType<typeof prepareZeroCsvComponent>>;
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const scriptImport = 'import { csvParseRows } from "./vendor/d3-dsv/src/csv.js";';
export const ZERO_CSV_APPLICATION_TRANSFORM = "fixed-inline-native-esm-v1" as const;
const escapeJson = (value: string) =>
  JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");

export type ZeroCsvApplicationWorkspace = ReturnType<typeof createZeroCsvApplicationWorkspace>;

/**
 * Fixed source recipe, no filesystem writes/build/commands or model dispatch.
 * Component and attribution arguments must come from trusted installed source.
 */
export function createZeroCsvApplicationWorkspace(
  csv: string,
  component: PreparedComponent,
  attribution: { license: string; notice: string },
) {
  if (typeof csv !== "string" || Buffer.byteLength(csv) > ZERO_CSV_APPLICATION_LIMITS.inputBytes)
    throw new Error("application_input_rejected");
  const rows = validateZeroCsv(csv);
  if (new Set(rows[0]).size !== rows[0]!.length)
    throw new Error("application_expense_header_required");
  if (rows.length < 2 || !rows[0]!.includes("category") || !rows[0]!.includes("amount"))
    throw new Error("application_expense_header_required");
  if (
    component.name !== "d3-dsv" ||
    component.version !== "3.0.1" ||
    component.license !== "ISC" ||
    component.profile !== ZERO_CSV_PROFILE ||
    component.source !== "https://github.com/d3/d3-dsv" ||
    component.entrypoint !== "src/csv.js#csvParseRows" ||
    !/^[a-f0-9]{64}$/u.test(component.lockfileSha256) ||
    !attribution.license.startsWith("Apache License\nVersion 2.0") ||
    !attribution.notice.trim() ||
    Buffer.byteLength(attribution.license + attribution.notice) > 32_768
  )
    throw new Error("application_source_rejected");
  const expectedPaths = [...Object.keys(ZERO_CSV_SOURCE_PINS), "package.json"];
  if (
    component.files.length !== expectedPaths.length ||
    new Set(component.files.map((file) => file.path)).size !== expectedPaths.length
  )
    throw new Error("application_source_rejected");
  const source = new Map<string, string>();
  for (const file of component.files) {
    if (!expectedPaths.includes(file.path) || hash(file.content) !== file.sha256)
      throw new Error("application_source_rejected");
    const expected = ZERO_CSV_SOURCE_PINS[file.path as keyof typeof ZERO_CSV_SOURCE_PINS];
    if (expected && file.sha256 !== expected) throw new Error("application_source_rejected");
    if (
      file.path === "package.json" &&
      file.content !== '{"name":"zero-prepared-csv","private":true,"type":"module"}\n'
    )
      throw new Error("application_source_rejected");
    source.set(file.path, file.content);
  }
  const dsv = source.get("src/dsv.js")!,
    csvSource = source.get("src/csv.js")!;
  const declaration = "export default function(delimiter) {";
  const dependency = 'import dsv from "./dsv.js";';
  if (
    dsv.split(declaration).length !== 2 ||
    csvSource.split(dependency).length !== 2 ||
    ZERO_CSV_EXPENSE_APP_SOURCE.split(scriptImport).length !== 2
  )
    throw new Error("application_transform_rejected");
  const script = [
    "/* d3-dsv 3.0.1, ISC. Original files and LICENSE are retained in this workspace. */",
    dsv.replace(declaration, "function dsv(delimiter) {"),
    csvSource.replace(dependency, ""),
    ZERO_CSV_EXPENSE_APP_SOURCE.replace(scriptImport, ""),
    "mountExpenseViewer(document, " + escapeJson(csv) + ");",
  ].join("\n");
  if (/<\/script/iu.test(script)) throw new Error("application_transform_rejected");
  const csp = [
    "default-src 'none'",
    "script-src 'sha256-" + createHash("sha256").update(script).digest("base64") + "'",
    "style-src 'sha256-" +
      createHash("sha256").update(ZERO_CSV_EXPENSE_STYLE).digest("base64") +
      "'",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join("; ");
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="' +
    csp.replaceAll('"', "&quot;") +
    '">' +
    "<title>Expense viewer</title><style>" +
    ZERO_CSV_EXPENSE_STYLE +
    "</style></head><body>" +
    ZERO_CSV_EXPENSE_BODY +
    '<script type="module">' +
    script +
    "</script></body></html>\n";
  const sourceLock =
    JSON.stringify(
      {
        schemaVersion: 1,
        profile: ZERO_CSV_APPLICATION_PROFILE,
        recipe: ZERO_CSV_APPLICATION_RECIPE,
        component: {
          name: component.name,
          version: component.version,
          license: component.license,
          source: component.source,
          profile: component.profile,
          lockfileSha256: component.lockfileSha256,
          files: component.files.map(({ path, sha256 }) => ({
            path: "vendor/d3-dsv/" + path,
            sha256,
          })),
          usedEntrypoint: "src/csv.js#csvParseRows",
        },
        generated: {
          applicationSourceSha256: hash(ZERO_CSV_EXPENSE_APP_SOURCE),
          styleSha256: hash(ZERO_CSV_EXPENSE_STYLE),
          bodySha256: hash(ZERO_CSV_EXPENSE_BODY),
          transform: ZERO_CSV_APPLICATION_TRANSFORM,
          inlineModuleSha256: hash(script),
        },
        attribution: {
          licenseSha256: hash(attribution.license),
          noticeSha256: hash(attribution.notice),
        },
        inputSha256: hash(csv),
        // CSV export retains imported bytes. No CSV-formatting conformance is inherited from the parser profile.
        export: "original-imported-utf8-bytes",
      },
      null,
      2,
    ) + "\n";
  const files = [
    ...component.files.map((file) => ({
      path: "vendor/d3-dsv/" + file.path,
      content: file.content,
    })),
    { path: "app.mjs", content: ZERO_CSV_EXPENSE_APP_SOURCE },
    { path: "index.html", content: html },
    { path: "source-lock.json", content: sourceLock },
    { path: "LICENSE", content: attribution.license },
    {
      path: "NOTICE",
      content:
        attribution.notice +
        "\nGenerated expense application glue is Apache-2.0. d3-dsv source remains ISC; see vendor/d3-dsv/LICENSE.\n",
    },
    {
      path: "README.md",
      content:
        '# Expense viewer\n\nOpen index.html in a browser. No installation or network access is needed.\n\nImport category/amount CSV, filter expenses, and export the exact original CSV text. Totals use integer cents. Application glue was generated by the fixed recipe; d3-dsv 3.0.1 supplies csvParseRows. See source-lock.json, LICENSE, NOTICE and vendor/d3-dsv/LICENSE.\n\nA workspace artifact alone is not a build, preview or independent test result. A verification receipt describes only its captured revision. Product embedding requires an opaque iframe with sandbox="allow-scripts"; never add allow-same-origin or use the authenticated product origin.\n',
    },
  ].sort((a, b) => a.path.localeCompare(b.path));
  const manifest = zeroCsvApplicationManifestSchema.parse({
    schemaVersion: 1,
    profile: ZERO_CSV_APPLICATION_PROFILE,
    recipe: ZERO_CSV_APPLICATION_RECIPE,
    inputSha256: hash(csv),
    sourceLockSha256: hash(sourceLock),
    files: files.map((file) => ({
      path: file.path,
      bytes: Buffer.byteLength(file.content),
      sha256: hash(file.content),
    })),
    totalBytes: files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0),
  });
  return {
    manifest,
    manifestSha256: hash(JSON.stringify(manifest)),
    files,
    preview: {
      path: "index.html",
      sha256: hash(html),
      contentSecurityPolicy: csp,
      sandbox: "allow-scripts" as const,
      origin: "opaque" as const,
    },
  };
}
