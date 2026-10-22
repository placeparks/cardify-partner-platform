import { supabaseAdmin as db } from '@/lib/supabase-admin'
import { api } from '@/lib/partner-api'
import { sandboxOrder, testCheckoutCart, testReturnUrl } from '@/lib/sandbox-checkout'

export async function GET(request: Request) {
  return api(async () => {
    const cart = await testCheckoutCart(db, new URL(request.url).searchParams.get('token') || '')
    const order = await sandboxOrder(db, cart.partner_id, cart.order_id || '')
    return new Response(null, { status: 303, headers: { Location: testReturnUrl(cart, order), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
  })
}
