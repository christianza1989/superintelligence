import assert from 'node:assert/strict';
import test from 'node:test';
import {parseExportCsv} from './csv-export.mjs';
const origin=process.env.BENCHMARK_ORIGIN;
assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin??''));
let sequence=0;
const marker=prefix=>`${prefix}-${++sequence}`;
async function req(route,body,method=body===undefined?'GET':'POST') {
 const r=await fetch(origin+route,{method,...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(3000)});
 const text=await r.text();assert.ok(text.length<262144);assert.match(r.headers.get('content-type')??'',/application\/json/);return{status:r.status,body:JSON.parse(text)};
}
const post=async(route,body,status=201)=>{const r=await req(route,body);assert.equal(r.status,status,`${route} status`);return r.body;};
const products=async q=>(await req('/api/products'+(q??''))).body.products;
const movements=async sku=>(await req('/api/movements?sku='+sku)).body.movements;
async function product(stock=0,extra={}){const sku=marker('P').toUpperCase();const p=await post('/api/products',{sku,name:sku,minStock:3,...extra});assert.equal(typeof p.id,'string');assert.ok(p.id);if(stock)await adjustment(sku,stock);return p;}
const adjustment=(sku,delta,extra={},status=201)=>post('/api/adjustments',{reference:marker('adj'),sku,warehouse:'main',delta,...extra},status);
const stock=async sku=>(await products('?q='+sku)).find(p=>p.sku===sku).stock;
const csv=lines=>'reference,sku,warehouse,delta,note\n'+lines.join('\n');
const preview=text=>post('/api/import/preview',{csv:text},200);
const commit=(text,status=200)=>post('/api/import/commit',{csv:text},status);
async function shape(v,statuses){assert.equal(v.rows.length,statuses.length);for(let i=0;i<statuses.length;i++){assert.equal(v.rows[i].row,i+1);assert.equal(v.rows[i].status,statuses[i]);assert.equal(typeof v.rows[i].message,'string');if(statuses[i]==='error')assert.ok(v.rows[i].message);}assert.deepEqual(v.totals,{ready:statuses.filter(s=>s==='ready').length,duplicates:statuses.filter(s=>s==='duplicate').length,errors:statuses.filter(s=>s==='error').length});assert.equal(v.valid,!statuses.includes('error'));}
await test('StockDesk independent API contract',async t=>{
 await t.test('health, normalization, defaults and product uniqueness',async()=>{
 assert.deepEqual((await req('/api/health')).body,{ok:true});const sku=marker('NORM').toUpperCase();const p=await post('/api/products',{sku:' '+sku.toLowerCase()+' ',name:' Product '+sku+' '});assert.equal(p.sku,sku);assert.equal(p.name,'Product '+sku);const s=(await products('?q='+sku))[0];assert.deepEqual(s.stock,{main:0,reserve:0});assert.equal(s.totalStock,0);assert.equal(s.minStock,0);assert.equal(s.lowStock,false);await post('/api/products',{sku:sku.toLowerCase(),name:'duplicate'},409);
 for(const bad of [{sku:''},{sku:'a'.repeat(33)},{sku:'a b'},{sku:12},{name:' '},{name:123},{name:'a'.repeat(121)},{minStock:-1},{minStock:1.5},{minStock:1000001},{minStock:'1'},{minStock:null}])await post('/api/products',{sku:marker('X'),name:'ok',...bad},400);
 });
 await t.test('adjustments, history, validation and idempotency',async()=>{
 const p=await product();const ref=marker('idem');const first=await adjustment(p.sku,7,{reference:' '+ref+' ',note:' note '});assert.equal(first.reference,ref);assert.equal(first.entries.length,1);const e=first.entries[0];for(const k of ['id','reference','sku','warehouse','delta','note','createdAt'])assert.ok(Object.hasOwn(e,k));assert.equal(e.note,'note');assert.equal(e.delta,7);assert.ok(Number.isFinite(Date.parse(e.createdAt)));
 assert.deepEqual(await adjustment(p.sku.toLowerCase(),7,{reference:ref,note:'note'},200),first);assert.deepEqual(await stock(p.sku),{main:7,reserve:0});assert.equal((await movements(p.sku)).length,1);await adjustment(p.sku,6,{reference:ref,note:'note'},409);await adjustment(p.sku,7,{reference:ref,note:'different'},409);
 for(const bad of [{delta:0},{delta:'2'},{delta:1.5},{delta:1000001},{warehouse:'other'},{reference:''},{note:3},{note:null},{reference:'x'.repeat(81)},{note:'x'.repeat(501)}])await adjustment(p.sku,2,bad,400);
 await adjustment('UNKNOWN-XYZ',1,{},404);await adjustment(p.sku,-8,{},409);assert.deepEqual(await stock(p.sku),{main:7,reserve:0});assert.equal((await movements(p.sku)).length,1);
 });
 await t.test('transfers are atomic, conservative and replayable',async()=>{
 const p=await product(10);const body={reference:marker('transfer'),sku:p.sku,from:'main',to:'reserve',quantity:4,note:'Move'};const first=await post('/api/transfers',body);assert.equal(first.entries.length,2);assert.deepEqual(first.entries.map(e=>[e.warehouse,e.delta]),[['main',-4],['reserve',4]]);assert.deepEqual(await post('/api/transfers',body,200),first);assert.deepEqual(await stock(p.sku),{main:6,reserve:4});await post('/api/transfers',{...body,quantity:3},409);await adjustment(p.sku,4,{reference:body.reference,note:'Move'},409);await post('/api/transfers',{...body,reference:marker('over'),quantity:7},409);assert.deepEqual(await stock(p.sku),{main:6,reserve:4});for(const bad of [{quantity:0},{quantity:1.2},{quantity:'1'},{from:'bad'},{to:'main'}])await post('/api/transfers',{...body,reference:marker('bad'),...bad},400);
 });
 await t.test('concurrent withdrawals and transfers never overspend',async()=>{
 for(const transfer of [false,true]){const p=await product(10);const rs=await Promise.all([1,2].map(()=>req(transfer?'/api/transfers':'/api/adjustments',transfer?{reference:marker('race'),sku:p.sku,from:'main',to:'reserve',quantity:7}:{reference:marker('race'),sku:p.sku,warehouse:'main',delta:-7})));assert.deepEqual(rs.map(r=>r.status).sort(),[201,409]);assert.deepEqual(await stock(p.sku),{main:3,reserve:transfer?7:0});}
 });
 await t.test('quoted CSV, BOM, CRLF, escaped quotes and newlines',async()=>{
 const p=await product();const ref=marker('quoted');const text='\uFEFFreference,sku,warehouse,delta,note\r\n'+ref+','+p.sku+',main,5,"a, b ""quoted""\nsecond line"\r\n';const before=await movements(p.sku);await shape(await preview(text),['ready']);assert.deepEqual(await movements(p.sku),before);assert.deepEqual(await stock(p.sku),{main:0,reserve:0});assert.deepEqual(await commit(text),{imported:1,duplicates:0});const list=await movements(p.sku);assert.equal(list.length,1);assert.equal(list[0].note,'a, b "quoted"\nsecond line');assert.equal(list[0].reference,ref);
 });
 await t.test('malformed CSV and invalid cells rejected without writes',async()=>{
 const p=await product();for(const text of ['', 'bad,header',csv([`x,${p.sku},main,2`]),csv([`x,${p.sku},main,2,"open`]),csv([`x,${p.sku},main,2,un"quoted`]),csv([`x,${p.sku},main,2,"x"tail`])]){const r=await req('/api/import/preview',{csv:text});assert.equal(r.status,400);assert.ok(r.body.error);await commit(text,400);}for(const value of ['0','1.2','1e2','+2','1000001','']){const text=csv([`${marker('invalid')},${p.sku},main,${value},`]);await shape(await preview(text),['error']);await commit(text,400);}await shape(await preview('reference,sku,warehouse,delta,note\n'),[]);assert.deepEqual(await commit('reference,sku,warehouse,delta,note\n'),{imported:0,duplicates:0});assert.equal((await movements(p.sku)).length,0);
 });
 await t.test('preview simulates order without writes or reference reservations',async()=>{
 const p=await product();const ref=marker('virtual');const text=csv([`${ref},${p.sku},main,5,first`,`${marker('remove')},${p.sku},main,-3,last`]);await shape(await preview(text),['ready','ready']);assert.deepEqual(await stock(p.sku),{main:0,reserve:0});assert.equal((await movements(p.sku)).length,0);await adjustment(p.sku,2,{reference:ref,note:'different'});await shape(await preview(text),['error','error']);await commit(text,409);assert.deepEqual(await stock(p.sku),{main:2,reserve:0});
 });
 await t.test('duplicates inside and across files never append history',async()=>{
 const p=await product();const row=`${marker('repeat')},${p.sku},main,4,note`;const text=csv([row,row]);await shape(await preview(text),['ready','duplicate']);assert.deepEqual(await commit(text),{imported:1,duplicates:1});await shape(await preview(text),['duplicate','duplicate']);assert.deepEqual(await commit(text),{imported:0,duplicates:2});assert.equal((await movements(p.sku)).length,1);assert.deepEqual(await stock(p.sku),{main:4,reserve:0});
 });
 await t.test('failed batches roll back every row and reserve no references',async()=>{
 const p=await product(4);const ref=marker('rollback');const good=`${ref},${p.sku},main,3,ok`;await commit(csv([good,`${marker('bad')},${p.sku},main,0,bad`]),400);assert.deepEqual(await stock(p.sku),{main:4,reserve:0});assert.equal((await movements(p.sku)).length,1);assert.deepEqual(await commit(csv([good])),{imported:1,duplicates:0});const conflict=csv([`${marker('temp')},${p.sku},main,1,ok`,`${marker('overspend')},${p.sku},main,-9,bad`]);await shape(await preview(conflict),['ready','error']);await commit(conflict,409);assert.deepEqual(await stock(p.sku),{main:7,reserve:0});
 });
 await t.test('stale preview and concurrent commits revalidate current state',async()=>{
 const p=await product(5);const text=csv([`${marker('stale')},${p.sku},main,-4,`]);await shape(await preview(text),['ready']);await adjustment(p.sku,-3);await commit(text,409);assert.deepEqual(await stock(p.sku),{main:2,reserve:0});const p2=await product(5);const race=csv([`${marker('simultaneous')},${p2.sku},main,-4,`]);const rs=await Promise.all([1,2].map(()=>req('/api/import/commit',{csv:race})));assert.deepEqual(rs.map(r=>r.status),[200,200]);assert.deepEqual(rs.map(r=>r.body.imported).sort(),[0,1]);assert.deepEqual(await stock(p2.sku),{main:1,reserve:0});assert.equal((await movements(p2.sku)).length,2);
 });
 await t.test('combined filters, movement order and complete escaped export',async()=>{
 const name='MixedCase <b>bolt</b>, "red"';const p=await product(2,{name,minStock:3});assert.equal((await products('?q=mixedcase&lowStock=true')).some(x=>x.sku===p.sku),true);assert.equal((await products('?q=mixedcase&lowStock=false')).some(x=>x.sku===p.sku),false);await adjustment(p.sku,1);assert.equal((await products('?q='+p.sku+'&lowStock=true')).length,0);assert.equal((await req('/api/products?lowStock=bad')).status,400);assert.equal((await req('/api/movements?warehouse=bad')).status,400);assert.deepEqual((await movements(p.sku)).map(e=>e.delta),[2,1]);assert.deepEqual((await req('/api/movements?sku=UNKNOWN-XYZ')).body.movements,[]);const r=await fetch(origin+'/api/export',{signal:AbortSignal.timeout(3000),redirect:'error'});assert.equal(r.status,200);assert.match(r.headers.get('content-type')??'',/^text\/csv;\s*charset=utf-8/i);const text=await r.text();const parsed=parseExportCsv(text);assert.deepEqual(parsed[0],['sku','name','minStock','main','reserve','totalStock']);const actual=parsed.slice(1).map(row=>{assert.equal(row.length,6);const numbers=row.slice(2).map(cell=>{assert.ok(cell.trim());const n=Number(cell);assert.ok(Number.isSafeInteger(n)&&n>=0);return n;});return[row[0],row[1],...numbers];});const expected=(await products()).map(p=>[p.sku,p.name,p.minStock,p.stock.main,p.stock.reserve,p.totalStock]);assert.deepEqual(actual,expected);
 });
 await t.test('malformed JSON, wrong body types and unknown routes never mutate',async()=>{
 const before=await products();for(const route of ['/api/products','/api/adjustments','/api/transfers','/api/import/preview','/api/import/commit']){const r=await fetch(origin+route,{method:'POST',headers:{'content-type':'application/json'},body:'{broken',signal:AbortSignal.timeout(3000)});assert.equal(r.status,400);assert.ok((await r.json()).error);for(const value of [null,[],42])assert.equal((await req(route,value)).status,400);}assert.equal((await req('/api/unknown-route')).status,404);assert.deepEqual(await products(),before);
 });
});
