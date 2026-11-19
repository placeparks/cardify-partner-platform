import { api, authenticate } from '@/lib/partner-api'
import { liveKey, uuid, publicQuote } from '@/lib/prepaid-contract'
import { creditRpc } from '@/lib/prepaid'
export async function POST(request: Request,context:{params:Promise<{id:string}>}) {return api(async()=>{
  const key=await authenticate(request);liveKey(key)
  return Response.json(publicQuote(await creditRpc('partner_prepaid_reserve',{p_partner:key.partner_id,p_key:key.id,p_quote:uuid((await context.params).id),p_release:false})),{headers:{'Cache-Control':'no-store'}})
})}
