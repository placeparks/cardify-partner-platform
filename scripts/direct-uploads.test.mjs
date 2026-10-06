import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const moduleUrl = js => `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
async function compile(file, replace = {}) {
  let js = ts.transpileModule(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const [from, to] of Object.entries(replace)) js = js.replaceAll(from, to)
  return moduleUrl(js)
}
process.env.PARTNER_INTERNAL_SECRET = 'test-only-signing-secret-'.repeat(3)
const contractUrl = await compile('lib/manufacturing-contract.ts')
const contract = await import(contractUrl)
const owner = { id: 'key-1', partner_id: 'partner-1', mode: 'test' }
const partner = { status: 'approved', terms_version: contract.TERMS_VERSION, terms_accepted_at: new Date().toISOString() }
const state = { key: { ...owner, partner }, files: new Set(), removed: [], bucket: { public: false, file_size_limit: 20971520, allowed_mime_types: ['image/png', 'image/jpeg'] }, rateAllowed: true }
const ok = data => ({ data, error: null })
const storage = {
  async createSignedUploadUrl(path, options) { assert.equal(options.upsert, false); state.path = path; return ok({ signedUrl: `https://storage.example/storage/v1/object/upload/sign/partner-artwork/${path}?token=upload-only` }) },
  async createSignedUrl(path, duration) { assert.equal(duration, 60); return state.files.has(path) ? ok({ signedUrl: `https://storage.example/read/${path}?token=read-only` }) : { data: null, error: new Error('missing') } },
  async list(path) { return ok(path === 'partner-uploads' ? [{ name: '2000-01-01' }, { name: '2999-01-01' }, { name: '../carts' }] : [{ name: 'a'.repeat(64) + '.png' }, { name: 'other.txt' }]) },
  async remove(paths) { state.removed.push(...paths); return ok([]) },
}
globalThis.__uploadDb = {
  storage: { async getBucket(name) { assert.equal(name, 'partner-artwork'); return ok(state.bucket) }, from(name) { assert.equal(name, 'partner-artwork'); return storage } },
  from(name) {
    assert.equal(name, 'partner_api_keys')
    const filters = {}
    return { select() { return this }, eq(k, v) { filters[k] = v; return this }, is(k, v) { filters[k] = v; return this }, async maybeSingle() { return ok(state.key && (!filters.partner_id || filters.partner_id === state.key.partner_id) && (!filters.mode || filters.mode === state.key.mode) ? state.key : null) } }
  },
  async rpc(name) { assert.equal(name, 'partner_rate_limit'); return ok(state.rateAllowed) },
}
const dbUrl = moduleUrl('export const supabaseAdmin = globalThis.__uploadDb')
const nextUrl = moduleUrl('export const NextResponse = { json: (...args) => Response.json(...args) }')
const sessionUrl = moduleUrl('export const getSignedInUser = () => {}; export const isPartnershipAdmin = () => {}')
const apiUrl = await compile('lib/partner-api.ts', { '@/lib/manufacturing-contract': contractUrl, '@/lib/supabase-admin': dbUrl, '@/lib/partnership': sessionUrl, 'next/server': nextUrl })
const uploadUrl = await compile('lib/partner-uploads.ts', { '@/lib/manufacturing-contract': contractUrl, '@/lib/partner-api': apiUrl, '@/lib/supabase-admin': dbUrl })
const { createUpload, readUploadGrant, assertUploadOwner, uploadSource, cleanupUploads } = await import(uploadUrl)
const { POST } = await import(await compile('app/v1/uploads/route.ts', { '@/lib/partner-api': apiUrl, '@/lib/partner-uploads': uploadUrl }))
const input = { content_type: 'image/png', size: 15000 }
const origin = 'https://partner.example'

test('signed upload is restricted, private, typed, expiring and bound to partner/mode', async () => {
  const result = await createUpload(owner, input, origin)
  assert.equal(result.method, 'PUT')
  assert.deepEqual(result.headers, { 'Content-Type': 'image/png' })
  assert.equal(result.max_bytes, 20971520)
  assert.ok(Date.parse(result.upload_expires_at) > Date.now())
  assert.ok(Date.parse(result.upload_expires_at) < Date.now() + 7201000)
  const token = new URL(result.image_url).searchParams.get('token')
  const grant = readUploadGrant(token)
  assert.match(grant.path, /^partner-uploads\//)
  assert.equal(grant.partner, owner.partner_id)
  assertUploadOwner(result.image_url, owner)
  assert.throws(() => assertUploadOwner(result.image_url, { ...owner, partner_id: 'other' }), /another partner/)
  assert.throws(() => assertUploadOwner(result.image_url, { ...owner, mode: 'live' }), /another partner/)
  assert.throws(() => readUploadGrant(token.slice(0, -1) + (token.endsWith('0') ? '1' : '0')), /Invalid upload/)
  assert.throws(() => readUploadGrant(token + '.extra'), /Invalid upload/)
  assert.throws(() => readUploadGrant(null), /Invalid upload/)
  const originalNow = Date.now
  Date.now = () => grant.expires + 1
  try { assert.throws(() => readUploadGrant(token), /expired/) } finally { Date.now = originalNow }
  assert.ok(!JSON.stringify(result).includes(process.env.PARTNER_INTERNAL_SECRET))
})

test('source access requires an uploaded file and active terms/key, and redirects instead of proxying bytes', async () => {
  const result = await createUpload(owner, input, origin)
  const request = new Request(result.image_url)
  await assert.rejects(uploadSource(request), error => error.code === 'upload_not_found')
  state.files.add(state.path)
  const response = await uploadSource(request)
  assert.equal(response.status, 307)
  assert.match(response.headers.get('Location'), /^https:\/\/storage.example\/read\//)
  assert.equal(await response.text(), '')
  state.key = null
  await assert.rejects(uploadSource(request), error => error.code === 'invalid_upload')
  state.key = { ...owner, partner: { ...partner, api_blocked_at: 'now' } }
  await assert.rejects(uploadSource(request), error => error.code === 'invalid_upload')
  state.key = { ...owner, partner }
})

test('ingress rejects bad metadata, excessive sizes and unsafe bucket settings', async () => {
  for (const bad of [null, [], { ...input, size: 0 }, { ...input, size: 20971521 }, { ...input, size: 1.5 }, { ...input, content_type: 'image/svg+xml' }, { ...input, path: 'carts/anything' }]) {
    await assert.rejects(createUpload(owner, bad, origin), error => error.code === 'invalid_request')
  }
  const original = state.bucket
  for (const bucket of [{ ...original, public: true }, { ...original, file_size_limit: 0 }, { ...original, allowed_mime_types: ['image/png', 'image/jpeg', 'text/html'] }]) {
    state.bucket = bucket
    await assert.rejects(createUpload(owner, input, origin), error => error.code === 'uploads_unavailable')
  }
  state.bucket = original
})

test('upload HTTP endpoint retains API-key auth, terms and write rate limiting', async () => {
  const request = token => new Request(origin + '/v1/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(input) })
  const key = 'tcgp_test_' + 'a'.repeat(64)
  assert.equal((await POST(request())).status, 401)
  assert.equal((await POST(request(key))).status, 201)
  state.key = { ...owner, partner: { ...partner, terms_version: 'old' } }
  assert.equal((await POST(request(key))).status, 403)
  state.key = { ...owner, partner }
  state.rateAllowed = false
  const limited = await POST(request(key))
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get('Retry-After'), '60')
  state.rateAllowed = true
})

test('existing HTTPS cart URLs still work and upload links use unchanged item fields', async () => {
  const uploaded = await createUpload(owner, input, origin)
  for (const image_url of ['https://client.example/front.png', uploaded.image_url]) {
    assertUploadOwner(image_url, owner)
    assert.equal(contract.validateCart({ items: [{ image_url, back_image_url: image_url, quantity: 2 }] }).card_count, 2)
  }
})

test('cleanup deletes only expired staging objects, never cart artwork', async () => {
  assert.equal(await cleanupUploads(Date.now() + 10000), 1)
  assert.deepEqual(state.removed, ['partner-uploads/2000-01-01/' + 'a'.repeat(64) + '.png'])
})

test('machine-readable documentation includes direct uploads without changing cart fields', async () => {
  const doc = await import(await compile('lib/api-documentation.ts', { './manufacturing-contract': contractUrl }))
  const schema = doc.buildOpenApi()
  assert.equal(schema.paths['/v1/uploads'].post.responses['201'].content['application/json'].schema.$ref, '#/components/schemas/UploadGrant')
  assert.deepEqual(schema.paths['/v1/uploads/source'].get.security, [])
  assert.equal(schema.components.schemas.CreateUpload.properties.size.maximum, 20971520)
  assert.equal(schema.components.schemas.UploadGrant.properties.method.const, 'PUT')
  assert.deepEqual(schema.components.schemas.CreateCart.required, ['items'])
  assert.ok(!schema.components.schemas.CreateCart.properties.certification)
  assert.match(doc.buildLlmsText(), /POST \/v1\/uploads/)
  assert.doesNotMatch(doc.buildLlmsText(), /No upload or finalize endpoints/)
})
