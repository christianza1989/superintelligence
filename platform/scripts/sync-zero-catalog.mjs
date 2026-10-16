import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../../', import.meta.url);
const source = JSON.parse(await readFile(new URL('catalog/candidates.json', root), 'utf8'));
const records = source.candidates.map((entry) => ({
  repository: entry.repository,
  category: entry.category,
  capability: entry.capability ?? '',
  note: entry.selection_note ?? '',
  sourceRevision: entry.source_revision,
  sourceAvailable: entry.page_status === 200,
  license: entry.license_summaries.join('; ') || 'Unknown — review required',
  licenseApproved: entry.license_scope_approved === true,
  runtimeTested: entry.runtime_tested === true,
  archived: entry.archived_notice_observed === true,
}));
if (new Set(records.map((r) => r.repository.toLowerCase())).size !== records.length) throw new Error('Duplicate canonical repository');
const snapshot = { researchDate: '2026-10-16', scope: 'Source research, not installed modules', records };
await writeFile(new URL('../packages/core/src/zero-catalog-data.json', import.meta.url), JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Synced ${records.length} canonical candidate records`);
