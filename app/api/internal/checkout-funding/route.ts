import { api, checked, digest, internalAuth, json } from '@/lib/partner-api'
import { supabaseAdmin as db } from '@/lib/supabase-admin'
import { ApiError } from '@/lib/manufacturing-contract'
import { acceptance, creditError, prepaidMode, PREPAID_TERMS_VERSION, shippingAddress } from '@/lib/prepaid-contract'
import { commerce, creditRpc } from '@/lib/prepaid'
import { customerCheckoutOrigin, ensureCustomerCheckout } from '@/lib/prepaid-customer-payment'

export const maxDuration = 60
export async function POST(request: Request) { return api(async () => {
  internalAuth(request)
  const body = await json(request)
  const mode = prepaidMode()
  if (body.mode !== mode) throw new ApiError(503, 'checkout_configuration', 'Partner and checkout Stripe credentials must use the same environment.')
  const shipping = shippingAddress(body.shipping)
  const accepted = acceptance(body.acceptance)
  if (accepted.email !== shipping.email) throw new ApiError(400, 'invalid_request', 'The shipping and acceptance emails must match.')
  const cart = checked(await db.from('partner_carts').select('*').eq('checkout_token_hash', digest(String(body.token || ''))).maybeSingle())
  if (cart?.connect_retail_cents != null) throw new ApiError(409,'connect_cart','Connect orders use separate settlement and never spend printing credit.')
  if (!cart || cart.mode !== 'live' || cart.settlement !== 'hosted') throw new ApiError(404, 'not_found', 'Hosted cart not found.')
  // Acceptance time is recorded separately. Retrying a customer's click must not
  // change the immutable shipping/price instructions or create a second payment.
  const hash = digest(JSON.stringify({ cart_id: cart.id, shipping, affiliate: body.affiliate_code || '', terms: accepted.terms_version, quality: accepted.image_quality_accepted }))
  let price = null
  // Both sources are saved by the platform. The database verifies widget/cart
  // ownership and makes the funding decision and debit in one transaction.
  if (!cart.customer_payment_only && !cart.checkout_funding && process.env.PARTNER_PREPAID_ENABLED === 'true' && (cart.api_key_id || cart.widget_session_id) && Date.parse(cart.expires_at) > Date.now() + 65 * 60_000) {
    const account = checked(await db.from('partner_credit_accounts').select('terms_version').eq('partner_id', cart.partner_id).maybeSingle())
    if (account?.terms_version === PREPAID_TERMS_VERSION) {
      const balance = await creditRpc('partner_credit_balance', { p_partner: cart.partner_id })
      if (Number.isSafeInteger(body.printing_cents) && body.printing_cents > 0 && balance && !balance.spending_blocked && balance.available_cents >= body.printing_cents) {
        customerCheckoutOrigin()
        price = await commerce('quote', { mode, card_count: cart.card_count, shipping, idempotency_key: digest(`automatic:${mode}:${cart.id}:${hash}`) })
        if (price.mode !== mode || price.printing_cents !== body.printing_cents || ![price.printing_cents, price.shipping_cents, price.tax_cents, price.total_cents].every(n => Number.isSafeInteger(n) && n >= 0) || price.total_cents !== price.printing_cents + price.shipping_cents + price.tax_cents || !Number.isFinite(Date.parse(price.expires_at))) throw new Error('Invalid automatic checkout quote')
      }
    }
  }
  const selected = await db.rpc('partner_checkout_funding', { p_cart: cart.id, p_mode: mode, p_hash: hash, p_shipping: shipping, p_acceptance: accepted, p_price: price })
  if (selected.error) creditError(selected.error)
  if (selected.data.funding === 'hosted') return Response.json({ funding: 'hosted' }, { headers: { 'Cache-Control': 'no-store' } })
  // A timeout or Stripe failure after this point MUST NOT fall back to a full
  // customer charge. The saved quote and Stripe idempotency key resume safely.
  const quote = await ensureCustomerCheckout(selected.data.quote)
  if (quote.customer_payment_status !== 'open' || !quote.stripe_checkout_url || Date.parse(quote.checkout_expires_at) <= Date.now()) throw new ApiError(409, 'checkout_unavailable', 'This checkout has completed or expired. Return to your store for the order status or a new cart.')
  return Response.json({ funding: 'prepaid', checkout_url: quote.stripe_checkout_url }, { headers: { 'Cache-Control': 'no-store' } })
}) }
