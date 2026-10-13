import { api, internalAuth, json, checked } from '@/lib/partner-api'
import { ApiError } from '@/lib/manufacturing-contract'
import { uuid } from '@/lib/prepaid-contract'
import { supabaseAdmin as db } from '@/lib/supabase-admin'
export async function POST(request: Request) {return api(async()=>{
  internalAuth(request)
  const body=await json(request)
  const quote=checked(await db.from('partner_prepaid_quotes').select('*').eq('id',uuid(body.quote_id)).eq('status','consumed').eq('payment_mode','live').single())
  const cart=checked(await db.from('partner_carts').select('id,card_count,partner_id,external_ref,partner_terms_version,partner_terms_accepted_at,settlement,checkout_funding,order_id,mode').eq('id',quote.cart_id).single())
  const order=checked(await db.from('partner_manufacturing_orders').select('id,status').eq('id',quote.order_id).single())
  if (!cart || !order || cart.mode!=='live' || (cart.settlement!=='prepaid' && cart.checkout_funding!=='prepaid') || cart.order_id!==quote.order_id || cart.partner_id!==quote.partner_id) throw new ApiError(409,'funding_unconfirmed','Order funding is not confirmed.')
  return Response.json({quote,cart,order},{headers:{'Cache-Control':'no-store'}})
})}
