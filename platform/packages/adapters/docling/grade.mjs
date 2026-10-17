// Independent, frozen-truth validator. Never derives expected values from model output.
export function decimalCell(text) {
  if (typeof text !== "string" || text.length > 64) return null;
  let value = text.trim();
  if (/^\(\d[\d,]*(?:\.\d+)?\)$/.test(value)) value = `-${value.slice(1, -1)}`;
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value)) return null;
  const [integer, fraction = ""] = value.replaceAll(",", "").split(".");
  const negative = integer.startsWith("-");
  const whole = integer.replace("-", "").replace(/^0+(?=\d)/, "");
  const decimals = fraction.replace(/0+$/, "");
  const canonical = whole + (decimals ? `.${decimals}` : "");
  return (negative && canonical !== "0" ? "-" : "") + canonical;
}
function normalizedBox(prov) {
  const b = prov?.bbox;
  if (!b || ![b.l, b.r, b.t, b.b].every(Number.isFinite)) return null;
  if (b.coord_origin === "BOTTOMLEFT") return { left: b.l, right: b.r, bottom: b.b, top: b.t };
  if (b.coord_origin === "TOPLEFT")
    return { left: b.l, right: b.r, bottom: 792 - b.b, top: 792 - b.t };
  return null;
}
export function gradePdfFixture(expected, actual) {
  const errors = [];
  if (actual?.state !== "completed")
    return { pass: false, errors: ["conversion_not_completed"], numericCells: 0 };
  if (actual.inputSha256 !== expected.sha256) errors.push("input_hash_mismatch");
  if (actual.pages !== expected.pages.length) errors.push("page_count_mismatch");
  if (!Array.isArray(actual.tables) || actual.tables.length > 32)
    return { pass: false, errors: ["table_schema_invalid"], numericCells: 0 };
  if (
    actual.tables.some(
      (t) =>
        !t ||
        !Array.isArray(t.provenance) ||
        t.provenance.length > 5 ||
        t.provenance.some((p) => !p || !Number.isInteger(p.page_no)) ||
        !t.data ||
        !Array.isArray(t.data.table_cells) ||
        t.data.table_cells.length > 512 ||
        t.data.table_cells.some((c) => !c || typeof c.text !== "string" || c.text.length > 4096),
    )
  )
    return { pass: false, errors: ["table_schema_invalid"], numericCells: 0 };
  if (actual.tables.length !== expected.provenance.length) errors.push("table_count_mismatch");
  let numericCells = 0;
  const used = new Set();
  for (const provenance of expected.provenance) {
    const wanted = expected.pages[provenance.page - 1].tables[provenance.table];
    const index = actual.tables.findIndex(
      (table, candidate) =>
        !used.has(candidate) &&
        table.provenance?.some((p) => {
          const box = normalizedBox(p);
          // Fixed 12-point tolerance on the letter-size synthetic corpus, declared before runtime.
          return (
            p.page_no === provenance.page &&
            box &&
            ["left", "right", "bottom", "top"].every(
              (k) => Math.abs(box[k] - provenance.bbox[k]) <= 12,
            )
          );
        }),
    );
    if (index < 0) {
      errors.push(`table_provenance_missing:${provenance.page}:${provenance.table}`);
      continue;
    }
    used.add(index);
    const table = actual.tables[index].data;
    const cells = table?.table_cells;
    if (
      !Array.isArray(cells) ||
      cells.length > 512 ||
      table.num_rows !== wanted.rows.length + 1 ||
      table.num_cols !== wanted.headers.length
    ) {
      errors.push(`table_shape_mismatch:${provenance.page}:${provenance.table}`);
      continue;
    }
    for (const number of wanted.numbers) {
      const cell = cells.filter(
        (c) =>
          c.start_row_offset_idx === number.row + 1 &&
          c.end_row_offset_idx === number.row + 2 &&
          c.start_col_offset_idx === number.column &&
          c.end_col_offset_idx === number.column + 1,
      );
      if (cell.length !== 1 || decimalCell(cell[0].text) !== decimalCell(number.decimal))
        errors.push(
          `numeric_mismatch:${provenance.page}:${provenance.table}:${number.row}:${number.column}`,
        );
      else numericCells++;
    }
  }
  return { pass: errors.length === 0, errors, numericCells };
}
