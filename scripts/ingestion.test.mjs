import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

const url=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const bytes=Buffer.from('original client file')
const hash=createHash('sha256').update(bytes).digest('hex')
const replacements={
  sharp:url('export default()=>({metadata:async()=>({format:"png",width:4000,height:4000,pages:1}),stats:async()=>({})});'),
  '@/lib/partner-api':url('import {createHash} from "node:crypto";export const checked=r=>r.data;export const digest=b=>createHash("sha256").update(b).digest("hex");'),
  '@/lib/supabase-admin':url('export const supabaseAdmin={from:(...a)=>globalThis.ingestionFixture.from(...a),storage:{from:(...a)=>globalThis.ingestionFixture.storage(...a)}};'),
  '@/lib/safe-download':url('export async function safeRequest(source){globalThis.ingestionFixture.downloads.push(source);return {status:200,bytes:globalThis.ingestionFixture.bytes};}'),
}
let js=ts.transpileModule(await readFile(new URL('../lib/ingest-artwork.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
for(const [name,replacement] of Object.entries(replacements))js=js.replaceAll(`from "${name}"`,`from "${replacement}"`)
const {ingestArtwork}=await import(url(js))
function fixture(order={mode:'live',status:'paid',partner:{api_blocked_at:null}}) {
  const state={order,bytes,downloads:[],uploads:[],updates:[],
    file:{id:'front1',cart_id:'cart1',state:'pending',source_url:'https://client.example/front.png',expected_sha256:hash,ingestion_attempts:0},
    from(table) {
      const result=()=>({data:table==='partner_manufacturing_orders'?state.order:table==='partner_artwork'?[state.file]:[]});
      const q={select(){return q;},eq(){return q;},lte(){return q;},order(){return q;},limit(){return q;},maybeSingle:async()=>result(),then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);},update(v){state.updates.push(v);return q;},insert:async()=>({data:null})};return q;
    },
    storage(bucket) {assert.equal(bucket,'partner-artwork');return {upload:async(path,data)=>{state.uploads.push({path,data});return {data:null};}}},
  };globalThis.ingestionFixture=state;return state;
}
test('artwork ingestion never downloads for unpaid, blocked, test-mode or unavailable orders',async()=>{
  for(const order of [null,{mode:'live',status:'pending'},{mode:'test',status:'paid'},{mode:'live',status:'blocked'},{mode:'live',status:'paid',partner:{api_blocked_at:'now'}}]) {
    const state=fixture(order);await ingestArtwork('cart1');assert.equal(state.downloads.length,0);assert.equal(state.uploads.length,0);
  }
})
test('paid ingestion retains the exact client bytes and records the original hash',async()=>{
  const state=fixture();const result=await ingestArtwork('cart1');
  assert.equal(result.ingested,1);assert.deepEqual(state.uploads[0].data,bytes);assert.equal(state.uploads[0].path,'cart1/front1');
  assert.equal(state.updates[0].actual_sha256,hash);assert.equal(state.updates[0].state,'stored');assert.equal(state.updates[0].source_url,null);
})
test('hash mismatch cannot upload an alternative file and records a retry',async()=>{
  const state=fixture();state.file.expected_sha256='0'.repeat(64);const result=await ingestArtwork('cart1');
  assert.equal(result.failures,1);assert.equal(state.uploads.length,0);assert.equal(state.updates[0].last_error,'image_hash_mismatch');assert.equal(state.updates[0].ingestion_attempts,1);
})
