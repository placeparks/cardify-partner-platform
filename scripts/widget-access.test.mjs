import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

const moduleUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`
async function load(path, replacements = {}) {
  let js = ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  for (const [from, to] of Object.entries(replacements)) js = js.replaceAll(`"${from}"`, JSON.stringify(to)).replaceAll(`'${from}'`, JSON.stringify(to))
  return moduleUrl(js)
}
const features = await load('../lib/partner-features.ts')
const next = moduleUrl('export const NextResponse={json:Response.json.bind(Response)};')
const noStripe = moduleUrl('export const stripeRequest=()=>{throw new Error("Stripe must not be called")};export const cardifyAppOrigin=()=>"";export const isStripeAccountReady=()=>false;')
const partnership = moduleUrl('export const getSignedInUser=async()=>({user:globalThis.applicationTest.user});export const sendWidgetReadyEmail=()=>{throw new Error("No onboarding emails")};')
const db = moduleUrl('export const supabaseAdmin={from:(...args)=>globalThis.applicationTest.from(...args),rpc:(...args)=>globalThis.applicationTest.rpc(...args)};')
const welcome = moduleUrl('export const deliverWelcomeEmail=async(id)=>{globalThis.applicationTest.emailCalls.push(id);return {sent:false,queued:true}};')
const replacements = { 'next/server': next, '@/lib/partnership': partnership, '@/lib/supabase-admin': db, '@/lib/stripe-connect': noStripe, '@/lib/partner-features': features, '@/lib/partner-welcome': welcome }
const { POST: onboard } = await import(await load('../app/api/stripe/connect/onboard/route.ts', replacements))
const { GET: connectStatus } = await import(await load('../app/api/stripe/connect/status/route.ts', replacements))
const { POST: apply } = await import(await load('../app/api/partnership/apply/route.ts', replacements))
const { partnerWidgetCode } = await import(await load('../lib/widget-access.ts'))

test('approved partners receive a widget without saved Stripe details or a widget key; other statuses and holds are denied', () => {
  const code = partnerWidgetCode({ status: 'approved' }, 'https://partners.example', 'https://checkout.example')
  assert.match(code, /https:\/\/partners.example\/partner-widget\/widget.js/)
  assert.match(code, /data-cart-endpoint="\/api\/tcgplaytest\/cart"/)
  assert.match(code, /data-checkout-origin="https:\/\/checkout.example"/)
  assert.doesNotMatch(code, /partner-share|stripe|tcgp_live_|partner-key/i)
  for (const partner of [{ status: 'pending' }, { status: 'declined' }, { status: 'approved', api_blocked_at: '2026-10-02' }]) {
    assert.equal(partnerWidgetCode(partner, 'https://partners.example', 'https://checkout.example'), null)
  }
})

test('Connect endpoints stay disabled without contacting Stripe or sending onboarding emails', async () => {
  assert.equal((await onboard(new Request('https://partners.example/api/stripe/connect/onboard', { method: 'POST' }))).status, 403)
  assert.deepEqual(await (await connectStatus()).json(), { payoutsEnabled: false, required: false })
})

test('signup uses verified identity, grants immediate access and queues a welcome without accepting client approval fields', async () => {
  for (const blocked of [false, true]) {
    let saved
    globalThis.applicationTest = {
      user: { id: 'user1', email: 'shop@example.com', user_metadata: {} },
      emailCalls: [],
      rpc: async (name, params) => { assert.equal(name, 'partner_register'); saved=params; return {data:blocked ? {blocked:true} : {partner:{id:'partner1',status:'approved'}}} },
    }
    const response = await apply(new Request('https://partners.example/api/partnership/apply', {
      method: 'POST', body: JSON.stringify({ businessName: 'Shop', websiteUrl: 'https://shop.example', proposedPercentage: 30, user_id:'forged',email:'forged@example.com',status:'approved',api_blocked_at:null }),
    }))
    assert.equal(response.status, blocked ? 403 : 200)
    assert.deepEqual(saved, {p_user:'user1',p_email:'shop@example.com',p_full_name:null,p_business_name:'Shop',p_website_url:'https://shop.example/',p_audience:null})
    assert.equal(globalThis.applicationTest.emailCalls.length, blocked ? 0 : 1)
    if (!blocked) { const data=await response.json();assert.equal(data.request.status,'approved');assert.equal(data.email.queued,true) }
  }
})

const widgetSource = await readFile(new URL('../public/partner-widget/widget.js', import.meta.url), 'utf8')
function browser({ response = { checkout_url: `https://checkout.example/partner-checkout/${'a'.repeat(64)}` }, ok = true } = {}) {
  const calls = [], navigations = []
  const context = {
    URL, AbortController, setTimeout, clearTimeout,
    document: { currentScript: { src: 'https://partners.example/partner-widget/widget.js', dataset: { autoButton: 'false', checkoutOrigin: 'https://checkout.example' } }, querySelector: () => null },
    window: { location: { origin: 'https://shop.example', assign: url => navigations.push(url) } },
    fetch: async (url, options) => { calls.push({ url, options }); return { ok, json: async () => response } },
  }
  vm.runInNewContext(widgetSource, context)
  return { calls, navigations, open: context.window.TCGPlaytest.open }
}

test('widget calls only the shop server, deduplicates clicks and redirects to certified checkout', async () => {
  const b = browser()
  const first = b.open(), duplicate = b.open()
  assert.equal(first, duplicate)
  await first
  assert.equal(b.calls.length, 1)
  assert.equal(b.calls[0].url, 'https://shop.example/api/tcgplaytest/cart')
  assert.equal(b.calls[0].options.body, '{}')
  assert.equal(b.calls[0].options.credentials, 'same-origin')
  assert.equal(b.calls[0].options.headers.Authorization, undefined)
  assert.equal(b.navigations.length, 1)
  assert.match(b.navigations[0], /checkout.example\/partner-checkout\//)
})

test('widget rejects foreign cart servers, foreign checkout URLs, missing URLs and shop errors without navigation', async () => {
  let b = browser()
  await assert.rejects(b.open({ cartEndpoint: 'https://untrusted.example/cart' }), /own website/)
  assert.equal(b.calls.length, 0)
  for (const response of [{ checkout_url: `https://untrusted.example/partner-checkout/${'a'.repeat(64)}` }, { checkout_url: 'javascript:alert(1)' }, {}, { checkout_url: 'https://checkout.example/account' }]) {
    b = browser({ response })
    await assert.rejects(b.open())
    assert.equal(b.navigations.length, 0)
  }
  b = browser({ response: { error: { message: 'Accept reproduction rights first' } }, ok: false })
  await assert.rejects(b.open(), /Accept reproduction rights first/)
  assert.equal(b.navigations.length, 0)
})

test('custom checkout callback supports CSRF integration and test checkout without exposing credentials', async () => {
  const b = browser()
  await b.open({ createCart: async () => ({ checkout_url: `https://partners.example/partner-checkout/${'b'.repeat(64)}` }) })
  assert.equal(b.calls.length, 0)
  assert.match(b.navigations[0], /^https:\/\/partners.example\//)
})

