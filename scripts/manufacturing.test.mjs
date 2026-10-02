import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'

const source = await readFile(new URL('../lib/manufacturing-contract.ts',import.meta.url),'utf8')
const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const contractURL = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
const {validateCart,TERMS_VERSION}=await import(contractURL)
const request=()=>({items:[{image_url:'https://client.example/front.png',sha256:'a'.repeat(64),back_image_url:'https://client.example/back.png',back_sha256:'b'.repeat(64),quantity:3}],certification:{client_supplied:true,reproduction_authorized:true,manufacturing_only:true,terms_version:TERMS_VERSION}})
test('requires every certification and client-supplied back; never accepts prices or library IDs',()=>{
  assert.equal(validateCart(request()).card_count,3)
  for(const key of ['client_supplied','reproduction_authorized','manufacturing_only']) {const b=request();b.certification[key]=false;assert.throws(()=>validateCart(b),/certifications/)}
  const b=request();delete b.items[0].back_image_url;assert.throws(()=>validateCart(b),/back_image_url/)
  assert.throws(()=>validateCart({...request(),price:1}),/Unknown field/)
  assert.throws(()=>validateCart({...request(),card_stock:'thick'}),/standard/)
})
test('validates quantities, hashes and HTTPS URLs and reports item index',()=>{
  for(const quantity of [0,-1,1.5,'3',Infinity]) {const b=request();b.items[0].quantity=quantity;assert.throws(()=>validateCart(b))}
  assert.throws(()=>validateCart(request(),2),/Maximum/)
  for(const image_url of ['http://example.com/a','https://user:pass@example.com/a','https://example.com:8443/a']) {const b=request();b.items[0].image_url=image_url;assert.throws(()=>validateCart(b),e=>e.item_index===0)}
  const b=request();b.items[0].sha256='bad';assert.throws(()=>validateCart(b),/SHA-256/)
})
test('download guard rejects local, reserved and metadata networks',async()=>{
  const raw=await readFile(new URL('../lib/safe-download.ts',import.meta.url),'utf8')
  const js=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace('@/lib/manufacturing-contract',contractURL)
  const {publicIPv4}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
  for(const address of ['127.0.0.1','10.1.1.1','169.254.169.254','172.16.0.1','192.168.0.1','100.100.100.200','::1','198.18.0.1','224.0.0.1'])assert.equal(publicIPv4(address),false,address)
  assert.equal(publicIPv4('8.8.8.8'),true)
})

test('PostgreSQL migrations enforce certification, test isolation, audit, blocking and lifecycle',async()=>{
  const db=new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`)
  for(const file of ['20260716_create_partnership_platform.sql','20260716_add_stripe_connect_to_partnerships.sql','20261002_manufacturing_api.sql','20261002_manufacturing_enforcement.sql','20261003000000_customer_checkout_affiliates.sql']) {
    const sql=(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8')).replace('create extension if not exists "pgcrypto";','')
    await db.exec(sql)
  }
  const uid='00000000-0000-4000-a000-000000000001',pid='00000000-0000-4000-a000-000000000002'
  await db.query('insert into auth.users values($1)',[uid])
  await db.query(`insert into partnership_requests(id,user_id,email,business_name,website_url,status,terms_version) values($1,$2,'test@example.com','Test','https://client.example','approved',$3)`,[pid,uid,TERMS_VERSION])
  await db.query("select partner_rotate_key($1,'test','hash1','tcgp_test_abc')",[pid])
  await db.query("select partner_rotate_key($1,'test','hash2','tcgp_test_def')",[pid])
  assert.equal((await db.query('select count(*)::int n from partner_api_keys where revoked_at is null')).rows[0].n,1)
  const key=(await db.query('select id from partner_api_keys where revoked_at is null')).rows[0].id
  assert.equal((await db.query('select partner_rate_limit($1,1) allowed',[key])).rows[0].allowed,true)
  assert.equal((await db.query('select partner_rate_limit($1,1) allowed',[key])).rows[0].allowed,false)
  const cart={id:'cart_test',partner_id:pid,api_key_id:key,mode:'test',status:'open',external_ref:'external',card_count:3,card_stock:'standard',affiliate_code:null,return_url:null,certification:request().certification,certification_text:{...request().certification},submitted_by:uid,idempotency_key:'retry-1',request_hash:'same',checkout_token_hash:'tokenhash',checkout_url:'https://test.example/checkout/token',order_id:null,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString()}
  const files=[{item_index:0,side:'front',quantity:3,source_url:'https://client.example/front.png?secret=hidden',source_origin:'https://client.example',expected_sha256:'a'.repeat(64)},{item_index:0,side:'back',quantity:3,source_url:'https://client.example/back.png',source_origin:'https://client.example',expected_sha256:'b'.repeat(64)}]
  const create=async(c=cart)=> (await db.query('select partner_create_cart($1::jsonb,$2::jsonb) result',[JSON.stringify(c),JSON.stringify(files)])).rows[0].result
  const created = await create();assert.equal(created.id,'cart_test');assert.equal(created.affiliate_code,null);assert.equal((await create()).id,'cart_test')
  assert.equal((await create({...cart,request_hash:'different'})).conflict,true)
  assert.equal((await db.query('select count(*)::int n from partner_artwork')).rows[0].n,2)
  await assert.rejects(db.query("select partner_order_event('cart_test','order_test','paid')"),/Live cart/)
  await db.query("update partner_carts set mode='live' where id='cart_test'")
  await db.query("select partner_order_event('cart_test','order_test','paid')")
  await db.query("select partner_order_event('cart_test','order_test','paid')")
  assert.equal((await db.query('select count(*)::int n from partner_webhook_events')).rows[0].n,1)
  await assert.rejects(db.query("select partner_order_event('cart_test','order_test','in_production')"),/Files not ready/)
  await db.query("update partner_artwork set state='stored',actual_sha256=expected_sha256 where cart_id='cart_test'")
  await db.query("select partner_order_event('cart_test','order_test','in_production')")
  await db.query("select partner_enforce('sha256',$1,'Known infringement','operator')",['a'.repeat(64)])
  assert.equal((await db.query("select status from partner_manufacturing_orders where id='order_test'")).rows[0].status,'blocked')
  await assert.rejects(db.query("select partner_order_event('cart_test','order_test','shipped')"),/Manufacturing hold/)
  await db.query("select partner_order_event('cart_test','order_test','cancelled')")
  await db.query("select partner_order_event('cart_test','order_test','paid')")
  assert.equal((await db.query("select status from partner_manufacturing_orders where id='order_test'")).rows[0].status,'cancelled')
  await db.query("update partner_artwork set delete_after=now()-interval '1 minute',legal_hold=(side='back')")
  const due=await db.query('select * from partner_claim_cleanup()');assert.equal(due.rows.length,1);assert.equal(due.rows[0].side,'front')
  const audit=await db.query('select details from partner_audit_events')
  assert.ok(!JSON.stringify(audit.rows).includes('secret=hidden'))
  await assert.rejects(db.query('delete from partner_audit_events'),/append-only/)
  await db.query("select partner_enforce('partner',$1,'Repeat infringement','operator')",[pid])
  assert.equal((await db.query('select count(*)::int n from partner_api_keys where revoked_at is null')).rows[0].n,0)
  await assert.rejects(create({...cart,id:'cart_blocked',idempotency_key:'new'}),/Partner unavailable/)
  await db.close()
})
