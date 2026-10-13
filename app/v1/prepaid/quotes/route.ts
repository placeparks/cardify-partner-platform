import { api, authenticate, checked, digest, json } from '@/lib/partner-api'
import { ApiError } from '@/lib/manufacturing-contract'
import { prepaidKey, idempotency, object, shippingAddress, publicQuote, prepaidName, prepaidMode } from '@/lib/prepaid-contract'
import { requireAccount, commerce } from '@/lib/prepaid'
import { supabaseAdmin as db } from '@/lib/supabase-admin'
export async function POST(request: Request) {return api(async()=>{
  const key=await authenticate(request);prepaidKey(key);await requireAccount(key.partner_id)
  const idem=idempotency(request),body=await json(request);object(body,['cart_id','shipping'])
  if (typeof body.cart_id!=='string' || !/^cart_[a-f0-9]{64}$/.test(body.cart_id)) throw new ApiError(400,'invalid_request','Use the exact cart ID returned by this API.')
  const shipping=shippingAddress(body.shipping),hash=digest(JSON.stringify({cart_id:body.cart_id,shipping}))
  const table=prepaidName('partner_prepaid_quotes')
  const previous=checked(await db.from(table).select('*').eq('partner_id',key.partner_id).eq('payment_mode',prepaidMode()).eq('idempotency_key',idem).maybeSingle())
  if (previous) {
    if (previous.request_hash!==hash) throw new ApiError(409,'idempotency_conflict','That key belongs to different quote instructions.')
    return Response.json(publicQuote(previous),{headers:{'Cache-Control':'no-store'}})
  }
  const cart=checked(await db.from('partner_carts').select('*').eq('id',body.cart_id).eq('partner_id',key.partner_id).eq('mode',key.mode).maybeSingle())
  if (!cart) throw new ApiError(404,'not_found','Cart not found.')
  if (cart.settlement!=='prepaid' || cart.status!=='open' || Date.parse(cart.expires_at)<=Date.now()) throw new ApiError(409,'cart_unavailable','Create a prepaid cart and wait until its artwork validation is open.')
  const price=await commerce('quote',{mode:prepaidMode(),card_count:cart.card_count,shipping,idempotency_key:digest(`${prepaidMode()}:${key.partner_id}:${idem}`)})
  if ((price.mode || 'live')!==prepaidMode()) throw new Error('Stripe credentials must use the same environment on partner and commerce deployments')
  if (![price.printing_cents,price.shipping_cents,price.tax_cents,price.total_cents].every(n=>Number.isSafeInteger(n) && n>=0) || price.total_cents!==price.printing_cents+price.shipping_cents+price.tax_cents || price.total_cents<=0 || typeof price.tax_calculation_id!=='string' || !Number.isFinite(Date.parse(price.expires_at))) throw new Error('Invalid fulfillment quote')
  const expires=new Date(Math.min(Date.now()+30*60000,Date.parse(cart.expires_at),Date.parse(price.expires_at))).toISOString()
  const inserted=await db.from(table).insert({partner_id:key.partner_id,payment_mode:prepaidMode(),cart_id:cart.id,idempotency_key:idem,request_hash:hash,shipping,funding_model:'cards_credit',
    printing_cents:price.printing_cents,shipping_cents:price.shipping_cents,tax_cents:price.tax_cents,total_cents:price.total_cents,tax_calculation_id:price.tax_calculation_id,expires_at:expires}).select('*').maybeSingle()
  if (inserted.error && inserted.error.code!=='23505') throw new Error('Quote could not be saved')
  const quote=inserted.data || checked(await db.from(table).select('*').eq('partner_id',key.partner_id).eq('payment_mode',prepaidMode()).eq('idempotency_key',idem).single())
  if (quote.request_hash!==hash) throw new ApiError(409,'idempotency_conflict','That key belongs to different quote instructions.')
  return Response.json(publicQuote(quote),{status:inserted.data?201:200,headers:{'Cache-Control':'no-store'}})
})}
