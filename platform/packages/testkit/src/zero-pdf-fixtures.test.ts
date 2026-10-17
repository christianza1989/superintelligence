import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  renderZeroPdfFixture,
  ZERO_PDF_FIXTURES,
  zeroPdfFixtureManifest,
} from "./zero-pdf-fixtures.js";

const folder = new URL("../fixtures/pdf-born-digital-v1/", import.meta.url);
describe("frozen born-digital PDF fixtures before Docling execution", () => {
  it("has ten immutable synthetic inputs, eleven pages/tables and 56 expected numeric cells", async () => {
    const manifest = JSON.parse(await readFile(new URL("manifest.json", folder), "utf8"));
    expect(zeroPdfFixtureManifest()).toEqual(manifest);
    expect(manifest.fixtures).toHaveLength(10);
    expect(ZERO_PDF_FIXTURES.reduce((n, f) => n + f.pages.length, 0)).toBe(11);
    expect(
      manifest.fixtures.reduce(
        (n: number, f: { provenance: unknown[] }) => n + f.provenance.length,
        0,
      ),
    ).toBe(11);
    expect(
      ZERO_PDF_FIXTURES.flatMap((f) => f.pages)
        .flatMap((p) => p.tables)
        .flatMap((t) => t.numbers),
    ).toHaveLength(56);
    expect(manifest.fixtures.at(-1).pages[0].tables).toEqual([]);
  });
  it.each(ZERO_PDF_FIXTURES)(
    "reproduces $id byte-for-byte and validates PDF object/stream offsets",
    async (fixture) => {
      const bytes = renderZeroPdfFixture(fixture);
      expect(bytes).toEqual(await readFile(new URL(`${fixture.id}.pdf`, folder)));
      expect(bytes.byteLength).toBeLessThan(1024 * 1024);
      const text = bytes.toString("ascii");
      expect(text.startsWith("%PDF-1.4\n")).toBe(true);
      const xref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)![1]);
      expect(text.slice(xref, xref + 5)).toBe("xref\n");
      const lines = text.slice(xref).split("\n");
      const count = Number(lines[1]!.split(" ")[1]);
      for (let id = 1; id < count; id++) {
        const offset = Number(lines[id + 2]!.slice(0, 10));
        expect(text.slice(offset).startsWith(`${id} 0 obj\n`)).toBe(true);
      }
      for (const match of text.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g))
        expect(Buffer.byteLength(match[2]!)).toBe(Number(match[1]));
    },
  );
  it("freezes numeric truth independently of any model output and gives every table page provenance", () => {
    const decimal = (text: string) => {
      const value = text.replaceAll(",", "").replace(/^\((.+)\)$/, "-$1");
      if (!/^-?\d+(\.\d+)?$/.test(value)) throw new Error("Invalid fixture numeric cell");
      return Number(value);
    };
    for (const fixture of ZERO_PDF_FIXTURES)
      for (const [pageIndex, page] of fixture.pages.entries())
        for (const table of page.tables) {
          expect(pageIndex + 1).toBeLessThanOrEqual(5);
          for (const expected of table.numbers)
            expect(decimal(table.rows[expected.row]![expected.column]!)).toBe(
              decimal(expected.decimal),
            );
          expect(table.rows.every((row) => row.length === table.headers.length)).toBe(true);
          expect(table.top - (table.rows.length + 1) * 28).toBeGreaterThan(48);
        }
  });
});
