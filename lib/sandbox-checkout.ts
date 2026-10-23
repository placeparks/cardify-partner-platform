import { ApiError, hasPartnerTerms, partnerReturnUrl } from './manufacturing-contract'
import { checked, digest } from './partner-api'
import { receiveSandboxDemo } from './sandbox-receiver'

export const SANDBOX_ORDER_ID = /^test_order_[a-f0-9]{32}$/
const unavailable = () => new ApiError(404, 'test_checkout_unavailable', 'This test checkout is unavailable. Create a new test cart if it expired.')

export function requireTestKey(key: any) {
  if (key.mode !== 'test') throw new ApiError(403, 'test_key_required', 'Use a tcgp_test_ key. Simulation is never available for live carts or orders.')
}

export function simulationBody(body: any, event = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'invalid_request', 'Send a JSON object.')
  if (event) {
    if (Object.keys(body).some(k => k !== 'status') || !['in_production', 'shipped', 'cancelled'].includes(body.status)) {
      throw new ApiError(400, 'invalid_request', 'Send status: in_production, shipped, or cancelled.')
    }
    return body.status as string
  }
  if (Object.keys(body).some(k => k !== 'confirm_simulation') || body.confirm_simulation !== true) {
    throw new ApiError(400, 'simulation_confirmation_required', 'Send confirm_simulation: true. No payment or manufacturing will take place.')
  }
  return 'paid'
}

export function publicSandboxOrder(order: any) {
  return { id: order.id, cart_id: order.cart_id, status: order.status, shipment: order.shipment,
    created_at: order.created_at, updated_at: order.updated_at, external_ref: order.external_ref,
    card_count: order.card_count, items: order.items, settlement: order.settlement,
    ...(order.retail_amount_cents != null ? { retail_amount_cents: order.retail_amount_cents } : {}),
    demo_webhook: order.demo_webhook ?? null,
    mode: 'test', simulated: true }
}

export async function sandboxOrder(db: any, partnerId: string, id: string) {
  if (!SANDBOX_ORDER_ID.test(id)) throw new ApiError(404, 'not_found', 'Simulated order not found.')
  const order: any = checked(await db.from('partner_sandbox_orders').select('*').eq('id', id).eq('partner_id', partnerId).maybeSingle())
  if (!order) throw new ApiError(404, 'not_found', 'Simulated order not found.')
  return order
}

export async function testCheckoutCart(db: any, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw unavailable()
  const cart: any = checked(await db.from('partner_carts').select('*,partner:partnership_requests(*)')
    .eq('mode', 'test').eq('checkout_token_hash', digest(token)).maybeSingle())
  if (!cart || cart.mode !== 'test' || !['open', 'converted', 'cancelled'].includes(cart.status) ||
    Date.parse(cart.expires_at) <= Date.now() || cart.settlement === 'prepaid' ||
    cart.connect_account_id || cart.connect_retail_cents != null || cart.checkout_quote_id ||
    (cart.checkout_funding && cart.checkout_funding !== 'hosted') ||
    cart.partner?.status !== 'approved' || cart.partner.api_blocked_at || cart.partner.access_revoked_at || !hasPartnerTerms(cart.partner)) throw unavailable()
  return cart
}

export async function simulateOrder(db: any, partnerId: string, cartId: string, status: string) {
  if (!/^cart_[a-f0-9]{64}$/.test(cartId)) throw new ApiError(404, 'not_found', 'Test cart not found.')
  const result = await db.rpc('partner_sandbox_order_event', { p_partner: partnerId, p_cart: cartId, p_status: status })
  if (result.error) {
    if (['PGRST202', 'PGRST205', '42P01', '42703', '42883'].includes(result.error.code)) {
      throw new ApiError(503, 'sandbox_setup_required', 'Apply the partner database migration 20261022000000_checkout_sandbox.sql.')
    }
    // Log only stable codes, never checkout tokens, artwork URLs, or credentials.
    console.error('checkout_sandbox_failed', { code: result.error.code, cart_id: cartId, status })
    throw new ApiError(500, 'sandbox_failed', 'The simulation could not be saved. Retry the same action.')
  }
  const value = result.data
  if (value?.error) {
    const errors: Record<string, [number, string]> = {
      not_found: [404, 'Test cart not found for this partner.'],
      unavailable: [403, 'This partnership cannot run checkout simulations.'],
      wrong_flow: [409, 'Only test hosted or test Connect simulator carts are supported.'],
      expired: [410, 'This test cart expired. Create a new cart.'],
      not_ready: [409, 'The cart must be open with all artwork stored and unblocked.'],
      invalid_transition: [409, 'Complete checkout first, then simulate production before shipment. Cancelled orders cannot progress.'],
    }
    const [code, message] = errors[value.error] || [409, 'This simulation cannot be completed.']
    throw new ApiError(code, `sandbox_${value.error}`, message)
  }
  if (!value?.id || !SANDBOX_ORDER_ID.test(value.id)) throw new Error('Invalid sandbox response')
  return receiveSandboxDemo(db, partnerId, publicSandboxOrder(value), status)
}

export function testReturnUrl(cart: any, order: any) {
  if (order.cart_id !== cart.id || !['paid', 'in_production', 'shipped'].includes(order.status)) {
    throw new ApiError(409, 'test_order_unconfirmed', 'Complete the simulated checkout before returning to your store.')
  }
  const url = new URL(partnerReturnUrl(cart.return_url, cart.partner.website_url))
  url.searchParams.set('cart_id', cart.id)
  url.searchParams.set('order_id', order.id)
  url.searchParams.set('mode', 'test')
  url.searchParams.set('simulated', 'true')
  return url.href
}
