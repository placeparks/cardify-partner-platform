import { api, authenticate, checked } from '@/lib/partner-api'
import { prepaidKey, prepaidName, prepaidMode } from '@/lib/prepaid-contract'
import { creditRpc, requireAccount } from '@/lib/prepaid'
import { supabaseAdmin as db } from '@/lib/supabase-admin'
export async function GET(request: Request) {return api(async()=>{
  const key=await authenticate(request);prepaidKey(key);await requireAccount(key.partner_id)
  const balance=await creditRpc('partner_credit_balance',{p_partner:key.partner_id})
  const before=new URL(request.url).searchParams.get('before')
  let query=db.from(prepaidName('partner_credit_ledger')).select('id,amount_cents,balance_after_cents,kind,reference,description,created_at').eq('partner_id',key.partner_id).eq('payment_mode',prepaidMode()).order('id',{ascending:false}).limit(50)
  if (before && /^\d{1,18}$/.test(before)) query=query.lt('id',before)
  const ledger=checked(await query) || []
  return Response.json({...balance,...(prepaidMode()==='test'?{mode:'test',simulated:true}:{}),ledger,next_before:ledger.length===50?String(ledger[49].id):null},{headers:{'Cache-Control':'no-store'}})
})}
