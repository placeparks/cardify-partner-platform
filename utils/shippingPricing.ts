// Shared by hosted checkout and prepaid fulfillment quotes.
export const ALLOWED_COUNTRIES = [
  'US', 'CA', 'MX', 'GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE',
  'AT', 'CH', 'SE', 'NO', 'DK', 'FI', 'IE', 'PT', 'PL', 'CZ',
  'HU', 'RO', 'BG', 'HR', 'SI', 'SK', 'LT', 'LV', 'EE', 'GR',
  'CY', 'MT', 'LU', 'AU', 'NZ', 'JP', 'SG', 'HK', 'KR', 'TW',
  'MY', 'TH', 'PH', 'ID', 'VN', 'IN', 'AE', 'SA', 'IL', 'TR',
  'ZA', 'BR', 'AR', 'CL', 'PE', 'CO',
]
// Card-order shipping in USD. Used by checkout, calculators and public tables.
export const SHIPPING_TIERS = [
  { maxQty: 100, US: 5.95, CA: 10.95, INTL: 14.95 },
  { maxQty: 250, US: 7.95, CA: 15.95, INTL: 19.95 },
  { maxQty: 500, US: 9.95, CA: 19.95, INTL: 26.95 },
  { maxQty: Infinity, US: 12.95, CA: 29.95, INTL: 39.95 },
] as const
export function getShippingCost(country: string,quantity: number): number {
  const tier=SHIPPING_TIERS.find(t=>quantity<=t.maxQty) || SHIPPING_TIERS[SHIPPING_TIERS.length-1]
  return country==='US'?tier.US:country==='CA'?tier.CA:tier.INTL
}
