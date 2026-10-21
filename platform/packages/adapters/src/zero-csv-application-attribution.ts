import { readFile } from "node:fs/promises";
declare const ZERO_RUNTIME_BUNDLED: boolean;
/** Installed repository attribution only. No request or operator-supplied file/text is accepted. */
export async function loadZeroCsvApplicationAttribution() {
  const bundled = typeof ZERO_RUNTIME_BUNDLED !== "undefined" && ZERO_RUNTIME_BUNDLED;
  try {
    const license = await readFile(
      new URL(bundled ? "../LICENSE" : "../../../../LICENSE", import.meta.url),
      "utf8",
    );
    const notice = await readFile(
      new URL(bundled ? "../NOTICE" : "../../../../NOTICE", import.meta.url),
      "utf8",
    );
    if (
      !license.startsWith("Apache License\nVersion 2.0") ||
      !notice.trim() ||
      Buffer.byteLength(license + notice) > 32_768
    )
      throw new Error("invalid");
    return { license, notice };
  } catch {
    throw new Error("application_installed_attribution_unavailable");
  }
}
