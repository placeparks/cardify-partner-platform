import { api, checked, json, partnerSession } from '@/lib/partner-api'
import { ApiError, hasPartnerTerms } from '@/lib/manufacturing-contract'
import { enabled, idempotency, object, prepaidName, prepaidMode } from '@/lib/prepaid-contract'
import { requireAccount } from '@/lib/prepaid'
import { prepaidStripe } from '@/lib/prepaid-stripe'
import { supabaseAdmin as db } from '@/lib/supabase-admin'
export async function POST(request: Request) { return api(async()=>{
  enabled()
  const origin=new URL(request.url).origin
  if (request.headers.get('origin')!==origin) throw new ApiError(403,'origin_not_allowed','Use your partner dashboard.')
  const {partner}=await partnerSession()
  if (partner.access_revoked_at || !hasPartnerTerms(partner)) throw new ApiError(403,'partner_unavailable','Active access and accepted partner terms required.')
  await requireAccount(partner.id)
  const key=idempotency(request),body=await json(request);object(body,['amount_cents'])
  if (!Number.isSafeInteger(body.amount_cents) || body.amount_cents<1000 || body.amount_cents>500000) throw new ApiError(400,'invalid_request','Add between $10 and $5,000 in whole USD cents.')
  const table=prepaidName('partner_credit_topups')
  const inserted=await db.from(table).insert({partner_id:partner.id,payment_mode:prepaidMode(),idempotency_key:key,amount_cents:body.amount_cents}).select('*').maybeSingle()
  if (inserted.error && inserted.error.code!=='23505') throw new Error('Top-up could not be saved')
  const topup=inserted.data || checked(await db.from(table).select('*').eq('partner_id',partner.id).eq('payment_mode',prepaidMode()).eq('idempotency_key',key).single())
  if (topup.amount_cents!==body.amount_cents) throw new ApiError(409,'idempotency_conflict','That key belongs to a different top-up amount.')
  let session
  if (topup.stripe_session_id) session=await prepaidStripe(`/checkout/sessions/${encodeURIComponent(topup.stripe_session_id)}`)
  else {
    if (Date.now()-Date.parse(topup.created_at)>23*3600000) throw new ApiError(409,'topup_reconciliation_required','This payment attempt needs support review before retrying.')
    const params=new URLSearchParams({mode:'payment','payment_method_types[0]':'card',success_url:`${origin}/dashboard/credits?credit=return`,cancel_url:`${origin}/dashboard/credits`,customer_email:partner.email,
      'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':String(topup.amount_cents),'line_items[0][price_data][product_data][name]':'TCGPlaytest prepaid fulfillment credit','line_items[0][quantity]':'1',
      'metadata[prepaid_topup_id]':topup.id,'metadata[partner_id]':partner.id,'payment_intent_data[metadata][prepaid_topup_id]':topup.id,'payment_intent_data[metadata][partner_id]':partner.id})
    session=await prepaidStripe('/checkout/sessions',params,`prepaid-topup-${topup.id}`)
    if (session.livemode!==(prepaidMode()==='live')) throw new ApiError(503,'prepaid_unavailable','Stripe checkout mode does not match the configured key.')
    checked(await db.from(table).update({stripe_session_id:session.id}).eq('id',topup.id))
  }
  if (session.livemode!==(prepaidMode()==='live') || session.metadata?.prepaid_topup_id!==topup.id || session.metadata?.partner_id!==partner.id || session.amount_total!==topup.amount_cents || session.currency!=='usd') throw new ApiError(503,'prepaid_unavailable','Stripe checkout identity or mode does not match this wallet.')
  if (session.status!=='open' || !session.url) throw new ApiError(409,'topup_finished','This payment attempt is complete or expired. Refresh your balance before starting another top-up.')
  return Response.json({id:topup.id,checkout_url:session.url},{headers:{'Cache-Control':'no-store'}})
}) }
