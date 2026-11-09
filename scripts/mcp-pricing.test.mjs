import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const asModule = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString('base64')
const shipping = asModule(await readFile(new URL('../utils/shippingPricing.ts', import.meta.url), 'utf8'))
const source = (await readFile(new URL('../utils/mcpPricing.ts', import.meta.url), 'utf8')).replace("'./shippingPricing'", JSON.stringify(shipping))
const { mcpCardPricing, mcpQuote, mcpPricingForCart, MCP_PRICING_VERSION } = await import(asModule(source))

test('whole-order rates, minimum and tier boundaries', () => {
  for (const [quantity, cents, rate] of [[1,3495,35],[18,3495,35],[19,3495,35],[99,3495,35],[100,3500,35],[180,6300,35],[181,5430,30],[249,7470,30],[250,6500,26],[251,6526,26],[504,13104,26],[505,13130,26],[10080,262080,26]]) {
    const price = mcpCardPricing(quantity)
    assert.equal(price.cards_subtotal_cents, cents, `subtotal for ${quantity}`)
    assert.equal(price.unit_price_cents, rate)
    assert.equal(price.billable_cards, quantity)
    assert.equal(price.bands.reduce((sum, band) => sum + band.subtotal_cents, 0) + price.minimum_adjustment_cents, cents)
    assert.equal(price.sheets, Math.ceil(quantity / 18))
  }
})
test('reported totals include destination shipping and the 250-card regression', () => {
  assert.equal(mcpQuote(1, 'US').estimated_total_before_tax_cents, 4190)
  assert.equal(mcpQuote(250, 'US').estimated_total_before_tax_cents, 7395)
  assert.equal(mcpQuote(251, 'US').estimated_total_before_tax_cents, 7821)
  assert.equal(mcpQuote(250, 'CA').estimated_total_before_tax_cents, 8995)
  assert.equal(mcpQuote(250, 'GB').estimated_total_before_tax_cents, 9495)
})
test('discount floor and free-capacity messaging reflect the minimum', () => {
  assert.equal(mcpCardPricing(250, 999999).cards_total_cents, 3495)
  assert.equal(mcpCardPricing(1, 100).discount_cents, 0)
  assert.equal(mcpQuote(1, 'US').extra_cards_at_same_total_before_tax, 98)
  assert.equal(mcpQuote(99, 'US').extra_cards_at_same_total_before_tax, 0)
  assert.equal(mcpQuote(250, 'US').savings_message, null)
  assert.equal(mcpQuote(1, 'US').estimated_total_before_tax_cents, mcpQuote(99, 'US').estimated_total_before_tax_cents)
})
test('invalid inputs, checkout routing and pricing version', () => {
  for (const quantity of [0, -1, 1.5, NaN, Infinity, 10081]) assert.throws(() => mcpCardPricing(quantity))
  assert.throws(() => mcpCardPricing(250, -1))
  assert.throws(() => mcpQuote(250, 'XX'))
  assert.equal(mcpPricingForCart({ pricing_channel: 'partner', card_count: 250 }), null)
  assert.equal(mcpPricingForCart({ pricing_channel: 'mcp', card_count: 250 }).cards_subtotal_cents, 6500)
  assert.throws(() => mcpPricingForCart({ card_count: 250 }))
  assert.equal(MCP_PRICING_VERSION, 'mcp-volume-per-card-v4')
})
