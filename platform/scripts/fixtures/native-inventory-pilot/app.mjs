import { mkdirSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { createServer } from 'node:http';
import { strictParse } from './strict.mjs';
const { mode } = JSON.parse(readFileSync(new URL('../control.json', import.meta.url), 'utf8'));
if (mode === 'impure-import') mkdirSync(`${process.env.DATA_DIR}/import-side-effect`, { recursive: true });
if (mode === 'import-network') {
  const socket = createConnection({ host: '127.0.0.1', port: 1 });
  socket.on('error', () => {});
  socket.on('connect', () => socket.destroy());
}
if (mode === 'import-server') createServer().listen(0, '127.0.0.1');
export function parseCsv(text) { return strictParse(text, mode === 'permissive-parser'); }
