import { supabaseAdmin as db } from '@/lib/supabase-admin'
import { checked } from '@/lib/partner-api'
import { ApiError } from '@/lib/manufacturing-contract'
import { creditRpc } from '@/lib/prepaid'
import { prepaidStripe } from '@/lib/prepaid-stripe'
import { prepaidMode, prepaidName } from '@/lib/prepaid-contract'

const amount=(q:any)=>q.shipping_cents+q.tax_cents
export function customerCheckoutOrigin() {
  const configured=process.env.NEXT_PUBLIC_TCGPLAYTEST_APP_URL || process.env.NEXT_PUBLIC_CARDIFY_APP_URL || process.env.CARDIFY_APP_URL
  if (!configured || !process.env.STRIPE_SECRET_KEY) throw new ApiError(503,'prepaid_unavailable','Configure the partner public origin and Stripe before accepting orders.')
  const origin=new URL(configured)
  if (origin.protocol!=='https:' || origin.username || origin.password) throw new ApiError(503,'prepaid_unavailable','Partner public origin must be HTTPS.')
  return origin.origin
}
export async function customerPaymentQuote(id:string) {
  const q=checked(await db.from(prepaidName('partner_prepaid_quotes')).select('*').eq('payment_mode',prepaidMode()).eq('id',id).single())
  if (!q || q.funding_model!=='cards_credit' || q.status!=='consumed') throw new Error('Submitted split-payment quote required')
  return q
}
function checkSession(q:any,s:any) {
  if (!s?.id || s.mode!=='payment' || s.livemode!==(prepaidMode()==='live') || (q.payment_mode || q.mode || 'live')!==prepaidMode() || s.currency!=='usd' || s.amount_total!==amount(q) ||
    s.metadata?.prepaid_quote_id!==q.id || s.metadata?.partner_id!==q.partner_id || s.metadata?.order_id!==q.order_id ||
    s.metadata?.payment_purpose!=='prepaid_shipping_tax' || (q.stripe_session_id && s.id!==q.stripe_session_id) ||
    s.expires_at!==Math.floor(Date.parse(q.checkout_expires_at)/1000)) throw new Error('Customer checkout mismatch')
}
export async function ensureCustomerCheckout(q:any) {
  if (q.funding_model!=='cards_credit' || q.status!=='consumed' || !['pending','open'].includes(q.customer_payment_status)) return q
  if (q.stripe_session_id) return q
  // Persisted parameters + one idempotency key survive ambiguous create responses.
  // Never retry creation past Stripe's idempotency retention window.
  if (Date.now()-Date.parse(q.checkout_started_at)>23*3600000) throw new ApiError(409,'payment_reconciliation_required','This checkout needs support review. Do not create another payment for it.')
  if (!q.customer_checkout_origin) q=await creditRpc('partner_prepaid_checkout_origin',{p_quote:q.id,p_origin:customerCheckoutOrigin()})
  const returnUrl=`${q.customer_checkout_origin}/prepaid/return/${q.customer_return_token}`
  const params=new URLSearchParams({mode:'payment','payment_method_types[0]':'card',success_url:returnUrl,cancel_url:returnUrl,
    customer_email:q.shipping.email,expires_at:String(Math.floor(Date.parse(q.checkout_expires_at)/1000)),
    'custom_text[submit][message]':'Card printing is funded by your store. This payment covers shipping and the quoted fulfillment tax only.'})
  const rows=[['Shipping',q.shipping_cents],['Tax on printing and shipping',q.tax_cents]].filter(([,n])=>Number(n)>0)
  rows.forEach(([label,cents],i)=>{params.set(`line_items[${i}][price_data][currency]`,'usd');params.set(`line_items[${i}][price_data][unit_amount]`,String(cents));params.set(`line_items[${i}][price_data][product_data][name]`,String(label));params.set(`line_items[${i}][quantity]`,'1')})
  for (const [k,v] of Object.entries({prepaid_quote_id:q.id,partner_id:q.partner_id,order_id:q.order_id,payment_purpose:'prepaid_shipping_tax'})) {
    params.set(`metadata[${k}]`,String(v));params.set(`payment_intent_data[metadata][${k}]`,String(v))
  }
  const session=await prepaidStripe('/checkout/sessions',params,`prepaid-customer-${q.id}`)
  checkSession(q,session)
  if (!session.url || new URL(session.url).origin!=='https://checkout.stripe.com') throw new Error('Customer checkout URL unavailable')
  return creditRpc('partner_prepaid_bind_checkout',{p_quote:q.id,p_session:session.id,p_url:session.url,p_expires:new Date(session.expires_at*1000).toISOString()})
}
export async function reconcileCustomerPayment(id:string,suppliedSession?:string) {
  let q=await customerPaymentQuote(id)
  const version=await creditRpc('partner_prepaid_claim_payment',{p_quote:id})
  if (!version) throw new Error('Customer payment unavailable')
  const sessionId=q.stripe_session_id || suppliedSession
  if (!sessionId) throw new Error('Customer checkout not yet bound')
  const session=await prepaidStripe(`/checkout/sessions/${encodeURIComponent(sessionId)}`)
  checkSession(q,session)
  let state='open',paid=0,refunded=0,disputed=false,refundPending=false,refundFailed=false,intentId:string|null=null
  if (session.payment_status==='paid') {
    intentId=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id
    if (!intentId) throw new Error('Customer payment intent required')
    const intent=await prepaidStripe(`/payment_intents/${encodeURIComponent(intentId)}?expand[]=latest_charge`)
    if (intent.status!=='succeeded' || intent.amount_received!==amount(q) || intent.amount!==amount(q) || intent.currency!=='usd' || intent.livemode!==(prepaidMode()==='live') ||
      intent.metadata?.prepaid_quote_id!==id || intent.metadata?.partner_id!==q.partner_id || intent.metadata?.order_id!==q.order_id || intent.metadata?.payment_purpose!=='prepaid_shipping_tax' ||
      !intent.latest_charge || typeof intent.latest_charge!=='object' || intent.latest_charge.paid!==true) throw new Error('Customer payment mismatch')
    const [disputes,refunds]=await Promise.all([
      prepaidStripe(`/disputes?payment_intent=${encodeURIComponent(intentId)}&limit=100`),
      prepaidStripe(`/refunds?payment_intent=${encodeURIComponent(intentId)}&limit=100`),
    ])
    if (disputes.has_more || !Array.isArray(disputes.data)) throw new Error('Customer dispute reconciliation incomplete')
    if (refunds.has_more || !Array.isArray(refunds.data) || refunds.data.some((r:any)=>r.payment_intent!==intentId || r.currency!=='usd' || !Number.isSafeInteger(r.amount) || r.amount<0 || !['pending','requires_action','succeeded','failed','canceled'].includes(r.status))) throw new Error('Customer refund reconciliation incomplete')
    refunded=refunds.data.filter((r:any)=>r.status==='succeeded').reduce((sum:number,r:any)=>sum+r.amount,0)
    refundPending=refunds.data.some((r:any)=>['pending','requires_action'].includes(r.status))
    refundFailed=refunded<amount(q) && refunds.data.some((r:any)=>['failed','canceled'].includes(r.status))
    if (!Number.isSafeInteger(refunded) || refunded<0 || refunded>amount(q)) throw new Error('Customer refund mismatch')
    disputed=disputes.data.some((d:any)=>!['won','warning_closed'].includes(d.status))
    state='paid';paid=amount(q)
  } else if (session.status==='expired' && session.payment_status==='unpaid') state='expired'
  else if (session.status!=='open' || session.payment_status!=='unpaid') throw new Error('Customer payment still settling')
  const applied=await creditRpc('partner_prepaid_apply_payment',{p_quote:id,p_version:version,p_session:session.id,p_intent:intentId,p_state:state,p_paid:paid,p_refunded:refunded,p_disputed:disputed,p_refund_pending:refundPending,p_refund_failed:refundFailed})
  if (!applied) throw new Error('Concurrent customer payment reconciliation; retry')
  q=await customerPaymentQuote(id)
  // All refunds use the verified original Intent. No amount supplied means the
  // remaining refundable amount; dashboard partial refunds cannot over-refund.
  if (q.customer_refund_required && intentId && refunded<paid && !disputed && !refundPending && !refundFailed) {
    await prepaidStripe('/refunds',new URLSearchParams({payment_intent:intentId}),`prepaid-customer-refund-${id}`)
    // Do not mark refunded from a POST response; the next signed event/cron
    // retrieves the charge and confirms how much was actually returned.
  }
  return q
}
export async function maintainCustomerPayments() {
  const jobs=await creditRpc('partner_prepaid_claim_payment_jobs',{}) || []
  let reconciled=0,failed=0
  for (const job of jobs) {
    try {
      const q=await ensureCustomerCheckout(job)
      await reconcileCustomerPayment(q.id)
      checked(await db.from(prepaidName('partner_prepaid_quotes')).update({payment_lease_token:null,payment_lease_until:null,payment_last_error:null,next_payment_sync_at:new Date(Date.now()+60000).toISOString()}).eq('id',job.id).eq('payment_lease_token',job.payment_lease_token))
      reconciled++
    } catch {
      checked(await db.from(prepaidName('partner_prepaid_quotes')).update({payment_lease_token:null,payment_lease_until:null,payment_last_error:'Customer payment reconciliation pending. Retry the original checkout; do not charge again.',next_payment_sync_at:new Date(Date.now()+Math.min(3600,30*2**Math.min(job.payment_sync_attempts,7))*1000).toISOString()}).eq('id',job.id).eq('payment_lease_token',job.payment_lease_token))
      failed++
    }
  }
  return {reconciled,failed}
}
