import { NextResponse } from "next/server"
import { api, json, partnerSession } from "@/lib/partner-api"
import { approvedPartnerAffiliate, savePartnerAffiliate } from "@/lib/partner-affiliate"

export async function GET() { return api(async () => {
  const { user, partner } = await partnerSession()
  const code = await approvedPartnerAffiliate(user.email || "")
  return NextResponse.json({ approved: Boolean(code), code, enabled: Boolean(partner.checkout_affiliate_code), savedCode: partner.checkout_affiliate_code || null },
    { headers: { "Cache-Control": "private, no-store" } })
}) }

export async function POST(request: Request) { return api(async () => {
  const { user, partner } = await partnerSession()
  const body = await json(request)
  const code = await savePartnerAffiliate(partner, user, body.enabled)
  return NextResponse.json({ enabled: Boolean(code), code }, { headers: { "Cache-Control": "private, no-store" } })
}) }
