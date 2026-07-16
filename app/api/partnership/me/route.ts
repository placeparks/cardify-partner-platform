import { NextResponse } from "next/server"
import { getSignedInUser, makeWidgetSnippet } from "@/lib/partnership"
import { supabaseAdmin } from "@/lib/supabase-admin"

export async function GET() {
  const { user } = await getSignedInUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  const { data: partner, error } = await supabaseAdmin
    .from("partnership_requests")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!partner) return NextResponse.json({ partner: null })

  const { data: orders } = await supabaseAdmin
    .from("partner_affiliate_orders")
    .select("retail_total_cents, partner_share_cents")
    .eq("partner_request_id", partner.id)

  const metrics = (orders || []).reduce((acc, order: any) => ({
    orders: acc.orders + 1,
    revenueCents: acc.revenueCents + Number(order.retail_total_cents || 0),
    partnerShareCents: acc.partnerShareCents + Number(order.partner_share_cents || 0),
  }), { orders: 0, revenueCents: 0, partnerShareCents: 0 })

  return NextResponse.json({
    partner: {
      ...partner,
      widgetCode: partner.widget_partner_key ? makeWidgetSnippet(partner.widget_partner_key) : null,
    },
    metrics,
  })
}
