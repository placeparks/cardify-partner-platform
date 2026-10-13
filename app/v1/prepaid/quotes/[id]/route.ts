import { api, authenticate, checked } from '@/lib/partner-api'
import { ApiError } from '@/lib/manufacturing-contract'
import { prepaidKey, uuid, publicQuote, prepaidName, prepaidMode } from '@/lib/prepaid-contract'
import { supabaseAdmin as db } from '@/lib/supabase-admin'
export async function GET(request: Request,context:{params:Promise<{id:string}>}) {return api(async()=>{
  const key=await authenticate(request);prepaidKey(key)
  const id=uuid((await context.params).id)
  const quote=checked(await db.from(prepaidName('partner_prepaid_quotes')).select('*').eq('id',id).eq('partner_id',key.partner_id).eq('payment_mode',prepaidMode()).maybeSingle())
  if (!quote) throw new ApiError(404,'not_found','Quote not found.')
  return Response.json(publicQuote(quote),{headers:{'Cache-Control':'no-store'}})
})}
