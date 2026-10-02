import { NextResponse } from "next/server"
import { getSignedInUser } from "@/lib/partnership"
import { partnerWidgetCode } from "@/lib/widget-access"
import { supabaseAdmin } from "@/lib/supabase-admin"

export async function GET(request: Request) {
  const { user } = await getSignedInUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  const { data: partner, error } = await supabaseAdmin
    .from("partnership_requests")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!partner) return NextResponse.json({ partner: null })

  const [keys, carts, manufacturingOrders] = await Promise.all([
    supabaseAdmin.from("partner_api_keys").select("mode,key_prefix,created_at").eq("partner_id",partner.id).is("revoked_at",null),
    supabaseAdmin.from("partner_carts").select("id",{count:"exact",head:true}).eq("partner_id",partner.id),
    supabaseAdmin.from("partner_manufacturing_orders").select("id",{count:"exact",head:true}).eq("partner_id",partner.id),
  ])
  if (keys.error || carts.error || manufacturingOrders.error) return NextResponse.json({error:"Manufacturing API setup is incomplete. Apply the database migrations."},{status:503})

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
      widgetCode: partnerWidgetCode(partner, new URL(request.url).origin, process.env.TCGPLAYTEST_CHECKOUT_ORIGIN || "https://www.tcgplaytest.com"),
    },
    metrics,
    apiKeys: keys.data,
    apiMetrics: { carts: carts.count, orders: manufacturingOrders.count },
  })
}
