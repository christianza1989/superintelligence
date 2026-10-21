/**
 * Separately authored development assertions. No frozen task/prompt/truth is imported
 * or rewritten. This harness is not a G2 grader and never dispatches a model.
 */
export const ZERO_CSV_APPLICATION_HARNESS = String.raw`
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import vm from "node:vm";
const hash = (value) => createHash("sha256").update(value).digest("hex");
let raw = "";
for await (const chunk of process.stdin) { raw += chunk; if (Buffer.byteLength(raw) > 524288) throw Error("capsule_limit"); }
const { files, manifestSha256, inputSha256, nonce } = JSON.parse(raw);
const source = new Map(files.map((file) => [file.path, file.content]));
const checks = [];
const assert = (name, condition) => { checks.push({ name, passed: Boolean(condition) }); if (!condition) throw Error(name); };
const context = vm.createContext({ TextEncoder }, { codeGeneration: { strings: false, wasm: false } });
const modules = new Map();
for (const file of ["vendor/d3-dsv/src/dsv.js", "vendor/d3-dsv/src/csv.js", "app.mjs"]) {
  modules.set(file, new vm.SourceTextModule(source.get(file), { context, identifier: file }));
}
const inline = source.get("index.html").match(/<script type="module">([\s\S]*)<\/script>/);
assert("single_inline_module_build", Boolean(inline) && inline[1].indexOf("</script") === -1);
new vm.SourceTextModule(inline[1], { context, identifier: "index-inline.mjs" });
const calls = [];
await modules.get("vendor/d3-dsv/src/dsv.js").link(() => { throw Error("unexpected_import"); });
await modules.get("vendor/d3-dsv/src/dsv.js").evaluate();
await modules.get("vendor/d3-dsv/src/csv.js").link((specifier) => {
  if (specifier !== "./dsv.js") throw Error("unexpected_import");
  return modules.get("vendor/d3-dsv/src/dsv.js");
});
await modules.get("vendor/d3-dsv/src/csv.js").evaluate();
const parser = modules.get("vendor/d3-dsv/src/csv.js").namespace.csvParseRows;
const boundary = new vm.SyntheticModule(["csvParseRows"], function() {
  this.setExport("csvParseRows", (csv) => {
    const rows = parser(csv);
    calls.push({ inputSha256: hash(csv), outputSha256: hash(JSON.stringify(rows)) });
    return rows;
  });
}, { context, identifier: "pinned-parser-boundary" });
await modules.get("app.mjs").link((specifier) => {
  if (specifier !== "./vendor/d3-dsv/src/csv.js") throw Error("unexpected_import");
  return boundary;
});
await modules.get("app.mjs").evaluate();
const app = modules.get("app.mjs").namespace.createExpenseViewer();
const csv = "category,amount,note\r\nTravel,12.50,\"first, leg\"\r\nFood,7.25,lunch\r\nTravel,3.00,return\r\n";
const state = app.importCsv(csv);
assert("three_imported_rows", state.rows.length === 3);
assert("category_totals", JSON.stringify(state.totals) === JSON.stringify([{ category: "Travel", amount: "15.50" }, { category: "Food", amount: "7.25" }]));
assert("category_filter", app.snapshot("Travel").rows.length === 2);
assert("exact_crlf_export", app.exportCsv() === csv);
const decimal = "category,amount\nExact,0.10\nExact,0.20\nExact,-0.05\n";
assert("decimal_string_sum", app.importCsv(decimal).totals[0].amount === "0.25");
let refused = false;
try { app.importCsv("category,amount\nInvalid,1.001\n"); } catch { refused = true; }
assert("invalid_amount_atomic", refused && app.exportCsv() === decimal);
const hostile = "category,amount,note\nSafe,1.00,<img src=x onerror=alert(1)>\n";
assert("untrusted_cell_preserved", app.importCsv(hostile).rows[0][2] === "<img src=x onerror=alert(1)>");
assert("pinned_parser_invoked", calls.length === 4 && calls[0].inputSha256 === hash(csv));

const require = createRequire("/opt/zero-browser/entrypoint.mjs");
const { chromium } = require("playwright-core");
let browser;
const screenshots = [];
let networkAttempts = 0, pageErrors = 0;
try {
  browser = await chromium.launch({
    executablePath: "/opt/chromium/chrome-headless-shell-linux64/chrome-headless-shell",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking", "--disable-component-update", "--disable-extensions", "--disable-sync", "--no-first-run"],
  });
  for (const [name, width, height] of [["desktop", 1280, 900], ["mobile", 390, 844]]) {
    const browserContext = await browser.newContext({
      acceptDownloads: false, serviceWorkers: "block", viewport: { width, height },
      locale: "en-US", timezoneId: "UTC", colorScheme: "light", reducedMotion: "reduce",
    });
    await browserContext.route("**/*", (route) => { networkAttempts++; return route.abort(); });
    const page = await browserContext.newPage();
    page.on("pageerror", () => { pageErrors++; });
    await page.setContent('<style>html,body{margin:0;height:100%}iframe{display:block;border:0;width:100%;height:100%}</style><iframe sandbox="allow-scripts" title="Expense application"></iframe>');
    await page.locator("iframe").evaluate((frame, html) => { frame.srcdoc = html; }, source.get("index.html"));
    const frame = page.frameLocator("iframe");
    await frame.locator("#expense-rows tr").first().waitFor();
    const actualFrame = page.frames().find((candidate) => candidate !== page.mainFrame());
    assert(name + "_seed_loaded", await frame.locator("#csv-input").inputValue() !== "");
    await frame.locator("#csv-input").fill(csv);
    await frame.getByRole("button", { name: "Import CSV", exact: true }).click();
    assert(name + "_three_rows", await frame.locator("#expense-rows tr").count() === 3);
    assert(name + "_visible_totals", await frame.locator("#totals > div").evaluateAll((rows) => JSON.stringify(rows.map((row) => ({ category: row.querySelector("dt").textContent, amount: row.querySelector("dd").textContent })))) === JSON.stringify([{ category: "Travel", amount: "15.50" }, { category: "Food", amount: "7.25" }]));
    await frame.getByLabel("Category", { exact: true }).selectOption("Travel");
    assert(name + "_filtered_rows", await frame.locator("#expense-rows tr").count() === 2);
    await frame.getByRole("button", { name: "Export CSV", exact: true }).click();
    // Textarea edits normalize CRLF; the file import route must preserve original bytes.
    await frame.locator("#csv-file").setInputFiles({ name: "expenses.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await actualFrame.waitForFunction(() => document.getElementById("category").value === "" && document.querySelectorAll("#expense-rows tr").length === 3);
    await frame.getByRole("button", { name: "Export CSV", exact: true }).click();
    // DOM textarea value normalizes line endings. The source module assertion above checks exact export bytes.
    assert(name + "_export_visible", (await frame.locator("#csv-export").inputValue()).replace(/\r\n/g, "\n") === csv.replace(/\r\n/g, "\n"));
    await frame.locator("#csv-input").fill(hostile);
    await frame.getByRole("button", { name: "Import CSV", exact: true }).click();
    assert(name + "_safe_cells", await frame.locator("#expense-rows img").count() === 0 && (await frame.locator("#expense-rows").textContent()).includes("<img"));
    await frame.locator("#csv-input").fill("category,amount\nDecimal,0.10\nDecimal,0.20\n");
    await frame.getByRole("button", { name: "Import CSV", exact: true }).click();
    assert(name + "_decimal_preview", (await frame.locator("#totals").innerText()).includes("0.30"));
    assert(name + "_no_horizontal_overflow", await frame.locator("html").evaluate((html) => html.scrollWidth <= html.clientWidth));
    assert(name + "_opaque_origin", await actualFrame.evaluate(() => {
      try { void parent.document; return false; } catch { return true; }
    }));
    const png = await page.screenshot({ type: "png", fullPage: false, animations: "disabled", timeout: 3000 });
    if (png.length > 1048576) throw Error("screenshot_limit");
    screenshots.push({ viewport: name, mimeType: "image/png", bytes: png.length, sha256: hash(png), contentBase64: png.toString("base64") });
    await browserContext.close();
  }
  assert("network_effects_absent", networkAttempts === 0);
  assert("page_errors_absent", pageErrors === 0);
  process.stdout.write(JSON.stringify({
    nonce, manifestSha256, inputSha256,
    build: { kind: "native-esm-no-install", modules: modules.size + 1, outcome: "pass" },
    checks, screenshots,
    actualUse: { scope: "fixed-source-module-import-boundary", entrypoint: "csvParseRows", calls },
    runtime: { node: process.versions.node, chromium: browser.version(), networkAttempts, pageErrors },
    limitations: ["Visible deterministic development assertions; not an independent holdout or G2 grader", "Parser invocation instrumentation is honest fixed-recipe evidence, not adversarial same-VM attestation", "Browser preview is the hash-bound index in an opaque allow-scripts iframe; no authenticated product origin is used"],
  }));
} finally { await browser?.close(); }
`;
