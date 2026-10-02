import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { sendWidgetReadyEmail } from "@/lib/partnership"

// A durable claim prevents parallel signup requests/workers from sending together.
// A crash after provider acceptance can still result in a retry (at-least-once delivery).
export async function deliverWelcomeEmail(partnerId?: string) {
  const claim = await db.rpc("partner_claim_welcome_email", { p_partner: partnerId || null })
  if (claim.error) return { sent: false, queued: true }
  const partner = claim.data?.[0]
  if (!partner) return { sent: false, queued: false }
  const result = await sendWidgetReadyEmail(partner).catch(() => ({ sent: false }))
  const now = new Date()
  const saved = await db.from("partnership_requests").update({
    welcome_email_sent_at: result.sent ? now.toISOString() : null,
    welcome_email_next_attempt_at: result.sent ? null : new Date(now.getTime() + Math.min(3600, 30 * 2 ** Math.min(partner.welcome_email_attempts, 7)) * 1000).toISOString(),
    welcome_email_last_error: result.sent ? null : "Email could not be delivered. Check Gmail configuration in the partner app.",
    welcome_email_claim_until: null, welcome_email_claim_token: null,
  }).eq("id", partner.id).eq("welcome_email_claim_token", partner.welcome_email_claim_token)
  return { sent: Boolean(result.sent), queued: !result.sent || Boolean(saved.error) }
}
