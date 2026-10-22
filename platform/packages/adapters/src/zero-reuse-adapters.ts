/** Maintained wrappers, not generated application code. Upstream source stays byte-identical. */
const csvValidation = String.raw`
function strictRows(text) {
  if (typeof text !== 'string' || !text || new TextEncoder().encode(text).length > 16384 || text.includes('\0')) throw Error('csv_input');
  const input = text.startsWith('\ufeff') ? text.slice(1) : text;
  if (!input) throw Error('csv_input');
  const rows = []; let row = [], field = '', state = 'start';
  const finishField = () => { if (field.length > 4096 || row.length >= 64) throw Error('csv_limit'); row.push(field); field = ''; state = 'start'; };
  const finishRow = () => { finishField(); if (rows.length >= 512 || (rows.length && row.length !== rows[0].length)) throw Error('csv_shape'); rows.push(row); row = []; };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (state === 'quoted') { if (c === '"') { if (input[i+1] === '"') { field += '"'; i++; } else state = 'closed'; } else field += c; }
    else if (c === ',') finishField();
    else if (c === '\n' || c === '\r') { if (c === '\r') { if (input[i+1] !== '\n') throw Error('csv_cr'); i++; } finishRow(); }
    else if (c === '"' && state === 'start') state = 'quoted';
    else { if (state === 'closed' || c === '"') throw Error('csv_quote'); state = 'plain'; field += c; }
    if (field.length > 4096) throw Error('csv_limit');
  }
  if (state === 'quoted') throw Error('csv_quote');
  if (state !== 'start' || field || row.length || !rows.length) finishRow();
  return { input, rows };
}
export function parseCsv(text) {
  const { input, rows: expected } = strictRows(text);
  const actual = parseVendor(input);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('csv_vendor_mismatch');
  return actual;
}
`;

export function zeroReuseCsvAdapter(vendor: "d3" | "papaparse") {
  const imports =
    vendor === "d3"
      ? `import { csvParseRows } from './vendor/d3-dsv/src/csv.js';\nconst parseVendor = input => csvParseRows(input);\n`
      : `import Papa from './vendor/papaparse/papaparse.cjs';\nconst parseVendor = input => { const result = Papa.parse(input, { delimiter: ',', skipEmptyLines: false, dynamicTyping: false }); if (result.errors.length) throw Error('csv_vendor_error'); if (input.endsWith('\\n')) result.data.pop(); return result.data; };\n`;
  return imports + csvValidation;
}

export const ZERO_REUSE_ZIP_ADAPTER = String.raw`import fflate from './vendor/fflate/fflate.cjs';
export function createZip(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw Error('zip_input');
  const names = Object.keys(files);
  if (!names.length || names.length > 32) throw Error('zip_count');
  const input = Object.create(null); let total = 0;
  for (const name of names) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(name) || name.includes('..')) throw Error('zip_name');
    const value = typeof files[name] === 'string' ? new TextEncoder().encode(files[name]) : files[name];
    if (!(value instanceof Uint8Array)) throw Error('zip_value');
    total += value.byteLength; if (total > 131072) throw Error('zip_limit'); input[name] = value;
  }
  const output = fflate.zipSync(input, { level: 6 });
  if (output.byteLength > 196608) throw Error('zip_limit');
  return output;
}
`;
