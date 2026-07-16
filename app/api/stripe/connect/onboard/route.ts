import { NextResponse } from "next/server"
import { getSignedInUser } from "@/lib/partnership"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { cardifyAppOrigin, stripeRequest } from "@/lib/stripe-connect"

export async function POST() {
  const { user } = await getSignedInUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  const { data: partner, error } = await supabaseAdmin
    .from("partnership_requests")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!partner || partner.status !== "approved") {
    return NextResponse.json({ error: "Your partnership must be approved before onboarding." }, { status: 403 })
  }

  try {
    let accountId = partner.stripe_account_id as string | null

    if (!accountId) {
      const account = await stripeRequest("/accounts", new URLSearchParams({
        type: "express",
        country: "US",
        email: partner.email,
        "capabilities[transfers][requested]": "true",
        "business_profile[url]": partner.website_url,
        "metadata[partner_request_id]": partner.id,
        "metadata[partner_key]": partner.widget_partner_key || "",
      }))

      accountId = account.id
      if (!accountId) throw new Error("Stripe did not return an account id")

      await supabaseAdmin
        .from("partnership_requests")
        .update({
          stripe_account_id: accountId,
          stripe_onboarding_complete: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", partner.id)
    }

    const origin = cardifyAppOrigin()
    const link = await stripeRequest("/account_links", new URLSearchParams({
      account: accountId,
      refresh_url: `${origin}/dashboard?connect=refresh`,
      return_url: `${origin}/dashboard?connect=return`,
      type: "account_onboarding",
    }))

    return NextResponse.json({ url: link.url })
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not start Stripe onboarding" },
      { status: 500 },
    )
  }
}
