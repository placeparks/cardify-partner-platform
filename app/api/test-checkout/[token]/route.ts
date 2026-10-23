import { supabaseAdmin as db } from '@/lib/supabase-admin'
import { api, json } from '@/lib/partner-api'
import { ApiError } from '@/lib/manufacturing-contract'
import { simulationBody, simulateOrder, testCheckoutCart, sandboxOrder, publicSandboxOrder } from '@/lib/sandbox-checkout'
import { receiveSandboxDemo } from '@/lib/sandbox-receiver'

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  return api(async () => {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError(403, 'origin_not_allowed', 'Complete this simulation on the test checkout page.')
    const body = await json(request)
    const { token } = await context.params
    const cart = await testCheckoutCart(db, token)
    if (body && Object.keys(body).length === 1 && ['duplicate', 'invalid_signature'].includes(body.demo_action)) {
      const order = publicSandboxOrder(await sandboxOrder(db, cart.partner_id, cart.order_id || ''))
      return Response.json(await receiveSandboxDemo(db, cart.partner_id, order, order.status, body.demo_action), { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
    }
    const status = simulationBody(body, body?.status !== undefined)
    return Response.json(await simulateOrder(db, cart.partner_id, cart.id, status), { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
  })
}
