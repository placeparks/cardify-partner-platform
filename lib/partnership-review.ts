import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { makePartnerKey, sendDecisionEmail } from "@/lib/partnership"
import { ApiError } from "@/lib/manufacturing-contract"

export const reviewFields = "id,email,full_name,business_name,website_url,audience,proposed_percentage,approved_percentage,status,admin_notes,reviewed_by,reviewed_at,created_at,updated_at,api_blocked_at"
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

export async function listPartnershipRequests(status: string, page: number) {
  if (!["all", "pending", "approved", "declined"].includes(status) || !Number.isInteger(page) || page < 1 || page > 10000) {
    throw new ApiError(400, "invalid_request", "Choose a valid status and page.")
  }
  const pageSize = 25
  let query = db.from("partnership_requests").select(reviewFields, { count: "exact" })
  if (status !== "all") query = query.eq("status", status)
  const { data, count, error } = await query.order("created_at", { ascending: false }).order("id").range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw new ApiError(500, "database_error", "Could not load partnership requests.")
  return { requests: data || [], total: count || 0, page, pageSize }
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
  if (body.status === "approved") {
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
    approved_percentage: percentage,
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
