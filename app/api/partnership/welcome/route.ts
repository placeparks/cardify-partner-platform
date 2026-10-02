import { NextResponse } from "next/server"
import { getSignedInUser } from "@/lib/partnership"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { deliverWelcomeEmail } from "@/lib/partner-welcome"

export const maxDuration = 30

// Also deliver queued welcomes for applications activated by the upgrade migration.
// The database claim enforces the retry delay and prevents concurrent sends.
export async function POST() {
  const { user } = await getSignedInUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const { data: partner, error } = await supabaseAdmin.from("partnership_requests")
    .select("id,status,api_blocked_at,access_revoked_at,welcome_email_sent_at")
    .eq("user_id", user.id).maybeSingle()
  if (error) return NextResponse.json({ error: "Email status unavailable" }, { status: 503 })
  if (!partner || partner.status !== "approved" || partner.api_blocked_at || partner.access_revoked_at) {
    return NextResponse.json({ error: "Active partner access required" }, { status: 403 })
  }
  const email = partner.welcome_email_sent_at ? { sent: true, queued: false } : await deliverWelcomeEmail(partner.id)
  return NextResponse.json({ email }, { headers: { "Cache-Control": "private, no-store" } })
}
