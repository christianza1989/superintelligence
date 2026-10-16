/** Trusted, bounded semantic UI contract. Never forward page text or browser errors. */
const assert = require("node:assert/strict");
const { chromium } = require("/browserdeps/playwright-core");
const origin = "http://127.0.0.1:38641";
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];
const result = { version: 1, status: "failed", browserVersion: null, failedCheck: "browser_start", checks: {}, captures: [] };
let browser;
async function api(route) {
  const response = await fetch(origin + route, { redirect: "error", signal: AbortSignal.timeout(2000) });
  assert.equal(response.status, 200);
  const text = await response.text(); assert.ok(text.length <= 65536);
  return JSON.parse(text);
}
async function ready() {
  const deadline = Date.now() + 10000;
  do {
    try { if ((await api("/api/health")).ok === true) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw Error("health_deadline");
}
async function tabTo(page, locator) {
  assert.equal(await locator.count(), 1, "one accessible control is required");
  for (let i = 0; i < 40; i++) {
    if (await locator.evaluate(element => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw Error("control_not_keyboard_reachable");
}
async function taskByTitle(title, status) {
  const deadline = Date.now() + 5000;
  do {
    const tasks = (await api("/api/tasks?q=" + encodeURIComponent(title))).tasks;
    const found = tasks.find(task => task.title === title && task.status === status);
    if (found) return found;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw Error("api_did_not_confirm_ui_action");
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
}
(async () => {
  await ready();
  browser = await chromium.launch({
    executablePath: "/browser/chromium/chromium", headless: true, chromiumSandbox: false,
    env: { ...process.env, HOME: "/tmp", LD_LIBRARY_PATH: "/browser/lib", FONTCONFIG_FILE: "/browser/fonts.conf" },
    args: ["--disable-gpu", "--disable-background-networking", "--disable-component-update", "--no-first-run"],
    timeout: 15000,
  });
  result.browserVersion = browser.version();
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height },
      serviceWorkers: "block", permissions: [], acceptDownloads: false });
    let jsErrors = 0, consoleErrors = 0, blockedRequests = 0, popups = 0;
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { blockedRequests++; return route.abort(); }
      if (url.pathname === "/favicon.ico") return route.fulfill({ status: 204, body: "" });
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    page.on("pageerror", () => { jsErrors++; });
    page.on("console", message => { if (message.type() === "error") consoleErrors++; });
    page.on("popup", popup => { popups++; void popup.close(); });
    const checks = result.checks[viewport.name] = {};
    result.failedCheck = `${viewport.name}_load`;
    const response = await page.goto(origin, { waitUntil: "networkidle", timeout: 15000 });
    assert.equal(response.status(), 200);
    for (const name of ["Todo", "In progress", "Done"])
      assert.equal(await page.getByRole("heading", { name, exact: true }).count(), 1);
    checks.load = true;
    result.failedCheck = `${viewport.name}_layout`;
    await noOverflow(page); checks.noHorizontalOverflow = true;
    const marker = `browser-${viewport.name}-${Date.now()}`;
    result.failedCheck = `${viewport.name}_keyboard_create`;
    const title = page.getByRole("textbox", { name: /^(?:task )?title$/i });
    await tabTo(page, title); await page.keyboard.type(marker);
    const create = page.getByRole("button", { name: /^(?:create|add)(?: task)?$/i });
    await tabTo(page, create); await page.keyboard.press("Enter");
    const created = await taskByTitle(marker, "todo");
    const card = page.getByRole("article", { name: marker, exact: true });
    await card.waitFor({ state: "visible" }); checks.keyboardCreate = true;
    result.failedCheck = `${viewport.name}_keyboard_move`;
    const status = card.getByRole("combobox", { name: /^(?:task )?status$/i });
    await tabTo(page, status);
    await page.keyboard.press("Home"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
    const moved = await taskByTitle(marker, "doing"); assert.equal(moved.id, created.id);
    checks.keyboardMoveApiReadback = true;
    result.failedCheck = `${viewport.name}_reload`;
    await page.reload({ waitUntil: "networkidle", timeout: 10000 });
    await page.getByRole("article", { name: marker, exact: true }).waitFor({ state: "visible" });
    await taskByTitle(marker, "doing"); checks.reloadReadback = true;
    result.failedCheck = `${viewport.name}_layout_after_actions`;
    await noOverflow(page);
    result.failedCheck = `${viewport.name}_runtime_errors`;
    assert.equal(jsErrors, 0); assert.equal(consoleErrors, 0); assert.equal(blockedRequests, 0); assert.equal(popups, 0);
    checks.noJavaScriptOrConsoleErrors = true; checks.noExternalRequestsOrPopups = true;
    const capture = await page.screenshot({ type: "png", fullPage: false, animations: "disabled", timeout: 5000 });
    assert.ok(capture.length <= 512 * 1024);
    result.captures.push({ name: viewport.name, width: viewport.width, height: viewport.height, pngBase64: capture.toString("base64") });
    await context.close();
  }
  result.status = "passed"; result.failedCheck = null;
})().catch(() => { result.status = "failed"; }).finally(async () => {
  try { await browser?.close(); } catch { result.status = "failed"; result.failedCheck = "browser_cleanup"; }
  process.stdout.write(JSON.stringify(result));
  if (result.status !== "passed") process.exitCode = 1;
});
