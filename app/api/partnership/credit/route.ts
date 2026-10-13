import { api, checked, json, partnerSession } from '@/lib/partner-api'
import { ApiError, hasPartnerTerms } from '@/lib/manufacturing-contract'
import { PREPAID_TERMS_VERSION, enabled, object, prepaidName, prepaidMode } from '@/lib/prepaid-contract'
import { creditRpc } from '@/lib/prepaid'
import { supabaseAdmin as db } from '@/lib/supabase-admin'
export const dynamic='force-dynamic'
export async function GET() { return api(async()=>{
  const {partner}=await partnerSession()
  if (process.env.PARTNER_PREPAID_ENABLED!=='true') return Response.json({enabled:false},{headers:{'Cache-Control':'no-store'}})
  const balance=await creditRpc('partner_credit_balance',{p_partner:partner.id})
  const account=checked(await db.from(prepaidName('partner_credit_accounts')).select('terms_version').eq('partner_id',partner.id).maybeSingle())
  const ledger=checked(await db.from(prepaidName('partner_credit_ledger')).select('id,amount_cents,balance_after_cents,kind,description,created_at').eq('partner_id',partner.id).eq('payment_mode',prepaidMode()).order('id',{ascending:false}).limit(50))
  return Response.json({enabled:true,mode:prepaidMode(),accepted:account?.terms_version===PREPAID_TERMS_VERSION,balance,ledger},{headers:{'Cache-Control':'no-store'}})
}) }
export async function POST(request: Request) { return api(async()=>{
  enabled()
  if (request.headers.get('origin')!==new URL(request.url).origin) throw new ApiError(403,'origin_not_allowed','Use your partner dashboard.')
  const {user,partner}=await partnerSession()
  if (!hasPartnerTerms(partner)) throw new ApiError(403,'terms_required','Accept partner terms first.')
  const body=await json(request);object(body,['terms_version','accepted'])
  if (body.accepted!==true || body.terms_version!==PREPAID_TERMS_VERSION) throw new ApiError(400,'prepaid_terms_required','Accept the prepaid fulfillment terms.')
  await creditRpc('partner_credit_accept',{p_partner:partner.id,p_user:user.id,p_version:body.terms_version})
  return Response.json({accepted:true})
}) }
