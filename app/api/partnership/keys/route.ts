import { NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { api, checked, digest, json, partnerSession, secret } from "@/lib/partner-api"
import { ApiError, TERMS_VERSION } from "@/lib/manufacturing-contract"
export async function POST(request: Request) { return api(async () => {
  const { partner } = await partnerSession()
  const body = await json(request)
  if (!["test", "live"].includes(body.mode)) throw new ApiError(400, "invalid_request", "Select test or live")
  if (body.accept_terms !== true || body.terms_version !== TERMS_VERSION) throw new ApiError(400, "terms_required", "Accept the current manufacturing API terms")
  const key = secret(`tcgp_${body.mode}_`)
  checked(await db.from("partnership_requests").update({ terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() }).eq("id", partner.id))
  checked(await db.rpc("partner_rotate_key", { p_partner: partner.id, p_mode: body.mode, p_hash: digest(key), p_prefix: key.slice(0, 18) }))
  checked(await db.from("partner_audit_events").insert({ partner_id: partner.id, entity_type: "terms", entity_id: partner.id, action: "accepted", actor: partner.user_id, details: { terms_version: TERMS_VERSION } }))
  return NextResponse.json({ key, mode: body.mode, message: "Copy now. Only the hash is retained. The previous key is revoked." }, { headers: { "Cache-Control": "no-store" } })
}) }
