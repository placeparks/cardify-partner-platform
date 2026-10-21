// Shared by hosted checkout and prepaid fulfillment quotes.
export const ALLOWED_COUNTRIES = [
  'US', 'CA', 'MX', 'GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE',
  'AT', 'CH', 'SE', 'NO', 'DK', 'FI', 'IE', 'PT', 'PL', 'CZ',
  'HU', 'RO', 'BG', 'HR', 'SI', 'SK', 'LT', 'LV', 'EE', 'GR',
  'CY', 'MT', 'LU', 'AU', 'NZ', 'JP', 'SG', 'HK', 'KR', 'TW',
  'MY', 'TH', 'PH', 'ID', 'VN', 'IN', 'AE', 'SA', 'IL', 'TR',
  'ZA', 'BR', 'AR', 'CL', 'PE', 'CO',
]
const SHIPPING_TIERS = [
  { maxQty:100,US:6.95,CA:18.95,INTL:24.95 },
  { maxQty:250,US:8.95,CA:24.95,INTL:29.95 },
  { maxQty:500,US:12.95,CA:32.95,INTL:42.95 },
  { maxQty:Infinity,US:18.95,CA:44.95,INTL:54.95 },
]
export function getShippingCost(country: string,quantity: number): number {
  const tier=SHIPPING_TIERS.find(t=>quantity<=t.maxQty) || SHIPPING_TIERS[SHIPPING_TIERS.length-1]
  return country==='US'?tier.US:country==='CA'?tier.CA:tier.INTL
}
