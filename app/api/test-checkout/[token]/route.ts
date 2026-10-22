import { supabaseAdmin as db } from '@/lib/supabase-admin'
import { api, json } from '@/lib/partner-api'
import { ApiError } from '@/lib/manufacturing-contract'
import { simulationBody, simulateOrder, testCheckoutCart } from '@/lib/sandbox-checkout'

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  return api(async () => {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError(403, 'origin_not_allowed', 'Complete this simulation on the test checkout page.')
    const status = simulationBody(await json(request))
    const { token } = await context.params
    const cart = await testCheckoutCart(db, token)
    return Response.json(await simulateOrder(db, cart.partner_id, cart.id, status), { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
  })
}
