import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { makePartnerKey, sendDecisionEmail, sendRejectionEmail } from "@/lib/partnership"
import { ApiError } from "@/lib/manufacturing-contract"
import { PARTNER_REVENUE_SHARING_ENABLED } from "@/lib/partner-features"

export const reviewFields = "id,email,full_name,business_name,website_url,audience,proposed_percentage,approved_percentage,status,admin_notes,reviewed_by,reviewed_at,created_at,updated_at,api_blocked_at,api_block_reason,auto_approved_at,access_revoked_at,access_revoked_by,welcome_email_sent_at,welcome_email_next_attempt_at,welcome_email_attempts,welcome_email_last_error"
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

async function countPartnerOrders(partnerId?: string):a Promise<number | null> {
  // Both integrations create manufacturing orders only after payment. Count
  // records, not carts/cards/events, including orders later cancelled or held.
  // Head/count avoids Supabase's row limit and never loads customer or artwork data.
  try {
    let query = db.from("partner_manufacturing_orders").select("id", { count: "exact", head: true }).eq("mode", "live")
    if (partnerId) query = query.eq("partner_id", partnerId)
    const { count, error } = await query
    return error || count === null ? null : count
  } catch { return null }
}

export async function listPartnershipRequests(status: string, page: number) {
  if (!["all", "pending", "approved", "declined", "revoked", "rejected"].includes(status) || !Number.isInteger(page) || page < 1 || page > 10000) {
    throw new ApiError(400, "invalid_request", "Choose a valid status and page.")
  }
  const pageSize = 25
  let query = db.from("partnership_requests").select(reviewFields, { count: "exact" })
  if (status === "rejected") query = query.or("status.eq.declined,api_blocked_at.not.is.null")
  else if (status === "revoked") query = query.not("api_blocked_at", "is", null)
  else if (status !== "all") query = query.eq("status", status).is("api_blocked_at", null)
  const { data, count, error } = await query.order("created_at", { ascending: false }).order("id").range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw new ApiError(500, "database_error", "Could not load partnership requests.")
  const requests = data || []
  const [totalOrders, ...partnerCounts] = await Promise.all([
    countPartnerOrders(), ...requests.map(request => countPartnerOrders(request.id)),
  ])
  const rejectionEmails = await Promise.all(requests.map(async request => {
    if (!request.api_blocked_at) return null
    try {
      const { data, error } = await db.from("partner_audit_events").select("created_at,details")
        .eq("partner_id", request.id).eq("action", "rejection_email")
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle()
      return error ? { status: "unknown" } : data ? { ...data.details, attemptedAt: data.created_at } : { status: "not_recorded" }
    } catch { return { status: "unknown" } }
  }))
  return {
    requests: requests.map((request, index) => ({ ...request, order_count: partnerCounts[index], rejection_email: rejectionEmails[index] })),
    total: count || 0, page, pageSize, totalOrders,
    orderCountsUnavailable: totalOrders === null || partnerCounts.some(value => value === null),
  }
}

export async function revokePartnership(id: string, body: any, reviewer: string) {
  if (!uuid.test(id) || typeof body?.reason !== "string" || body.reason.trim().length < 3 || body.reason.length > 2000 ||
      typeof body.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) {
    throw new ApiError(400, "invalid_request", "Enter a revocation reason and refresh the partner before saving.")
  }
  const { data, error } = await db.rpc("partner_revoke_access", { p_partner: id, p_revision: body.expectedUpdatedAt, p_reason: body.reason.trim(), p_actor: reviewer })
  if (error) throw new ApiError(503, "revoke_unavailable", "Could not revoke access. Check the automatic-access database migration and retry.")
  if (data?.missing) throw new ApiError(404, "not_found", "Partner not found.")
  if (data?.conflict) throw new ApiError(409, "review_conflict", "This partner has changed. Refresh before revoking access.")
  if (!data?.partner) throw new ApiError(500, "database_error", "Could not confirm access revocation. Refresh before retrying.")
  // Never send a second email for a retry of an already-applied decision.
  if (data.already_revoked) return { request: data.partner, email: { skipped: true }, revoked: true }
  const result = await sendRejectionEmail(data.partner, body.reason.trim())
    .catch(() => ({ sent: false }))
  const email = { sent: result.sent, reason: result.sent ? null : "Partner rejected, but email could not be sent. Check Gmail configuration on the partner app.", recorded: false }
  // Delivery outcome uses the existing audit log; no schema migration required.
  try {
    const logged = await db.from("partner_audit_events").insert({ partner_id: id, entity_type: "partnership", entity_id: id,
      action: "rejection_email", actor: reviewer, details: { status: result.sent ? "sent" : "failed", reason: email.reason } })
    email.recorded = !logged.error
  } catch { /* Access must remain blocked even if email/audit storage is unavailable. */ }
  return { request: data.partner, email, revoked: true }
}

export async function reviewPartnership(id: string, body: any, reviewerEmail: string, pendingOnly = false) {
  if (!uuid.test(id) || !body || !["approved", "declined"].includes(body.status)) {
    throw new ApiError(400, "invalid_request", "Choose an application and an approval or decline decision.")
  }
  if (body.adminNotes != null && (typeof body.adminNotes !== "string" || body.adminNotes.length > 2000)) {
    throw new ApiError(400, "invalid_request", "Review notes must be at most 2,000 characters.")
  }
  const { data: current, error: lookupError } = await db.from("partnership_requests").select("*").eq("id", id).maybeSingle()
  if (lookupError) throw new ApiError(500, "database_error", "Could not load this application.")
  if (!current) throw new ApiError(404, "not_found", "Application not found.")
  if ((pendingOnly && current.status !== "pending") || (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== current.updated_at)) {
    throw new ApiError(409, "review_conflict", "This application has changed. Refresh before reviewing it.")
  }
  if (body.status === "approved" && current.api_blocked_at) {
    throw new ApiError(409, "partner_blocked", "This partner is blocked. Resolve the enforcement hold before approval.")
  }
  let percentage: number | null = null
  if (PARTNER_REVENUE_SHARING_ENABLED && body.status === "approved") {
    const value = body.approvedPercentage ?? current.proposed_percentage
    if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") {
      throw new ApiError(400, "invalid_percentage", "Enter a percentage between 0 and 30.")
    }
    percentage = Number(value)
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 30 || Math.abs(percentage * 100 - Math.round(percentage * 100)) > 0.000001) {
      throw new ApiError(400, "invalid_percentage", "Enter a percentage between 0 and 30 with at most two decimal places.")
    }
  }
  const now = new Date().toISOString()
  const { data, error } = await db.from("partnership_requests").update({
    status: body.status,
    // Do not overwrite historical percentages while revenue sharing is paused.
    ...(PARTNER_REVENUE_SHARING_ENABLED ? { approved_percentage: percentage } : {}),
    admin_notes: body.adminNotes?.trim() || null,
    reviewed_at: now,
    reviewed_by: reviewerEmail,
    widget_partner_key: body.status === "approved" ? (current.widget_partner_key || makePartnerKey()) : current.widget_partner_key,
    updated_at: now,
  }).eq("id", id).eq("updated_at", current.updated_at).select().maybeSingle()
  if (error) throw new ApiError(500, "database_error", "Could not save this decision.")
  if (!data) throw new ApiError(409, "review_conflict", "Another reviewer changed this application. Refresh before trying again.")
  const email = await sendDecisionEmail(data).catch(() => ({ sent: false, reason: "Decision saved, but the email service could not be reached." }))
  return { request: data, email }
}
