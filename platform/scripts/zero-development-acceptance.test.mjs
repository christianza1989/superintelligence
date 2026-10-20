import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { acceptancePlan, freezeAcceptance, initialResults, verifyAcceptance } from "./zero-development-acceptance.mjs";
import { gradeDevelopmentPdf, PDF_TRUTH } from "./zero-development-acceptance-truth.mjs";
const sha="a".repeat(64);
const good=()=>({
  sourceSha256:sha,pages:1,tables:[{
    provenance:[{page_no:1,bbox:{l:48,t:152,r:548,b:264,coord_origin:"TOPLEFT"}}],
    data:{num_rows:4,num_cols:3,table_cells:PDF_TRUTH["pdf-01"].tables[0].rows.flatMap((row,r)=>row.map((text,c)=>({
      text,start_row_offset_idx:r,end_row_offset_idx:r+1,start_col_offset_idx:c,end_col_offset_idx:c+1,
      bbox:{l:48+c*500/3,t:152+r*28,r:48+(c+1)*500/3,b:152+(r+1)*28,coord_origin:"TOPLEFT"},
    })))},
  }],
});
test("thirty rows retain unsupported domains and all mandatory controls",async()=>{
  const {manifest}=await acceptancePlan(),result=initialResults(manifest);
  assert.equal(manifest.tasks.length,30);assert.equal(result.denominator,30);
  assert.equal(result.rows.filter(x=>x.status==="blocked").length,20);
  assert.equal(result.rows.filter(x=>x.status==="not_run").length,10);
  assert.equal(result.accepted,false);assert.equal(result.passed,0);
  assert.deepEqual(Object.keys(result.mandatoryControls),["permissions","cancel","restart","budget"]);
  assert.ok(Object.values(result.mandatoryControls).every(x=>x.status==="not_run"&&!x.inherited));
  assert.ok(manifest.tasks.filter(x=>x.domain==="browser").every(x=>x.sourceRegistry[0].url.startsWith("https://acceptance.invalid/")));
});
test("content grader accepts every declared cell only with source and page/bbox truth",()=>{
  assert.deepEqual(gradeDevelopmentPdf("pdf-01",good(),sha),{passed:true,errors:[]});
});
for(const [name,mutate]of [
  ["wrong numeric cell",x=>x.tables[0].data.table_cells[5].text="18.91"],
  ["wrong source",x=>x.sourceSha256="b".repeat(64)],
  ["wrong page",x=>x.tables[0].provenance[0].page_no=2],
  ["wrong table bounds",x=>x.tables[0].provenance[0].bbox.b=265],
  ["wrong cell bounds",x=>x.tables[0].data.table_cells[0].bbox.r=500],
  ["duplicate coordinate",x=>x.tables[0].data.table_cells[1]=x.tables[0].data.table_cells[0]],
  ["omitted cell",x=>x.tables[0].data.table_cells.pop()],
  ["extra table",x=>x.tables.push(x.tables[0])],
])test("content grader rejects "+name,()=>{const x=good();mutate(x);assert.equal(gradeDevelopmentPdf("pdf-01",x,sha).passed,false)});
test("freeze is exclusive, verifies bytes, and preserves tamper evidence",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"zero-development-freeze-")),dir=path.join(root,"cohort");
  try{
    await freezeAcceptance(dir);await verifyAcceptance(dir);
    await assert.rejects(freezeAcceptance(dir),{code:"EEXIST"});
    const original=await readFile(path.join(dir,"pdf-01.pdf"));
    await writeFile(path.join(dir,"pdf-01.pdf"),Buffer.concat([original,Buffer.from("changed")]));
    await assert.rejects(verifyAcceptance(dir),/input_hash_changed:pdf-01/);
    assert.ok((await readFile(path.join(dir,"pdf-01.pdf"))).length>original.length);
  }finally{await rm(root,{recursive:true,force:true})}
});
