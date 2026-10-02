import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import ts from 'typescript'

const migration = '20261004000000_partner_automatic_access.sql'
test('automatic signup is idempotent, auditable, preserves data, and revocation stops keys/carts/production and resubmission', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`)
    for (const file of ['20260716_create_partnership_platform.sql','20260716_add_stripe_connect_to_partnerships.sql','20261002_manufacturing_api.sql','20261002_manufacturing_enforcement.sql','20261003000000_customer_checkout_affiliates.sql',migration]) {
      await db.exec((await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8')).replace('create extension if not exists "pgcrypto";',''))
    }
    const uid='00000000-0000-4000-a000-000000000011', oldUid='00000000-0000-4000-a000-000000000012'
    await db.query('insert into auth.users values($1),($2)',[uid,oldUid])
    await db.query("insert into partnership_requests(user_id,email,business_name,website_url,status,proposed_percentage,approved_percentage) values($1,'old@example.com','Old','https://old.example','declined',9,4)",[oldUid])
    await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'))
    const register=async(user=uid)=>(await db.query("select partner_register($1,'shop@example.com','Shop Owner','Shop','https://shop.example',null) result",[user])).rows[0].result
    assert.equal((await register(oldUid)).blocked,true)
    const legacy=(await db.query('select status,proposed_percentage,approved_percentage from partnership_requests where user_id=$1',[oldUid])).rows[0]
    assert.equal(legacy.status,'declined');assert.equal(Number(legacy.proposed_percentage),9);assert.equal(Number(legacy.approved_percentage),4)
    const first=await register(), again=await register();const partner=first.partner
    assert.equal(partner.status,'approved');assert.equal(partner.terms_accepted_at,null);assert.equal(first.created,true);assert.equal(again.created,false);assert.equal(again.partner.id,partner.id)
    assert.equal((await db.query("select count(*)::int n from partner_audit_events where action='automatically_approved'")).rows[0].n,1)
    const claim=(await db.query('select * from partner_claim_welcome_email($1)',[partner.id])).rows[0]
    assert.equal(claim.welcome_email_attempts,1);assert.ok(claim.welcome_email_claim_token)
    assert.equal((await db.query('select * from partner_claim_welcome_email($1)',[partner.id])).rows.length,0)
    await db.query("update partnership_requests set welcome_email_claim_until=now()-interval '1 second' where id=$1",[partner.id])
    const retry=(await db.query('select * from partner_claim_welcome_email($1)',[partner.id])).rows[0]
    assert.equal(retry.welcome_email_attempts,2);assert.notEqual(retry.welcome_email_claim_token,claim.welcome_email_claim_token)
    await db.query("select partner_rotate_key($1,'live','key-hash','tcgp_live_prefix')",[partner.id])
    const key=(await db.query('select id from partner_api_keys where partner_id=$1',[partner.id])).rows[0].id
    const cert={client_supplied:true,reproduction_authorized:true,manufacturing_only:true,terms_version:'2026-10-02'}
    const cart={id:'cart_auto',partner_id:partner.id,api_key_id:key,mode:'live',status:'open',card_count:1,card_stock:'standard',certification:cert,certification_text:cert,submitted_by:uid,idempotency_key:'order1',request_hash:'request',checkout_token_hash:'token',checkout_url:'https://checkout.example/partner-checkout/token',created_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString()}
    const files=['front','back'].map((side,index)=>({item_index:0,side,quantity:1,source_url:`https://shop.example/${side}.png`,source_origin:'https://shop.example',expected_sha256:String(index).repeat(64)}))
    await db.query('select partner_create_cart($1,$2)',[JSON.stringify(cart),JSON.stringify(files)])
    await db.query("select partner_order_event('cart_auto','order_auto','paid')")
    const stale=(await db.query("select partner_revoke_access($1,'2000-01-01'::timestamptz,'Suspicious activity','admin@example.com') result",[partner.id])).rows[0].result
    assert.equal(stale.conflict,true)
    const revoke=(await db.query('select partner_revoke_access($1,$2,$3,$4) result',[partner.id,partner.updated_at,'Suspicious activity','admin@example.com'])).rows[0].result
    assert.ok(revoke.partner.api_blocked_at);assert.equal(revoke.partner.access_revoked_by,'admin@example.com')
    assert.equal((await db.query('select count(*)::int n from partner_api_keys where revoked_at is null')).rows[0].n,0)
    assert.equal((await db.query("select status from partner_carts where id='cart_auto'")).rows[0].status,'blocked')
    assert.equal((await db.query("select status from partner_manufacturing_orders where id='order_auto'")).rows[0].status,'blocked')
    assert.equal((await db.query("select count(*)::int n from partner_artwork where state='blocked'")).rows[0].n,2)
    assert.equal((await register()).blocked,true)
    await assert.rejects(db.query("select partner_rotate_key($1,'live','newhash','prefix')",[partner.id]),/Partner unavailable/)
    await assert.rejects(db.query('select partner_create_cart($1,$2)',[JSON.stringify({...cart,id:'cart_new',idempotency_key:'order2'}),JSON.stringify(files)]),/Partner unavailable/)
    assert.equal((await db.query('select * from partner_claim_welcome_email($1)',[partner.id])).rows.length,0)
    const audit=(await db.query("select actor,details from partner_audit_events where action='access_revoked'")).rows[0]
    assert.equal(audit.actor,'admin@example.com');assert.equal(audit.details.reason,'Suspicious activity')
    for(const signature of ['partner_register(uuid,text,text,text,text,text)','partner_revoke_access(uuid,timestamptz,text,text)','partner_claim_welcome_email(uuid)']) {
      assert.equal((await db.query("select has_function_privilege('authenticated',$1,'EXECUTE') ok",[signature])).rows[0].ok,false)
      assert.equal((await db.query("select has_function_privilege('service_role',$1,'EXECUTE') ok",[signature])).rows[0].ok,true)
    }
  } finally { await db.close() }
})

const moduleUrl=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
async function load(path,replacements={}) {
  let source=ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  for(const [key,value] of Object.entries(replacements))source=source.replaceAll(`"${key}"`,JSON.stringify(value)).replaceAll(`'${key}'`,JSON.stringify(value))
  return moduleUrl(source)
}
const mockedDb=moduleUrl(`export const supabaseAdmin={rpc:async()=>({data:globalThis.welcomeTest.claim?[globalThis.welcomeTest.claim]:[]}),from:()=>{const q={update:v=>{globalThis.welcomeTest.update=v;return q},eq:(k,v)=>{globalThis.welcomeTest.filters.push([k,v]);return q},then:resolve=>resolve({error:null})};return q}};`)
const mail=moduleUrl('export const sendWidgetReadyEmail=async row=>{globalThis.welcomeTest.sent.push(row);return {sent:globalThis.welcomeTest.success}};')
const {deliverWelcomeEmail}=await import(await load('../lib/partner-welcome.ts',{'@/lib/supabase-admin':mockedDb,'@/lib/partnership':mail}))
test('welcome delivery retries failures and marks successes using the claimed token',async()=>{
  for(const success of [false,true]) {
    globalThis.welcomeTest={claim:{id:'partner1',welcome_email_attempts:1,welcome_email_claim_token:'lease1'},filters:[],sent:[],success}
    const result=await deliverWelcomeEmail('partner1'),f=globalThis.welcomeTest
    assert.equal(result.sent,success);assert.equal(result.queued,!success);assert.equal(f.sent.length,1)
    assert.deepEqual(f.filters,[['id','partner1'],['welcome_email_claim_token','lease1']])
    assert.equal(Boolean(f.update.welcome_email_sent_at),success);assert.equal(Boolean(f.update.welcome_email_next_attempt_at),!success)
  }
  globalThis.welcomeTest={claim:null,sent:[]};await deliverWelcomeEmail();assert.equal(globalThis.welcomeTest.sent.length,0)
})

test('welcome email contains widget, API address, endpoints and key-generation link, with no secret API keys',async()=>{
  const widget=await load('../lib/widget-access.ts')
  const {sendWidgetReadyEmail}=await import(await load('../lib/partnership.ts',{
    'next/headers':moduleUrl('export const cookies=()=>{};'), '@supabase/ssr':moduleUrl('export const createServerClient=()=>{};'),
    '@/lib/supabase-admin':mockedDb,'@/lib/widget-access':widget,
  }))
  const env={GMAIL_SERVICE_ACCOUNT_JSON:'',GMAIL_CLIENT_ID:'dummy',GMAIL_CLIENT_SECRET:'dummy',GMAIL_REFRESH_TOKEN:'dummy',GMAIL_SENDER_EMAIL:'partners@example.com',NEXT_PUBLIC_TCGPLAYTEST_APP_URL:'https://partners.example',TCGPLAYTEST_CHECKOUT_ORIGIN:'https://checkout.example'}
  const previous=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]])), originalFetch=globalThis.fetch
  Object.assign(process.env,env);let message=''
  globalThis.fetch=async(url,options)=>{
    if(String(url)==='https://oauth2.googleapis.com/token')return Response.json({access_token:'dummy-token'})
    assert.equal(String(url),'https://gmail.googleapis.com/gmail/v1/users/me/messages/send')
    message=Buffer.from(JSON.parse(options.body).raw,'base64url').toString();return Response.json({id:'sent-message'})
  }
  try {
    const result=await sendWidgetReadyEmail({status:'approved',email:'shop@example.com',business_name:'Shop',full_name:'Owner'})
    assert.equal(result.sent,true);assert.match(message,/partner-widget\/widget.js/);assert.match(message,/Base URL: https:\/\/partners.example/)
    assert.match(message,/POST \/v1\/carts/);assert.match(message,/https:\/\/partners.example\/dashboard/)
    assert.doesNotMatch(message,/tcgp_(live|test)_[a-f0-9]{64}/);assert.match(message,/Automatic account access does not verify artwork rights/)
  } finally {globalThis.fetch=originalFetch;for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
})
