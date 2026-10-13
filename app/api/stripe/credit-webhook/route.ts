import { api } from '@/lib/partner-api'
import { ApiError } from '@/lib/manufacturing-contract'
import { prepaidStripe, reconcileTopup, verifyStripeSignature } from '@/lib/prepaid-stripe'
import { reconcileCustomerPayment } from '@/lib/prepaid-customer-payment'
import { prepaidMode } from '@/lib/prepaid-contract'
export const runtime='nodejs'
export const maxDuration=60
export async function POST(request: Request) { return api(async()=>{
  const chunks: Uint8Array[]=[];let size=0
  const reader=request.body?.getReader()
  if (!reader) throw new ApiError(400,'invalid_request','Webhook body required.')
  while (true) {const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>256000){await reader.cancel();throw new ApiError(413,'invalid_request','Webhook too large.')}chunks.push(part.value)}
  const raw=Buffer.concat(chunks).toString('utf8')
  verifyStripeSignature(raw,request.headers.get('stripe-signature')||'',process.env.STRIPE_CREDIT_WEBHOOK_SECRET||'')
  let event;try{event=JSON.parse(raw)}catch{throw new ApiError(400,'invalid_request','Malformed event.')}
  // Reconciliation remains active if new prepaid spending is disabled.
  if (event.livemode!==(prepaidMode()==='live')) return Response.json({received:true})
  const item=event.data?.object
  if (['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired'].includes(event.type) && item?.metadata?.prepaid_quote_id) {
    await reconcileCustomerPayment(item.metadata.prepaid_quote_id,item.id)
    return Response.json({received:true})
  }
  if (['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type) && item?.metadata?.prepaid_topup_id) {
    await reconcileTopup(item.metadata.prepaid_topup_id,item.id)
  } else if (['charge.refunded','refund.created','refund.updated','refund.failed','charge.dispute.created','charge.dispute.updated','charge.dispute.closed','charge.dispute.funds_withdrawn','charge.dispute.funds_reinstated'].includes(event.type)) {
    const intentId=typeof item?.payment_intent==='string'?item.payment_intent:item?.payment_intent?.id
    if (intentId) {
      const intent=await prepaidStripe(`/payment_intents/${encodeURIComponent(intentId)}`)
      if (intent.metadata?.prepaid_topup_id) await reconcileTopup(intent.metadata.prepaid_topup_id)
      if (intent.metadata?.prepaid_quote_id) await reconcileCustomerPayment(intent.metadata.prepaid_quote_id)
    }
  }
  return Response.json({received:true})
}) }
