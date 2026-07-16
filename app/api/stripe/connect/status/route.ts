import { NextResponse } from "next/server"
import { getSignedInUser, sendWidgetReadyEmail } from "@/lib/partnership"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { isStripeAccountReady, stripeRequest } from "@/lib/stripe-connect"

export async function GET() {
  const { user } = await getSignedInUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  const { data: partner, error } = await supabaseAdmin
    .from("partnership_requests")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!partner?.stripe_account_id) {
    return NextResponse.json({ connected: false, onboardingComplete: false })
  }

  try {
    const account = await stripeRequest(`/accounts/${partner.stripe_account_id}`, undefined, "GET")
    const onboardingComplete = isStripeAccountReady(account)
    let widgetEmail = null as null | { sent: boolean; reason?: string }

    if (partner.stripe_onboarding_complete !== onboardingComplete) {
      await supabaseAdmin
        .from("partnership_requests")
        .update({
          stripe_onboarding_complete: onboardingComplete,
          updated_at: new Date().toISOString(),
        })
        .eq("id", partner.id)
    }

    if (onboardingComplete && !partner.widget_email_sent_at) {
      widgetEmail = await sendWidgetReadyEmail({ ...partner, stripe_onboarding_complete: onboardingComplete })
        .catch((caught) => ({
          sent: false,
          reason: caught instanceof Error ? caught.message : "Widget email crashed before returning a response.",
        }))

      if (widgetEmail.sent) {
        await supabaseAdmin
          .from("partnership_requests")
          .update({
            widget_email_sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", partner.id)
      }
    }

    return NextResponse.json({
      connected: Boolean(partner.stripe_account_id),
      onboardingComplete,
      widgetEmail,
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
