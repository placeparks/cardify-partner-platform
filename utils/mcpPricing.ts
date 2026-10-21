import { ALLOWED_COUNTRIES, getShippingCost } from './shippingPricing'

// MCP-only policy. Marginal rates apply to additional cards, not whole sheets.
export const MCP_PRICING_VERSION = 'mcp-base-per-card-v2'
export const MCP_PRICING = {
  model: MCP_PRICING_VERSION, currency: 'USD', cards_per_sheet: 18, max_cards: null,
  minimum_cards_subtotal_cents: 3495,
  additional_card_tiers: [
    { from: 19, through: 180, cents: 35 },
    { from: 181, through: 504, cents: 30 },
    { from: 505, through: null, cents: 26 },
  ],
} as const

export function mcpCardPricing(quantity: number, requestedDiscountCents = 0) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('MCP quantity must be a positive whole number.')
  if (!Number.isSafeInteger(requestedDiscountCents) || requestedDiscountCents < 0) throw new Error('Invalid MCP discount.')
  const bands = MCP_PRICING.additional_card_tiers.map(tier => {
    const cards = Math.max(0, Math.min(quantity, tier.through ?? quantity) - tier.from + 1)
    return { ...tier, cards, subtotal_cents: cards * tier.cents }
  })
  const subtotal = 3495 + bands.reduce((sum, band) => sum + band.subtotal_cents, 0)
  // Reject numeric overflow rather than returning rounded financial amounts.
  if (!Number.isSafeInteger(subtotal)) throw new Error('Quantity exceeds supported numeric precision.')
  const discount = Math.min(requestedDiscountCents, subtotal - 3495)
  const sheets = Math.ceil(quantity / 18)
  return {
    pricing_model: MCP_PRICING_VERSION, quantity, sheets, billable_cards: Math.max(18, quantity),
    cards_subtotal_cents: subtotal, discount_cents: discount, bands,
    cards_total_cents: subtotal - discount, minimum_after_discount_cents: 3495,
    average_card_price_cents: Math.round(subtotal / quantity),
    extra_cards_in_current_sheet: (18 - quantity % 18) % 18,
    extra_cards_at_same_printing_price: Math.max(0, 18 - quantity),
    cards_included_at_same_printing_price: Math.max(18, quantity),
  }
}

export function mcpShippingCents(country: string, quantity: number) {
  mcpCardPricing(quantity)
  if (!ALLOWED_COUNTRIES.includes(country)) throw new Error('Shipping is not available to this country.')
  return Math.round(getShippingCost(country, quantity) * 100)
}

export function mcpSavingsMessage(quantity: number) {
  const extra = mcpCardPricing(quantity).extra_cards_at_same_printing_price
  return extra ? `You can still order ${extra} more card${extra === 1 ? '' : 's'} for no extra charge! The $34.95 base covers up to 18 cards. Ask your assistant to update the quantity before checkout.` : null
}

export function mcpQuote(quantity: number, country: string) {
  const price = mcpCardPricing(quantity)
  const shipping = mcpShippingCents(country, quantity)
  const total = price.cards_subtotal_cents + shipping
  if (!Number.isSafeInteger(total)) throw new Error('Quantity exceeds supported numeric precision.')
  return { ...price, currency: 'USD', country, shipping_cents: shipping,
    estimated_total_before_tax_cents: total,
    extra_cards_at_same_total_before_tax: price.extra_cards_at_same_printing_price,
    savings_message: mcpSavingsMessage(quantity), estimate_only: true,
    note: 'MCP pricing: $34.95 covers cards 1–18; cards 19–180 add $0.35 each, 181–504 add $0.30 each, and 505 onward add $0.26 each. No fixed card-count cap. Shipping varies by destination and quantity. Discounts cannot reduce cards below $34.95. Tax is confirmed at checkout.',
  }
}

// Only an authenticated partner handoff can select MCP pricing.
export function mcpPricingForCart(cart: { pricing_channel?: string; card_count: number }) {
  if (cart.pricing_channel === 'partner') return null
  if (cart.pricing_channel !== 'mcp') throw new Error('Checkout pricing is unavailable. Deploy the partner MCP pricing update first.')
  return mcpCardPricing(cart.card_count)
}
