import { api, checked } from '@/lib/partner-api'
import { ApiError } from '@/lib/manufacturing-contract'
import { verifyStripeSignature } from '@/lib/prepaid-stripe'
import { connectMode } from '@/lib/connect'
import { supabaseAdmin as db } from '@/lib/supabase-admin'
export async function POST(request:Request){return api(async()=>{
 const raw=await request.text();if(raw.length>512000)throw new ApiError(413,'invalid_request','Event too large.')
 verifyStripeSignature(raw,request.headers.get('stripe-signature')||'',process.env.STRIPE_CONNECT_WEBHOOK_SECRET||'')
 const event=JSON.parse(raw)
 if(event.livemode!==(connectMode()==='live')||event.account)return Response.json({received:true})
 const object=event.data?.object
 // Persist a reconciliation request. Delivery order never controls the balance;
 // the worker retrieves the current payment/refunds/disputes directly from Stripe.
 if(object?.metadata?.connect_order_id&&/^[0-9a-f-]{36}$/i.test(object.metadata.connect_order_id)){
  checked(await db.from('partner_connect_orders').update({next_sync_at:new Date().toISOString()}).eq('id',object.metadata.connect_order_id).eq('payment_mode',connectMode()))
 }else if(typeof object?.charge==='string'){
  checked(await db.from('partner_connect_orders').update({next_sync_at:new Date().toISOString()}).eq('charge_id',object.charge).eq('payment_mode',connectMode()))
 }else if(object?.object==='charge'){
  checked(await db.from('partner_connect_orders').update({next_sync_at:new Date().toISOString()}).eq('charge_id',object.id).eq('payment_mode',connectMode()))
 }
 return Response.json({received:true})
})}
