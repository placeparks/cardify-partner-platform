import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64')
const shippingUrl = moduleUrl(await readFile(new URL('../utils/shippingPricing.ts', import.meta.url), 'utf8'))
const { getShippingCost, SHIPPING_TIERS, ALLOWED_COUNTRIES } = await import(shippingUrl)
const mcpSource = (await readFile(new URL('../utils/mcpPricing.ts', import.meta.url), 'utf8')).replace("'./shippingPricing'", JSON.stringify(shippingUrl))
const { mcpQuote, mcpShippingDetails, MCP_SHIPPING_TIERS } = await import(moduleUrl(mcpSource))

// Independently specified from the approved shipping schedule (integer cents).
const expected = [
  [100, 595, 1095, 1495], [250, 795, 1595, 1995], [500, 995, 1995, 2695],
  [Infinity, 1295, 2995, 3995],
]
const countries = ['US', 'CA', 'GB']
test('all shipping boundaries use the approved rates for all destinations', () => {
  for (const quantity of [1, 99, 100, 101, 249, 250, 251, 499, 500, 501, 999, 1000, 1001, 1008, 3025, 5041, 7561, 10000]) {
    const row = expected.find(([through]) => quantity <= through)
    countries.forEach((country, index) => {
      const cents = row[index + 1]
      assert.equal(Math.round(getShippingCost(country, quantity) * 100), cents, `${country}/${quantity}`)
      assert.equal(mcpQuote(quantity, country).shipping_cents, cents, `MCP ${country}/${quantity}`)
    })
  }
})
test('ordinary and MCP shipping agree at every permitted MCP quantity', () => {
  for (let quantity = 1; quantity <= 10000; quantity++) {
    countries.forEach(country => assert.equal(mcpShippingDetails(country, quantity).cents, Math.round(getShippingCost(country, quantity) * 100)))
  }
  for (const country of ALLOWED_COUNTRIES.filter(c => c !== 'US' && c !== 'CA')) {
    assert.equal(getShippingCost(country, 250), 19.95)
  }
  assert.equal(getShippingCost('US', 10001), 12.95)
  assert.throws(() => mcpQuote(10001, 'US'))
})
test('calculator bands and next-price hints reflect the open-ended final tier', () => {
  assert.equal(SHIPPING_TIERS.length, 4)
  assert.deepEqual(MCP_SHIPPING_TIERS.map(t => t.through), [100, 250, 500, 10000])
  for (const country of countries) {
    assert.equal(mcpShippingDetails(country, 100).next_increase_at, 101)
    assert.equal(mcpShippingDetails(country, 250).next_increase_at, 251)
    assert.equal(mcpShippingDetails(country, 500).next_increase_at, 501)
    assert.equal(mcpShippingDetails(country, 1000).next_increase_at, null)
    assert.equal(mcpShippingDetails(country, 1001).next_increase_at, null)
  }
  assert.equal(mcpQuote(1, 'US').estimated_total_before_tax_cents, 4090)
  assert.equal(mcpQuote(250, 'US').estimated_total_before_tax_cents, 7295)
  assert.equal(mcpQuote(251, 'US').estimated_total_before_tax_cents, 7521)
})

test('legacy widget shipping helper uses the shared rates', async () => {
  for (const path of ['../app/api/partner/widget-order/route.ts', '../app/api/partner/prepaid/widget-order/route.ts', '../app/api/partner/mock-order/route.ts']) {
    let source
    try { source = await readFile(new URL(path, import.meta.url), 'utf8') } catch (error) { if (error.code === 'ENOENT') continue; throw error }
    assert.ok(source.includes("import { getShippingCost } from '@/utils/shippingPricing'"))
    const helper = source.match(/function shippingCentsFor\(country: string, cardCount: number\) \{[\s\S]*?\n\}/)?.[0]
    assert.ok(helper)
    const { shippingCentsFor } = await import(moduleUrl(`import { getShippingCost } from ${JSON.stringify(shippingUrl)}; export ${helper}`))
    for (const quantity of [100, 101, 250, 251, 500, 501, 1000, 1001]) {
      countries.forEach((country, index) => assert.equal(shippingCentsFor(country.toLowerCase(), quantity), expected.find(r => quantity <= r[0])[index + 1]))
    }
  }
})
