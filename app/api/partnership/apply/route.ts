import { NextResponse } from "next/server"
import { getSignedInUser } from "@/lib/partnership"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { deliverWelcomeEmail } from "@/lib/partner-welcome"

export const maxDuration = 60

export async function POST(request: Request) {
  const { user } = await getSignedInUser()
  if (!user?.email) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.businessName !== "string" || !body.businessName.trim() || body.businessName.length > 200 ||
      typeof body.websiteUrl !== "string" || body.websiteUrl.length > 2048 ||
      (body.fullName != null && (typeof body.fullName !== "string" || body.fullName.length > 200)) ||
      (body.audience != null && (typeof body.audience !== "string" || body.audience.length > 5000))) {
    return NextResponse.json({ error: "Enter a valid business name, website, and application details." }, { status: 400 })
  }
  let website: URL
  try { website = new URL(body.websiteUrl) } catch { return NextResponse.json({ error: "Valid website URL required" }, { status: 400 }) }
  if (website.protocol !== "https:" || website.username || website.password) return NextResponse.json({ error: "Use an HTTPS website URL" }, { status: 400 })

  // Authenticated identity and approval are server-owned. Database locks serialize
  // signup retries and revocation; resubmission cannot reactivate a blocked account.
  const { data, error } = await supabaseAdmin.rpc("partner_register", {
    p_user: user.id, p_email: user.email, p_full_name: body.fullName?.trim() || user.user_metadata?.full_name || null,
    p_business_name: body.businessName.trim(), p_website_url: website.href, p_audience: body.audience?.trim() || null,
  })
  if (error) return NextResponse.json({ error: "Partner registration is unavailable. Apply the automatic-access database migration and retry." }, { status: 503 })
  if (data?.blocked) return NextResponse.json({ error: "Access to this account has been declined or revoked. Contact TCGPlaytest; submitting again cannot restore access." }, { status: 403 })
  if (!data?.partner) return NextResponse.json({ error: "Could not confirm your registration. Retry safely." }, { status: 500 })
  if (data.partner.status !== "approved" || data.partner.api_blocked_at || data.partner.access_revoked_at) {
    return NextResponse.json({ error: "Automatic activation could not be confirmed. Contact TCGPlaytest to check the registration setup." }, { status: 503 })
  }

  const email = data.partner.welcome_email_sent_at ? { sent: true, queued: false } : await deliverWelcomeEmail(data.partner.id)
  return NextResponse.json({ request: { id: data.partner.id, status: data.partner.status }, email }, { headers: { "Cache-Control": "private, no-store" } })
}
