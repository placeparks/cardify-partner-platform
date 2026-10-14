import { api, checked, digest, internalAuth, json } from '@/lib/partner-api'
import { supabaseAdmin as db } from '@/lib/supabase-admin'
import { ApiError, partnerReturnUrl } from '@/lib/manufacturing-contract'
import { connectMode, connectRpc, connectSessionCheck, connectStripe, prepareConnect } from '@/lib/connect'
export const maxDuration=60
export async function POST(request:Request){return api(async()=>{
 internalAuth(request);const body=await json(request)
 if(body.action==='prepare'){
  const cart=checked(await db.from('partner_carts').select('*').eq('checkout_token_hash',digest(String(body.token||''))).maybeSingle())
  if(!cart||cart.connect_retail_cents===null||cart.mode!=='live')throw new ApiError(404,'not_found','Connect cart not found.')
  return Response.json(await prepareConnect(cart,body),{headers:{'Cache-Control':'no-store'}})
 }
 if(body.action==='verify-payment'){
  const o=checked(await db.from('partner_connect_orders').select('*').eq('id',body.id).eq('payment_mode',connectMode()).single())
  const session=await connectStripe('/checkout/sessions/'+encodeURIComponent(String(body.session_id)));connectSessionCheck(o,session)
  if(o.payment_mode!=='live'||session.payment_status!=='paid')throw new ApiError(409,'payment_pending','A verified live payment is required for manufacturing.')
  const id=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id
  const intent=await connectStripe('/payment_intents/'+encodeURIComponent(id)+'?expand[]=latest_charge.balance_transaction')
  const charge=intent.latest_charge,fee=charge?.balance_transaction?.fee
  const tax=session.total_details?.amount_tax
  if(!Number.isSafeInteger(tax)||tax<0||session.amount_total!==o.retail_cents+o.shipping_cents+tax||session.automatic_tax?.enabled!==true||session.automatic_tax?.status!=='complete')throw new ApiError(409,'payment_pending','Complete tax and payment confirmation are required.')
  if(intent.status!=='succeeded'||intent.livemode!==true||intent.currency!=='usd'||intent.amount_received!==session.amount_total||intent.metadata?.connect_order_id!==o.id||intent.metadata?.connect_hash!==o.request_hash||!charge?.paid||!charge.captured||charge.balance_transaction?.source!==charge.id||charge.balance_transaction?.currency!=='usd'||!Number.isSafeInteger(fee)||fee<0)throw new ApiError(409,'payment_pending','Payment verification is still pending.')
  if(o.retail_cents-o.printing_cents-fee<0)throw new ApiError(409,'connect_fee_shortfall','The selling price does not cover printing and payment fees. Hold fulfillment and contact support.')
  return Response.json({verified:true},{headers:{'Cache-Control':'no-store'}})
 }
 if(body.action==='return'){
  const o=checked(await db.from('partner_connect_orders').select('*').eq('id',body.id).eq('payment_mode',connectMode()).single())
  if(o.payment_mode!=='test')throw new ApiError(400,'invalid_request','Use the verified manufacturing return for live orders.')
  const session=await connectStripe('/checkout/sessions/'+encodeURIComponent(String(body.session_id)));connectSessionCheck(o,session)
  if(session.status!=='complete'||session.payment_status!=='paid')throw new ApiError(409,'payment_pending','Payment confirmation is pending.')
  const cart=checked(await db.from('partner_carts').select('return_url,partner:partnership_requests(website_url)').eq('id',o.cart_id).single())
  if(!cart)throw new ApiError(404,'not_found','Connect cart not found.')
  const partner:any=cart.partner
  return Response.json({return_url:partnerReturnUrl(cart.return_url,partner.website_url)},{headers:{'Cache-Control':'no-store'}})
 }
 if(body.action==='bind'){

  const o=checked(await db.from('partner_connect_orders').select('*').eq('id',body.id).eq('payment_mode',connectMode()).single())
  const session=await connectStripe(`/checkout/sessions/${encodeURIComponent(String(body.session_id))}`);connectSessionCheck(o,session)
  return Response.json(await connectRpc('partner_connect_bind',{p_id:o.id,p_session:session.id}),{headers:{'Cache-Control':'no-store'}})
 }
 throw new ApiError(400,'invalid_request','Unknown Connect operation.')
})}
