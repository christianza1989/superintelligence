/** Freeze and inspect a development acceptance plan. No model or backend calls. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { developmentCorpus } from "./zero-development-acceptance-corpus.mjs";
import { expectedFor } from "./zero-development-acceptance-truth.mjs";
export const DEVELOPMENT_PROFILE = Object.freeze({
  id:"zero-development-30-v1", classification:"visible_development_not_independent_holdout",
  model:{id:null,status:"not_authorized_for_this_profile"}, paidApiCapUsd:0, paidModelCalls:0,
  threshold:{total:24,denominator:30,perDomain:7,domainDenominator:10},
  mandatoryControls:["permissions","cancel","restart","budget"],
  runtimePins:{pdfImage:"sha256:d016f2d236645626f243ca8fbf31778b1206f00af3d6e0661c33f2831db83f98",browserImage:"sha256:b74bf06b473909daae82590fb427c1ee37888568f605340ee88c0f858385b6af",browserLockSha256:"96cd2c725060ba0dfc36688ef57cd174375c74bcf4a76d72e6a4c9108ddc90c4",scope:"existing_driver_context_only_new_URL_profile_not_qualified"},
  execution:"not_run", executionHarness:"planned_authenticated_API_PostgreSQL_Graphile",
});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const json=value=>JSON.stringify(value,null,2)+"\n";
const pinPaths=[
  "platform/scripts/zero-development-acceptance-corpus.mjs",
  "platform/scripts/zero-development-acceptance-truth.mjs",
  "platform/scripts/zero-development-acceptance.mjs",
  "platform/scripts/zero-development-acceptance.test.mjs",
  "platform/packages/testkit/src/zero-pdf-fixtures.ts",
  "platform/packages/adapters/src/zero-pdf-contract.ts",
  "platform/packages/adapters/src/zero-component-jobs.ts",
  "platform/packages/adapters/src/zero-pdf-runtime.ts",
  "platform/packages/adapters/src/zero-browser-research.ts",
  "platform/pnpm-lock.yaml",
];
export async function acceptancePlan() {
  const {tasks,inputs}=developmentCorpus();
  const sourcePins=await Promise.all(pinPaths.map(async file=>({path:file,sha256:hash(await readFile(path.join(root,file)))})));
  return {manifest:{version:1,profile:DEVELOPMENT_PROFILE,sourceBaseHead:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),sourcePins,
    tasks:tasks.map(task=>({...task,promptSha256:hash(task.prompt),inputSha256:hash(inputs.get(task.input)),inputBytes:inputs.get(task.input).length,
      expectedSha256:hash(json(expectedFor(task))),
      ...(task.domain==="browser"?{sourceRegistry:[{url:task.sourceUrl,input:task.input,sha256:hash(inputs.get(task.input)),kind:"synthetic_URL_route_requires_real_browser_navigation"}]}:{})})),
    expected:Object.fromEntries(tasks.map(task=>[task.id,expectedFor(task)])),
    runnerPlan:{
      pdf:"For each immutable allowlisted PDF: authenticated submit, actual Graphile worker, page all receipt bytes, verify transport SHA, source/profile/request digest and independent cell/page/bbox grader. Persist all job events and failed attempts.",
      browser:"Add bounded URL navigation through existing BrowserProvider and shared worker. A real visited URL, exact granted origin/path, source registry URL/content SHA and screenshot are required. Inert file extraction cannot pass.",
      coding:"An actual application requires a pinned licensed source component, host/workspace handoff, source artifact, isolated build and independent functional/browser checks of the same revision. Current backend lacks that operation. A parser fixture cannot pass.",
      controls:"Execute dedicated permissions/cancel/restart/budget adversarial controls on this exact profile. Prior conformance receipts are context only. Any forbidden side effect or missing mandatory control prevents G2.",
      attempts:"Write a new immutable attempt directory per execution; preserve failures, blocked, cancelled, partial, unknown and budget exhaustion in all 30 denominator rows.",
    }},inputs};
}
export function initialResults(manifest) {
  const rows=manifest.tasks.map(task=>({id:task.id,domain:task.domain,status:task.supported?"not_run":"blocked",reason:task.supported?"No frozen-corpus backend execution has occurred":task.blockedBy,attempts:[]}));
  return {profile:manifest.profile.id,classification:manifest.profile.classification,accepted:false,gate:"NOT_RUN",passed:0,denominator:30,
    domains:Object.fromEntries(["browser","pdf","coding"].map(domain=>[domain,{passed:0,denominator:10}])),
    mandatoryControls:Object.fromEntries(manifest.profile.mandatoryControls.map(name=>[name,{status:"not_run",inherited:false}])),rows,paidModelCalls:0};
}
export async function freezeAcceptance(directory) {
  const plan=await acceptancePlan();
  await mkdir(directory,{mode:0o700}); // Exclusive directory: existing freezes are never rewritten.
  for(const [name,bytes]of plan.inputs)await writeFile(path.join(directory,name),bytes,{flag:"wx",mode:0o600});
  await writeFile(path.join(directory,"manifest.json"),json(plan.manifest),{flag:"wx",mode:0o600});
  await writeFile(path.join(directory,"manifest.sha256"),hash(json(plan.manifest))+"\n",{flag:"wx",mode:0o600});
  await writeFile(path.join(directory,"results-not-run.json"),json(initialResults(plan.manifest)),{flag:"wx",mode:0o600});
  return plan.manifest;
}
export async function verifyAcceptance(directory) {
  const bytes=await readFile(path.join(directory,"manifest.json"));
  if(hash(bytes)!==(await readFile(path.join(directory,"manifest.sha256"),"utf8")).trim())throw Error("manifest_hash_changed");
  const manifest=JSON.parse(bytes);
  if(manifest.tasks.length!==30||new Set(manifest.tasks.map(x=>x.id)).size!==30)throw Error("denominator_changed");
  for(const domain of ["browser","pdf","coding"])if(manifest.tasks.filter(x=>x.domain===domain).length!==10)throw Error("domain_denominator_changed");
  for(const task of manifest.tasks){
    if(hash(await readFile(path.join(directory,task.input)))!==task.inputSha256)throw Error("input_hash_changed:"+task.id);
    if(hash(task.prompt)!==task.promptSha256||hash(json(manifest.expected[task.id]))!==task.expectedSha256)throw Error("prompt_or_truth_changed:"+task.id);
  }
  for(const pin of manifest.sourcePins)if(hash(await readFile(path.join(root,pin.path)))!==pin.sha256)throw Error("source_pin_changed:"+pin.path);
  return manifest;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [command,directory]=process.argv.slice(2);
  if(!["freeze","verify","plan"].includes(command)||!directory)throw Error("Usage: zero-development-acceptance.mjs freeze|verify|plan NEW_OR_FROZEN_DIRECTORY");
  const manifest=command==="freeze"?await freezeAcceptance(path.resolve(directory)):await verifyAcceptance(path.resolve(directory));
  console.log(json(command==="plan"?initialResults(manifest):{profile:manifest.profile.id,tasks:manifest.tasks.length,classification:manifest.profile.classification,execution:"not_run"}));
}
