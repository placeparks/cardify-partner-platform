import { NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { api, checked, digest, json, partnerSession, secret } from "@/lib/partner-api"
import { ApiError, hasPartnerTerms } from "@/lib/manufacturing-contract"
import { savePartnerAffiliate } from "@/lib/partner-affiliate"
export async function POST(request: Request) { return api(async () => {
  const { user, partner } = await partnerSession()
  const body = await json(request)
  if (!["test", "live"].includes(body.mode)) throw new ApiError(400, "invalid_request", "Select test or live")
  if (!hasPartnerTerms(partner)) throw new ApiError(400, "terms_required", "Accept the partner terms in the dashboard before creating a key")
  if (body.use_affiliate !== undefined) await savePartnerAffiliate(partner, user, body.use_affiliate)
  const key = secret(`tcgp_${body.mode}_`)
  checked(await db.rpc("partner_rotate_key", { p_partner: partner.id, p_mode: body.mode, p_hash: digest(key), p_prefix: key.slice(0, 18) }))
  return NextResponse.json({ key, mode: body.mode, message: "Copy now. Only the hash is retained. The previous key is revoked." }, { headers: { "Cache-Control": "no-store" } })
}) }
