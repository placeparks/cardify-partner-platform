import { NextResponse } from "next/server"
import { api, checked, json, partnerSession, secret } from "@/lib/partner-api"
import { ApiError, httpsUrl } from "@/lib/manufacturing-contract"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { encrypt } from "@/lib/webhook-secrets"
export async function POST(request: Request) { return api(async () => {
  const { partner } = await partnerSession(); const body = await json(request)
  if (!["test","live"].includes(body.mode)) throw new ApiError(400,"invalid_request","Select a mode")
  const url = httpsUrl(body.url, "webhook URL")
  if (new URL(url).origin !== new URL(partner.website_url).origin) throw new ApiError(400,"invalid_request","Use your approved website origin")
  const signingSecret = secret("whsec_")
  checked(await db.from("partner_webhook_settings").upsert({ partner_id: partner.id, mode: body.mode, url, secret_ciphertext: encrypt(signingSecret) }))
  return NextResponse.json({ signing_secret: signingSecret, url, mode: body.mode }, { headers: { "Cache-Control": "no-store" } })
}) }
