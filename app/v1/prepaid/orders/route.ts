import { after } from 'next/server'
import { api, authenticate, digest, json } from '@/lib/partner-api'
import { prepaidKey, uuid, idempotency, object, acceptance, publicQuote } from '@/lib/prepaid-contract'
import { creditRpc, deliverPrepaidJobs } from '@/lib/prepaid'
import { ensureCustomerCheckout, customerCheckoutOrigin } from '@/lib/prepaid-customer-payment'
import { randomUUID } from 'node:crypto'
export const maxDuration=60
export async function POST(request: Request) {return api(async()=>{
  const key=await authenticate(request);prepaidKey(key)
  customerCheckoutOrigin()
  const idem=idempotency(request),body=await json(request);object(body,['quote_id','acceptance'])
  const normalized={quote_id:uuid(body.quote_id),acceptance:acceptance(body.acceptance)}
  let quote=await creditRpc('partner_prepaid_submit',{p_partner:key.partner_id,p_key:key.id,p_quote:normalized.quote_id,p_idempotency:idem,p_hash:digest(JSON.stringify(normalized)),p_acceptance:normalized.acceptance,p_order:randomUUID()})
  quote=await ensureCustomerCheckout(quote)
  after(async()=>{try{await deliverPrepaidJobs()}catch{console.error('Prepaid delivery pending; maintenance will retry.')}})
  const view=publicQuote(quote)
  return Response.json({order_id:view.order_id,cart_id:quote.cart_id,funding:quote.funding_model==='cards_credit'?'printing_credit_customer_shipping_tax':'prepaid_credit',quote:view,...(view.checkout_url?{checkout_url:view.checkout_url}:{}),status_url:view.order_id?`/v1/orders/${view.order_id}`:`/v1/prepaid/quotes/${quote.id}`},{status:view.order_id?200:202,headers:{'Cache-Control':'no-store'}})
})}
