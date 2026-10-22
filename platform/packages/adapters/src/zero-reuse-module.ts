import { readFile } from "node:fs/promises";
import { zeroReuseModules } from "@rakazo/core/zero-reuse-modules";
import type { ZeroReuseToolId } from "@rakazo/core/zero-reuse-modules";
import { zeroCsvHash } from "./zero-csv-profile.js";
import {
  zeroReuseCsvAdapter,
  ZERO_REUSE_ZIP_ADAPTER,
} from "./zero-reuse-adapters.js";

export async function prepareZeroReuseModule(toolId: ZeroReuseToolId) {
  const profile = zeroReuseModules.find((module) => module.toolId === toolId);
  if (!profile) throw new Error("unsupported_module");
  const root = new URL("../reuse-sources/", import.meta.url);
  const files: { path: string; sha256: string; content: string }[] = [];
  for (const pin of profile.sourceFiles) {
    const bytes = await readFile(
      new URL(`${profile.sourceDirectory}/${pin.path}`, root),
    );
    if (bytes.byteLength !== pin.bytes || zeroCsvHash(bytes) !== pin.sha256)
      throw new Error("module_source_mismatch");
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const relative =
      profile.name === "papaparse" && pin.path === "papaparse.min.js"
        ? "papaparse.cjs"
        : profile.name === "fflate" && pin.path === "umd/index.js"
          ? "fflate.cjs"
          : pin.path;
    files.push({
      path: `vendor/${profile.name}/${relative}`,
      sha256: pin.sha256,
      content,
    });
  }
  const add = (path: string, content: string) =>
    files.push({ path, content, sha256: zeroCsvHash(content) });
  if (profile.name === "d3-dsv")
    add("vendor/d3-dsv/package.json", '{"type":"module","private":true}\n');
  add(
    profile.capability === "csv" ? "csv-adapter.mjs" : "zip-adapter.mjs",
    profile.capability === "csv"
      ? zeroReuseCsvAdapter(profile.name === "d3-dsv" ? "d3" : "papaparse")
      : ZERO_REUSE_ZIP_ADAPTER,
  );
  const module = {
    profileId: profile.profileId,
    toolId,
    capability: profile.capability,
    repository: profile.repo,
    version: profile.version,
    sourceRevision: profile.sourceRevision,
    npmIntegrity: profile.npmIntegrity,
    license: profile.license,
    entrypoint: profile.entrypoint,
    files,
    limitations: [
      "Pinned reviewed source module; host integration and application quality require separate checks",
      profile.description,
    ],
  };
  if (Buffer.byteLength(JSON.stringify(module)) > 80 * 1024)
    throw new Error("module_artifact_limit");
  return module;
}
export type ZeroPreparedReuseModule = Awaited<
  ReturnType<typeof prepareZeroReuseModule>
>;
