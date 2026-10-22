import data from "./zero-reuse-modules.data.json" with { type: "json" };

export const ZERO_REUSE_TOOL_IDS = [
  "module.csv.d3",
  "module.csv.papaparse",
  "module.zip.fflate",
] as const;
export type ZeroReuseToolId = (typeof ZERO_REUSE_TOOL_IDS)[number];
export const ZERO_REUSE_MODULE_LIMITS = Object.freeze({
  csvBytes: 16384,
  csvRows: 512,
  csvColumns: 64,
  csvCellChars: 4096,
  zipFiles: 32,
  zipInputBytes: 131072,
  zipOutputBytes: 196608,
});

/** Reviewed file-level source overlay. The historical repository catalog is immutable. */
export const zeroReuseModules = data.modules.map((module) => ({
  ...module,
  toolId: module.toolId as ZeroReuseToolId,
  capability: module.capability as "csv" | "zip",
  profileId: `${module.name}-${module.version}/${module.capability}-component-v1`,
  entrypoint:
    module.capability === "csv"
      ? "csv-adapter.mjs#parseCsv"
      : "zip-adapter.mjs#createZip",
  description:
    module.capability === "csv"
      ? `Prepare a synchronous strict comma-separated CSV parser using ${module.repo} ${module.version}; quoted commas, doubled quotes, multiline fields, BOM and rectangular string rows. Maximum 16384 UTF-8 bytes, 512 rows, 64 columns, 4096 characters/cell. No streaming, TSV, Excel, business rules or database code. ${module.license} source; host must retain attribution.`
      : `Prepare a synchronous ZIP creation module using ${module.repo} ${module.version}. Maximum 32 named root-level files and 131072 input bytes, 196608 ZIP output bytes. No archive extraction, encryption, filesystem access or application code. ${module.license} source; host must retain attribution.`,
}));

/** Recall is separate from compatibility/authorization. Unknown constraints are never certified. */
export function discoverZeroReuseModules(query: string) {
  const text = query.toLocaleLowerCase("en-US");
  const csv = /\bcsv\b|comma[ -]separated|kableliais|kablelių/u.test(text);
  const zip =
    /\bzip\b|\barchive\b|\bcompress(?:ion|ed)?\b|archyv|suspaus/u.test(text);
  return zeroReuseModules.filter((module) =>
    module.capability === "csv" ? csv : zip,
  );
}

export function eligibleZeroReuseModules(goal: string) {
  const text = goal.toLocaleLowerCase("en-US");
  // Only remove explicit exclusions of known unsupported capabilities. Retain any
  // separate positive/ambiguous mention, and pass the original goal to Jev.
  const constraintText = text.replace(
    /\b(?:no|without)\s+(?:(?:archive|csv)\s+)?(?:streaming|streamed|tsv|excel|xlsx|semicolon|extraction|extracting|unzip|decryption|encryption|password)(?:\s*(?:,|or|and)\s*(?:streaming|streamed|tsv|excel|xlsx|semicolon|extraction|extracting|unzip|decryption|encryption|password))*/gu,
    " ",
  );
  return discoverZeroReuseModules(goal).filter((module) => {
    if (
      module.capability === "csv" &&
      /\b(?:tsv|excel|xlsx|streaming|streamed|semicolon)\b/u.test(
        constraintText,
      )
    )
      return false;
    if (
      module.capability === "zip" &&
      /\b(?:extract(?:ion|ing)?|unzip|decrypt(?:ion)?|encrypt(?:ion)?|password)\b/u.test(
        constraintText,
      )
    )
      return false;
    // Enforce explicit byte requirements in addition to the provider's bounded choice.
    for (const match of text.matchAll(
      /(\d+(?:\.\d+)?)\s*(kib|mib|gib|kb|mb|gb|bytes?)\b/gu,
    )) {
      const unit = match[2]!;
      const factor =
        unit === "kib"
          ? 1024
          : unit === "mib"
            ? 1048576
            : unit === "gib"
              ? 1073741824
              : unit === "kb"
                ? 1000
                : unit === "mb"
                  ? 1000000
                  : unit === "gb"
                    ? 1000000000
                    : 1;
      const cap =
        module.capability === "csv"
          ? ZERO_REUSE_MODULE_LIMITS.csvBytes
          : ZERO_REUSE_MODULE_LIMITS.zipInputBytes;
      if (Number(match[1]) * factor > cap) return false;
    }
    return true;
  });
}
