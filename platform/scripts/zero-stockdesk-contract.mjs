/** Fixed StockDesk contract metadata; candidate workspaces never receive grader source. */
export const STOCKDESK_SUITE = 'stockdesk-v1';
export const STOCKDESK_BROWSER_CHECKS = ['load','noHorizontalOverflow','keyboardCreate','keyboardTransferApiReadback','csvPreviewCommitReplay','validation','filtersAndExport','safeText','reloadReadback','noJavaScriptOrConsoleErrors','noExternalRequestsOrPopups'];
export const STOCKDESK_BROWSER_STAGES = ['load','layout','keyboard_create','keyboard_transfer','csv','validation','filters_export','safe_text','reload','layout_after_actions','runtime_errors'];
async function persistenceProbe(){
 const assert=require('node:assert/strict');const origin='http://127.0.0.1:38641';
 async function req(route,body){const r=await fetch(origin+route,{...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(2000)});const text=await r.text();assert.ok(text.length<262144);return{status:r.status,body:JSON.parse(text)};}
 const end=Date.now()+10000;let ready=false;do{try{if((await req('/api/health')).body.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}while(Date.now()<end);assert.ok(ready);
 const stage=process.argv[1],marker=process.argv[2],sku=('REST-'+marker).toUpperCase();
 if(stage==='seed'){
  const p=await req('/api/products',{sku,name:marker,minStock:9});assert.equal(p.status,201);assert.equal(typeof p.body.id,'string');
  const adjustment={reference:marker+'-receipt',sku,warehouse:'main',delta:7,note:'Restart receipt'};
  const transfer={reference:marker+'-transfer',sku,from:'main',to:'reserve',quantity:2,note:'Restart transfer'};
  const a=await req('/api/adjustments',adjustment),t=await req('/api/transfers',transfer);assert.equal(a.status,201);assert.equal(t.status,201);
  const ps=(await req('/api/products?q='+sku)).body.products;const ms=(await req('/api/movements?sku='+sku)).body.movements;
  assert.equal(ms.length,3);assert.deepEqual(ps[0].stock,{main:5,reserve:2});
  process.stdout.write(JSON.stringify({id:p.body.id,title:marker,products:ps,movements:ms,adjustment,transfer,adjustmentResult:a.body,transferResult:t.body,requiredRows:[[p.body.id,marker],...ms.map(e=>[e.id,e.reference])]}));
 }else{
  const expected=JSON.parse(process.argv[3]);assert.deepEqual((await req('/api/products?q='+sku)).body.products,expected.products);assert.deepEqual((await req('/api/movements?sku='+sku)).body.movements,expected.movements);
  for(const [route,body,result] of [['/api/adjustments',expected.adjustment,expected.adjustmentResult],['/api/transfers',expected.transfer,expected.transferResult]]){const r=await req(route,body);assert.equal(r.status,200);assert.deepEqual(r.body,result);}
  assert.deepEqual((await req('/api/movements?sku='+sku)).body.movements,expected.movements);process.stdout.write(JSON.stringify({preserved:true}));
 }
}
export const STOCKDESK_PROBE_CODE = `(${persistenceProbe.toString()})().catch(()=>{process.exitCode=1;});`;
