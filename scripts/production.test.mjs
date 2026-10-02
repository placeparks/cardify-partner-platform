import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const moduleUrl=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const contract=moduleUrl(`export class ApiError extends Error { constructor(status,code,message){super(message);this.status=status;this.code=code;} }`)
const api=moduleUrl(`import {ApiError} from '${contract}';
export const checked=result=>{if(result.error)throw result.error;return result.data;};
export const internalAuth=request=>{if(request.headers.get('authorization')!=='Bearer internal')throw new ApiError(401,'unauthorized','Denied');};
export const json=request=>request.json();
export const api=async work=>{try{return await work();}catch(error){return Response.json({error:{code:error.code,message:error.message}},{status:error.status||500});}};`)
const db=moduleUrl('export const supabaseAdmin={from:(...args)=>globalThis.productionFixture.from(...args),storage:{from:(...args)=>globalThis.productionFixture.storage(...args)}};')
const ingest=moduleUrl('export async function ingestArtwork(id){globalThis.productionFixture.ingestions.push(id);if(globalThis.productionFixture.blockDuringIngestion)globalThis.productionFixture.order.status="blocked";}')
const raw=await readFile(new URL('../app/api/internal/production/route.ts',import.meta.url),'utf8')
let js=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
for(const [name,url] of Object.entries({'next/server':moduleUrl('export const NextResponse={json:Response.json.bind(Response)};'),'@/lib/partner-api':api,'@/lib/manufacturing-contract':contract,'@/lib/supabase-admin':db,'@/lib/ingest-artwork':ingest}))js=js.replaceAll(name,url)
const {POST}=await import(moduleUrl(js))

function fixture(options={}) {
  const state={
    order:{id:'order1',cart_id:'cart1',partner_id:'partner1',status:'paid',partner:{api_blocked_at:null},...options.order},
    files:[{id:'front',cart_id:'cart1',item_index:0,side:'front',quantity:3,state:'stored',storage_path:'cart1/front',expected_sha256:'a',actual_sha256:'a'},
      {id:'back',cart_id:'cart1',item_index:0,side:'back',quantity:3,state:'stored',storage_path:'cart1/back',expected_sha256:'b',actual_sha256:'b'}],
    signed:[],audit:[],ingestions:[],blocks:[],...options,
    from(table) {
      const result=()=>({data:table==='partner_manufacturing_orders'?state.order:table==='partner_artwork'?state.files:table==='partner_content_blocks'?state.blocks:null});
      const query={select(){return query;},eq(){return query;},order(){return query;},in(){return query;},single:async()=>result(),maybeSingle:async()=>result(),then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);},insert:async event=>{state.audit.push(event);return {data:null};}};
      return query;
    },
    storage(bucket) {assert.equal(bucket,'partner-artwork');return {createSignedUrl:async(path,ttl)=>{state.signed.push({path,ttl});return {data:{signedUrl:`https://private.example/${path}`}};}}},
  }
  globalThis.productionFixture=state;
  return state;
}
async function request(body,auth='Bearer internal') {
  const response=await POST(new Request('https://partner.example/api/internal/production',{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify({order_id:'order1',...body})}));
  return {status:response.status,body:await response.json()};
}
test('production requires internal authentication before accessing storage',async()=>{
  const state=fixture();assert.equal((await request({},'')).status,401);assert.equal(state.signed.length,0);
})
test('metadata-only preparation does not reveal storage paths or sign URLs',async()=>{
  const state=fixture();const result=await request({prepare:true,include_urls:false});
  assert.equal(result.status,200);assert.equal(result.body.ready,true);assert.deepEqual(state.ingestions,['cart1']);
  assert.equal(state.signed.length,0);assert.ok(!JSON.stringify(result.body).includes('storage_path'));
  assert.equal(result.body.files[0].quantity,3);
})
test('one file is signed only if it belongs to this ready order',async()=>{
  const state=fixture();
  assert.equal((await request({file_id:'someone-elses-file'})).status,404);assert.equal(state.signed.length,0);
  const result=await request({file_id:'front',actor:'dashboard:admin1'});
  assert.equal(result.status,200);assert.equal(result.body.files.length,1);assert.equal(state.signed[0].ttl,60);
  assert.equal(state.audit[0].actor,'dashboard:admin1');assert.deepEqual(state.audit[0].details.file_ids,['front']);
})
test('missing, blocked, cancelled, shipped and incomplete artwork cannot be downloaded',async()=>{
  for(const status of ['blocked','cancelled','shipped']) {
    const state=fixture();state.order.status=status;
    assert.equal((await request({file_id:'front'})).status,409);assert.equal(state.signed.length,0);
  }
  let state=fixture();state.order.partner.api_blocked_at=new Date().toISOString();
  assert.equal((await request({})).status,409);assert.equal(state.signed.length,0);
  state=fixture();state.blocks=[{sha256:'a'}];assert.equal((await request({})).status,409);
  state=fixture();state.files[1].state='pending';assert.equal((await request({})).status,409);assert.equal(state.signed.length,0);
  state=fixture({order:null});assert.equal((await request({})).status,404);
})
test('a hold applied during ingestion is rechecked before offering files',async()=>{
  const state=fixture({blockDuringIngestion:true});const result=await request({prepare:true,include_urls:false});
  assert.equal(result.body.ready,false);assert.equal(result.body.status,'blocked');assert.equal(state.signed.length,0);
})
