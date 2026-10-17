import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { decimalCell, gradePdfFixture } from './grade.mjs';
const manifest = JSON.parse(readFileSync(new URL('../../testkit/fixtures/pdf-born-digital-v1/manifest.json', import.meta.url)));
function output(expected) {
  const tables = expected.provenance.map(p => {
    const table = expected.pages[p.page - 1].tables[p.table];
    return { provenance: [{ page_no: p.page, bbox: { l: p.bbox.left, r: p.bbox.right, t: p.bbox.top, b: p.bbox.bottom, coord_origin: 'BOTTOMLEFT' } }], data: {
      num_rows: table.rows.length + 1, num_cols: table.headers.length,
      table_cells: [table.headers, ...table.rows].flatMap((row, y) => row.map((text, x) => ({ text, start_row_offset_idx: y, end_row_offset_idx: y + 1, start_col_offset_idx: x, end_col_offset_idx: x + 1 })))
    } };
  });
  return { state: 'completed', inputSha256: expected.sha256, pages: expected.pages.length, tables };
}
for (const fixture of manifest.fixtures) test(`truth conformance ${fixture.id}`, () => {
  const result = gradePdfFixture(fixture, output(fixture));
  assert.equal(result.pass, true);
  assert.equal(result.numericCells, fixture.pages.flatMap(p => p.tables).flatMap(t => t.numbers).length);
});
test('decimal rules preserve sign/grouping/precision without floating point', () => {
  for (const [input, expected] of [['1,234.50', '1234.5'], ['(1,234.50)', '-1234.5'], ['-0.00', '0'], ['001.2500', '1.25'], ['9007199254740993', '9007199254740993']]) assert.equal(decimalCell(input), expected);
  for (const input of ['1,23', '$2', '1e3', 'NaN', '(1,23)', '', '2026 report']) assert.equal(decimalCell(input), null);
});
test('wrong number is a failure even when conversion succeeded', () => {
  const actual = output(manifest.fixtures[0]); actual.tables[0].data.table_cells[4].text = '999';
  assert.equal(gradePdfFixture(manifest.fixtures[0], actual).pass, false);
});
test('wrong page/hash/provenance and extra table fail', () => {
  for (const mutate of [a => a.inputSha256 = '0'.repeat(64), a => a.pages = 2, a => a.tables[0].provenance[0].page_no = 2, a => a.tables.push(a.tables[0])]) {
    const actual = output(manifest.fixtures[0]); mutate(actual); assert.equal(gradePdfFixture(manifest.fixtures[0], actual).pass, false);
  }
});
test('no-table narrative cannot become a numeric extraction pass', () => {
  const fixture = manifest.fixtures[9]; const actual = output(fixture); actual.tables.push(output(manifest.fixtures[0]).tables[0]);
  assert.equal(gradePdfFixture(fixture, actual).pass, false);
});
test('blocked, failed, partial and absent runtime cannot pass', () => {
  for (const state of ['blocked', 'failed', 'partial', 'not_run', 'unknown']) assert.equal(gradePdfFixture(manifest.fixtures[0], { ...output(manifest.fixtures[0]), state }).pass, false);
  assert.equal(gradePdfFixture(manifest.fixtures[0], null).pass, false);
});
test('top-left page coordinates normalize to frozen bottom-left provenance', () => {
  const fixture = manifest.fixtures[0], actual = output(fixture), b = actual.tables[0].provenance[0].bbox;
  b.t = 792 - b.t; b.b = 792 - b.b; b.coord_origin = 'TOPLEFT'; assert.equal(gradePdfFixture(fixture, actual).pass, true);
});

test('malformed bounded table output fails closed', () => {
  for (const value of [null, {}, {provenance: {}, data: {}}, {provenance: [null], data: {table_cells: []}}, {provenance: [], data: {table_cells: [null]}}]) {
    const actual = output(manifest.fixtures[0]); actual.tables = [value]; assert.equal(gradePdfFixture(manifest.fixtures[0], actual).pass, false);
  }
});
