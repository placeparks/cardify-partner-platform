import { api, checked, json, partnerSession } from '@/lib/partner-api'
import { ApiError } from '@/lib/manufacturing-contract'
import { supabaseAdmin as db } from '@/lib/supabase-admin'
import { activePartner, accountReady, connectAccount, connectMode, connectStripe } from '@/lib/connect'
import { CONNECT_TERMS_VERSION, connectEnabled } from '@/lib/connect-contract'
export const dynamic='force-dynamic'
export async function GET(){return api(async()=>{
 const {partner}=await partnerSession();activePartner(partner)
 if(process.env.PARTNER_CONNECT_ENABLED!=='true')return Response.json({enabled:false},{headers:{'Cache-Control':'no-store'}})
 const row=await connectAccount(partner.id)
 const account=row?.stripe_account_id?await connectStripe(`/accounts/${encodeURIComponent(row.stripe_account_id)}`):null
 const orders=checked(await db.from('partner_connect_orders').select('id,cart_id,retail_cents,printing_cents,fee_cents,earnings_cents,reserve_cents,release_at,status,last_error,snapshot,created_at').eq('partner_id',partner.id).eq('payment_mode',connectMode()).order('created_at',{ascending:false}).limit(50))
 return Response.json({enabled:true,accepted:row?.terms_version===CONNECT_TERMS_VERSION,connected:!!account,ready:accountReady(account),orders},{headers:{'Cache-Control':'no-store'}})
})}
export async function POST(request:Request){return api(async()=>{
 connectEnabled()
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError(403,'origin_not_allowed','Use your partner dashboard.')
 const {partner,user}=await partnerSession();activePartner(partner);const body=await json(request)
 if(body.accepted!==true||body.terms_version!==CONNECT_TERMS_VERSION||Object.keys(body).some(k=>!['accepted','terms_version'].includes(k)))throw new ApiError(400,'connect_terms_required','Accept the current Connect terms.')
 checked(await db.rpc('partner_connect_accept',{p_partner:partner.id,p_mode:connectMode(),p_user:user.id,p_version:CONNECT_TERMS_VERSION}))
 return Response.json({accepted:true})
})}
