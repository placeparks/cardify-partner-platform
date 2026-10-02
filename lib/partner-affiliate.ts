import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { ApiError } from "@/lib/manufacturing-contract"

export async function approvedPartnerAffiliate(email: string) {
  const origin = process.env.TCGPLAYTEST_CHECKOUT_ORIGIN
  const secret = process.env.PARTNER_INTERNAL_SECRET
  if (!origin || !secret || secret.length < 32) throw new ApiError(503, "affiliate_unavailable", "Affiliate details are temporarily unavailable.")
  const response = await fetch(`${origin.replace(/\/$/, "")}/api/partner/affiliate`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ email }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new ApiError(503, "affiliate_unavailable", "Affiliate details are temporarily unavailable.")
  const data = await response.json()
  return data.approved === true && typeof data.code === "string" && /^[A-Z0-9-]{1,64}$/.test(data.code) ? data.code as string : null
}

export async function savePartnerAffiliate(partner: any, user: any, enabled: unknown) {
  if (typeof enabled !== "boolean") throw new ApiError(400, "invalid_request", "Choose whether to apply your affiliate code.")
  const code = enabled ? await approvedPartnerAffiliate(user.email || "") : null
  if (enabled && !code) throw new ApiError(403, "affiliate_not_approved", "No approved affiliate code was found for your signed-in email.")
  const { error } = await db.rpc("partner_set_checkout_affiliate", { p_partner: partner.id, p_actor: user.id, p_code: code })
  if (error) throw new ApiError(503, "affiliate_setup_required", "Could not save your affiliate preference. Apply the partner affiliate migration and retry.")
  return code
}
