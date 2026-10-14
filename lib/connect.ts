import { supabaseAdmin as db } from '@/lib/supabase-admin'
import { checked, digest } from '@/lib/partner-api'
import { ApiError, hasPartnerTerms } from '@/lib/manufacturing-contract'
import { prepaidMode } from '@/lib/prepaid-contract'
import { CONNECT_TERMS_VERSION, connectEnabled } from '@/lib/connect-contract'

export async function connectStripe(path:string,body?:URLSearchParams,key?:string){
 const secret=process.env.STRIPE_SECRET_KEY
 if(!secret)throw new ApiError(503,'connect_configuration','Stripe is not configured.')
 const response=await fetch(`https://api.stripe.com/v1${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${secret}`,'Stripe-Version':'2023-10-16',...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},body,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)})
 const data=await response.json()
 if(!response.ok){
  const code=String(data.error?.code||data.error?.type||'stripe_error').replace(/[^a-z0-9_]/gi,'').slice(0,80)
  console.error('Connect Stripe request failed',{code,status:response.status,request_id:response.headers.get('request-id')})
  throw new ApiError(503,'connect_stripe_error',`Stripe could not complete the Connect operation (${code}). Check the platform Stripe request log; retry the same attempt.`)
 }
 return data
}
export const connectMode=prepaidMode
export async function connectRpc(name:string,body:Record<string,unknown>){return checked(await db.rpc(name,body))}
export function connectOrigin(){const value=process.env.NEXT_PUBLIC_TCGPLAYTEST_APP_URL||process.env.NEXT_PUBLIC_CARDIFY_APP_URL||process.env.CARDIFY_APP_URL;const u=new URL(value||'');if(u.protocol!=='https:'||u.username||u.password)throw new ApiError(503,'connect_configuration','Configure the HTTPS partner website URL.');return u.origin}
export function activePartner(p:any){if(!p||p.status!=='approved'||p.api_blocked_at||p.access_revoked_at||!hasPartnerTerms(p))throw new ApiError(403,'partner_unavailable','An active partner with current terms is required.')}
export async function connectAccount(partner:string){return checked(await db.from('partner_connect_accounts').select('*').eq('partner_id',partner).eq('payment_mode',connectMode()).maybeSingle())}
export function accountReady(a:any){return a?.country==='US'&&a.details_submitted===true&&a.payouts_enabled===true&&a.capabilities?.transfers==='active'&&!a.requirements?.disabled_reason}
export async function readyConnect(partner:any){
 connectEnabled();activePartner(partner)
 const row=await connectAccount(partner.id)
 if(!row?.stripe_account_id||row.terms_version!==CONNECT_TERMS_VERSION)throw new ApiError(403,'connect_onboarding_required','Accept Connect terms and finish Stripe onboarding in your dashboard.')
 const account=await connectStripe(`/accounts/${encodeURIComponent(row.stripe_account_id)}`)
 if(!accountReady(account)||account.metadata?.partner_request_id!==partner.id)throw new ApiError(409,'connect_account_unavailable','Finish Stripe onboarding before using Connect checkout.')
 return row
}
export async function onboardConnect(partner:any){
 connectEnabled();activePartner(partner)
 let row=await connectAccount(partner.id)
 if(row?.terms_version!==CONNECT_TERMS_VERSION)throw new ApiError(403,'connect_terms_required','Accept the Connect terms first.')
 if(!row.stripe_account_id){
  const a=await connectStripe('/accounts',new URLSearchParams({type:'express',country:'US',email:partner.email,'capabilities[transfers][requested]':'true','business_profile[url]':partner.website_url,'metadata[partner_request_id]':partner.id,'metadata[payment_mode]':connectMode()}),`connect-account-${connectMode()}-${partner.id}`)
  checked(await db.from('partner_connect_accounts').update({stripe_account_id:a.id}).eq('partner_id',partner.id).eq('payment_mode',connectMode()).is('stripe_account_id',null))
  row=await connectAccount(partner.id)
 }
 const origin=connectOrigin()
 const link=await connectStripe('/account_links',new URLSearchParams({account:row.stripe_account_id,type:'account_onboarding',refresh_url:`${origin}/dashboard/connect?onboarding=refresh`,return_url:`${origin}/dashboard/connect?onboarding=return`}))
 return {url:link.url}
}
export function connectSessionCheck(o:any,s:any){
 const shipping=s?.total_details?.amount_shipping
 const validShipping=s?.payment_status==='paid'?shipping===o.shipping_cents:[0,o.shipping_cents].includes(shipping)
 if(!s?.id||s.mode!=='payment'||s.livemode!==(o.payment_mode==='live')||s.currency!=='usd'||s.metadata?.connect_order_id!==o.id||s.metadata?.partnerCartId!==o.cart_id||s.metadata?.partnerId!==o.partner_id||s.metadata?.connect_hash!==o.request_hash||s.amount_subtotal!==o.retail_cents||!validShipping||s.total_details?.amount_discount!==0||(o.stripe_session_id&&s.id!==o.stripe_session_id)||s.expires_at!==Math.floor(Date.parse(o.checkout_expires_at)/1000))throw Error('Connect session mismatch')
}
export async function prepareConnect(cart:any,body:any){
 connectEnabled()
 if(cart.connect_payment_mode!==connectMode()||body.mode!==connectMode())throw new ApiError(409,'connect_mode_mismatch','Create a new Connect cart using this payment environment.')
 const partner=checked(await db.from('partnership_requests').select('*').eq('id',cart.partner_id).single())
 const account=await readyConnect(partner)
 if(account.stripe_account_id!==cart.connect_account_id)throw new ApiError(409,'connect_account_changed','Create a new cart after changing the connected account.')
 const platform=await connectStripe('/account')
 if(platform.id!==body.platform_account_id)throw new ApiError(503,'connect_configuration','Both deployments must use the same Stripe platform account.')
 const commerce=new URL(process.env.TCGPLAYTEST_CHECKOUT_ORIGIN||'')
 if(commerce.protocol!=='https:')throw new ApiError(503,'connect_configuration','Configure the HTTPS checkout origin.')
 const shipping=body.shipping
 if(!shipping||!['name','email','line1','city','postal_code','country'].every(k=>typeof shipping[k]==='string'&&shipping[k].trim()&&shipping[k].length<=254))throw new ApiError(400,'invalid_shipping','Complete the delivery address.')
 const hash=digest(JSON.stringify({cart:cart.id,shipping,retail:cart.connect_retail_cents,mode:body.mode}))
 if(!Number.isSafeInteger(body.printing_cents)||body.printing_cents<=0||!Number.isSafeInteger(body.shipping_cents)||body.shipping_cents<0||body.printing_cents>cart.connect_retail_cents)throw new ApiError(400,'invalid_connect_price','The selling price must cover printing; processing fees also reduce earnings.')
 return connectRpc('partner_connect_prepare',{p_cart:cart.id,p_mode:connectMode(),p_hash:hash,p_details:{shipping,printing_cents:body.printing_cents,shipping_cents:body.shipping_cents,platform_account_id:platform.id,commerce_origin:commerce.origin,cancel_url:new URL(partner.website_url).origin,card_count:cart.card_count}})
}
