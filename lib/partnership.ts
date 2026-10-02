import { cookies } from "next/headers"
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { createSign } from "crypto"
import { widgetSnippet } from "@/lib/widget-access"

export type PartnershipStatus = "pending" | "approved" | "declined"

export type PartnershipRequest = {
  id: string
  user_id: string
  email: string
  full_name: string | null
  business_name: string
  website_url: string
  audience: string | null
  proposed_percentage: number
  approved_percentage: number | null
  status: PartnershipStatus
  admin_notes: string | null
  widget_partner_key: string | null
  stripe_account_id: string | null
  stripe_onboarding_complete: boolean | null
  widget_email_sent_at: string | null
  created_at: string
  reviewed_at: string | null
  api_blocked_at?: string | null
}

const DEFAULT_ADMIN_EMAILS = [
  "mirachannan@gmail.com",
  "kainatkhankhosa@gmail.com",
  "placeparks@gmail.com",
]

export async function getSignedInUser() {
  const store = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => store.getAll(), setAll: (values: {name:string;value:string;options:CookieOptions}[]) => { values.forEach(({name,value,options}) => store.set(name,value,options)) } },
  })
  const { data: { user }, error } = await supabase.auth.getUser()
  return { supabase, user: error ? null : user }
}

export function getAdminEmails() {
  const configured = process.env.PARTNERSHIP_ADMIN_EMAILS
    ?.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)

  return configured?.length ? configured : DEFAULT_ADMIN_EMAILS
}

export async function isPartnershipAdmin(userId: string, email?: string | null) {
  const normalizedEmail = email?.toLowerCase() || ""
  if (getAdminEmails().includes(normalizedEmail)) return true

  const { data } = await supabaseAdmin
    .from("admins")
    .select("user_id, email")
    .or(`user_id.eq.${userId},email.eq.${normalizedEmail}`)
    .maybeSingle()

  return Boolean(data)
}

export function makePartnerKey() {
  return `partner_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`
}

export function makeWidgetSnippet() {
  const origin = process.env.NEXT_PUBLIC_TCGPLAYTEST_APP_URL || process.env.NEXT_PUBLIC_CARDIFY_APP_URL || "https://partners.tcgplaytest.com"
  return widgetSnippet(origin, process.env.TCGPLAYTEST_CHECKOUT_ORIGIN || "https://www.tcgplaytest.com")
}

function toBase64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url")
}

type TokenResult =
  | { accessToken: string }
  | { error: string }

type ServiceAccountJsonResult =
  | {
      serviceAccount: {
        client_email: string
        private_key: string
        token_uri?: string
      }
    }
  | { error: string }

function getServiceAccountJson(): ServiceAccountJsonResult {
  const raw = process.env.GMAIL_SERVICE_ACCOUNT_JSON
  if (!raw) return { error: "GMAIL_SERVICE_ACCOUNT_JSON is missing." }

  try {
    const normalized = raw.trim()
    const unwrapped = (normalized.startsWith("'") && normalized.endsWith("'"))
      || (normalized.startsWith('"') && normalized.endsWith('"'))
      ? normalized.slice(1, -1)
      : normalized
    const parsed = JSON.parse(unwrapped) as {
      client_email: string
      private_key: string
      token_uri?: string
    }
    if (!parsed.client_email) return { error: "GMAIL_SERVICE_ACCOUNT_JSON is missing client_email." }
    if (!parsed.private_key) return { error: "GMAIL_SERVICE_ACCOUNT_JSON is missing private_key." }

    return { serviceAccount: {
        ...parsed,
        private_key: parsed.private_key?.replace(/\\n/g, "\n"),
      } }
  } catch (caught) {
    return { error: `GMAIL_SERVICE_ACCOUNT_JSON is not valid JSON: ${caught instanceof Error ? caught.message : "parse failed"}` }
  }
}

async function getServiceAccountAccessToken(signal?: AbortSignal): Promise<TokenResult> {
  const parsed = getServiceAccountJson()
  if ("error" in parsed) return { error: parsed.error }

  const serviceAccount = parsed.serviceAccount

  const impersonatedEmail = process.env.GMAIL_IMPERSONATED_EMAIL
    || process.env.GMAIL_OAUTH_SUBJECT
    || process.env.GMAIL_SENDER_EMAIL

  if (!impersonatedEmail) {
    return { error: "GMAIL_IMPERSONATED_EMAIL or GMAIL_OAUTH_SUBJECT is missing." }
  }

  const now = Math.floor(Date.now() / 1000)
  const tokenUri = serviceAccount.token_uri || "https://oauth2.googleapis.com/token"
  const header = { alg: "RS256", typ: "JWT" }
  const claims = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/gmail.send",
    aud: tokenUri,
    exp: now + 3600,
    iat: now,
    sub: impersonatedEmail,
  }
  const unsigned = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(claims))}`
  const signature = createSign("RSA-SHA256").update(unsigned).sign(serviceAccount.private_key)
  const assertion = `${unsigned}.${toBase64Url(signature)}`

  const response = await fetch(tokenUri, {
    signal,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  })

  if (!response.ok) {
    const details = await response.text()
    return {
      error: `Google token endpoint returned ${response.status}${details ? `: ${details.slice(0, 400)}` : ""}`,
    }
  }

  const data = await response.json()
  if (!data.access_token) return { error: "Google token endpoint did not return access_token." }
  return { accessToken: data.access_token as string }
}

async function getGmailAccessToken(signal?: AbortSignal): Promise<TokenResult> {
  const serviceAccountToken = await getServiceAccountAccessToken(signal)
  if ("accessToken" in serviceAccountToken) return serviceAccountToken

  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) return { error: serviceAccountToken.error }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    signal,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  })

  if (!response.ok) {
    const details = await response.text()
    return {
      error: `OAuth refresh token failed after service account failed (${serviceAccountToken.error}). Google returned ${response.status}${details ? `: ${details.slice(0, 400)}` : ""}`,
    }
  }

  const data = await response.json()
  if (!data.access_token) return { error: "OAuth refresh token response did not include access_token." }
  return { accessToken: data.access_token as string }
}

async function sendGmailMessage(input: { to: string; subject: string; text: string }) {
  const signal = AbortSignal.timeout(12000)
  const token = await getGmailAccessToken(signal)
  if ("error" in token) {
    return {
      sent: false,
      reason: `Could not get Gmail access token. ${token.error}`,
    }
  }

  const senderEmail = process.env.GMAIL_SENDER_EMAIL || "partners@tcgplaytest.com"
  const raw = [
    `From: "TCGPlaytest Partnerships" <${senderEmail}>`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    input.text,
  ].join("\r\n")

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    signal,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }),
  })

  if (response.ok) return { sent: true }

  const details = await response.text()
  return {
    sent: false,
    reason: `Gmail returned ${response.status}${details ? `: ${details.slice(0, 300)}` : ""}`,
  }
}

export async function sendDecisionEmail(request: PartnershipRequest) {
  const approved = request.status === "approved"
  const subject = approved ? "Your TCGPlaytest partnership is approved" : "TCGPlaytest partnership update"
  const text = approved
    ? `Hi ${request.full_name || request.business_name},\n\nYour TCGPlaytest partnership is approved.\n\nSign in to your TCGPlaytest dashboard to copy your widget code, accept the manufacturing API terms, and create your test and live REST API keys. Connect the widget to your server using the integration guide. No Stripe Connect account is required.\n\nTCGPlaytest`
    : `Hi ${request.full_name || request.business_name},\n\nThanks for applying to become a TCGPlaytest partner. We are not able to approve this application right now.\n\n${request.admin_notes ? `Notes: ${request.admin_notes}\n\n` : ""}TCGPlaytest`

  return sendGmailMessage({ to: request.email, subject, text })
}

export async function sendWidgetReadyEmail(request: PartnershipRequest) {
  if (request.status !== "approved" || request.api_blocked_at) {
    return { sent: false, reason: "Partner access is unavailable." }
  }

  const widgetCode = makeWidgetSnippet()
  const dashboardUrl = (process.env.NEXT_PUBLIC_TCGPLAYTEST_APP_URL || process.env.NEXT_PUBLIC_CARDIFY_APP_URL || process.env.CARDIFY_APP_URL || "https://partners.tcgplaytest.com").replace(/\/$/, "")
  const subject = "Your TCGPlaytest widget and API access are ready"
  const text = `Hi ${request.full_name || request.business_name},\n\nYour application is complete and your partner access is active immediately. No manual approval or Stripe Connect account is required.\n\nYOUR WIDGET\n${widgetCode}\n\nConnect the widget to POST /api/tcgplaytest/cart on your own server using this guide:\n${dashboardUrl}/docs#widget\n\nYOUR REST API\nBase URL: ${dashboardUrl}\nPOST /v1/carts - create a certified cart and checkout link\nGET /v1/carts/{id} - cart status\nGET /v1/orders/{id} - manufacturing and shipment status\n\nSign in to accept the manufacturing terms and generate your test and live secret API keys:\n${dashboardUrl}/dashboard\nKeys are displayed once in your dashboard. Store them on your server, never in the widget or browser.\n\nYou supply every front and back and certify content origin, reproduction rights, and manufacturing-only instructions on every order. TCGPlaytest temporarily processes those client-supplied files for printing and fulfillment. Automatic account access does not verify artwork rights. Access can be revoked for suspicious activity or infringement.\n\nTCGPlaytest`

  return sendGmailMessage({ to: request.email, subject, text })
}
