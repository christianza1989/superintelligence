import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  copyFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  gradeNativeStockDeskExtensions,
  stockdeskByteBoundary,
} from "./native-stockdesk-pilot-grader.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = await mkdtemp(
  path.join(
    process.env.NATIVE_STOCKDESK_QUALIFICATION_ROOT ?? tmpdir(),
    "native-stockdesk-controls-",
  ),
);

test("byte fixtures exercise valid business rows at both sides of the limit", () => {
  for (const size of [16384, 16385]) {
    const csv = stockdeskByteBoundary(size);
    assert.equal(Buffer.byteLength(csv), size);
    const rows = csv
      .trimEnd()
      .split("\n")
      .slice(1)
      .map((s) => s.split(","));
    assert.equal(rows.length, 128);
    assert.ok(rows.every((r) => r.length === 5 && r[4].length <= 500));
  }
});
for (const mode of ["none", "no-byte-limit", "no-row-limit", "bypass"])
  test(
    "qualified native extension control: " + mode,
    { timeout: 60000 },
    async () => {
      const base = path.join(root, mode),
        workspace = path.join(base, "app"),
        output = path.join(base, "evidence");
      await mkdir(path.join(workspace, "component"), { recursive: true });
      let source = await readFile(
        path.join(here, "../packages/testkit/fixtures/stockdesk/server.mjs"),
        "utf8",
      );
      assert.ok(source.includes("function parseCSV(value)"));
      source = source.replace(
        "function parseCSV(value)",
        "function originalParseCSV(value)",
      );
      const wrapper = `\nfunction parseCSV(value){
 ${mode === "no-byte-limit" ? "" : "if(typeof value==='string'&&Buffer.byteLength(value)>16384)fail(400,'CSV byte limit');"}
 const rows=originalParseCSV(value);
 ${mode === "no-row-limit" ? "" : "if(rows.length>129)fail(400,'CSV row limit');"}
 ${mode === "bypass" ? "return rows;" : `const cell=v=>/[",\\r\\n]/.test(v)?'"'+v.replaceAll('"','""')+'"':v;try{return parseCsv(rows.map(r=>r.map(cell).join(',')).join('\\n'));}catch{fail(400,'Malformed CSV');}`}
 }\n`;
      source =
        "import {parseCsv} from './component/app.mjs';\n" + source + wrapper;
      await writeFile(path.join(workspace, "server.mjs"), source);
      await copyFile(
        path.join(here, "../packages/testkit/fixtures/stockdesk/ui.html"),
        path.join(workspace, "ui.html"),
      );
      await copyFile(
        path.join(here, "fixtures/native-inventory-pilot/strict.mjs"),
        path.join(workspace, "component/strict.mjs"),
      );
      await writeFile(
        path.join(workspace, "component/app.mjs"),
        "export {strictParse as parseCsv} from './strict.mjs';\n",
      );
      await writeFile(
        path.join(workspace, "package.json"),
        JSON.stringify({
          type: "module",
          scripts: { start: "node server.mjs" },
        }),
      );
      const report = await gradeNativeStockDeskExtensions({
        workspace,
        output,
      });
      if (mode === "none") {
        assert.equal(report.outcome, "pass", JSON.stringify(report.checks));
        assert.ok(report.observedUse.parserExportCalls >= 2);
        assert.equal(report.observedUse.faultInjected, true);
      } else {
        assert.equal(report.outcome, "fail");
        const name =
          mode === "no-byte-limit"
            ? "rejects-16385-bytes"
            : mode === "no-row-limit"
              ? "rejects-129-data-records"
              : "actual-csv-http-path";
        assert.equal(
          report.checks.find((c) => c.id === name)?.status,
          "fail",
          JSON.stringify(report.checks),
        );
      }
    },
  );
