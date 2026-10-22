#!/usr/bin/env node
// Development-case grader. This is not a hostile-code sandbox or a hidden holdout.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SPEC_SHA256 = 'cb0fdd354e81b6180e7689f81b961402eb6d819c282f275b942787ecb2d290e1';
export const PROMPT_SHA256 = '475c51d5ec4c1f88c06946c40e36c73f920a636ffc65a308d690eee87af2beee';
const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, 'fixtures/native-inventory-pilot');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const shortError = (error) => String(error?.stack ?? error).slice(0, 4000);
const pickedRows = (rows) => rows.map(({ sku, name, quantity }) => ({ sku, name, quantity }));
const sortRows = (rows) => [...rows].sort((a, b) => Buffer.compare(Buffer.from(a.sku), Buffer.from(b.sku)));
const csv = (rows) => `sku,name,quantity\n${rows.map((row) => row.map((cell) => {
  const text = String(cell);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}).join(',')).join('\n')}`;

export const parserCases = [
  { id: 'basic', text: 'sku,name,quantity\n001,Widget,2', rows: [['sku', 'name', 'quantity'], ['001', 'Widget', '2']] },
  { id: 'crlf-final', text: 'a,b\r\nx,y\r\n', rows: [['a', 'b'], ['x', 'y']] },
  { id: 'quoted', text: 'a,b\n"x,y","a""b"', rows: [['a', 'b'], ['x,y', 'a"b']] },
  { id: 'multiline-preserved', text: 'a,b\r\n"x\r\ny","z\nw"', rows: [['a', 'b'], ['x\r\ny', 'z\nw']] },
  { id: 'empty-fields', text: 'a,b\n,', rows: [['a', 'b'], ['', '']] },
  { id: 'unclosed', text: 'a,b\n"x,y', invalid: true },
  { id: 'quote-in-unquoted', text: 'a,b\nx"y,z', invalid: true },
  { id: 'after-close', text: 'a,b\n"x"z,y', invalid: true },
  { id: 'space-after-close', text: 'a,b\n"x" ,y', invalid: true },
  { id: 'bare-cr', text: 'a,b\nx,y\r', invalid: true },
  { id: 'ragged-short', text: 'a,b\nx', invalid: true },
  { id: 'ragged-long', text: 'a,b\nx,y,z', invalid: true },
  { id: 'extra-empty-record', text: 'a,b\nx,y\n\n', invalid: true },
];

export function exactSizeCsv(size) {
  return csv(exactSizeRows(size));
}

function exactSizeRows(size) {
  const rows = Array.from({ length: 17 }, (_, i) => [`B${String(i).padStart(2, '0')}`, 'x', '0']);
  let remaining = size - Buffer.byteLength(csv(rows));
  for (const row of rows) {
    const extra = Math.min(999, remaining);
    row[1] += 'x'.repeat(extra);
    remaining -= extra;
  }
  assert.equal(remaining, 0, 'requested boundary fixture cannot fit the name limit');
  const text = csv(rows);
  assert.equal(Buffer.byteLength(text), size);
  return rows;
}

export function invalidCases() {
  return [
    ['header-order', 'name,sku,quantity\nx,A,1'],
    ['header-case', 'SKU,name,quantity\nA,x,1'],
    ['header-space', 'sku, name,quantity\nA,x,1'],
    ['header-only', 'sku,name,quantity\n'],
    ['empty', ''],
    ['double-bom', '\uFEFF\uFEFFsku,name,quantity\nA,x,1'],
    ['missing-column', 'sku,name,quantity\nA,x'],
    ['extra-column', 'sku,name,quantity\nA,x,1,z'],
    ['empty-record', 'sku,name,quantity\nA,x,1\n\n'],
    ['bare-cr', 'sku,name,quantity\rA,x,1'],
    ['unclosed', 'sku,name,quantity\nA,"x,1'],
    ['midfield-quote', 'sku,name,quantity\nA,x"y,1'],
    ['after-quote', 'sku,name,quantity\nA,"x"y,1'],
    ['space-after-quote', 'sku,name,quantity\nA,"x" ,1'],
    ['empty-sku', 'sku,name,quantity\n,x,1'],
    ['space-sku', 'sku,name,quantity\n A,x,1'],
    ['trailing-space-sku', 'sku,name,quantity\nA ,x,1'],
    ['unicode-sku', 'sku,name,quantity\nŽ,x,1'],
    ['long-sku', csv([['A'.repeat(33), 'x', '1']])],
    ['empty-name', 'sku,name,quantity\nA,,1'],
    ['blank-name', 'sku,name,quantity\nA," \t\n",1'],
    ['long-name', csv([['A', 'x'.repeat(1001), '1']])],
    ['utf16-name-bound', csv([['A', '😀'.repeat(501), '1']])],
    ...['', '-1', '+1', '1.0', '1e2', ' 1', '1 ', '1000001', '１２', 'NaN'].map((q, i) => [`quantity-${i}`, csv([['A', 'x', q]])]),
    ['duplicate', csv([['DUPE', 'first', 1], ['DUPE', 'second', 2]])],
    ['late-invalid-atomic', csv([['001', 'must not change existing', 66], ['LATE_VALID', 'must not insert', 1], ['LATE_BAD', 'invalid', -1]])],
    ['row-limit-129', csv(Array.from({ length: 129 }, (_, i) => [`R${i}`, 'x', 0]))],
    ['invalid-utf8', Buffer.concat([Buffer.from('sku,name,quantity\nA,'), Buffer.from([0xc3, 0x28]), Buffer.from(',1')])],
    ['truncated-utf8', Buffer.concat([Buffer.from('sku,name,quantity\nA,'), Buffer.from([0xe2, 0x82])])],
    ['overlong-utf8', Buffer.concat([Buffer.from('sku,name,quantity\nA,'), Buffer.from([0xc0, 0xaf]), Buffer.from(',1')])],
  ];
}

export function assertErrors(body) {
  assert.ok(body && Array.isArray(body.errors) && body.errors.length > 0, 'nonempty errors array required');
  for (const error of body.errors) {
    assert.ok(Number.isInteger(error.row) && error.row > 0, 'error row must be a positive integer');
    assert.ok(['csv', 'sku', 'name', 'quantity'].includes(error.field), 'error field outside contract');
    assert.ok(typeof error.message === 'string' && error.message.trim().length > 0, 'human-readable message required');
  }
}

async function sourceManifest(root) {
  const result = [];
  let bytes = 0;
  async function visit(dir, depth = 0) {
    assert.ok(depth <= 12, 'source depth bound exceeded');
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['.git', 'node_modules', '.artifacts', '.local'].includes(entry.name)) continue;
      const target = path.join(dir, entry.name);
      assert.ok(!entry.isSymbolicLink(), `source symlink requires manual review: ${path.relative(root, target)}`);
      if (entry.isDirectory()) await visit(target, depth + 1);
      else if (entry.isFile()) {
        const info = await stat(target);
        bytes += info.size;
        assert.ok(result.length < 512 && bytes <= 16 * 1024 * 1024, 'source evidence bound exceeded');
        result.push({ path: path.relative(root, target), bytes: info.size, sha256: digest(await readFile(target)) });
      }
    }
  }
  await visit(root);
  return result;
}

class Candidate {
  constructor(options, dataDir, signal) {
    this.options = options;
    this.dataDir = dataDir;
    this.signal = signal;
    this.events = [];
    this.log = '';
    this.process = undefined;
  }
  async start({ poison = false } = {}) {
    assert.equal(this.process, undefined, 'owned child already running');
    const env = {
      PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: this.options.runtimeDir, TMPDIR: this.options.runtimeDir,
      LANG: 'C.UTF-8', NODE_ENV: 'test', PORT: '0', DATA_DIR: this.dataDir,
      PILOT_COMPONENT_URL: pathToFileURL(path.join(this.options.workspace, 'component/app.mjs')).href,
      PILOT_POISON_PARSER: poison ? '1' : '0', PILOT_D3_URL: this.options.d3Module ? pathToFileURL(this.options.d3Module).href : '',
      PILOT_D3_EXPORT: this.options.d3Export ?? 'csvParseRows',
    };
    const child = spawn(this.options.node ?? process.execPath, ['--max-old-space-size=512', '--import', path.join(fixtures, 'observe-loader.mjs'), 'server.mjs'], {
      cwd: this.options.workspace, env, detached: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    });
    this.process = child;
    this.exit = once(child, 'exit').catch(() => []);
    let readyResolve;
    let readyReject;
    const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    let stdout = '';
    let eventBuffer = '';
    const append = (kind, chunk) => {
      this.log = `${this.log}[${kind}] ${chunk}`.slice(-65536);
    };
    child.stdout.on('data', (chunk) => {
      append('stdout', chunk);
      stdout = (stdout + chunk).slice(-8192);
      const match = stdout.match(/(?:^|\n)READY ([0-9]+)(?:\r?\n|$)/);
      if (match) {
        const port = Number(match[1]);
        if (port > 0 && port <= 65535) readyResolve(port);
        else readyReject(new Error('READY port must be nonzero and valid'));
      }
    });
    child.stderr.on('data', (chunk) => append('stderr', chunk));
    child.stdio[3].on('data', (chunk) => {
      eventBuffer += chunk;
      if (eventBuffer.length > 65536) { eventBuffer = ''; append('observer', 'event buffer overflow'); }
      let end;
      while ((end = eventBuffer.indexOf('\n')) >= 0) {
        const line = eventBuffer.slice(0, end);
        eventBuffer = eventBuffer.slice(end + 1);
        try { if (this.events.length < 4096) this.events.push(JSON.parse(line)); } catch { append('observer', 'malformed trace'); }
      }
    });
    child.once('error', readyReject);
    child.once('exit', (code, signal) => readyReject(new Error(`server exited before READY (${code ?? signal})`)));
    const stopOnAbort = () => { void this.stop(); };
    this.signal.addEventListener('abort', stopOnAbort, { once: true });
    this.abortListener = stopOnAbort;
    const timeout = setTimeout(() => readyReject(new Error('startup exceeded 6000 ms')), 6000);
    try { this.port = await ready; } catch (error) { await this.stop(); throw error; } finally { clearTimeout(timeout); }
    return this;
  }
  async request(route, { body, key, method = body === undefined ? 'GET' : 'POST' } = {}) {
    assert.ok(this.process && !this.signal.aborted, 'server not available');
    const response = await fetch(`http://127.0.0.1:${this.port}${route}`, {
      method, body, headers: body === undefined ? {} : { 'Content-Type': 'text/csv', ...(key === undefined ? {} : { 'Idempotency-Key': key }) },
      signal: AbortSignal.any([this.signal, AbortSignal.timeout(2500)]), redirect: 'error',
    });
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 131072) { await response.body.cancel().catch(() => {}); throw new Error('HTTP response exceeded 128 KiB'); }
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    let json;
    try { json = JSON.parse(raw); } catch { throw new Error(`HTTP ${response.status} invalid JSON: ${raw.slice(0, 500)}`); }
    return { status: response.status, json };
  }
  async items() {
    const response = await this.request('/api/items');
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.json.items));
    for (const row of response.json.items) {
      assert.equal(typeof row.sku, 'string');
      assert.equal(typeof row.name, 'string');
      assert.ok(Number.isInteger(row.quantity));
    }
    const items = pickedRows(response.json.items);
    assert.deepEqual(items, sortRows(items), 'items not in binary SKU ordering');
    assert.equal(new Set(items.map((item) => item.sku)).size, items.length, 'duplicate saved SKU');
    return items;
  }
  async stop() {
    const child = this.process;
    if (!child) return;
    this.process = undefined;
    this.signal.removeEventListener('abort', this.abortListener);
    const kill = (signal) => { if (!Number.isInteger(child.pid)) return; try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; } };
    kill('SIGTERM');
    await Promise.race([this.exit, sleep(400)]);
    // Kill only the process group created by our detached spawn, including surviving descendants.
    kill('SIGKILL');
    await Promise.race([this.exit, sleep(1000)]);
  }
}

async function runParserContract(options, signal) {
  const child = spawn(options.node ?? process.execPath, ['--max-old-space-size=512', '--permission', '--allow-fs-read=*', path.join(fixtures, 'parser-contract-worker.mjs'), path.join(options.workspace, 'component/app.mjs')], {
    cwd: options.workspace, detached: true, env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: options.runtimeDir, DATA_DIR: options.runtimeDir, PORT: '0' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (value) => { stdout = (stdout + value).slice(-65536); });
  child.stderr.on('data', (value) => { stderr = (stderr + value).slice(-8192); });
  const kill = () => { if (!Number.isInteger(child.pid)) return; try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } };
  const timer = setTimeout(kill, 8000);
  signal.addEventListener('abort', kill, { once: true });
  child.stdin.end(JSON.stringify(parserCases));
  try {
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, `parser contract worker failed: ${stderr}`);
    return JSON.parse(stdout);
  } finally { clearTimeout(timer); signal.removeEventListener('abort', kill); kill(); }
}

async function functionalCases(candidate, record) {
  const probe = csv([['LEDGER_PROBE', 'Ledger probe', 4]]);
  await record('health', async () => {
    const response = await candidate.request('/api/health');
    assert.equal(response.status, 200);
    assert.equal(response.json.ok, true);
    assert.deepEqual(await candidate.items(), []);
  });
  const validRows = (id, rows) => [id, csv(rows), rows.map(([sku, name, quantity]) => ({ sku, name, quantity: Number(quantity) }))];
  const valid = [
    ['bom-crlf-quotes', '\uFEFFsku,name,quantity\r\n001,"Comma, and ""quote""",0002\r\nA,"Line one\r\nLine two",0\r\n', [
      { sku: '001', name: 'Comma, and "quote"', quantity: 2 }, { sku: 'A', name: 'Line one\r\nLine two', quantity: 0 },
    ]],
    validRows('case-sensitive-skus', [['a', 'lower', 1], ['A', 'upper', 2], ['1', 'one', 3], ['001', 'zero', 4], ['_', 'underscore', 5], ['-', 'hyphen', 6]]),
    validRows('field-boundaries', [['X'.repeat(32), ` ${'x'.repeat(998)} `, 1000000], ['UTF16', '😀'.repeat(500), 0], ['TEXT', '<img src=x onerror="window.pilotXss=1">', 0]]),
    validRows('row-limit-128', Array.from({ length: 128 }, (_, i) => [`R${i}`, 'Row', 0])),
    validRows('byte-limit-16384', exactSizeRows(16384)),
  ];
  for (const [id, body, expected] of valid) {
    await record(`preview-${id}`, async () => {
      const before = await candidate.items();
      const response = await candidate.request('/api/preview', { body, key: `preview-${id}` });
      assert.equal(response.status, 200);
      assert.equal(response.json.valid, true);
      assert.deepEqual(response.json.errors, []);
      assert.ok(Array.isArray(response.json.rows));
      assert.deepEqual(pickedRows(response.json.rows), expected);
      assert.deepEqual(await candidate.items(), before, 'valid preview mutated inventory');
      const commit = await candidate.request('/api/commit', { body, key: `preview-${id}` });
      assert.equal(commit.status, 200);
      assert.equal(commit.json.applied, true, 'preview wrote an import key');
      assert.equal(commit.json.rowCount, response.json.rows.length);
      const saved = await candidate.items();
      for (const row of response.json.rows) assert.deepEqual(saved.find((item) => item.sku === row.sku), pickedRows([row])[0]);
    });
  }
  for (const [index, [id, body]] of invalidCases().entries()) {
    await record(`invalid-${id}`, async () => {
      const before = await candidate.items();
      const preview = await candidate.request('/api/preview', { body });
      assert.equal(preview.status, 200);
      assert.equal(preview.json.valid, false);
      assert.deepEqual(preview.json.rows, []);
      assertErrors(preview.json);
      assert.deepEqual(await candidate.items(), before, 'invalid preview mutated inventory');
      const key = `invalid-${index}`;
      const commit = await candidate.request('/api/commit', { body, key });
      assert.equal(commit.status, 422);
      assertErrors(commit.json);
      assert.deepEqual(await candidate.items(), before, 'invalid commit mutated inventory');
      const retry = await candidate.request('/api/commit', { body: probe, key });
      assert.equal(retry.status, 200);
      assert.equal(retry.json.applied, true, 'invalid commit reserved or altered key ledger');
    });
  }
  await record('oversize-16385', async () => {
    const body = exactSizeCsv(16385);
    const before = await candidate.items();
    for (const route of ['/api/preview', '/api/commit']) {
      const response = await candidate.request(route, { body, key: 'oversize-key' });
      assert.equal(response.status, 413);
      assertErrors(response.json);
      assert.deepEqual(await candidate.items(), before);
    }
    const retry = await candidate.request('/api/commit', { body: probe, key: 'oversize-key' });
    assert.equal(retry.status, 200);
    assert.equal(retry.json.applied, true);
  });
  for (const [index, key] of [undefined, '', ' ', 'a b', 'é', 'a'.repeat(65)].entries()) {
    await record(`invalid-key-${index}`, async () => {
      const before = await candidate.items();
      const response = await candidate.request('/api/commit', { body: csv([['KEY_BAD', 'must not insert', 1]]), key });
      assert.equal(response.status, 400);
      assert.deepEqual(await candidate.items(), before);
    });
  }
  await record('key-boundary-64', async () => {
    const response = await candidate.request('/api/commit', { body: probe, key: 'Z'.repeat(64) });
    assert.equal(response.status, 200);
    assert.equal(response.json.applied, true);
  });
  const original = csv([['REPLAY', 'Original', 1], ['REPLAY2', 'Second', 2]]);
  const changed = csv([['REPLAY', 'Later update', 9]]);
  await record('insert-upsert-replay-conflict', async () => {
    for (const [body, key] of [[original, 'persist-key'], [changed, 'upsert-key']]) {
      const response = await candidate.request('/api/commit', { body, key });
      assert.equal(response.status, 200);
      assert.equal(response.json.applied, true);
    }
    const before = await candidate.items();
    assert.deepEqual(before.find((row) => row.sku === 'REPLAY'), { sku: 'REPLAY', name: 'Later update', quantity: 9 });
    const replay = await candidate.request('/api/commit', { body: original, key: 'persist-key' });
    assert.equal(replay.status, 200);
    assert.equal(replay.json.applied, false);
    assert.equal(replay.json.rowCount, 2);
    const conflict = await candidate.request('/api/commit', { body: `${original}\n`, key: 'persist-key' });
    assert.equal(conflict.status, 409, 'raw-byte change must conflict despite equivalent parsed CSV');
    assert.deepEqual(await candidate.items(), before, 'replay/conflict changed inventory');
  });
  await record('concurrent-identical-key', async () => {
    const body = csv([['CONCURRENT', 'One effect', 2]]);
    const results = await Promise.all([candidate.request('/api/commit', { body, key: 'concurrent-key' }), candidate.request('/api/commit', { body, key: 'concurrent-key' })]);
    assert.deepEqual(results.map((r) => r.status), [200, 200]);
    assert.deepEqual(results.map((r) => r.json.applied).sort(), [false, true]);
    assert.ok(results.every((r) => r.json.rowCount === 1));
  });
  await record('restart-items-and-key-ledger', async () => {
    const before = await candidate.items();
    await candidate.stop();
    await candidate.start();
    assert.deepEqual(await candidate.items(), before, 'inventory not persisted across restart');
    const replay = await candidate.request('/api/commit', { body: original, key: 'persist-key' });
    assert.equal(replay.status, 200);
    assert.equal(replay.json.applied, false);
    assert.equal(replay.json.rowCount, 2);
    const conflict = await candidate.request('/api/commit', { body: changed, key: 'persist-key' });
    assert.equal(conflict.status, 409);
    assert.deepEqual(await candidate.items(), before, 'restart replay/conflict changed saved state');
  });
}

async function browserCases(candidate, options, record, report) {
  if (!options.playwrightModule) {
    report.browser.push({ id: 'browser-environment', status: 'not_run', error: 'Explicit installed Playwright module path required; no browser is downloaded.' });
    return;
  }
  const playwright = await import(pathToFileURL(options.playwrightModule).href);
  const browser = await playwright.chromium.launch({ executablePath: options.chromium ?? '/usr/bin/chromium', headless: true, timeout: 6000, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disk-cache-size=0', '--media-cache-size=0'] });
  const closeOnAbort = () => { void browser.close(); };
  candidate.signal.addEventListener('abort', closeOnAbort, { once: true });
  try {
    for (const [name, viewport] of [['desktop', { width: 1100, height: 850 }], ['mobile', { width: 390, height: 844 }]]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      const page = await context.newPage();
      page.setDefaultTimeout(4000);
      const consoleErrors = [];
      page.on('pageerror', (error) => consoleErrors.push(String(error).slice(0, 500)));
      let dialogs = 0;
      page.on('dialog', async (dialog) => { dialogs += 1; await dialog.dismiss(); });
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === `http://127.0.0.1:${candidate.port}`) await route.continue();
        else await route.abort('blockedbyclient');
      });
      const screenshot = async (suffix) => {
        const file = path.join(options.runtimeDir, `${name}-${suffix}.jpg`);
        const buffer = await page.screenshot({ type: 'jpeg', quality: 35, fullPage: false, timeout: 3000 });
        if (buffer.length <= 512 * 1024) { await writeFile(file, buffer); report.evidence.push({ kind: 'screenshot', path: path.relative(options.output, file), sha256: digest(buffer), bytes: buffer.length }); }
      };
      const caseRecord = async (id, fn) => record(`${name}-${id}`, async () => { try { await fn(); } catch (error) { await screenshot(`failure-${id}`).catch(() => {}); throw error; } });
      const waitEnabled = async (button) => {
        const deadline = performance.now() + 4000;
        while (performance.now() < deadline) {
          candidate.signal.throwIfAborted();
          if (await button.isEnabled()) return;
          await sleep(20);
        }
        assert.fail('Commit not enabled after valid preview');
      };
      try {
        await caseRecord('upload-preview-commit', async () => {
          const sku = name === 'desktop' ? 'UI_DESKTOP' : 'UI_MOBILE';
          const oldName = `Saved before browser commit ${name}`;
          const seed = await candidate.request('/api/commit', { body: csv([[sku, oldName, 3]]), key: `ui-seed-${name}` });
          assert.equal(seed.status, 200);
          await page.goto(`http://127.0.0.1:${candidate.port}/`, { waitUntil: 'domcontentloaded', timeout: 6000 });
          await page.getByText(oldName, { exact: true }).first().waitFor({ state: 'visible' });
          const input = page.getByLabel('CSV file', { exact: true });
          assert.equal(await input.count(), 1, 'labelled file input missing or ambiguous');
          assert.equal(await input.getAttribute('type'), 'file');
          const preview = page.getByRole('button', { name: 'Preview', exact: true });
          const commit = page.getByRole('button', { name: 'Commit', exact: true });
          assert.ok(await commit.isDisabled(), 'Commit initially enabled');
          const before = await candidate.items();
          const maliciousName = '<img src=x onerror="window.pilotXss=1">';
          const body = csv([[sku, maliciousName, 7]]);
          await input.setInputFiles({ name: 'inventory.csv', mimeType: 'text/csv', buffer: Buffer.from(body) });
          await preview.focus();
          assert.ok(await preview.evaluate((node) => document.activeElement === node), 'Preview not keyboard focusable');
          const [previewResponse] = await Promise.all([
            page.waitForResponse((response) => response.url().endsWith('/api/preview') && response.request().method() === 'POST'),
            page.keyboard.press('Enter'),
          ]);
          assert.equal(previewResponse.status(), 200);
          await waitEnabled(commit);
          assert.ok(await page.getByText(sku, { exact: true }).first().isVisible(), 'preview row not visible');
          assert.ok(await page.getByText(maliciousName, { exact: true }).first().isVisible(), 'name not rendered as literal text');
          assert.equal(await page.locator('img[src="x"]').count(), 0, 'CSV name interpreted as HTML');
          assert.deepEqual(await candidate.items(), before, 'browser preview wrote inventory');
          assert.ok(await page.getByText(oldName, { exact: true }).first().isVisible(), 'saved row disappeared before commit');
          await commit.focus();
          const [commitResponse] = await Promise.all([
            page.waitForResponse((response) => response.url().endsWith('/api/commit') && response.request().method() === 'POST'),
            page.keyboard.press('Enter'),
          ]);
          assert.equal(commitResponse.status(), 200);
          assert.deepEqual((await candidate.items()).find((item) => item.sku === sku), { sku, name: maliciousName, quantity: 7 });
          await page.getByText(oldName, { exact: true }).waitFor({ state: 'hidden' });
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.getByText(sku, { exact: true }).first().waitFor({ state: 'visible' });
          await page.getByText(maliciousName, { exact: true }).first().waitFor({ state: 'visible' });
          assert.ok(await page.getByText(sku, { exact: true }).first().isVisible(), 'saved inventory absent after refresh');
          assert.equal(await page.evaluate(() => window.pilotXss ?? 0), 0);
          assert.equal(dialogs, 0);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'horizontal overflow at viewport');
          await screenshot('saved');
          const saved = await candidate.items();
          await candidate.stop();
          await candidate.start();
          assert.deepEqual(await candidate.items(), saved, 'browser commit did not persist across server restart');
          await page.goto(`http://127.0.0.1:${candidate.port}/`, { waitUntil: 'domcontentloaded' });
          await page.getByText(sku, { exact: true }).first().waitFor({ state: 'visible' });
          assert.equal(await page.getByText(oldName, { exact: true }).count(), 0);
        });
        await caseRecord('selection-invalidates-preview', async () => {
          const input = page.getByLabel('CSV file', { exact: true });
          const preview = page.getByRole('button', { name: 'Preview', exact: true });
          const commit = page.getByRole('button', { name: 'Commit', exact: true });
          await input.setInputFiles({ name: 'valid.csv', mimeType: 'text/csv', buffer: Buffer.from(csv([['UI_INVALIDATION', 'old preview', 1]])) });
          await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/preview')), preview.click()]);
          await waitEnabled(commit);
          await input.setInputFiles({ name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from(csv([['UI_BAD', 'invalid', -1]])) });
          assert.ok(await commit.isDisabled(), 'changing file retained valid preview');
          const before = await candidate.items();
          const [result] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/preview')), preview.click()]);
          assert.equal(result.status(), 200);
          await page.waitForTimeout(50);
          assert.ok(await commit.isDisabled(), 'invalid preview enabled Commit');
          const text = await page.locator('body').innerText();
          assert.match(text, /quantity/i, 'field error not visible');
          assert.match(text, /(?:row\s*[:#]?\s*2\b|2\s*[:·/-])/i, 'row number not visible');
          assert.deepEqual(await candidate.items(), before);
        });
        await caseRecord('keyboard-navigation', async () => {
          await page.reload({ waitUntil: 'domcontentloaded' });
          const seen = new Set();
          const input = page.getByLabel('CSV file', { exact: true });
          const preview = page.getByRole('button', { name: 'Preview', exact: true });
          for (let i = 0; i < 30; i += 1) {
            await page.keyboard.press('Tab');
            if (await input.evaluate((node) => document.activeElement === node)) seen.add('file');
            if (await preview.evaluate((node) => document.activeElement === node)) seen.add('preview');
            if (seen.size === 2) break;
          }
          assert.deepEqual([...seen].sort(), ['file', 'preview'], 'file/Preview unreachable with Tab');
          assert.deepEqual(consoleErrors, [], 'browser script error');
        });
      } finally { await context.close(); }
    }
  } finally { candidate.signal.removeEventListener('abort', closeOnAbort); await browser.close(); }
}

async function sqliteEvidence(dataDir) {
  const files = [];
  let count = 0;
  let totalBytes = 0;
  async function visit(dir, depth = 0) {
    assert.ok(depth < 8, 'DATA_DIR nesting bound exceeded');
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      count += 1;
      assert.ok(count <= 64, 'DATA_DIR file-count evidence bound exceeded');
      const target = path.join(dir, entry.name);
      assert.ok(!entry.isSymbolicLink(), 'DATA_DIR symlink unsupported');
      if (entry.isDirectory()) await visit(target, depth + 1);
      else if (entry.isFile()) {
        const info = await stat(target);
        totalBytes += info.size;
        assert.ok(totalBytes <= 8 * 1024 * 1024, 'DATA_DIR evidence bound exceeded');
        const bytes = await readFile(target);
        if (bytes.subarray(0, 16).toString() === 'SQLite format 3\u0000') files.push({ target, bytes });
      }
    }
  }
  await visit(dataDir);
  assert.ok(files.length > 0, 'no SQLite database under DATA_DIR');
  const { DatabaseSync } = await import('node:sqlite');
  return files.map(({ target, bytes }) => {
    const db = new DatabaseSync(target, { readOnly: true });
    try { assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); }
    finally { db.close(); }
    return { path: path.relative(dataDir, target), bytes: bytes.length, sha256: digest(bytes), integrityCheck: 'ok' };
  });
}

export async function gradeInventory(input) {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'Node 24 or newer required');
  assert.equal(process.platform, 'linux', 'owned process-group cleanup requires the Linux/WSL profile');
  const options = { ...input, workspace: await realpath(input.workspace), output: path.resolve(input.output) };
  assert.ok(!options.output.startsWith(`${options.workspace}${path.sep}`) && options.output !== options.workspace, 'output must be outside candidate workspace');
  if (options.d3Module) {
    options.d3Module = await realpath(options.d3Module);
    assert.ok(options.d3Module.startsWith(`${options.workspace}${path.sep}`), 'observed d3 module must be inside candidate workspace');
  }
  await mkdir(options.output, { recursive: true });
  options.runtimeDir = await mkdtemp(path.join(options.output, 'run-'));
  const dataDir = path.join(options.runtimeDir, 'data');
  await mkdir(dataDir);
  const report = {
    schema: 'native-inventory-pilot-grader/v1', specSha256: SPEC_SHA256, promptSha256: PROMPT_SHA256,
    limits: { startupMs: 6000, requestMs: 2500, totalMs: input.totalMs ?? 180000, nodeHeapMiB: 512, logBytes: 65536 },
    environment: { node: process.version, platform: process.platform, arch: process.arch, chromium: input.chromium ?? '/usr/bin/chromium' },
    functional: [], browser: [], observedUse: {}, evidence: [],
    limitations: ['Development cases, not a true hidden holdout.', 'Same-user processes and instrumentation are not hostile-code isolation.', 'Wrapper traces prove calls crossing the observed export boundary; internal module calls may remain unobserved.', 'Vendored d3 pin/use evidence is distinct from generic parser use and any separate Zero component verification receipt.', 'Browser traffic is limited to the candidate loopback origin; candidate server network isolation is not claimed.', 'No general benefit verdict follows from a single development pair.'],
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('grader runtime exceeded')), report.limits.totalMs);
  const start = performance.now();
  const record = (list) => async (id, fn) => {
    const time = performance.now();
    try { controller.signal.throwIfAborted(); await fn(); list.push({ id, status: 'pass', elapsedMs: Math.round(performance.now() - time) }); }
    catch (error) { list.push({ id, status: 'fail', elapsedMs: Math.round(performance.now() - time), error: shortError(error) }); }
  };
  const functional = record(report.functional);
  const candidate = new Candidate(options, dataDir, controller.signal);
  let before;
  try {
    if (options.spec) assert.equal(digest(await readFile(options.spec)), SPEC_SHA256, 'SPEC differs from frozen contract');
    if (options.prompt) assert.equal(digest(await readFile(options.prompt)), PROMPT_SHA256, 'prompt differs from frozen bytes');
    before = await sourceManifest(options.workspace);
    report.sourceBefore = before;
    report.graderSha256 = digest(await readFile(fileURLToPath(import.meta.url)));
    await functional('component-export-contract-and-import-purity', async () => {
      const results = await runParserContract(options, controller.signal);
      report.parserContract = results;
      assert.deepEqual(results.sideEffects, [], 'module import attempted side effects');
      assert.ok(results.cases.length === parserCases.length && results.cases.every((item) => item.status === 'pass'), 'parseCsv contract failures (see parserContract)');
    });
    await functional('startup-ephemeral-loopback', async () => { await candidate.start(); });
    if (candidate.process) {
      await functionalCases(candidate, functional);
      await browserCases(candidate, options, record(report.browser), report).catch((error) => report.browser.push({ id: 'browser-environment', status: 'fail', error: shortError(error) }));
      const normalEvents = [...candidate.events];
      await candidate.stop();
      await functional('sqlite-storage-and-integrity', async () => { report.sqlite = await sqliteEvidence(dataDir); });
      const count = (events, kind) => events.filter((event) => event.kind === kind).length;
      report.observedUse.parserExportCalls = count(normalEvents, 'parser-call');
      report.observedUse.parserBoundary = report.observedUse.parserExportCalls > 0 ? 'observed' : 'unknown';
      report.observedUse.d3 = options.d3Module ? {
        module: path.relative(options.workspace, options.d3Module), export: options.d3Export ?? 'csvParseRows',
        sha256: digest(await readFile(options.d3Module)), expectedSha256: options.d3Sha256 ?? null,
        pinMatches: options.d3Sha256 ? digest(await readFile(options.d3Module)) === options.d3Sha256 : null,
        calls: count(normalEvents, 'd3-call'), actualUse: count(normalEvents, 'd3-call') > 0 ? 'observed' : 'unknown',
        zeroVerificationReceipt: 'not_evaluated_by_this_grader',
      } : { actualUse: 'not_observed', pinMatches: null, zeroVerificationReceipt: 'not_evaluated_by_this_grader' };
      const callsBefore = candidate.events.length;
      try {
        await candidate.start({ poison: true });
        const response = await candidate.request('/api/preview', { body: csv([['FAULT_PROBE', 'Parser fault probe', 2]]) });
        const poisonEvents = candidate.events.slice(callsBefore);
        const injected = count(poisonEvents, 'parser-poison') > 0;
        report.observedUse.parserFaultProbe = {
          injected, httpStatus: response.status, acceptedAsValid: response.json.valid === true,
          result: injected && response.json.valid !== true ? 'intercepted_exercised_http_path' : 'inconclusive',
        };
      } catch (error) {
        const injected = count(candidate.events.slice(callsBefore), 'parser-poison') > 0;
        report.observedUse.parserFaultProbe = { injected, result: injected ? 'intercepted_exercised_http_path' : 'inconclusive', error: shortError(error) };
      } finally { await candidate.stop(); }
      report.observerEvents = candidate.events;
    } else {
      report.functional.push({ id: 'http-suite', status: 'not_run', error: 'startup failed' });
      report.browser.push({ id: 'browser-suite', status: 'not_run', error: 'startup failed' });
    }
  } catch (error) { report.functional.push({ id: 'grader-preflight-or-runtime', status: 'fail', error: shortError(error) }); }
  finally {
    await candidate.stop();
    clearTimeout(timer);
    await writeFile(path.join(options.runtimeDir, 'server.log'), candidate.log);
    if (before) {
      try {
        const after = await sourceManifest(options.workspace);
        report.sourceAfter = after;
        await functional('candidate-source-unchanged', async () => assert.deepEqual(after, before, 'candidate wrote files outside DATA_DIR; inspect manifests'));
      } catch (error) { report.functional.push({ id: 'candidate-source-unchanged', status: 'fail', error: shortError(error) }); }
    }
    report.elapsedMs = Math.round(performance.now() - start);
    report.functionalOutcome = report.functional.every((item) => item.status === 'pass') ? 'pass' : 'fail';
    report.browserOutcome = report.browser.length > 0 && report.browser.every((item) => item.status === 'pass') ? 'pass' : report.browser.some((item) => item.status === 'fail') ? 'fail' : 'not_run';
    report.outcome = report.functionalOutcome === 'pass' && report.browserOutcome === 'pass' ? 'pass' : report.functionalOutcome === 'fail' || report.browserOutcome === 'fail' ? 'fail' : 'incomplete';
    const destination = path.join(options.runtimeDir, 'report.json');
    await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
    report.reportPath = destination;
  }
  return report;
}

function cliOptions(args) {
  const map = new Map();
  for (let i = 0; i < args.length; i += 2) {
    assert.ok(args[i]?.startsWith('--') && args[i + 1] !== undefined, 'options require explicit values');
    assert.ok(!map.has(args[i]), `duplicate option: ${args[i]}`);
    map.set(args[i], args[i + 1]);
  }
  const allowed = ['--workspace', '--output', '--spec', '--prompt', '--node', '--playwright-module', '--chromium', '--d3-module', '--d3-export', '--d3-sha256'];
  for (const key of map.keys()) assert.ok(allowed.includes(key), `unknown option: ${key}`);
  assert.ok(map.has('--workspace') && map.has('--output'), 'Usage: node native-inventory-pilot-grader.mjs --workspace DIR --output OUTSIDE_DIR [--playwright-module FILE] [--chromium FILE] [--spec FILE] [--prompt FILE] [--d3-module FILE --d3-export NAME --d3-sha256 HEX]');
  return Object.fromEntries([...map].map(([key, value]) => [key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await gradeInventory(cliOptions(process.argv.slice(2)));
    console.log(JSON.stringify({ outcome: report.outcome, functional: report.functionalOutcome, browser: report.browserOutcome, report: report.reportPath }));
    process.exitCode = report.outcome === 'pass' ? 0 : 1;
  } catch (error) { console.error(shortError(error)); process.exitCode = 2; }
}
