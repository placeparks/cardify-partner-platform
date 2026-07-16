import { cookies } from "next/headers"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { createSign } from "crypto"

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
  created_at: string
  reviewed_at: string | null
}

const DEFAULT_ADMIN_EMAILS = [
  "mirachannan@gmail.com",
  "kainatkhankhosa@gmail.com",
  "placeparks@gmail.com",
]

export async function getSignedInUser() {
  const supabase = createRouteHandlerClient({ cookies })
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

export function makeWidgetSnippet(partnerKey: string, approvedPercentage: number | string | null = 2) {
  const origin = process.env.NEXT_PUBLIC_TCGPLAYTEST_WIDGET_ORIGIN || "https://testing123-prof.vercel.app"
  const partnerShareBps = Math.round(Number(approvedPercentage || 2) * 100)
  return `<script src="${origin}/partner-widget/widget.js" data-partner-key="${partnerKey}" data-product-name="Premium custom card printing" data-partner-share-bps="${partnerShareBps}" data-accent="#16a34a" async></script>`
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

async function getServiceAccountAccessToken(): Promise<TokenResult> {
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

async function getGmailAccessToken(): Promise<TokenResult> {
  const serviceAccountToken = await getServiceAccountAccessToken()
  if ("accessToken" in serviceAccountToken) return serviceAccountToken

  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) return { error: serviceAccountToken.error }

  const response = await fetch("https://oauth2.googleapis.com/token", {
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

export async function sendDecisionEmail(request: PartnershipRequest) {
  const token = await getGmailAccessToken()
  if ("error" in token) {
    return {
      sent: false,
      reason: `Could not get Gmail access token. ${token.error}`,
    }
  }

  const approved = request.status === "approved"
  const senderEmail = process.env.GMAIL_SENDER_EMAIL || "partners@cardify.club"
  const subject = approved ? "Your Cardify partnership is approved" : "Cardify partnership update"
  const text = approved
    ? `Hi ${request.full_name || request.business_name},\n\nYour Cardify partnership is approved at ${request.approved_percentage ?? request.proposed_percentage}%.\n\nNext step: sign in to your Cardify dashboard and complete Stripe Connect onboarding. Once Stripe confirms the connected account, your dashboard will show the widget code for your shop.\n\nCardify`
    : `Hi ${request.full_name || request.business_name},\n\nThanks for applying to become a Cardify partner. We are not able to approve this application right now.\n\n${request.admin_notes ? `Notes: ${request.admin_notes}\n\n` : ""}Cardify`

  const raw = [
    `From: "Cardify Partnerships" <${senderEmail}>`,
    `To: ${request.email}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    text,
  ].join("\r\n")

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
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
