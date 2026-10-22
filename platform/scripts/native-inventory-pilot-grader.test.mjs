import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertErrors, exactSizeCsv, gradeInventory } from './native-inventory-pilot-grader.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, 'fixtures/native-inventory-pilot');
// A caller can select a bounded evidence root. No fixtures enter real trial workspaces.
const root = await mkdtemp(path.join(process.env.PILOT_QUALIFICATION_ROOT ?? os.tmpdir(), 'inventory-grader-qualification-'));
const playwrightModule = process.env.PILOT_PLAYWRIGHT_MODULE;
if (process.env.PILOT_REQUIRE_BROWSER === '1') assert.ok(playwrightModule, 'PILOT_REQUIRE_BROWSER requires an installed PILOT_PLAYWRIGHT_MODULE file');
const chromium = process.env.PILOT_CHROMIUM ?? '/usr/bin/chromium';

async function qualify(mode, browser = false) {
  const base = await mkdtemp(path.join(root, `${mode}-`));
  const workspace = path.join(base, 'app');
  const output = path.join(base, 'evidence');
  await mkdir(path.join(workspace, 'component'), { recursive: true });
  for (const file of ['server.mjs', 'index.html']) await copyFile(path.join(fixture, file), path.join(workspace, file));
  for (const file of ['app.mjs', 'strict.mjs']) await copyFile(path.join(fixture, file), path.join(workspace, 'component', file));
  await writeFile(path.join(workspace, 'control.json'), JSON.stringify({ mode }));
  const report = await gradeInventory({ workspace, output, ...(browser ? { playwrightModule, chromium } : {}), totalMs: 120000 });
  return report;
}

function failure(report, id) {
  const item = report.functional.find((entry) => entry.id === id);
  assert.equal(item?.status, 'fail', `expected ${id} failure; actual failures: ${report.functional.filter((entry) => entry.status === 'fail').map((entry) => `${entry.id}: ${entry.error}`).join('\n')}`);
}

test('boundary fixtures distinguish exactly 16384 from 16385 bytes', () => {
  assert.equal(Buffer.byteLength(exactSizeCsv(16384)), 16384);
  assert.equal(Buffer.byteLength(exactSizeCsv(16385)), 16385);
});

test('error-shape checker rejects missing row, field and readable message', () => {
  assertErrors({ errors: [{ row: 2, field: 'quantity', message: 'Quantity is invalid' }] });
  for (const errors of [[], [{ row: 0, field: 'csv', message: 'Bad' }], [{ row: 1, field: 'other', message: 'Bad' }], [{ row: 1, field: 'csv', message: ' ' }]]) assert.throws(() => assertErrors({ errors }));
});

test('reference passes HTTP, standalone parser, restart and storage cases', { timeout: 130000 }, async () => {
  const report = await qualify('reference');
  assert.equal(report.functionalOutcome, 'pass', JSON.stringify(report.functional.filter((entry) => entry.status !== 'pass'), null, 2));
  assert.equal(report.browserOutcome, 'not_run');
  assert.equal(report.outcome, 'incomplete', 'an omitted browser run must not become overall PASS');
  assert.ok(report.observedUse.parserExportCalls > 0);
  assert.equal(report.observedUse.parserFaultProbe.result, 'intercepted_exercised_http_path');
  assert.ok(report.sqlite.length > 0);
  assert.ok((await readFile(report.reportPath, 'utf8')).includes('Development cases'));
});

test('permissive parser starts normally and fails malformed-quote behavior', { timeout: 130000 }, async () => {
  const report = await qualify('permissive-parser');
  assert.equal(report.functional.find((item) => item.id === 'startup-ephemeral-loopback')?.status, 'pass');
  failure(report, 'component-export-contract-and-observed-import-effects');
  failure(report, 'invalid-after-quote');
});

for (const [mode, effect] of [['impure-import', 'fs.mkdirSync'], ['import-network', 'socket.connect'], ['import-server', 'server.listen']]) {
  test(`${mode} control starts normally and exposes the observed import effect`, { timeout: 130000 }, async () => {
    const report = await qualify(mode);
    assert.equal(report.functional.find((item) => item.id === 'startup-ephemeral-loopback')?.status, 'pass');
    failure(report, 'component-export-contract-and-observed-import-effects');
    assert.ok(report.parserContract.sideEffects.includes(effect));
  });
}

for (const [mode, caseId] of [
  ['invalid-mutation', 'invalid-header-order'],
  ['preview-mutation', 'invalid-header-order'],
  ['invalid-ledger', 'invalid-header-order'],
  ['replay-reapply', 'insert-upsert-replay-conflict'],
  ['conflict-overwrite', 'insert-upsert-replay-conflict'],
  ['lost-persistence', 'restart-items-and-key-ledger'],
  ['lost-ledger', 'restart-items-and-key-ledger'],
]) {
  test(`${mode} control reaches HTTP and is rejected by ${caseId}`, { timeout: 130000 }, async () => {
    const report = await qualify(mode);
    assert.equal(report.functional.find((item) => item.id === 'startup-ephemeral-loopback')?.status, 'pass');
    failure(report, caseId);
    assert.equal(report.functionalOutcome, 'fail');
  });
}

test('bypass control remains functionally valid but cannot claim export use', { timeout: 130000 }, async () => {
  const report = await qualify('bypass-parser');
  assert.equal(report.functionalOutcome, 'pass', JSON.stringify(report.functional.filter((entry) => entry.status !== 'pass')));
  assert.equal(report.observedUse.parserExportCalls, 0);
  assert.equal(report.observedUse.parserBoundary, 'unknown');
  assert.equal(report.observedUse.parserFaultProbe.injected, false);
  assert.equal(report.observedUse.parserFaultProbe.acceptedAsValid, true);
  assert.equal(report.observedUse.parserFaultProbe.result, 'inconclusive');
});

test('reference completes real file upload, commit, errors and keyboard on desktop/mobile', { skip: !playwrightModule, timeout: 130000 }, async () => {
  const report = await qualify('reference', true);
  assert.equal(report.outcome, 'pass', JSON.stringify([...report.functional, ...report.browser].filter((entry) => entry.status !== 'pass'), null, 2));
  assert.equal(report.browser.length, 6);
});

test('accessible icon buttons and semantic Row/Field/Message error table are accepted', { skip: !playwrightModule, timeout: 130000 }, async () => {
  const report = await qualify('browser-accessible-table', true);
  assert.equal(report.outcome, 'pass', JSON.stringify([...report.functional, ...report.browser].filter((entry) => entry.status !== 'pass'), null, 2));
});

for (const [mode, failedCase] of [
  ['browser-commit-error', 'desktop-upload-preview-commit'],
  ['browser-stale-preview', 'desktop-selection-invalidates-preview'],
  ['browser-html', 'desktop-upload-preview-commit'],
]) {
  test(`${mode} control is rejected by the real browser flow`, { skip: !playwrightModule, timeout: 130000 }, async () => {
    const report = await qualify(mode, true);
    assert.equal(report.functionalOutcome, 'pass', 'the browser control must not merely fail the HTTP suite');
    assert.equal(report.browser.find((item) => item.id === failedCase)?.status, 'fail', JSON.stringify(report.browser));
    assert.equal(report.browserOutcome, 'fail');
  });
}
