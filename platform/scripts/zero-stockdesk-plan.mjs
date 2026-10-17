/** Fixed matched-model experiment contract. No app or model executes here. */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export const STOCKDESK_ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const STOCKDESK_SETTINGS=Object.freeze({model:'claude-haiku-5-5',reasoning:'high',systemPromptMode:'default',tools:'Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch',timeoutMs:1200000,maxObservedToolActions:100,maxTurns:100});
export const stockHash=value=>createHash('sha256').update(value).digest('hex');
export const STOCKDESK_SOURCES=['package.json','benchmarks/stockdesk-v1/PROMPT.md','benchmarks/stockdesk-v1/README.md','benchmarks/stockdesk-v1/proposal.json','benchmarks/stockdesk-v1/acceptance.mjs','benchmarks/stockdesk-v1/browser-grader.cjs',...['zero-stockdesk-plan.mjs','zero-stockdesk-contract.mjs','zero-stockdesk-prepare.mjs','zero-stockdesk-run.mjs','zero-stockdesk.test.mjs','zero-claude-cli.mjs','zero-codex-cli.mjs','zero-lab-strategies.mjs','zero-lab-config.mjs','zero-lab-prepare.mjs','zero-lab-reuse.mjs','zero-lab-jev.mjs','zero-lab-evaluate.mjs','zero-lab-browser.mjs','zero-lab-acceptance.mjs'].map(f=>'platform/scripts/'+f),'platform/packages/adapters/src/zero-systemone.ts','platform/packages/adapters/src/zero-repository-tools.ts','platform/packages/adapters/src/zero-repository-selector.ts','platform/packages/core/src/zero-catalog-data.json',...['package.json','server.mjs','ui.html'].map(f=>'platform/packages/testkit/fixtures/stockdesk/'+f)];
export async function stockSnapshot(){const digests={};for(const f of STOCKDESK_SOURCES)digests[f]=stockHash(await readFile(new URL('../../'+f,import.meta.url)));return digests;}
