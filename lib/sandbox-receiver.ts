import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { ApiError } from './manufacturing-contract'
import { checked } from './partner-api'

// Deliberately local: this demonstrates delivery handling, not external HTTP/worker health.
export function verifyDemoSignature(body: string, timestamp: number, signature: string, secret: Buffer, now = Date.now()) {
  if (!Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > 300 || !/^[a-f0-9]{64}$/.test(signature)) return false
  return timingSafeEqual(Buffer.from(signature, 'hex'), createHmac('sha256', secret).update(`${timestamp}.${body}`).digest())
}

export async function receiveSandboxDemo(db: any, partnerId: string, order: any, status: string, action = 'deliver') {
  if (!/^test_order_[a-f0-9]{32}$/.test(order.id) || !['paid', 'in_production', 'shipped', 'cancelled'].includes(status) || !['deliver', 'duplicate', 'invalid_signature'].includes(action)) {
    throw new ApiError(400, 'invalid_demo', 'Choose a valid sandbox event.')
  }
  const eventId = `evt_${order.id}_${status}`
  const event: any = checked(await db.from('partner_webhook_events').select('payload').eq('id', eventId).eq('partner_id', partnerId).eq('mode', 'test').maybeSingle())
  if (!event || event.payload?.data?.id !== order.id || event.payload?.data?.mode !== 'test' || event.payload?.data?.simulated !== true) {
    throw new ApiError(404, 'demo_event_missing', 'Complete this simulated order step first.')
  }
  const raw = JSON.stringify(event.payload)
  const secret = randomBytes(32) // Ephemeral demonstration key; never a partner's signing secret.
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex')
  const valid = verifyDemoSignature(raw, timestamp, action === 'invalid_signature' ? '0'.repeat(64) : signature, secret)
  if (!valid) {
    return { ...order, demo_result: { status: 401, message: 'Invalid signature rejected. Demo receiver state unchanged.' } }
  }
  // The first simulated transport attempt is deliberately unavailable. Retry uses
  // the same signed bytes; the database transaction deduplicates concurrent calls.
  const attempts = action === 'deliver' ? [503, 200] : [200]
  const saved = await db.rpc('partner_sandbox_demo_receive', {
    p_partner: partnerId, p_order: order.id, p_event: eventId, p_attempts: attempts,
  })
  if (saved.error && ['PGRST202', '42703', '42883'].includes(saved.error.code)) {
    throw new ApiError(503, 'sandbox_setup_required', 'The platform operator must apply the sandbox demo receiver migration. Your test order is safe; retry this step afterwards.')
  }
  const result: any = checked(saved)
  if (!result || result.error) throw new ApiError(409, 'demo_unavailable', 'The demo receiver could not process this test event. Retry the same step.')
  return { ...order, demo_webhook: result, demo_result: { status: 200, message: action === 'duplicate'
    ? 'Duplicate delivered. The same event is applied at most once.'
    : 'Demo delivery retried after a simulated 503; signature verified and event processed.' } }
}
