import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const contract = moduleUrl(`export class ApiError extends Error { constructor(status,code,message){super(message);this.status=status;this.code=code;} }`)
const partnership = moduleUrl(`
export const makePartnerKey=()=> 'generated-widget-key';
export async function isPartnershipAdmin(id,email){globalThis.partnershipFixture.adminChecks.push({id,email});return !globalThis.partnershipFixture.denied;}
export async function sendDecisionEmail(row){globalThis.partnershipFixture.emails.push(row);if(globalThis.partnershipFixture.emailFailure)throw new Error('service unavailable');return {sent:true};}`)
const db = moduleUrl('export const supabaseAdmin={from:(...args)=>globalThis.partnershipFixture.from(...args)};')
async function load(path, replacements) {
  const raw = await readFile(new URL(path, import.meta.url), 'utf8')
  let js = ts.transpileModule(raw, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const [name, url] of Object.entries(replacements)) js = js.replaceAll(name, url)
  return moduleUrl(js)
}
const features = await load('../lib/partner-features.ts', {})
const reviewUrl = await load('../lib/partnership-review.ts', { '@/lib/supabase-admin': db, '@/lib/partnership': partnership, '@/lib/manufacturing-contract': contract, '@/lib/partner-features': features })
const { reviewPartnership, listPartnershipRequests } = await import(reviewUrl)
const api = moduleUrl(`import {ApiError} from '${contract}';
export const internalAuth=request=>{if(request.headers.get('authorization')!=='Bearer internal')throw new ApiError(401,'unauthorized','Denied');};
export const json=request=>request.json();
export const api=async work=>{try{return await work();}catch(error){return Response.json({error:{message:error.message}},{status:error.status||500});}};`)
const routeUrl = await load('../app/api/internal/partnerships/route.ts', {
  'next/server': moduleUrl('export const NextResponse={json:Response.json.bind(Response)};'),
  '@/lib/partner-api': api, '@/lib/partnership-review': reviewUrl, '@/lib/partnership': partnership, '@/lib/manufacturing-contract': contract,
})
const { POST } = await import(routeUrl)
const id = '11111111-1111-4111-a111-111111111111', revision = '2026-10-02T10:00:00+00:00'

function fixture(options = {}) {
  const state = {
    row: { id, email: 'applicant@example.com', business_name: 'Example Cards', status: 'pending', proposed_percentage: 5, approved_percentage: null, api_blocked_at: null, widget_partner_key: null, updated_at: revision, ...options.row },
    updates: [], emails: [], reads: [], ranges: [], adminChecks: [], ...options,
    from(table) {
      assert.equal(table, 'partnership_requests')
      const filters = {}; let changes, columns = '*'
      const result = () => {
        if (state.databaseError) return { error: new Error('database failed') }
        if (state.missing || filters.id && filters.id !== state.row.id) return { data: null }
        if (changes) {
          assert.equal(filters.updated_at, state.row.updated_at)
          if (state.conflict) return { data: null }
          state.updates.push(changes); state.row = { ...state.row, ...changes }
        }
        return { data: { ...state.row } }
      }
      const query = {
        select(value = '*') { columns = value; state.reads.push(value); return query; },
        eq(key, value) { filters[key] = value; return query; }, update(value) { changes = value; return query; }, order() { return query; },
        range(from, to) {
          state.ranges.push([from, to]); const row = Object.fromEntries(columns.split(',').map(field => [field, state.row[field]]))
          return Promise.resolve({ data: [row], count: 26 })
        }, maybeSingle: async () => result(),
      }
      return query
    },
  }
  globalThis.partnershipFixture = state
  return state
}
async function request(body, auth = 'Bearer internal') {
  const response = await POST(new Request('https://partner.example/api/internal/partnerships', {
    method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewer: { userId: id, email: 'admin@example.com' }, ...body }),
  }))
  return { status: response.status, headers: response.headers, body: await response.json() }
}

test('internal credential and partnership admin membership gate list and review', async () => {
  let f = fixture(); assert.equal((await request({ action: 'list' }, '')).status, 401); assert.equal(f.reads.length, 0); assert.equal(f.adminChecks.length, 0)
  f = fixture({ denied: true }); assert.equal((await request({ action: 'review', id, status: 'approved', expectedUpdatedAt: revision })).status, 403)
  assert.equal(f.reads.length, 0); assert.equal(f.emails.length, 0)
  f = fixture(); assert.equal((await request({ action: 'list', reviewer: { userId: id, email: 'malformed,email' } })).status, 403); assert.equal(f.adminChecks.length, 0)
})

test('list is paginated and does not expose widget keys or payout account IDs', async () => {
  const f = fixture(); const result = await request({ action: 'list', page: 2, status: 'all' })
  assert.equal(result.status, 200); assert.deepEqual(f.ranges, [[25, 49]]); assert.equal(result.body.total, 26)
  assert.ok(!('widget_partner_key' in result.body.requests[0])); assert.ok(!('stripe_account_id' in result.body.requests[0]))
  assert.equal(result.headers.get('Cache-Control'), 'private, no-store')
  await assert.rejects(listPartnershipRequests('invalid', 1), error => error.status === 400)
  await assert.rejects(listPartnershipRequests('all', 0), error => error.status === 400)
})

test('approval requires no percentage or Stripe account and preserves reviewer identity and email delivery', async () => {
  const f = fixture(); const result = await request({ action: 'review', id, status: 'approved', approvedPercentage: 0, adminNotes: ' Reviewed ', expectedUpdatedAt: revision })
  assert.equal(result.status, 200); assert.ok(!('approved_percentage' in f.updates[0]))
  assert.equal(f.updates[0].reviewed_by, 'admin@example.com'); assert.equal(f.updates[0].admin_notes, 'Reviewed')
  assert.equal(f.updates[0].widget_partner_key, 'generated-widget-key'); assert.equal(f.emails.length, 1); assert.equal(f.emails[0].status, 'approved')
  assert.ok(!('widget_partner_key' in result.body.request)); assert.equal(result.body.email.sent, true)
})

test('paused percentage inputs are ignored without changing saved financial terms', async () => {
  for (const value of [undefined, '', ' ', true, -1, 31, 'NaN', 1.234]) {
    const f = fixture()
    f.row.approved_percentage = 12
    await reviewPartnership(id, { status: 'approved', approvedPercentage: value }, 'admin@example.com')
    assert.equal(f.updates.length, 1); assert.equal(f.row.approved_percentage, 12); assert.equal(f.row.proposed_percentage, 5)
    assert.ok(!('approved_percentage' in f.updates[0]))
  }
})

test('invalid status and notes cannot save a decision or send email', async () => {
  fixture()
  await assert.rejects(reviewPartnership(id, { status: 'other' }, 'admin@example.com'), error => error.status === 400)
  await assert.rejects(reviewPartnership(id, { status: 'declined', adminNotes: 'a'.repeat(2001) }, 'admin@example.com'), error => error.status === 400)
})

test('blocked, already reviewed, and stale applications fail closed without sending email', async () => {
  for (const options of [{ row: { status: 'approved', updated_at: revision } }, { row: { api_blocked_at: revision, status: 'pending', updated_at: revision } }, { conflict: true }]) {
    const f = fixture(options)
    // Retain the application identity in fixtures that override the full row.
    f.row.id = id
    const result = await request({ action: 'review', id, status: 'approved', approvedPercentage: 5, expectedUpdatedAt: revision })
    assert.equal(result.status, 409); assert.equal(f.updates.length, 0); assert.equal(f.emails.length, 0)
  }
  const f = fixture()
  assert.equal((await request({ action: 'review', id, status: 'approved', expectedUpdatedAt: 'stale' })).status, 409)
  assert.equal((await request({ action: 'review', id, status: 'approved' })).status, 400)
  assert.equal(f.updates.length, 0)
})

test('decline preserves historical percentages; email failure does not undo the saved decision', async () => {
  const f = fixture({ emailFailure: true }); const result = await request({ action: 'review', id, status: 'declined', expectedUpdatedAt: revision, adminNotes: 'Not eligible' })
  assert.equal(result.status, 200); assert.equal(result.body.request.status, 'declined'); assert.equal(result.body.email.sent, false)
  assert.ok(!('approved_percentage' in f.updates[0])); assert.equal(f.emails.length, 1)
})

test('missing applications and database failures never send an approval email', async () => {
  for (const [options, status] of [[{ missing: true }, 404], [{ databaseError: true }, 500]]) {
    const f = fixture(options)
    const result = await request({ action: 'review', id, status: 'approved', expectedUpdatedAt: revision })
    assert.equal(result.status, status); assert.equal(f.emails.length, 0)
  }
})
