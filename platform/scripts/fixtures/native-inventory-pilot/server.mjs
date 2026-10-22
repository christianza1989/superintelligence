// Qualification reference/control only. This is not a candidate starter.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseCsv } from './component/app.mjs';
import { strictParse } from './component/strict.mjs';

const { mode } = JSON.parse(readFileSync(new URL('./control.json', import.meta.url), 'utf8'));
mkdirSync(process.env.DATA_DIR, { recursive: true });
const db = new DatabaseSync(mode === 'lost-persistence' ? ':memory:' : path.join(process.env.DATA_DIR, 'inventory.sqlite'));
db.exec('CREATE TABLE IF NOT EXISTS items (sku TEXT PRIMARY KEY COLLATE BINARY, name TEXT NOT NULL, quantity INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS imports (key TEXT PRIMARY KEY, hash TEXT NOT NULL, count INTEGER NOT NULL)');
if (mode === 'lost-ledger') db.exec('DELETE FROM imports');
const items = () => db.prepare('SELECT sku, name, quantity FROM items ORDER BY sku COLLATE BINARY').all();
const upsert = db.prepare('INSERT INTO items(sku,name,quantity) VALUES (?,?,?) ON CONFLICT(sku) DO UPDATE SET name=excluded.name, quantity=excluded.quantity');
const error = (row, field, message) => ({ row, field, message });
const validate = (bytes) => {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { return { valid: false, rows: [], errors: [error(1, 'csv', 'Invalid UTF-8')] }; }
  if (text.startsWith('\uFEFF')) text = text.slice(1);
  let parsed;
  try { parsed = mode === 'bypass-parser' ? strictParse(text) : parseCsv(text); }
  catch (cause) { return { valid: false, rows: [], errors: [error(1, 'csv', cause.message)] }; }
  if (JSON.stringify(parsed[0]) !== JSON.stringify(['sku', 'name', 'quantity'])) return { valid: false, rows: [], errors: [error(1, 'csv', 'Header must be sku,name,quantity')] };
  if (parsed.length < 2 || parsed.length > 129) return { valid: false, rows: [], errors: [error(1, 'csv', 'Require 1 to 128 data rows')] };
  const errors = [];
  const rows = [];
  const seen = new Set();
  for (const [index, cells] of parsed.slice(1).entries()) {
    const row = index + 2;
    if (cells.length !== 3) { errors.push(error(row, 'csv', 'Require three fields')); continue; }
    const [sku, name, quantity] = cells;
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(sku)) errors.push(error(row, 'sku', 'SKU must have 1 to 32 ASCII letters, digits, _ or -'));
    if (seen.has(sku)) errors.push(error(row, 'sku', 'Duplicate SKU'));
    seen.add(sku);
    if (!/\S/u.test(name) || name.length > 1000) errors.push(error(row, 'name', 'Name must contain text and have at most 1000 code units'));
    if (!/^[0-9]+$/.test(quantity) || Number(quantity) > 1000000) errors.push(error(row, 'quantity', 'Quantity must be decimal digits from 0 to 1000000'));
    rows.push({ sku, name, quantity: Number(quantity) });
  }
  return errors.length ? { valid: false, rows: [], errors } : { valid: true, rows, errors: [] };
};
const respond = (response, status, body) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body)); };
const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/api/health') return respond(response, 200, { ok: true });
    if (request.method === 'GET' && request.url === '/api/items') return respond(response, 200, { items: items() });
    if (request.method === 'GET' && request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      let html = readFileSync(new URL('./index.html', import.meta.url), 'utf8').replace('__CONTROL_MODE__', JSON.stringify(mode));
      if (mode === 'browser-accessible-table') html = html.replace('<button id="preview">Preview</button>', '<button id="preview" aria-label="Preview">⇢</button>').replace('<button id="commit" disabled>Commit</button>', '<button id="commit" aria-label="Commit" disabled>✓</button>');
      return response.end(html);
    }
    if (request.method !== 'POST' || !['/api/preview', '/api/commit'].includes(request.url)) return respond(response, 404, { error: 'Not found' });
    const commit = request.url === '/api/commit';
    const key = request.headers['idempotency-key'];
    if (commit && (typeof key !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(key))) { request.resume(); return respond(response, 400, { errors: [error(1, 'csv', 'Invalid Idempotency-Key')] }); }
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size <= 16384) chunks.push(chunk);
    }
    if (size > 16384) return respond(response, 413, { errors: [error(1, 'csv', 'CSV exceeds 16384 bytes')] });
    const bytes = Buffer.concat(chunks);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const previous = commit ? db.prepare('SELECT hash,count FROM imports WHERE key=?').get(key) : null;
    if (previous && previous.hash !== hash && mode !== 'conflict-overwrite') return respond(response, 409, { error: 'Key already completed with different raw bytes' });
    if (previous && previous.hash === hash && mode !== 'replay-reapply') return respond(response, 200, { applied: false, rowCount: previous.count });
    const result = validate(bytes);
    if (!result.valid) {
      if ((commit && mode === 'invalid-mutation') || (!commit && mode === 'preview-mutation')) upsert.run('CORRUPT', 'Invalid input mutated data', 1);
      if (commit && mode === 'invalid-ledger') db.prepare('INSERT OR REPLACE INTO imports(key,hash,count) VALUES (?,?,?)').run(key, hash, 0);
      return respond(response, commit ? 422 : 200, result);
    }
    if (!commit) return respond(response, 200, result);
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of result.rows) upsert.run(row.sku, row.name, row.quantity);
      db.prepare('INSERT OR REPLACE INTO imports(key,hash,count) VALUES (?,?,?)').run(key, hash, result.rows.length);
      db.exec('COMMIT');
    } catch (cause) { db.exec('ROLLBACK'); throw cause; }
    return respond(response, 200, { applied: true, rowCount: result.rows.length });
  } catch (cause) { respond(response, 500, { error: cause.message }); }
});
server.listen(Number(process.env.PORT ?? 3000), '127.0.0.1', () => console.log(`READY ${server.address().port}`));
const stop = () => { server.close(() => { db.close(); process.exit(0); }); };
process.once('SIGTERM', stop);
