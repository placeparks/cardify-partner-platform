import { createHmac, timingSafeEqual } from 'node:crypto'
import { ApiError } from '@/lib/manufacturing-contract'
import { supabaseAdmin as db } from '@/lib/supabase-admin'
import { checked } from '@/lib/partner-api'
import { creditRpc } from '@/lib/prepaid'
import { prepaidMode, prepaidName } from '@/lib/prepaid-contract'

export async function prepaidStripe(path: string, body?: URLSearchParams, key?: string) {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) throw new ApiError(503,'prepaid_unavailable','Stripe is not configured.')
  const response = await fetch(`https://api.stripe.com/v1${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${secret}`,'Stripe-Version':'2023-10-16',...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},body,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)})
  const data = await response.json()
  if (!response.ok) throw new ApiError(503,'stripe_unavailable','Payment service is unavailable. Retry with the same idempotency key.')
  return data
}
export function verifyStripeSignature(raw: string, signature: string, secret: string, now=Date.now()) {
  const parts = signature.split(',').map(p=>p.split('='))
  const times=parts.filter(([k])=>k==='t'), signatures=parts.filter(([k])=>k==='v1').map(([,v])=>v)
  if (!secret || times.length!==1 || !/^\d+$/.test(times[0][1]) || Math.abs(now/1000-Number(times[0][1]))>300) throw new ApiError(400,'invalid_signature','Invalid webhook signature.')
  const expected=createHmac('sha256',secret).update(`${times[0][1]}.${raw}`).digest()
  if (!signatures.some(s=>/^[a-f0-9]{64}$/i.test(s) && timingSafeEqual(expected,Buffer.from(s,'hex')))) throw new ApiError(400,'invalid_signature','Invalid webhook signature.')
}
export function netTopupCredit(amount: number, refunded: number, disputes: any[]) {
  if (!Number.isSafeInteger(amount) || amount<=0 || !Number.isSafeInteger(refunded) || refunded<0 || refunded>amount) throw new Error('Invalid Stripe amount')
  const active=disputes.filter(d=>!['won','warning_closed'].includes(d.status))
  const disputed=active.reduce((sum,d)=>sum+Number(d.amount),0)
  if (!Number.isSafeInteger(disputed) || disputed<0) throw new Error('Invalid dispute amount')
  return {net:Math.max(0,amount-refunded-disputed),blocked:active.length>0}
}
export async function reconcileTopup(id: string, suppliedSession?: string) {
  const row=checked(await db.from(prepaidName('partner_credit_topups')).select('*').eq('payment_mode',prepaidMode()).eq('id',id).maybeSingle())
  if (!row) throw new Error('Top-up not found')
  const version=await creditRpc('partner_credit_claim_reconcile',{p_topup:id})
  const sessionId=row.stripe_session_id || suppliedSession
  if (!sessionId || (row.stripe_session_id && suppliedSession && row.stripe_session_id!==suppliedSession)) throw new Error('Top-up session mismatch')
  const session=await prepaidStripe(`/checkout/sessions/${encodeURIComponent(sessionId)}`)
  if (session.metadata?.prepaid_topup_id!==id || session.metadata?.partner_id!==row.partner_id || session.amount_total!==row.amount_cents || session.currency!=='usd' || session.livemode!==(prepaidMode()==='live')) throw new Error('Top-up payment mismatch')
  if (session.payment_status!=='paid') return
  const intentId=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id
  if (!intentId) throw new Error('Payment intent missing')
  const intent=await prepaidStripe(`/payment_intents/${encodeURIComponent(intentId)}?expand[]=latest_charge`)
  if (intent.status!=='succeeded' || intent.amount_received!==row.amount_cents || intent.currency!=='usd' || intent.livemode!==(prepaidMode()==='live') || intent.metadata?.prepaid_topup_id!==id || intent.metadata?.partner_id!==row.partner_id) throw new Error('Payment intent mismatch')
  const charge=intent.latest_charge
  if (!charge || typeof charge!=='object' || charge.paid!==true) throw new Error('Charge unavailable')
  const disputes=await prepaidStripe(`/disputes?payment_intent=${encodeURIComponent(intentId)}&limit=100`)
  if (disputes.has_more || !Array.isArray(disputes.data)) throw new Error('Dispute reconciliation incomplete')
  const credit=netTopupCredit(row.amount_cents,charge.amount_refunded,disputes.data)
  const applied=await creditRpc('partner_credit_reconcile',{p_topup:id,p_version:version,p_session:session.id,p_intent:intent.id,p_net:credit.net,p_dispute:credit.blocked})
  if (!applied) throw new Error('Concurrent payment reconciliation; retry')
}
