import { mkdirSync, readFileSync } from 'node:fs';
import { strictParse } from './strict.mjs';
const { mode } = JSON.parse(readFileSync(new URL('../control.json', import.meta.url), 'utf8'));
if (mode === 'impure-import') mkdirSync(`${process.env.DATA_DIR}/import-side-effect`, { recursive: true });
export function parseCsv(text) { return strictParse(text, mode === 'permissive-parser'); }
