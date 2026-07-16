const STRIPE_API = "https://api.stripe.com/v1"

function stripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY || ""
}

function stripeAuthHeader() {
  return `Basic ${Buffer.from(`${stripeSecretKey()}:`).toString("base64")}`
}

export function cardifyAppOrigin() {
  return (process.env.NEXT_PUBLIC_CARDIFY_APP_URL || process.env.CARDIFY_APP_URL || "http://localhost:3000").replace(/\/$/, "")
}

export async function stripeRequest(path: string, body?: URLSearchParams, method = "POST") {
  if (!stripeSecretKey()) throw new Error("STRIPE_SECRET_KEY is not configured")

  const response = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: stripeAuthHeader(),
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
    cache: "no-store",
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error?.message || `Stripe returned ${response.status}`)
  }

  return data
}

export function isStripeAccountReady(account: any) {
  return Boolean(
    account?.details_submitted
    && account?.charges_enabled
    && account?.payouts_enabled,
  )
}
