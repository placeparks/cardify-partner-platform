import { after } from 'next/server'
import { api, adminSession, checked, json } from '@/lib/partner-api'
import { ApiError } from '@/lib/manufacturing-contract'
import { uuid, object, publicQuote, prepaidName, prepaidMode } from '@/lib/prepaid-contract'
import { creditRpc, deliverPrepaidJobs } from '@/lib/prepaid'
import { supabaseAdmin as db } from '@/lib/supabase-admin'
export async function GET() {return api(async()=>{
  await adminSession()
  const accounts=checked(await db.from(prepaidName('partner_credit_accounts')).select('*,partner:partnership_requests(business_name,email)').order('accepted_at',{ascending:false}).limit(100))
  const pending=prepaidMode()==='test'?[]:checked(await db.from('partner_prepaid_jobs').select('quote_id,attempts,last_error,next_attempt_at,delivered_at,refund_delivered_at,quote:partner_prepaid_quotes(order_id,refunded_at)').or('delivered_at.is.null,last_error.not.is.null').limit(50))
  const payments=checked(await db.from(prepaidName('partner_prepaid_quotes')).select('id,order_id,partner_id,customer_payment_status,customer_refund_required,payment_last_error,checkout_expires_at,next_payment_sync_at').eq('payment_mode',prepaidMode()).eq('funding_model','cards_credit').eq('status','consumed').or('customer_payment_status.in.(pending,open,review,refund_pending),customer_refund_required.eq.true').order('next_payment_sync_at').limit(50))
  return Response.json({mode:prepaidMode(),accounts:(accounts || []).map((a:any)=>({...a,balance_cents:prepaidMode()==='test'?a.test_balance_cents:a.balance_cents})),pending,payments},{headers:{'Cache-Control':'no-store'}})
})}
export async function POST(request: Request) {return api(async()=>{
  if (request.headers.get('origin')!==new URL(request.url).origin) throw new ApiError(403,'origin_not_allowed','Use the admin dashboard.')
  const user=await adminSession(),body=await json(request);object(body,['order_id','reason'])
  if (typeof body.reason!=='string' || body.reason.trim().length<3 || body.reason.length>500) throw new ApiError(400,'invalid_request','Give a refund reason (3–500 characters).')
  const quote=await creditRpc('partner_prepaid_refund',{p_order:uuid(body.order_id),p_actor:user.id,p_reason:body.reason.trim()})
  after(async()=>{try{await deliverPrepaidJobs()}catch{console.error('Prepaid refund synchronization pending.')}})
  return Response.json({refunded:true,quote:publicQuote(quote)})
})}
