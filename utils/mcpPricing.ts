import { ALLOWED_COUNTRIES } from './shippingPricing'

export const MCP_SHIPPING_TIERS = [
  { through: 100, US: 695, CA: 1895, INTL: 2495 },
  { through: 250, US: 895, CA: 2495, INTL: 2995 },
  { through: 500, US: 1295, CA: 3295, INTL: 4295 },
  { through: 792, US: 1895, CA: 4495, INTL: 5495 },
  { through: 1008, US: 1895, CA: 4495, INTL: 6495 },
  { through: 3024, US: 1895, CA: 4495, INTL: 10495 },
  { through: 5040, US: 2695, CA: 7495, INTL: 18495 },
  { through: 7560, US: 3995, CA: 10995, INTL: 27495 },
  { through: 10000, US: 5295, CA: 14995, INTL: 36495 },
] as const

export const MCP_MAX_CARDS = 10000
export class McpQuantityError extends Error {
  readonly code = 'mcp_card_limit_exceeded'
  constructor() { super('MCP orders are limited to 10,000 cards (556 sheets). Reduce the order quantity before checkout.') }
}

// MCP-only policy. The quantity tier applies to every card, with a subtotal floor.
export const MCP_PRICING_VERSION = 'mcp-volume-per-card-v4'
export const MCP_PRICING = {
  model: MCP_PRICING_VERSION, currency: 'USD', cards_per_sheet: 18, max_cards: MCP_MAX_CARDS, shipping_tiers: MCP_SHIPPING_TIERS,
  minimum_cards_subtotal_cents: 3495,
  quantity_tiers: [
    { from: 1, through: 180, cents: 35 },
    { from: 181, through: 249, cents: 30 },
    { from: 250, through: null, cents: 26 },
  ],
} as const

export function mcpCardPricing(quantity: number, requestedDiscountCents = 0) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('MCP quantity must be a positive whole number.')
  if (quantity > MCP_MAX_CARDS) throw new McpQuantityError()
  if (!Number.isSafeInteger(requestedDiscountCents) || requestedDiscountCents < 0) throw new Error('Invalid MCP discount.')
  const tier = MCP_PRICING.quantity_tiers.find(tier => quantity >= tier.from && (tier.through === null || quantity <= tier.through))!
  const bands = [{ ...tier, cards: quantity, subtotal_cents: quantity * tier.cents }]
  const minimum = MCP_PRICING.minimum_cards_subtotal_cents
  const subtotal = Math.max(minimum, quantity * tier.cents)
  const included = Math.max(quantity, Math.min(tier.through ?? MCP_MAX_CARDS, Math.floor(minimum / tier.cents)))
  // Reject numeric overflow rather than returning rounded financial amounts.
  if (!Number.isSafeInteger(subtotal)) throw new Error('Quantity exceeds supported numeric precision.')
  const discount = Math.min(requestedDiscountCents, subtotal - minimum)
  const sheets = Math.ceil(quantity / 18)
  return {
    pricing_model: MCP_PRICING_VERSION, quantity, sheets, billable_cards: quantity, unit_price_cents: tier.cents, minimum_adjustment_cents: subtotal - quantity * tier.cents,
    cards_subtotal_cents: subtotal, discount_cents: discount, bands,
    cards_total_cents: subtotal - discount, minimum_after_discount_cents: minimum,
    average_card_price_cents: Math.round(subtotal / quantity),
    extra_cards_in_current_sheet: (18 - quantity % 18) % 18,
    extra_cards_at_same_printing_price: included - quantity,
    cards_included_at_same_printing_price: included,
  }
}

export function mcpShippingDetails(country: string, quantity: number) {
  mcpCardPricing(quantity)
  if (!ALLOWED_COUNTRIES.includes(country)) throw new Error('Shipping is not available to this country.')
  const region = country === 'US' ? 'US' : country === 'CA' ? 'CA' : 'INTL'
  const index = MCP_SHIPPING_TIERS.findIndex(tier => quantity <= tier.through)
  if (index < 0) throw new McpQuantityError()
  const tier = MCP_SHIPPING_TIERS[index]
  // Adjacent bands sometimes change only international prices. Report the
  // next actual price increase for this destination, not every table boundary.
  const next = MCP_SHIPPING_TIERS.findIndex((row, i) => i > index && row[region] !== tier[region])
  return { from: index ? MCP_SHIPPING_TIERS[index - 1].through + 1 : 1,
    through: tier.through, cents: tier[region],
    next_increase_at: next < 0 ? null : MCP_SHIPPING_TIERS[next - 1].through + 1 }
}

export function mcpShippingCents(country: string, quantity: number) {
  return mcpShippingDetails(country, quantity).cents
}

export function mcpSavingsMessage(quantity: number) {
  const extra = mcpCardPricing(quantity).extra_cards_at_same_printing_price
  return extra ? `You can still order ${extra} more card${extra === 1 ? '' : 's'} for no extra charge! The $34.95 minimum covers up to 99 cards at 35¢ each. Ask your assistant to update the quantity before checkout.` : null
}

export function mcpQuote(quantity: number, country: string) {
  const price = mcpCardPricing(quantity)
  const shippingBand = mcpShippingDetails(country, quantity)
  const shipping = shippingBand.cents
  const total = price.cards_subtotal_cents + shipping
  if (!Number.isSafeInteger(total)) throw new Error('Quantity exceeds supported numeric precision.')
  return { ...price, currency: 'USD', country, shipping_cents: shipping, shipping_band: shippingBand,
    estimated_total_before_tax_cents: total,
    extra_cards_at_same_total_before_tax: price.extra_cards_at_same_printing_price,
    savings_message: mcpSavingsMessage(quantity), estimate_only: true,
    note: 'MCP pricing uses one rate for every card: 35¢ each for orders of 1–180 cards, 30¢ each for 181–249, and 26¢ each for 250–10,000. The card subtotal is at least $34.95; this minimum is not added to the per-card total. Maximum 10,000 cards (556 sheets). Shipping is separate. Discounts cannot reduce cards below $34.95. Tax is confirmed at checkout.',
  }
}

// Only an authenticated partner handoff can select MCP pricing.
export function mcpPricingForCart(cart: { pricing_channel?: string; card_count: number }) {
  if (cart.pricing_channel === 'partner') return null
  if (cart.pricing_channel !== 'mcp') throw new Error('Checkout pricing is unavailable. Deploy the partner MCP pricing update first.')
  return mcpCardPricing(cart.card_count)
}
