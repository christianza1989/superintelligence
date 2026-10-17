import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const out = `${root}/.local/astra-audit-reproduction`;

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const expected = 'fe14bdd4fb9cd8805938e1169a4bd2d13961bb86';
if (git('rev-parse', 'HEAD') !== expected) throw new Error('Snapshot changed: use an isolated checkout of the recorded commit');
const { searchRepositories, repositorySnapshot } = await import(pathToFileURL(`${root}/platform/packages/core/src/zero-catalog.ts`).href);
const { selectRepositoryWithJev } = await import(pathToFileURL(`${root}/platform/packages/adapters/src/zero-repository-selector.ts`).href);
mkdirSync(out, { recursive: true });
const paths = git('ls-files').split('\n');
const docs = paths.filter(p => /\.(md|mdx)$/i.test(p)).map(path => {
  const bytes = readFileSync(`${root}/${path}`);
  const content = bytes.toString('utf8');
  return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), lines: content.split('\n').length,
    headings: content.split('\n').flatMap((line,i) => /^#{1,4} /.test(line) ? [{ line:i+1, text:line }] : []) };
});
writeFileSync(`${out}/document-inventory.json`, JSON.stringify(docs, null, 2)+'\n');
const queries = ['csv', 'csv import', 'inventory', 'warehouse', 'sandėlio', 'importuoti CSV', 'sqlite', 'database', 'spreadsheet', 'tabular data', 'agent platform', 'pdf tables', 'docling', 'honojs/hono', 'image editor', 'photo editing', 'photoshop', 'remove background', 'pdf', 'FFmpeg', 'reverse engineering'];
const probes = queries.map(query => ({ query, results:searchRepositories({query,limit:5}).map(x=>x.repository) }));
let dispatches = 0;
const dependencies = {
  fetch: async () => { dispatches++; throw new Error('Unexpected network dispatch'); },
  reserve: async () => { throw new Error('Unexpected reservation'); },
  authorizeDispatch: async () => false,
  stillEligible: async () => true,
};
const candidate = { repository:'example/unrelated', sourceRevision:'a'.repeat(40), sourceAvailable:true, archived:false, capability:'Render static text only; no CSV parsing or database capability', licenseSource:'unknown' };
const singleton = await selectRepositoryWithJev({model:'unused',timeoutMs:1000},dependencies,{invocationId:'audit-singleton',generation:1,goal:'Import CSV with strict validation and SQLite persistence',candidates:[candidate]});
const archived = await selectRepositoryWithJev({model:'unused',timeoutMs:1000},dependencies,{invocationId:'audit-archived',generation:1,goal:'Render static text',candidates:[{...candidate,archived:true}]});
const records=repositorySnapshot.records;
const report={snapshot:expected,originMain:git('rev-parse','origin/main'),status:git('status','--porcelain'),trackedFiles:paths.length,markdownFiles:docs.length,
  catalog:{records:records.length,capabilityNonempty:records.filter(x=>x.capability.trim()).length,sourceAvailable:records.filter(x=>x.sourceAvailable).length,pinned:records.filter(x=>/^[a-f0-9]{40}$/.test(x.sourceRevision??'')).length,runtimeTested:records.filter(x=>x.runtimeTested).length,licenseApproved:records.filter(x=>x.licenseApproved).length},
  searchProbes:probes,singletonSourceAdvice:{result:singleton,networkDispatches:dispatches,interpretation:'Source eligibility is not semantic suitability. This helper is advisory, not an execution grant.'},archivedSourceAdvice:archived,
  rootWorkflows:paths.filter(p=>p.startsWith('.github/workflows/')),nestedWorkflows:paths.filter(p=>p.startsWith('platform/.github/workflows/')),
  apps:paths.filter(p=>/^platform\/apps\/[^/]+\/package.json$/.test(p)),packages:paths.filter(p=>/^platform\/packages\/[^/]+\/package.json$/.test(p)),newPaidCalls:0};
writeFileSync(`${out}/probe-results.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
