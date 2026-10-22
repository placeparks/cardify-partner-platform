import { supabaseAdmin as db } from '@/lib/supabase-admin'
import { api, authenticate, json } from '@/lib/partner-api'
import { requireTestKey, sandboxOrder, simulationBody, simulateOrder } from '@/lib/sandbox-checkout'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const key = await authenticate(request)
    requireTestKey(key)
    const status = simulationBody(await json(request), true)
    const { id } = await context.params
    const order = await sandboxOrder(db, key.partner_id, id)
    return Response.json(await simulateOrder(db, key.partner_id, order.cart_id, status), { headers: { 'Cache-Control': 'no-store' } })
  })
}
