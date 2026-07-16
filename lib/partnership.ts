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

export function makeWidgetSnippet(partnerKey: string) {
  const origin = process.env.NEXT_PUBLIC_TCGPLAYTEST_WIDGET_ORIGIN || "https://tcgplaytest.com"
  return `<script src="${origin}/partner-widget/widget.js" data-partner-key="${partnerKey}" data-product-name="Premium custom card printing" data-price-cents="2500" data-accent="#16a34a" async></script>`
}

function toBase64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url")
}

function getServiceAccountJson() {
  const raw = process.env.GMAIL_SERVICE_ACCOUNT_JSON
  if (!raw) return null

  try {
    return JSON.parse(raw.replace(/\\n/g, "\n")) as {
      client_email: string
      private_key: string
      token_uri?: string
    }
  } catch {
    return null
  }
}

async function getServiceAccountAccessToken() {
  const serviceAccount = getServiceAccountJson()
  if (!serviceAccount?.client_email || !serviceAccount.private_key) return null

  const impersonatedEmail = process.env.GMAIL_IMPERSONATED_EMAIL
    || process.env.GMAIL_OAUTH_SUBJECT
    || process.env.GMAIL_SENDER_EMAIL

  if (!impersonatedEmail) return null

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

  if (!response.ok) return null
  const data = await response.json()
  return data.access_token as string | undefined
}

async function getGmailAccessToken() {
  const serviceAccountToken = await getServiceAccountAccessToken()
  if (serviceAccountToken) return serviceAccountToken

  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) return null

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

  if (!response.ok) return null
  const data = await response.json()
  return data.access_token as string | undefined
}

export async function sendDecisionEmail(request: PartnershipRequest) {
  const accessToken = await getGmailAccessToken()
  if (!accessToken) {
    return {
      sent: false,
      reason: "Could not get Gmail access token. Check GMAIL_SERVICE_ACCOUNT_JSON, GMAIL_IMPERSONATED_EMAIL, Gmail API, and domain-wide delegation.",
    }
  }

  const approved = request.status === "approved"
  const senderEmail = process.env.GMAIL_SENDER_EMAIL || "partners@cardify.club"
  const widgetCode = request.widget_partner_key ? makeWidgetSnippet(request.widget_partner_key) : ""
  const subject = approved ? "Your Cardify partnership is approved" : "Cardify partnership update"
  const text = approved
    ? `Hi ${request.full_name || request.business_name},\n\nYour Cardify partnership is approved at ${request.approved_percentage ?? request.proposed_percentage}%.\n\nAdd this widget code to your shop:\n\n${widgetCode}\n\nYou can also sign in to your dashboard to track orders and earnings.\n\nCardify`
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
      Authorization: `Bearer ${accessToken}`,
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
