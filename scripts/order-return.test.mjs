import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
async function load(path, replacements = {}) {
  let source = ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to)
  return moduleUrl(source)
}
const contractUrl = await load('../lib/manufacturing-contract.ts')
const { partnerReturnUrl } = await import(contractUrl)
const apiUrl = moduleUrl(`import {ApiError} from '${contractUrl}';
export const internalAuth=r=>{if(r.headers.get('authorization')!=='Bearer internal')throw new ApiError(401,'unauthorized','Denied');};
export const json=r=>r.json();
export const checked=r=>{if(r.error)throw r.error;return r.data;};
export const api=async work=>{try{return await work();}catch(e){return Response.json({error:{code:e.code}},{status:e.status||500});}};`)
const dbUrl = moduleUrl(`export const supabaseAdmin={from:table=>{
 const f=globalThis.returnFixture;f.reads++;if(table!=='partner_carts')throw Error('Unexpected table');const filters={};
 const q={select(){return q;},eq(k,v){filters[k]=v;return q;},async maybeSingle(){return {data:Object.entries(filters).every(([k,v])=>f.cart?.[k]===v)?f.cart:null}}};return q;
}};`)
const { POST } = await import(await load('../app/api/internal/order-return/route.ts', {
  'next/server': moduleUrl('export const NextResponse={json:Response.json.bind(Response)};'),
  '@/lib/partner-api': apiUrl, '@/lib/manufacturing-contract': contractUrl, '@/lib/supabase-admin': dbUrl,
}))
function fixture(cart = {}) {
  globalThis.returnFixture = { reads: 0, cart: { id: 'cart1', order_id: 'order1', mode: 'live', return_url: null, partner: { website_url: 'https://shop.example/' }, ...cart } }
  return globalThis.returnFixture
}
const request = (body, auth = 'Bearer internal') => POST(new Request('https://api.example/api/internal/order-return', {
  method: 'POST', headers: { Authorization: auth }, body: JSON.stringify(body),
}))

test('return defaults to the registered website and accepts a same-origin completion page', () => {
  assert.equal(partnerReturnUrl(null, 'https://shop.example'), 'https://shop.example/')
  assert.equal(partnerReturnUrl('https://shop.example/done?ref=123', 'https://shop.example'), 'https://shop.example/done?ref=123')
  for (const url of ['https://attacker.example', 'https://shop.example.attacker.example', '//shop.example', 'javascript:alert(1)', 'http://shop.example', 'https://name:pass@shop.example', 'https://shop.example:8443', 'https://shop.example/#fragment']) {
    assert.throws(() => partnerReturnUrl(url, 'https://shop.example'), undefined, url)
  }
})
test('return lookup requires internal authentication and a matching paid cart/order pair', async () => {
  const state = fixture()
  assert.equal((await request({ cart_id: 'cart1', order_id: 'order1' }, '')).status, 401)
  assert.equal(state.reads, 0)
  for (const body of [{}, { cart_id: 'cart1', order_id: 'someone-else' }, { cart_id: 'someone-else', order_id: 'order1' }]) {
    assert.ok([400,404].includes((await request(body)).status))
  }
  fixture({ order_id: null })
  assert.equal((await request({ cart_id: 'cart1', order_id: 'order1' })).status, 404)
  fixture({ mode: 'test' })
  assert.equal((await request({ cart_id: 'cart1', order_id: 'order1' })).status, 404)
})
test('existing paid carts use their partner website; request payload cannot override it', async () => {
  fixture()
  const response = await request({ cart_id: 'cart1', order_id: 'order1', return_url: 'https://attacker.example' })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { return_url: 'https://shop.example/' })
  fixture({ return_url: 'https://shop.example/done?ref=123' })
  assert.deepEqual(await (await request({ cart_id: 'cart1', order_id: 'order1' })).json(), { return_url: 'https://shop.example/done?ref=123' })
  fixture({ return_url: 'https://attacker.example' })
  assert.equal((await request({ cart_id: 'cart1', order_id: 'order1' })).status, 400)
})
