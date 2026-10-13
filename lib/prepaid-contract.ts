import { ApiError, CUSTOMER_TERMS_VERSION } from '@/lib/manufacturing-contract'

export const PREPAID_TERMS_VERSION = '2026-10-13-prepaid-v2'
export const PREPAID_TERMS = 'You sell cards and charge your customer for the cards independently. You are responsible for your retail prices, refunds of your own charges, retail taxes and customer support. USD credit pays the quoted printing cost only; it is not transferable or withdrawable through this API. TCGPlaytest separately collects quoted shipping and fulfillment tax from the customer through Stripe. Do not also collect those quoted charges from the customer. Top-ups are credited after confirmed payment. Payment reversals may reduce your balance or pause spending. Reservations expire at the time shown. Submitting an order spends printing credit and opens customer shipping/tax checkout; production starts only after verified customer payment. Confirmed unpaid checkout expiry returns printing credit. Cancellation after payment requires review; an approved full cancellation refund returns printing credit and refunds the customer shipping/tax payment separately. This never refunds the card purchase charged by your store. Collect the exact customer image-rights statement and any quality acknowledgment, retain evidence, and send the actual acceptance time. Do not send payment-card data to this API.'

export function enabled() {
  if (process.env.PARTNER_PREPAID_ENABLED !== 'true') throw new ApiError(503, 'prepaid_unavailable', 'Prepaid fulfillment is not enabled on this deployment.')
}
export function prepaidMode(): 'test'|'live' {
  return /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY || '') ? 'test' : 'live'
}
// Keep the same table/RPC names in every Stripe environment.
export function prepaidName(name: string) {
  if (!/^partner_(credit|prepaid)_/.test(name)) throw new Error('Unknown prepaid resource')
  return name
}
export function prepaidKey(key: any) {
  enabled()
  if (key.mode !== 'live' && !(key.mode === 'test' && prepaidMode() === 'test')) throw new ApiError(403, 'prepaid_mode_mismatch', 'A live partner API key is required for real payments. The same live partner key also works with Stripe test credentials.')
  if (key.partner.access_revoked_at) throw new ApiError(403, 'partner_unavailable', 'Partner access is revoked.')
}
// Preserve imports from earlier deployment packages; both names enforce the
// configured Stripe mode, enabled feature and active partner access.
export { prepaidKey as liveKey }
export function object(value: any, fields: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !fields.includes(k))) throw new ApiError(400, 'invalid_request', 'Invalid request object or unknown field.')
}
export function idempotency(request: Request) {
  const key = request.headers.get('idempotency-key') || ''
  if (!/^[\x21-\x7e]{1,200}$/.test(key)) throw new ApiError(400, 'invalid_request', 'Idempotency-Key is required (1–200 visible ASCII characters, no spaces).')
  return key
}
export function uuid(value: any) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new ApiError(400, 'invalid_request', 'A valid quote or order ID is required.')
  return value
}
export function shippingAddress(value: any) {
  object(value, ['name','email','line1','line2','city','state','postal_code','country','phone'])
  const result: Record<string,string> = {}
  for (const field of ['name','email','line1','line2','city','state','postal_code','country','phone']) {
    const optional = ['line2','phone','state'].includes(field)
    if (value[field] !== undefined && typeof value[field] !== 'string') throw new ApiError(400, 'invalid_request', `shipping.${field} must be text.`)
    const text = (value[field] || '').trim()
    if ((!optional && !text) || text.length > (field === 'email' ? 254 : 200) || /[\u0000-\u001f\u007f]/.test(text)) throw new ApiError(400, 'invalid_request', `Invalid shipping.${field}.`)
    result[field] = text
  }
  result.country = result.country.toUpperCase()
  result.email = result.email.toLowerCase()
  if (!/^[A-Z]{2}$/.test(result.country) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new ApiError(400, 'invalid_request', 'Enter a valid email and two-letter country code.')
  if (['US','CA','AU'].includes(result.country) && !result.state) throw new ApiError(400, 'invalid_request', 'State or province is required for this country.')
  return result
}
export function acceptance(value: any) {
  object(value, ['accepted','terms_version','email','accepted_at','image_quality_accepted'])
  if (value.accepted !== true || value.terms_version !== CUSTOMER_TERMS_VERSION || typeof value.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) || value.email.length>254 || typeof value.accepted_at !== 'string' || !Number.isFinite(Date.parse(value.accepted_at)) || Date.parse(value.accepted_at)>Date.now()+300000 || (value.image_quality_accepted !== undefined && typeof value.image_quality_accepted !== 'boolean')) throw new ApiError(400, 'rights_acceptance_required', 'Send the customer’s actual image-rights acceptance, current terms version, email and timestamp.')
  return { accepted:true, terms_version:CUSTOMER_TERMS_VERSION, email:value.email.toLowerCase(), accepted_at:new Date(value.accepted_at).toISOString(), image_quality_accepted:value.image_quality_accepted === true }
}
export function publicQuote(q: any) {
  const split=q.funding_model==='cards_credit'
  const payment=q.customer_payment_status || 'not_required'
  const funded=!split || !!q.order_funded_at
  return { id:q.id, cart_id:q.cart_id, ...((q.payment_mode || q.mode)==='test'?{mode:'test',simulated:true}:{}), currency:'USD', printing_cents:q.printing_cents, shipping_cents:q.shipping_cents, tax_cents:q.tax_cents, total_cents:q.total_cents,
    funding_model:split?'cards_credit':'credit_all', credit_cents:split?q.printing_cents:q.total_cents, customer_payment_cents:split?q.shipping_cents+q.tax_cents:0,
    customer_payment_status:payment, checkout_expires_at:q.checkout_expires_at || null,
    ...(split && payment==='open' && q.stripe_checkout_url && Date.parse(q.checkout_expires_at)>Date.now() ? {checkout_url:q.stripe_checkout_url}:{}),
    status:['quoted','reserved'].includes(q.status) && Date.parse(q.expires_at)<=Date.now() ? 'expired' : q.status,
    expires_at:q.expires_at, order_id:funded ? q.order_id || null : null, refunded_at:q.refunded_at || null }
}
export function creditError(error: any): never {
  if (['PGRST202','PGRST205','42703'].includes(error?.code)) throw new ApiError(503,'prepaid_setup_required','The prepaid database upgrade has not been installed. Apply 20261013030000_prepaid_unified.sql once, then reload this page.')
  const message = String(error?.message || '')
  const known: Record<string,[number,string]> = {
    'Insufficient credit':[402,'insufficient_credit'], 'Credit account blocked':[409,'credit_blocked'],
    'Quote not found':[404,'not_found'], 'Order not found':[404,'not_found'], 'Prepaid terms required':[403,'prepaid_terms_required'],
    'Idempotency conflict':[409,'idempotency_conflict'], 'Quote expired':[409,'quote_expired'],
    'Partner unavailable':[403,'partner_unavailable'], 'Live key required':[401,'invalid_api_key'], 'Test key required':[401,'invalid_api_key'],
    'Active reservation required':[409,'reservation_required'], 'Cart unavailable':[409,'cart_unavailable'],
    'Quote unavailable':[409,'quote_unavailable'], 'Cart already reserved':[409,'cart_reserved'],
    'Order already funded':[409,'order_funded'], 'Cancel order before refund':[409,'cancel_first'],
    'Rights acceptance required':[400,'rights_acceptance_required'], 'Invalid acceptance time':[400,'invalid_acceptance'],
    'Image quality acceptance required':[400,'quality_acceptance_required'], 'Artwork unavailable':[409,'artwork_unavailable'],
  }
  if (known[message]) throw new ApiError(...known[message], message)
  throw new Error('Prepaid database operation failed')
}
