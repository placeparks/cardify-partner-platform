import { NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { api, checked, json, partnerSession } from "@/lib/partner-api"
import { ApiError, TERMS_VERSION } from "@/lib/manufacturing-contract"

export async function POST(request: Request) { return api(async () => {
  const { user, partner } = await partnerSession()
  const body = await json(request)
  if (body.accept_terms !== true || body.terms_version !== TERMS_VERSION) throw new ApiError(400, "terms_required", "Accept the current partner terms")
  const acceptance = checked(await db.rpc("partner_accept_terms", { p_partner: partner.id, p_user: user.id, p_version: TERMS_VERSION }))
  return NextResponse.json({ terms_version: acceptance.terms_version, terms_accepted_at: acceptance.accepted_at }, { headers: { "Cache-Control": "no-store" } })
}) }
