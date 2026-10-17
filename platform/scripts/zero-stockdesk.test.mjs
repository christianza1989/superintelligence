import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,cp,readFile,writeFile,rm,mkdir,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {summarizeStockDesk} from './zero-stockdesk-run.mjs';
import {STOCKDESK_SETTINGS,stockSnapshot,stockHash} from './zero-stockdesk-plan.mjs';
import {claudeArguments,createClaudeEventParser,resolveClaudeExecutable,claudeExecutableDigest} from './zero-claude-cli.mjs';
import {evaluateSprintDesk} from './zero-lab-evaluate.mjs';
import {evaluateSprintDeskBrowser,parseBrowserReceipt} from './zero-lab-browser.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),exec=promisify(execFile);
test('Haiku exact identity, high effort and bounded settings remain explicit',()=>{
 const args=claudeArguments({model:'claude-haiku-5-5',reasoning:'high',maxTurns:100});assert.equal(args[args.indexOf('--model')+1],'claude-haiku-5-5');assert.equal(args[args.indexOf('--effort')+1],'high');assert.equal(args[args.indexOf('--max-turns')+1],'100');assert(!args.includes('--fallback-model'));assert.throws(()=>claudeArguments({model:'other'}));
 for(const name of ['claude-haiku-5-5','claude-sonnet-5-5']){const parser=createClaudeEventParser({model:'claude-haiku-5-5'});parser.push(Buffer.from(JSON.stringify({type:'assistant',message:{model:name,content:[{type:'text',text:'OK'}]}})+'\n'+JSON.stringify({type:'result',subtype:'success',is_error:false,result:'OK',usage:{input_tokens:1,output_tokens:2},modelUsage:{[name]:{}}})+'\n'));assert.equal(parser.finish().valid,name==='claude-haiku-5-5');}
 assert.equal(parseBrowserReceipt('{}',{suite:'other'}),null);
});
test('real StockDesk positive and negative grader controls', {skip:process.env.ZERO_STOCKDESK_DOCKER_TESTS!=='1',timeout:900000},async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'zero-stockdesk-controls-'));try{
 for(const fault of ['none','split_csv','preview_writes','partial_commit','duplicate_apply','nonatomic_transfer','lost_data'])await t.test(fault,async()=>{
  const candidate=path.join(dir,fault);await cp(path.join(root,'platform/packages/testkit/fixtures/stockdesk'),candidate,{recursive:true});const manifest=JSON.parse(await readFile(path.join(candidate,'package.json'),'utf8'));manifest.scripts.start+=' '+fault;await writeFile(path.join(candidate,'package.json'),JSON.stringify(manifest));let failedNames=[];
  const runDocker=async(args,options)=>{try{const r=await exec('docker',args,{env:options.env,cwd:options.cwd,timeout:options.timeoutMs,maxBuffer:1048576,signal:options.signal});return{...r,exitCode:0};}catch(e){if(args.includes('/grader/acceptance.mjs'))failedNames=String(e.stdout??'').split('\n').filter(l=>/^\s*not ok \d+ - /.test(l)).map(l=>l.trim().slice(0,180));return{exitCode:-1,stdout:'',stderr:''};}};
  const r=await evaluateSprintDesk({suite:'stockdesk-v1',candidatePath:candidate,trustProfile:'controlled_synthetic',timeoutMs:180000},{runDocker});
  assert.equal(r.cleanup,'passed');if(fault==='none'){assert.equal(r.functionalStatus,'passed',JSON.stringify({reason:r.reason,failedNames}));assert.equal(r.api.tests,13);assert.equal(r.persistence.status,'passed');}else{assert.equal(r.status,'failed');assert.equal(fault==='lost_data'?r.persistence.status:r.api.status,'failed');}
 });
 for(const fault of ['none','ui_no_api'])await t.test('browser_'+fault,async()=>{const candidate=path.join(dir,fault==='none'?'none':'ui_no_api');if(fault!=='none'){await cp(path.join(root,'platform/packages/testkit/fixtures/stockdesk'),candidate,{recursive:true});const m=JSON.parse(await readFile(path.join(candidate,'package.json'),'utf8'));m.scripts.start+=' '+fault;await writeFile(path.join(candidate,'package.json'),JSON.stringify(m));}const r=await evaluateSprintDeskBrowser({suite:'stockdesk-v1',candidatePath:candidate,trustProfile:'controlled_synthetic',timeoutMs:180000});assert.equal(r.cleanup,'passed');assert.equal(r.status,fault==='none'?'passed':'failed',JSON.stringify({reason:r.reason,failedCheck:r.failedCheck,checks:r.checks}));});
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('summary refuses failed apps, unverified models and fixed-effort changes',()=>{
 const report={stage:'system',pairs:1,status:'completed',cliVersion:'2.1.301',cliIntegrity:'passed',executionKind:'claude_cli',liveRequested:true,settings:STOCKDESK_SETTINGS,sourceIntegrity:'passed',timingIntegrity:'passed',preparation:{packs:{C:{elapsedMs:10,apiActualCostUsd:0.001}}},trials:['A','C'].map(lane=>({lane,outcome:'passed',codingMs:100,gradingMs:20,trialMs:120,generation:{actualModel:'claude-haiku-5-5',apiEquivalentCostEstimateUsd:0.1,usage:{inputTokens:10,outputTokens:2,totalTokens:12,cachedInputTokens:5,cacheCreationInputTokens:4,uncachedInputTokens:1}}}))};
 assert.equal(summarizeStockDesk(report).status,'comparable');assert.equal(summarizeStockDesk(report).lanes.C.workflowMs,130);assert.equal(summarizeStockDesk(report).lanes.C.totalTokens,12);
 for(const field of ['outcome','model','effort','cli']){const r=structuredClone(report);if(field==='outcome')r.trials[1].outcome='functional_failed';if(field==='model')r.trials[1].generation.actualModel='claude-sonnet-5-5';if(field==='effort')r.settings.reasoning='low';if(field==='cli')r.cliVersion='2.1.292';assert.equal(summarizeStockDesk(r).status,'not_comparable');assert.equal(summarizeStockDesk(r).metrics,null);}
 const unknown=structuredClone(report);unknown.trials[1].generation.usage=null;assert.equal(summarizeStockDesk(unknown).lanes.C.totalTokens,null);
});
test('dry runner and preparation preserve sources without auth, Docker or models',async()=>{const before=await stockSnapshot();const proposal=JSON.parse(await readFile(path.join(root,'benchmarks/stockdesk-v1/proposal.json'),'utf8'));assert.equal(stockHash(await readFile(path.join(root,proposal.taskPromptPath))),proposal.taskPromptSha256);assert.equal(stockHash(await readFile(path.join(root,proposal.protocolPath))),proposal.protocolSha256);assert.equal(before['benchmarks/stockdesk-v1/PROMPT.md'],proposal.taskPromptSha256);});

test('pin resolves the executable and detects changed bytes independently of a launcher symlink',async()=>{const dir=await mkdtemp(path.join(tmpdir(),'stockdesk-cli-pin-'));try{const file=path.join(dir,'claude');await writeFile(file,'synthetic executable A');await chmod(file,0o755);assert.equal(await resolveClaudeExecutable({PATH:dir}),file);const first=await claudeExecutableDigest(file);await writeFile(file,'synthetic executable B');assert.notEqual(await claudeExecutableDigest(file),first);await assert.rejects(()=>claudeExecutableDigest('relative-cli'));}finally{await rm(dir,{recursive:true,force:true});}});
