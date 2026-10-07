import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import ts from 'typescript'

const require=createRequire(import.meta.url)
const moduleUrl=js=>`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
async function compile(file, replacements={}) {
  let js=ts.transpileModule(await readFile(new URL(`../${file}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  for (const [name,value] of Object.entries(replacements)) js=js.replaceAll(`from "${name}"`,`from "${value}"`)
  return moduleUrl(js)
}
const contract=await compile('lib/manufacturing-contract.ts')
const bleedUrl=await compile('lib/print-bleed.ts',{'sharp':pathToFileURL(require.resolve('sharp')).href,'@/lib/manufacturing-contract':contract})
const {preparePrintArtwork,detectExistingBleed,PRINT_PROCESSING_VERSION}=await import(bleedUrl)
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const solid=(width,height)=>sharp({create:{width,height,channels:4,background:{r:37,g:121,b:209,alpha:1}}}).png().toBuffer()

test('trim-size front/back gain 2 mm without rescaling center pixels; reprocessing does not double bleed',async()=>{
  for (const [width,height,outWidth,outHeight] of [[1500,2100,1596,2196],[1146,1600,1218,1672]]) {
    const original=await solid(width,height)
    const result=await preparePrintArtwork(original)
    const meta=await sharp(result).metadata()
    assert.equal(meta.width,outWidth); assert.equal(meta.height,outHeight); assert.equal(meta.format,'png')
    const center=await sharp(result).extract({left:Math.floor(outWidth/2)-10,top:Math.floor(outHeight/2)-10,width:20,height:20}).raw().toBuffer()
    for(let i=0;i<center.length;i+=4) assert.deepEqual([...center.subarray(i,i+4)],[37,121,209,255])
    const corner=await sharp(result).extract({left:0,top:0,width:5,height:5}).raw().toBuffer()
    assert.deepEqual([...corner.subarray(0,4)],[37,121,209,255])
    assert.deepEqual(await preparePrintArtwork(result),result)
  }
})

test('existing 2 mm is byte-preserved and 3 mm is only cropped to 2 mm',async()=>{
  const existing=await solid(1626,2250)
  assert.deepEqual(await preparePrintArtwork(existing),existing)
  const cropped=await preparePrintArtwork(await solid(1650,2250))
  const meta=await sharp(cropped).metadata()
  assert.deepEqual([meta.width,meta.height],[1602,2202])
  assert.equal(detectExistingBleed(1146,1600),false)
  assert.equal(detectExistingBleed(1156,1600),true)
})

test('the prepared canvas remains within the 40 MP cap',async()=>{
  const large=await solid(5300,7400)
  await assert.rejects(preparePrintArtwork(large),error=>error.code==='image_pixels_exceeded')
})

const source=await solid(750,1050)
const printed=await preparePrintArtwork(source)
const api=moduleUrl('import {createHash} from "node:crypto"; export const digest=b=>createHash("sha256").update(b).digest("hex"); export const checked=r=>{if(r.error)throw r.error;return r.data};')
const db=moduleUrl('export const supabaseAdmin={rpc:(...args)=>globalThis.bleedFixture.rpc(...args),from:(...args)=>globalThis.bleedFixture.from(...args),storage:{from:()=>globalThis.bleedFixture.storage}};')
const download=moduleUrl('export async function safeRequest(){globalThis.bleedFixture.downloads++;return {status:200,bytes:globalThis.bleedFixture.source};}')
const {validateQueuedArtwork}=await import(await compile('lib/ingest-artwork.ts',{
  'sharp':pathToFileURL(require.resolve('sharp')).href,'@/lib/manufacturing-contract':contract,
  '@/lib/partner-api':api,'@/lib/supabase-admin':db,'@/lib/safe-download':download,'@/lib/print-bleed':bleedUrl,
}))
function fixture(options={}) {
  const job={id:'job1',cart_id:'cart1',source_url:'https://images.example/front.png',lease_token:'lease1',attempts:1,...options.job}
  const state={source,downloads:0,claimed:false,objects:new Map(),reservations:[],finished:[],failPrintUpload:false,
    async rpc(name,args) {
      if(name==='partner_claim_validation') {if(this.claimed)return {data:[]};this.claimed=true;return {data:[job]}}
      if(name==='partner_reserve_validation'||name==='partner_reserve_print_artwork'){this.reservations.push({name,...args});return {data:true}}
      if(name==='partner_finish_validation'){this.finished.push(args);return {data:true}}
      throw new Error(`Unexpected RPC: ${name}`)
    },
    from(){return {select(){return this},eq(){return Promise.resolve({data:[]})}}},
    storage:{
      async upload(path,bytes){
        if(state.failPrintUpload&&path.endsWith(hash(printed)))return {error:new Error('storage unavailable')}
        if(state.objects.has(path))return {error:new Error('already exists')}
        state.objects.set(path,bytes);return {data:{}}
      },
      async download(path){return state.objects.has(path)?{data:new Blob([state.objects.get(path)])}:{error:new Error('missing')}},
    },
  }
  globalThis.bleedFixture=state
  return state
}

test('worker stores cart-scoped source and bleed output before completing; source hash stays original',async()=>{
  const state=fixture()
  await validateQueuedArtwork(Date.now()+60000)
  assert.equal(state.downloads,1)
  assert.deepEqual(state.objects.get(`carts/cart1/${hash(source)}`),source)
  assert.deepEqual(state.objects.get(`carts/cart1/${hash(printed)}`),printed)
  assert.equal(state.reservations[0].p_hash,hash(source))
  assert.equal(state.reservations[1].p_hash,hash(printed))
  assert.equal(state.reservations[1].p_version,PRINT_PROCESSING_VERSION)
  assert.equal(state.finished[0].p_error,null)
})

test('worker retry uses stored originals and print output without downloading or adding more bleed',async()=>{
  const originalPath=`carts/cart1/${hash(source)}`,printPath=`carts/cart1/${hash(printed)}`
  const state=fixture({job:{storage_path:originalPath,print_storage_path:printPath,print_sha256:hash(printed),print_version:PRINT_PROCESSING_VERSION,attempts:2}})
  state.objects.set(originalPath,source);state.objects.set(printPath,printed)
  await validateQueuedArtwork(Date.now()+60000)
  assert.equal(state.downloads,0);assert.equal(state.objects.size,2)
  assert.equal(state.finished[0].p_error,null)
})

test('failed print upload cannot complete validation successfully',async()=>{
  const state=fixture();state.failPrintUpload=true
  await validateQueuedArtwork(Date.now()+60000)
  assert.equal(state.finished[0].p_error,'validation_unavailable')
})

test('production signs the prepared file and its hash, with legacy fallback',async()=>{
  const files=[{id:'new',item_index:0,side:'front',quantity:1,state:'stored',storage_path:'source',actual_sha256:'original',print_storage_path:'prepared',print_sha256:'prepared-hash'},
    {id:'legacy',item_index:1,side:'front',quantity:1,state:'stored',storage_path:'legacy-source',actual_sha256:'legacy-hash'}]
  const signed=[]
  globalThis.productionFixture={
    from(table){const data=table==='partner_manufacturing_orders'?{id:'order1',cart_id:'cart1',status:'paid',partner:{}}:table==='partner_artwork'?files:[];return {
      select(){return this},eq(){return this},order(){return this},in(){return this},maybeSingle(){return Promise.resolve({data})},single(){return Promise.resolve({data})},
      insert(){return Promise.resolve({data:null})},then(resolve,reject){return Promise.resolve({data}).then(resolve,reject)},
    }},
    storage:{from(){return {async createSignedUrl(path){signed.push(path);return {data:{signedUrl:'https://private.example/'+path}}}}}},
  }
  const apiUrl=moduleUrl('export const api=fn=>fn();export const internalAuth=()=>{};export const json=r=>r.json();export const checked=r=>r.data;')
  const {POST}=await import(await compile('app/api/internal/production/route.ts',{
    'next/server':moduleUrl('export const NextResponse={json:Response.json};'),'@/lib/partner-api':apiUrl,
    '@/lib/manufacturing-contract':contract,'@/lib/supabase-admin':moduleUrl('export const supabaseAdmin=globalThis.productionFixture;'),
  }))
  const response=await POST(new Request('https://api.example/production',{method:'POST',body:JSON.stringify({order_id:'order1'})}))
  const manifest=await response.json()
  assert.deepEqual(signed,['prepared','legacy-source'])
  assert.deepEqual(manifest.files.map(f=>f.sha256),['prepared-hash','legacy-hash'])
})
