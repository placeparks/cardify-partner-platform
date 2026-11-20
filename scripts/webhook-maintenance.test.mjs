import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { createHmac } from 'node:crypto'

const source = await readFile(new URL('../app/api/internal/maintenance/route.ts', import.meta.url), 'utf8')
const code = stripTypeScriptTypes(source.replace(/^import .*\r?\n/gm, '')).replaceAll('export ', '')
function fixture(events = [], responseStatus = 200) {
  const state = { writes: [], requests: [], rpcs: [], events }
  const db = {
    async rpc(name, args) { state.rpcs.push({ name, args }); return { data: name === 'partner_due_webhooks' ? events : [] } },
    from(table) {
      assert.notEqual(table, 'partner_webhook_settings', 'No per-event settings lookups')
      let patch
      const q = { select() { return q }, in() { return q }, lte() { return q }, lt() { return q }, is() { return q }, limit() { return q }, delete() { return q },
        update(value) { patch = value; return q }, eq(key, value) { if (patch) state.writes.push({ table, patch, key, value }); return q },
        then(resolve, reject) { return Promise.resolve({ data: [] }).then(resolve, reject) } }
      return q
    },
  }
  const checked = result => { if (result.error) throw result.error; return result.data }
  const names = ['createHmac', 'NextResponse', 'api', 'checked', 'internalAuth', 'cronAuth', 'db', 'safeRequest', 'decrypt', 'deliverWelcomeEmail', 'cleanupUploads', 'console']
  state.get = new Function(...names, code + '\nreturn GET;')(
    createHmac, { json: Response.json }, work => work(), checked, () => {}, () => {}, db,
    async (url, init) => { state.requests.push({ url, init }); return { status: responseStatus } },
    value => { assert.equal(value, 'cipher'); return 'signing-secret' }, async () => ({ sent: false }), async () => 0,
    { info() {}, error() {} },
  )
  return state
}
const event = () => ({ id: 'event1', partner_id: 'partner1', mode: 'live', payload: { id: 'event1', type: 'cart.ready' }, attempts: 2, url: 'https://receiver.example.test/hooks', secret_ciphertext: 'cipher' })
test('an empty configured queue performs no event writes or delivery attempts', async () => {
  const f = fixture(), result = await (await f.get(new Request('https://example.test'))).json()
  assert.equal(result.failures, 0); assert.equal(result.delivered, 0)
  assert.deepEqual(f.writes, []); assert.deepEqual(f.requests, [])
  assert.equal(f.rpcs.filter(x => x.name === 'partner_due_webhooks').length, 1)
})
test('configured receiver keeps its exact payload and HMAC signature', async () => {
  const e = event(), f = fixture([e]), result = await (await f.get(new Request('https://example.test'))).json()
  assert.equal(result.delivered, 1); assert.equal(f.requests.length, 1)
  const { url, init } = f.requests[0]
  assert.equal(url, e.url); assert.equal(init.body, JSON.stringify(e.payload))
  const match = /^t=(\d+),v1=(.+)$/.exec(init.headers['TCGP-Signature'])
  assert.equal(match[2], createHmac('sha256', 'signing-secret').update(`${match[1]}.${init.body}`).digest('hex'))
  assert.equal(f.writes[0].patch.attempts, 3); assert.ok(f.writes[0].patch.delivered_at)
})
test('receiver failures retain the event and existing exponential retry behavior', async () => {
  const f = fixture([event()], 503), before = Date.now()
  const result = await (await f.get(new Request('https://example.test'))).json()
  assert.equal(result.failures, 1); assert.equal(result.delivered, 0)
  const { patch } = f.writes[0]
  assert.equal(patch.delivered_at, null); assert.equal(patch.attempts, 3)
  assert.ok(Date.parse(patch.next_attempt_at) >= before + 120000)
  assert.equal('payload' in patch, false)
})
