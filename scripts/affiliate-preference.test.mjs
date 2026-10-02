import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
async function load(path, replacements = {}) {
  let js = ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
  }).outputText
  for(const [from,to] of Object.entries(replacements)) js=js.replaceAll(`'${from}'`,JSON.stringify(to)).replaceAll(`"${from}"`,JSON.stringify(to))
  return url(js)
}
const contract = await load('../lib/manufacturing-contract.ts')
const { TERMS_VERSION } = await import(contract)
const next = url('export const NextResponse={json:Response.json.bind(Response)};')
const db = url(`export const supabaseAdmin={
  from(table){
    const f=globalThis.partnerAffiliateFixture;
    const q={select(){return q},eq(){return q},is(){return q},update(value){f.updates.push({table,value});return q},insert(value){f.updates.push({table,value});return q},
      async maybeSingle(){return {data: table==='partnership_requests'?f.partner:table==='partner_api_keys'?f.key:table==='partner_carts'?f.cart:null}},then(resolve,reject){return Promise.resolve({data:null,error:null}).then(resolve,reject)}};return q;
  },
  async rpc(name,args){
    const f=globalThis.partnerAffiliateFixture;f.rpcs.push({name,args});
    if(name==='partner_rate_limit')return {data:true};
    if(name==='partner_set_checkout_affiliate'){f.partner.checkout_affiliate_code=args.p_code;return {error:f.saveError}};
    if(name==='partner_create_cart'){f.cart=args.p_cart;return {data:f.cart}};
    return {data:null,error:null};
  }
};`)
const api = await load('../lib/partner-api.ts', {
  'next/server':next,'@/lib/supabase-admin':db,'@/lib/manufacturing-contract':contract,
  '@/lib/partnership':url('export const getSignedInUser=async()=>({user:globalThis.partnerAffiliateFixture.user});export const isPartnershipAdmin=async()=>false;'),
})
const affiliate = await load('../lib/partner-affiliate.ts', {'@/lib/supabase-admin':db,'@/lib/manufacturing-contract':contract})
const replacements={'next/server':next,'@/lib/partner-api':api,'@/lib/supabase-admin':db,'@/lib/manufacturing-contract':contract,'@/lib/partner-affiliate':affiliate}
const preferences = await import(await load('../app/api/partnership/affiliate/route.ts',replacements))
const keys = await import(await load('../app/api/partnership/keys/route.ts',replacements))
const carts = await import(await load('../app/v1/carts/route.ts',replacements))
function fixture(t) {
  const f=globalThis.partnerAffiliateFixture={
    user:{id:'owner',email:'owner@example.com'},partner:{id:'partner',user_id:'owner',status:'approved',api_blocked_at:null,terms_version:TERMS_VERSION,website_url:'https://shop.example'},
    calls:[],rpcs:[],updates:[],code:'SHOP',approved:true,cart:null,
  }
  f.key={id:'key1',partner_id:'partner',mode:'live',partner:f.partner}
  t.mock.property(process,'env',{...process.env,TCGPLAYTEST_CHECKOUT_ORIGIN:'https://checkout.example',PARTNER_INTERNAL_SECRET:'test-internal-secret-with-32-characters',PARTNER_LIVE_ENABLED:'true',PARTNER_MIN_IMAGE_WIDTH:'744',PARTNER_MIN_IMAGE_HEIGHT:'1040'})
  t.mock.method(globalThis,'fetch',async (path,options)=>{
    f.calls.push({path,options,body:JSON.parse(options.body)})
    if(f.unavailable)throw Error('Network unavailable')
    return Response.json({approved:f.approved,code:f.approved?f.code:null})
  })
  return f
}
const post = body=>new Request('https://partner.example/api/partnership/affiliate',{method:'POST',body:JSON.stringify(body)})

test('only active authenticated partners can load or save preferences',async t=>{
  const f=fixture(t)
  f.user=null
  assert.equal((await preferences.GET()).status,401)
  assert.equal((await preferences.POST(post({enabled:true}))).status,401)
  f.user={id:'owner',email:'owner@example.com'};f.partner.api_blocked_at='now'
  assert.equal((await preferences.POST(post({enabled:true}))).status,403)
  assert.equal(f.calls.length,0);assert.equal(f.rpcs.length,0)
})

test('opt-in verifies the sign-in email on the checkout server and ignores supplied codes or emails',async t=>{
  const f=fixture(t)
  const result=await preferences.POST(post({enabled:true,email:'other@example.com',code:'HIJACK'}))
  assert.equal(result.status,200);assert.deepEqual(await result.json(),{enabled:true,code:'SHOP'})
  assert.equal(f.calls[0].path,'https://checkout.example/api/partner/affiliate')
  assert.deepEqual(f.calls[0].body,{email:'owner@example.com'})
  assert.equal(f.calls[0].options.redirect,'error')
  assert.deepEqual(f.rpcs[0],{name:'partner_set_checkout_affiliate',args:{p_partner:'partner',p_actor:'owner',p_code:'SHOP'}})
  f.approved=false;f.rpcs=[]
  assert.equal((await preferences.POST(post({enabled:true}))).status,403)
  assert.equal(f.rpcs.length,0)
})

test('disabling works without affiliate service access; invalid consent never enables attribution',async t=>{
  const f=fixture(t);f.unavailable=true;f.partner.checkout_affiliate_code='SHOP'
  assert.deepEqual(await (await preferences.POST(post({enabled:false}))).json(),{enabled:false,code:null})
  assert.equal(f.calls.length,0);assert.equal(f.partner.checkout_affiliate_code,null)
  for(const enabled of ['yes','false',1,null,undefined]) assert.equal((await preferences.POST(post({enabled}))).status,400)
  assert.equal(f.rpcs.length,1)
})

test('key creation saves an explicit preference; existing clients omitting it remain compatible',async t=>{
  const f=fixture(t)
  const body={mode:'live',accept_terms:true,terms_version:TERMS_VERSION}
  assert.equal((await keys.POST(post({...body,use_affiliate:true}))).status,200)
  assert.equal(f.partner.checkout_affiliate_code,'SHOP')
  assert.equal(f.rpcs[0].name,'partner_set_checkout_affiliate');assert.equal(f.rpcs[1].name,'partner_rotate_key')
  f.rpcs=[];f.calls=[]
  assert.equal((await keys.POST(post(body))).status,200)
  assert.equal(f.calls.length,0);assert.ok(!f.rpcs.some(call=>call.name==='partner_set_checkout_affiliate'))
  assert.equal(f.partner.checkout_affiliate_code,'SHOP')
})

test('new API/widget carts snapshot opt-in; retries and customer removal cannot silently change an existing cart',async t=>{
  const f=fixture(t)
  const body={items:[{image_url:'https://shop.example/front.png',sha256:'a'.repeat(64),back_image_url:'https://shop.example/back.png',back_sha256:'b'.repeat(64),quantity:1}],certification:{client_supplied:true,reproduction_authorized:true,manufacturing_only:true,terms_version:TERMS_VERSION}}
  const request=(extra={})=>new Request('https://partner.example/v1/carts',{method:'POST',headers:{Authorization:'Bearer tcgp_live_'+ 'a'.repeat(64),'Idempotency-Key':'same'},body:JSON.stringify({...body,...extra})})
  assert.equal((await carts.POST(request())).status,201);assert.equal(f.cart.affiliate_code,null)
  f.cart=null;f.partner.checkout_affiliate_code='SHOP'
  assert.equal((await carts.POST(request())).status,201);assert.equal(f.cart.affiliate_code,'SHOP')
  const count=f.rpcs.filter(call=>call.name==='partner_create_cart').length
  f.partner.checkout_affiliate_code=null
  assert.equal((await (await carts.POST(request())).json()).affiliate_code,'SHOP')
  assert.equal(f.rpcs.filter(call=>call.name==='partner_create_cart').length,count)
  assert.equal((await carts.POST(request({affiliate_code:'HIJACK'}))).status,400)
})

test('SQL preference migration is repeatable, audited, service-only, and preserves existing data',async()=>{
  const db=new PGlite()
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`)
    for(const file of ['20260716_create_partnership_platform.sql','20260716_add_stripe_connect_to_partnerships.sql','20261002_manufacturing_api.sql','20261002_manufacturing_enforcement.sql','20261003000000_customer_checkout_affiliates.sql']) {
      await db.exec((await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8')).replace('create extension if not exists "pgcrypto";',''))
    }
    const uid='00000000-0000-4000-a000-000000000001',pid='00000000-0000-4000-a000-000000000002'
    await db.query('insert into auth.users values($1)',[uid])
    await db.query(`insert into partnership_requests(id,user_id,email,business_name,website_url,status) values($1,$2,'owner@example.com','Shop','https://shop.example','approved')`,[pid,uid])
    await db.query("select partner_rotate_key($1,'live','existing-key-hash','existing-prefix')",[pid])
    const migration=await readFile(new URL('../supabase/migrations/20261006000000_partner_checkout_affiliate.sql',import.meta.url),'utf8')
    await db.exec(migration);await db.exec(migration)
    assert.equal((await db.query('select checkout_affiliate_code from partnership_requests')).rows[0].checkout_affiliate_code,null)
    await db.query('select partner_set_checkout_affiliate($1,$2,$3)',[pid,uid,'SHOP'])
    await db.query('select partner_set_checkout_affiliate($1,$2,$3)',[pid,uid,'SHOP'])
    assert.equal((await db.query("select count(*)::int n from partner_audit_events where entity_type='affiliate_preference'")).rows[0].n,1)
    assert.equal((await db.query('select key_hash,revoked_at from partner_api_keys')).rows[0].key_hash,'existing-key-hash')
    assert.equal((await db.query('select revoked_at from partner_api_keys')).rows[0].revoked_at,null)
    assert.equal((await db.query("select has_function_privilege('authenticated','partner_set_checkout_affiliate(uuid,uuid,text)','EXECUTE') allowed")).rows[0].allowed,false)
    assert.equal((await db.query("select has_function_privilege('service_role','partner_set_checkout_affiliate(uuid,uuid,text)','EXECUTE') allowed")).rows[0].allowed,true)
    await assert.rejects(db.query('select partner_set_checkout_affiliate($1,$2,$3)',[pid,pid,'OTHER']),/Partner unavailable/)
    await db.query('select partner_set_checkout_affiliate($1,$2,null)',[pid,uid])
    assert.equal((await db.query('select checkout_affiliate_code from partnership_requests')).rows[0].checkout_affiliate_code,null)
    await db.query('update partnership_requests set api_blocked_at=now()')
    await assert.rejects(db.query('select partner_set_checkout_affiliate($1,$2,$3)',[pid,uid,'SHOP']),/Partner unavailable/)
  } finally { await db.close() }
})
