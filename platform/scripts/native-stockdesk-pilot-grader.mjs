// Controlled local development candidates only; the extension process is not a hostile-code sandbox.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile, realpath } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parserCases } from "./native-inventory-pilot-grader.mjs";
import {
  evaluateSprintDesk,
  snapshotSprintDesk,
} from "./zero-lab-evaluate.mjs";
import { evaluateSprintDeskBrowser } from "./zero-lab-browser.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)),
  fixtures = path.join(here, "fixtures/native-inventory-pilot");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const digest = (x) => createHash("sha256").update(x).digest("hex");
const csvHeader = "reference,sku,warehouse,delta,note\n";
export function stockdeskByteBoundary(size) {
  const rows = Array.from({ length: 128 }, (_, i) => [
    `BOUND-${i}`,
    "P",
    "main",
    "1",
    "",
  ]);
  let remaining =
    size -
    Buffer.byteLength(csvHeader + rows.map((r) => r.join(",")).join("\n"));
  for (const row of rows) {
    const n = Math.min(500, remaining);
    row[4] = "x".repeat(n);
    remaining -= n;
  }
  assert.equal(remaining, 0);
  const csv = csvHeader + rows.map((r) => r.join(",")).join("\n");
  assert.equal(Buffer.byteLength(csv), size);
  return csv;
}
async function port() {
  const s = net.createServer();
  await new Promise((res, rej) => {
    s.once("error", rej);
    s.listen(0, "127.0.0.1", res);
  });
  const value = s.address().port;
  await new Promise((r) => s.close(r));
  return value;
}
function killOwned(p, signal) {
  if (Number.isInteger(p.pid))
    try {
      process.kill(-p.pid, signal);
    } catch (e) {
      if (e.code !== "ESRCH") throw e;
    }
}
async function parserContract(workspace, runtime) {
  const p = spawn(
    process.execPath,
    [
      "--max-old-space-size=256",
      "--permission",
      "--allow-fs-read=*",
      path.join(fixtures, "parser-contract-worker.mjs"),
      path.join(workspace, "component/app.mjs"),
    ],
    {
      cwd: workspace,
      detached: true,
      env: {
        PATH: process.env.PATH,
        HOME: runtime,
        DB_PATH: path.join(runtime, "import.sqlite"),
        DATA_DIR: runtime,
        PORT: "0",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let text = "",
    error = "";
  p.stdout.on("data", (b) => (text = (text + b.toString()).slice(-65536)));
  p.stderr.on("data", (b) => (error = (error + b.toString()).slice(-8192)));
  const timer = setTimeout(() => killOwned(p, "SIGKILL"), 8000);
  p.stdin.end(JSON.stringify(parserCases));
  try {
    const [code] = await once(p, "exit");
    assert.equal(code, 0, error);
    const result = JSON.parse(text);
    assert.deepEqual(result.sideEffects, []);
    assert.equal(result.cases.length, parserCases.length);
    assert.ok(
      result.cases.every((c) => c.status === "pass"),
      JSON.stringify(result),
    );
    return result;
  } finally {
    clearTimeout(timer);
    killOwned(p, "SIGKILL");
  }
}
export async function gradeNativeStockDeskExtensions({ workspace, output }) {
  assert.equal(process.platform, "linux");
  workspace = await realpath(workspace);
  output = path.resolve(output);
  assert.ok(output !== workspace && !output.startsWith(workspace + path.sep));
  await mkdir(output, { recursive: true });
  const runtime = await mkdtemp(path.join(output, "extension-")),
    beforeDir = path.join(runtime, "source-before");
  await mkdir(beforeDir);
  const before = await snapshotSprintDesk(workspace, beforeDir);
  const report = {
    schema: "native-stockdesk-extensions/v1",
    sourceDigest: before.sourceDigest,
    checks: [],
    observedUse: {},
    limitations: [
      "Development cases, no hidden holdout.",
      "Extension candidate process uses the same OS user; no hostile-code or host network-isolation claim.",
      "Observed export calls and the injected fault establish only the exercised HTTP path.",
    ],
    runtime,
  };
  const check = async (id, fn) => {
    const start = performance.now();
    try {
      await fn();
      report.checks.push({
        id,
        status: "pass",
        elapsedMs: Math.round(performance.now() - start),
      });
    } catch (e) {
      report.checks.push({
        id,
        status: "fail",
        elapsedMs: Math.round(performance.now() - start),
        error: String(e.stack ?? e).slice(0, 2000),
      });
    }
  };
  let child,
    exited,
    origin,
    events = [],
    log = "";
  const stop = async () => {
    if (!child) return;
    killOwned(child, "SIGTERM");
    await Promise.race([exited, sleep(400)]);
    killOwned(child, "SIGKILL");
    await Promise.race([exited, sleep(1000)]);
    child = undefined;
  };
  const request = async (route, body) => {
    const r = await fetch(origin + route, {
      ...(body !== undefined
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
      redirect: "error",
      signal: AbortSignal.timeout(2500),
    });
    const text = await r.text();
    assert.ok(Buffer.byteLength(text) <= 262144);
    return { status: r.status, body: JSON.parse(text) };
  };
  const start = async (poison = false) => {
    const p = await port();
    origin = "http://127.0.0.1:" + p;
    child = spawn(
      process.execPath,
      [
        "--max-old-space-size=256",
        "--import",
        path.join(fixtures, "observe-loader.mjs"),
        "server.mjs",
      ],
      {
        cwd: workspace,
        detached: true,
        env: {
          PATH: process.env.PATH,
          HOME: runtime,
          DB_PATH: path.join(runtime, "candidate.sqlite"),
          DATA_DIR: runtime,
          PORT: String(p),
          PILOT_COMPONENT_URL: pathToFileURL(
            path.join(workspace, "component/app.mjs"),
          ).href,
          ...(poison ? { PILOT_POISON_PARSER: "1" } : {}),
        },
        stdio: ["ignore", "pipe", "pipe", "pipe"],
      },
    );
    exited = new Promise((resolve) => {
      child.once("error", (e) => {
        log += String(e);
        resolve();
      });
      child.once("exit", resolve);
    });
    let pending = "";
    child.stdio[3].on("data", (b) => {
      pending += b.toString();
      let i;
      while ((i = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, i);
        pending = pending.slice(i + 1);
        try {
          if (events.length < 2048) events.push(JSON.parse(line));
        } catch {}
      }
    });
    for (const s of [child.stdout, child.stderr])
      s.on("data", (b) => (log = (log + b.toString()).slice(-65536)));
    let ready = false;
    for (let end = Date.now() + 6000; Date.now() < end;) {
      try {
        const h = await request("/api/health");
        if (h.status === 200 && h.body.ok === true) {
          ready = true;
          break;
        }
      } catch {}
      await sleep(100);
    }
    assert.ok(ready, "candidate failed startup");
  };
  const timer = setTimeout(() => {
    if (child) killOwned(child, "SIGKILL");
  }, 45000);
  try {
    await check("pure-synchronous-generic-parser-contract", async () => {
      report.parserContract = await parserContract(workspace, runtime);
    });
    await check("startup", () => start());
    if (child) {
      await check("actual-csv-http-path", async () => {
        assert.equal(
          (
            await request("/api/products", {
              sku: "P",
              name: "Observer product",
              minStock: 0,
            })
          ).status,
          201,
        );
        const csv = csvHeader + 'TRACE-A,P,main,2,"line\nnext"\n';
        const preview = await request("/api/import/preview", { csv });
        assert.equal(preview.status, 200);
        assert.equal(preview.body.valid, true);
        assert.equal(
          (await request("/api/import/commit", { csv })).status,
          200,
        );
        const products = await request("/api/products");
        assert.equal(products.body.products[0].stock.main, 2);
        report.observedUse.parserExportCalls = events.filter(
          (e) => e.kind === "parser-call",
        ).length;
        assert.ok(
          report.observedUse.parserExportCalls >= 2,
          "CSV preview/commit did not exercise observed component export",
        );
      });
      const state = async () => ({
        products: (await request("/api/products")).body,
        movements: (await request("/api/movements")).body,
      });
      await check("accepts-exactly-16384-utf8-bytes-and-128-rows", async () => {
        const before = await state();
        const r = await request("/api/import/preview", {
          csv: stockdeskByteBoundary(16384),
        });
        assert.equal(r.status, 200);
        assert.equal(r.body.valid, true);
        assert.equal(r.body.rows.length, 128);
        assert.deepEqual(await state(), before);
      });
      for (const [id, csv] of [
        ["rejects-16385-bytes", stockdeskByteBoundary(16385)],
        [
          "rejects-129-data-records",
          csvHeader +
            Array.from({ length: 129 }, (_, i) => `ROW-${i},P,main,1,`).join(
              "\n",
            ),
        ],
      ])
        await check(id, async () => {
          const before = await state();
          for (const route of ["/api/import/preview", "/api/import/commit"]) {
            const r = await request(route, { csv });
            assert.equal(r.status, 400);
            assert.equal(typeof r.body.error, "string");
            assert.ok(r.body.error.trim());
            assert.deepEqual(await state(), before);
          }
        });
      await stop();
      report.observedUse.normalEvents = [...events];
      events = [];
      await check("component-fault-intercepts-real-preview", async () => {
        await start(true);
        const r = await request("/api/import/preview", {
          csv: csvHeader + "TRACE-POISON,P,main,1,\n",
        });
        report.observedUse.faultInjected = events.some(
          (e) => e.kind === "parser-poison",
        );
        assert.equal(report.observedUse.faultInjected, true);
        assert.ok(
          r.status !== 200 || r.body.valid !== true,
          "preview silently bypassed poisoned component",
        );
      });
    }
  } finally {
    await stop();
    clearTimeout(timer);
    await writeFile(path.join(runtime, "server.log"), log);
    const afterDir = path.join(runtime, "source-after");
    await mkdir(afterDir);
    await check("candidate-source-unchanged", async () =>
      assert.deepEqual(await snapshotSprintDesk(workspace, afterDir), before),
    );
  }
  report.outcome =
    report.checks.length === 8 &&
    report.checks.every((c) => c.status === "pass")
      ? "pass"
      : "fail";
  report.observedUse.faultEvents = events;
  await writeFile(
    path.join(output, "extensions.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  return report;
}
export async function gradeNativeStockDesk(input) {
  const options = {
    suite: "stockdesk-v1",
    candidatePath: input.workspace,
    trustProfile: "controlled_local_candidate",
    timeoutMs: 180000,
  };
  await mkdir(input.output, { recursive: true });
  const started = performance.now();
  const api = await evaluateSprintDesk(options);
  await writeFile(
    path.join(input.output, "api.json"),
    JSON.stringify(api, null, 2) + "\n",
  );
  const browser = await evaluateSprintDeskBrowser({
    ...options,
    artifactDirectory: path.join(input.output, "screenshots"),
  });
  await writeFile(
    path.join(input.output, "browser.json"),
    JSON.stringify(browser, null, 2) + "\n",
  );
  const extensions = await gradeNativeStockDeskExtensions(input);
  const sourceIntegrity =
    Boolean(api.sourceDigest) &&
    api.sourceDigest === browser.sourceDigest &&
    api.sourceDigest === extensions.sourceDigest;
  const report = {
    schema: "native-stockdesk-grade/v1",
    outcome:
      api.functionalStatus === "passed" &&
      api.cleanup === "passed" &&
      browser.status === "passed" &&
      browser.cleanup === "passed" &&
      sourceIntegrity &&
      extensions.outcome === "pass"
        ? "pass"
        : "fail",
    elapsedMs: Math.round(performance.now() - started),
    sourceIntegrity,
    api,
    browser,
    extensions,
  };
  await writeFile(
    path.join(input.output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  return report;
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const args = process.argv.slice(2);
  assert.equal(args.length, 2, "Pass workspace and outside output directory");
  const report = await gradeNativeStockDesk({
    workspace: args[0],
    output: args[1],
  });
  console.log(
    JSON.stringify({
      outcome: report.outcome,
      elapsedMs: report.elapsedMs,
      api: report.api.functionalStatus,
      browser: report.browser.status,
      extensions: report.extensions.outcome,
    }),
  );
  process.exitCode = report.outcome === "pass" ? 0 : 1;
}
