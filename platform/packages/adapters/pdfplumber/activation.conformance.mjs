import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { preparePdfCpuProfile } from "../../../scripts/zero-pdf-cpu-prepare.mjs";
import { runPdfCpuSpike } from "../../../scripts/zero-pdf-cpu-spike.mjs";

for (const script of ["zero-pdfplumber-prepare.mjs", "zero-pdfplumber-spike.mjs"])
  test(`${script} cannot download or start Docker through default/wrong flags`, () => {
    for (const args of [[], ["--help"], ["--prepare", "--run"]]) {
      const child = spawnSync(
        process.execPath,
        [fileURLToPath(new URL(`../../../scripts/${script}`, import.meta.url)), ...args],
        { env: { PATH: "" }, encoding: "utf8", timeout: 3000 },
      );
      assert.equal(child.status, 2, child.stderr);
      const output = JSON.parse(child.stdout);
      assert.equal(output.state, "blocked");
      assert.equal(output.defaultDownloads, 0);
    }
  });
test("shared harness accepts only the two frozen PDF candidates", async () => {
  for (const key of ["../docling", "unknown", "", null]) {
    await assert.rejects(preparePdfCpuProfile(key), /PDF_PROFILE_UNSUPPORTED/);
    await assert.rejects(runPdfCpuSpike(key), /PDF_PROFILE_UNSUPPORTED/);
  }
});
