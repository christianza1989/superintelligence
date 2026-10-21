/** Fixed application glue. The parser import is the prepared component. */
export const ZERO_CSV_EXPENSE_APP_SOURCE = String.raw`import { csvParseRows } from "./vendor/d3-dsv/src/csv.js";

const limits = Object.freeze({ bytes: 16384, rows: 512, columns: 64, cellChars: 4096 });
function cents(value) {
  if (typeof value !== "string" || !/^-?(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,2})?$/.test(value)) {
    throw new Error("Use amounts with at most two decimal places.");
  }
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -result : result;
}
function money(value) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return (negative ? "-" : "") + String(absolute / 100n) + "." + String(absolute % 100n).padStart(2, "0");
}
export function createExpenseViewer() {
  let source = "", rows = [], headers = [], categoryColumn = -1, amountColumn = -1;
  return {
    importCsv(value) {
      if (typeof value !== "string" || !value || new TextEncoder().encode(value).length > limits.bytes ||
          value.includes("\0") || value.startsWith("\ufeff")) throw new Error("Import a CSV of up to 16 KiB.");
      const parsed = csvParseRows(value);
      const nextHeaders = parsed[0];
      if (!nextHeaders || parsed.length < 2 || parsed.length > limits.rows ||
          nextHeaders.length > limits.columns || nextHeaders.length < 2 ||
          new Set(nextHeaders).size !== nextHeaders.length ||
          parsed.some((row) => row.length !== nextHeaders.length || row.some((cell) => cell.length > limits.cellChars))) {
        throw new Error("Use a rectangular CSV with a header and expense rows.");
      }
      const category = nextHeaders.indexOf("category"), amount = nextHeaders.indexOf("amount");
      if (category < 0 || amount < 0) throw new Error("Include category and amount columns.");
      for (const row of parsed.slice(1)) {
        if (!row[category]) throw new Error("Each expense needs a category.");
        cents(row[amount]);
      }
      // Commit only after every row passes. Original CSV bytes remain the export authority.
      source = value; headers = nextHeaders.slice(); rows = parsed.slice(1).map((row) => row.slice());
      categoryColumn = category; amountColumn = amount;
      return this.snapshot();
    },
    snapshot(category = "") {
      const totals = new Map();
      for (const row of rows) totals.set(row[categoryColumn], (totals.get(row[categoryColumn]) ?? 0n) + cents(row[amountColumn]));
      return {
        headers: headers.slice(),
        rows: rows.filter((row) => !category || row[categoryColumn] === category).map((row) => row.slice()),
        totals: [...totals].map(([name, total]) => ({ category: name, amount: money(total) })),
        categories: [...totals.keys()],
      };
    },
    exportCsv() { return source; },
  };
}
export function mountExpenseViewer(doc, initialCsv) {
  const app = createExpenseViewer();
  const source = doc.getElementById("csv-input"), category = doc.getElementById("category");
  const status = doc.getElementById("status"), output = doc.getElementById("csv-export");
  const render = () => {
    const state = app.snapshot(category.value);
    const head = doc.getElementById("expense-head"), body = doc.getElementById("expense-rows");
    head.replaceChildren(); body.replaceChildren();
    const heading = doc.createElement("tr");
    for (const name of state.headers) { const cell = doc.createElement("th"); cell.scope = "col"; cell.textContent = name; heading.append(cell); }
    head.append(heading);
    for (const row of state.rows) {
      const tr = doc.createElement("tr");
      for (const value of row) { const cell = doc.createElement("td"); cell.textContent = value; tr.append(cell); }
      body.append(tr);
    }
    const totals = doc.getElementById("totals"); totals.replaceChildren();
    for (const total of state.totals) {
      const row = doc.createElement("div"), name = doc.createElement("dt"), amount = doc.createElement("dd");
      name.textContent = total.category; amount.textContent = total.amount; row.append(name, amount); totals.append(row);
    }
    status.textContent = state.rows.length + (state.rows.length === 1 ? " expense" : " expenses");
  };
  const load = (value) => {
    try {
      const state = app.importCsv(value);
      category.replaceChildren();
      for (const name of ["", ...state.categories]) {
        const option = doc.createElement("option"); option.value = name; option.textContent = name || "All categories"; category.append(option);
      }
      output.value = ""; doc.getElementById("export-region").hidden = true; render();
    } catch (error) { status.textContent = error.message; }
  };
  doc.getElementById("load-csv").addEventListener("click", () => load(source.value));
  doc.getElementById("csv-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > limits.bytes) { status.textContent = "Import a CSV of up to 16 KiB."; return; }
    try {
      const value = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      source.value = value; load(value);
    } catch { status.textContent = "Import a UTF-8 CSV file."; }
  });
  category.addEventListener("change", render);
  doc.getElementById("export-csv").addEventListener("click", () => {
    output.value = app.exportCsv(); doc.getElementById("export-region").hidden = false; output.focus(); output.select();
  });
  source.value = initialCsv; load(initialCsv);
}
`;

/** Native controls, one reading column, responsive table and no external resources. */
export const ZERO_CSV_EXPENSE_STYLE = String.raw`html{font:16px/1.5 system-ui,sans-serif;color-scheme:light dark}body{margin:0}main{max-width:72rem;margin:auto;padding:clamp(1rem,4vw,3rem)}h1{font-size:clamp(1.8rem,4vw,2.5rem);line-height:1.15;margin:0 0 2rem}h2{font-size:1.15rem;margin:2rem 0 .75rem}label{display:block;font-weight:600;margin-bottom:.5rem}textarea,select,button{font:inherit}textarea{box-sizing:border-box;width:100%;min-height:8rem;padding:.75rem;resize:vertical}button,select{min-height:44px;padding:.4rem .8rem}button{cursor:pointer}button:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid Highlight;outline-offset:3px}.actions{display:flex;gap:1rem;align-items:end;flex-wrap:wrap;margin-top:1rem}.actions label{margin:0}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;text-align:start}th,td{padding:.75rem;border-bottom:1px solid ButtonBorder;overflow-wrap:anywhere}th{font-weight:600}dl{display:flex;gap:2rem;flex-wrap:wrap;margin:0}dd{margin:0;font-size:1.3rem;font-variant-numeric:tabular-nums}#status{min-height:1.5em;margin:1rem 0}#csv-export{min-height:10rem}footer{margin-top:2rem;font-size:.875rem}@media(prefers-reduced-motion:no-preference){button{transition:opacity .15s ease-out}button:hover{opacity:.8}}`;

export const ZERO_CSV_EXPENSE_BODY = String.raw`<main>
<h1>Expense viewer</h1>
<label for="csv-file">CSV file</label><input id="csv-file" type="file" accept=".csv,text/csv">
<label for="csv-input">Expense CSV</label><textarea id="csv-input" spellcheck="false"></textarea>
<div class="actions"><button id="load-csv" type="button">Import CSV</button>
<div><label for="category">Category</label><select id="category"><option value="">All categories</option></select></div>
<button id="export-csv" type="button">Export CSV</button></div>
<p id="status" role="status" aria-live="polite"></p>
<h2>Category totals</h2><dl id="totals" aria-label="Category totals"></dl>
<h2>Expenses</h2><div class="table-wrap"><table aria-label="Expenses"><thead id="expense-head"></thead><tbody id="expense-rows"></tbody></table></div>
<section id="export-region" hidden><h2>Exported CSV</h2><label for="csv-export">Copy CSV</label><textarea id="csv-export" readonly spellcheck="false"></textarea></section>
<footer>CSV parsing: d3-dsv 3.0.1 · ISC license. Amount totals and filtering are application code.</footer>
</main>`;
