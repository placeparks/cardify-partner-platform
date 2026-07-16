import { NextResponse } from "next/server"
import { getSignedInUser } from "@/lib/partnership"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { isStripeAccountReady, stripeRequest } from "@/lib/stripe-connect"

export async function GET() {
  const { user } = await getSignedInUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  const { data: partner, error } = await supabaseAdmin
    .from("partnership_requests")
    .select("id, stripe_account_id, stripe_onboarding_complete")
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!partner?.stripe_account_id) {
    return NextResponse.json({ connected: false, onboardingComplete: false })
  }

  try {
    const account = await stripeRequest(`/accounts/${partner.stripe_account_id}`, undefined, "GET")
    const onboardingComplete = isStripeAccountReady(account)

    if (partner.stripe_onboarding_complete !== onboardingComplete) {
      await supabaseAdmin
        .from("partnership_requests")
        .update({
          stripe_onboarding_complete: onboardingComplete,
          updated_at: new Date().toISOString(),
        })
        .eq("id", partner.id)
    }

    return NextResponse.json({
      connected: Boolean(partner.stripe_account_id),
      onboardingComplete,
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
      detailsSubmitted: Boolean(account.details_submitted),
    })
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not check Stripe onboarding" },
      { status: 500 },
    )
  }
}
