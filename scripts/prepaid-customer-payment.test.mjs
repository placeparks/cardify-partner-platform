import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

const moduleUrl=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`
async function load(path,replacements={}) {
 let source=ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 for(const [from,to] of Object.entries(replacements).sort((a,b)=>b[0].length-a[0].length))source=source.replaceAll(from,to)
 return moduleUrl(source)
}
const contract=await load('../lib/manufacturing-contract.ts')
const prepaidContract=await load('../lib/prepaid-contract.ts',{'@/lib/manufacturing-contract':contract})
const db=moduleUrl(`export const supabaseAdmin={from(){const query={select(){return query},eq(){return query},async single(){return {data:globalThis.paymentFixture.q}}};return query}}`)
const credit=moduleUrl(`export async function creditRpc(name,body){
 const f=globalThis.paymentFixture;f.rpc.push({name,body});
 if(name==='partner_prepaid_bind_checkout'){f.q={...f.q,stripe_session_id:body.p_session,stripe_checkout_url:body.p_url,customer_payment_status:'open'};return f.q}
 if(name==='partner_prepaid_claim_payment')return 1;
 if(name==='partner_prepaid_apply_payment'){f.q={...f.q,customer_payment_status:body.p_state};return true}
 throw Error('Unexpected RPC '+name)
}`)
const stripe=moduleUrl(`export async function prepaidStripe(path,body,key){const f=globalThis.paymentFixture;f.stripe.push({path,key});return f.session}`)
const {ensureCustomerCheckout}=await import(await load('../lib/prepaid-customer-payment.ts',{
 '@/lib/supabase-admin':db,'@/lib/partner-api':moduleUrl('export const checked=r=>{if(r.error)throw r.error;return r.data}'),
 '@/lib/manufacturing-contract':contract,'@/lib/prepaid':credit,'@/lib/prepaid-stripe':stripe,'@/lib/prepaid-contract':prepaidContract,
}))
function fixture(url='https://pay.tcgplaytest.com/c/pay/cs_test_example') {
 process.env.STRIPE_SECRET_KEY='sk_test_fixture'
 const q={id:'quote',partner_id:'partner',order_id:'order',payment_mode:'test',funding_model:'cards_credit',status:'consumed',customer_payment_status:'pending',shipping_cents:695,tax_cents:0,shipping:{email:'test@example.com'},checkout_started_at:new Date().toISOString(),checkout_expires_at:new Date(Math.floor(Date.now()/1000)*1000+3600000).toISOString(),customer_checkout_origin:'https://partner.example',customer_return_token:'return'}
 const session={id:'cs_test_example',mode:'payment',livemode:false,status:'open',payment_status:'unpaid',currency:'usd',amount_total:695,expires_at:Date.parse(q.checkout_expires_at)/1000,url,metadata:{prepaid_quote_id:q.id,partner_id:q.partner_id,order_id:q.order_id,payment_purpose:'prepaid_shipping_tax'}}
 return globalThis.paymentFixture={q,session,rpc:[],stripe:[]}
}
test('verified Stripe checkout supports its custom domain and retries reuse the bound session',async()=>{
 const f=fixture();const q=await ensureCustomerCheckout(f.q)
 assert.equal(q.stripe_checkout_url,f.session.url)
 assert.equal(f.rpc[0].name,'partner_prepaid_bind_checkout')
 assert.equal(f.stripe[0].key,'prepaid-customer-quote')
 await ensureCustomerCheckout(q);assert.equal(f.stripe.length,1)
})
test('standard Stripe domain remains supported',async()=>{
 const f=fixture('https://checkout.stripe.com/c/pay/cs_test_example')
 assert.equal((await ensureCustomerCheckout(f.q)).customer_payment_status,'open')
})
test('an expired idempotent session without a URL is reconciled, never offered for payment',async()=>{
 const f=fixture(null);f.session.status='expired'
 assert.equal((await ensureCustomerCheckout(f.q)).customer_payment_status,'expired')
 assert.deepEqual(f.rpc.map(x=>x.name),['partner_prepaid_claim_payment','partner_prepaid_apply_payment'])
 const payment=f.rpc[1].body;assert.equal(payment.p_state,'expired');assert.equal(payment.p_paid,0);assert.equal(payment.p_intent,null)
})
test('mismatched identities or amounts cannot bind checkout',async()=>{
 for(const change of [{livemode:true},{amount_total:700},{metadata:{}}]){
  const f=fixture();Object.assign(f.session,change)
  await assert.rejects(ensureCustomerCheckout(f.q),/Customer checkout mismatch/);assert.equal(f.rpc.length,0)
 }
})
test('missing or unsafe URLs from an open session cannot bind checkout',async()=>{
 for(const url of [null,'http://pay.tcgplaytest.com','javascript:alert(1)','https://name:pass@pay.tcgplaytest.com']){
  const f=fixture(url);await assert.rejects(ensureCustomerCheckout(f.q),/Customer checkout URL unavailable/);assert.equal(f.rpc.length,0)
 }
})
