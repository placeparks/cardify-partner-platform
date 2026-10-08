import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { getSignedInUser, isPartnershipAdmin } from "@/lib/partnership"
import { ApiError, hasPartnerTerms } from "@/lib/manufacturing-contract"

export const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
export const secret = (prefix: string) => `${prefix}${randomBytes(32).toString("hex")}`
export const checked = <T,>(result: { data: T; error: any }): T => { if (result.error) throw new Error("Database operation failed"); return result.data }
export async function api(work: () => Promise<Response>) {
  try { return await work() } catch (error) {
    if (error instanceof ApiError) return NextResponse.json({ error: { code: error.code, message: error.message, ...(error.item_index !== undefined ? { item_index: error.item_index } : {}) } }, { status: error.status, headers: { "Cache-Control": "no-store", ...(error.status === 429 ? { "Retry-After": "60" } : {}) } })
    console.error("Partner API failure:", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ error: { code: "server_error", message: "The request could not be completed. Retry safely with the same idempotency key." } }, { status: 500 })
  }
}
export async function json(request: Request) {
  // Stream limit also covers chunked bodies; Content-Length is not trusted.
  const reader = request.body?.getReader()
  if (!reader) throw new ApiError(400, "invalid_request", "JSON body required")
  const chunks: Uint8Array[] = []; let size = 0
  while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 512_000) { await reader.cancel(); throw new ApiError(413, "invalid_request", "Request is too large") }; chunks.push(part.value) }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) } catch { throw new ApiError(400, "invalid_request", "Malformed JSON") }
}
export async function partnerSession() {
  const { user } = await getSignedInUser()
  if (!user) throw new ApiError(401, "authentication_required", "Sign in first")
  const partner = checked(await db.from("partnership_requests").select("*").eq("user_id", user.id).maybeSingle())
  if (!partner || partner.status !== "approved" || partner.api_blocked_at) throw new ApiError(403, "partner_unavailable", "An active, approved partnership is required")
  return { user, partner }
}
export async function adminSession() {
  const { user } = await getSignedInUser()
  if (!user || !await isPartnershipAdmin(user.id, user.email)) throw new ApiError(403, "admin_required", "Administrator access required")
  return user
}
export function internalAuth(request: Request) {
  const configured = process.env.PARTNER_INTERNAL_SECRET
  const provided = request.headers.get("authorization")?.replace(/^Bearer /, "") || ""
  if (!configured || configured.length < 32 || !timingSafeEqual(Buffer.from(digest(provided)), Buffer.from(digest(configured)))) throw new ApiError(401, "authentication_required", "Invalid internal credential")
}
export function cronAuth(request: Request) {
  const configured = process.env.CRON_SECRET
  const provided = request.headers.get("authorization")?.replace(/^Bearer /, "") || ""
  if (!configured || configured.length < 32 || !timingSafeEqual(Buffer.from(digest(provided)), Buffer.from(digest(configured)))) throw new ApiError(401, "authentication_required", "Invalid worker credential")
}
export async function authenticate(request: Request, options: { polling?: boolean } = {}) {
  const key = request.headers.get("authorization")?.match(/^Bearer (tcgp_(test|live)_[a-f0-9]{64})$/)?.[1]
  if (!key) throw new ApiError(401, "invalid_api_key", "A server-side bearer API key is required")
  const record = checked(await db.from("partner_api_keys").select("*, partner:partnership_requests(*)").eq("key_hash", digest(key)).is("revoked_at", null).maybeSingle())
  if (!record || record.partner.status !== "approved" || record.partner.api_blocked_at) throw new ApiError(401, "invalid_api_key", "API key is unavailable")
  if (!hasPartnerTerms(record.partner)) throw new ApiError(403, "terms_required", "Accept the current partner terms in the dashboard. Your existing API key can still be used after acceptance.")
  if (!options.polling) {
    const allowed = checked(await db.rpc("partner_rate_limit", { p_key: record.id, p_limit: Number(process.env.PARTNER_RATE_LIMIT || 60) }))
    if (!allowed) throw new ApiError(429, "rate_limited", "Too many requests")
  }
  return record
}
export function publicCart(cart: any) {
  const status = ["validating", "open"].includes(cart.status) && Date.parse(cart.expires_at) <= Date.now() ? "expired" : cart.status
  return { id: cart.id, status,
    external_ref: cart.external_ref, card_count: cart.card_count, card_stock: cart.card_stock, affiliate_code: cart.affiliate_code,
    progress: { done: cart.validation_done || 0, total: cart.validation_total || 0 }, errors: cart.validation_errors || [], warnings: cart.artwork_warnings || [],
    partner_terms_version: cart.partner_terms_version || null,
    mode: cart.mode, ...(status === "open" ? { checkout_url: cart.checkout_url } : {}), order_id: cart.order_id, expires_at: cart.expires_at, created_at: cart.created_at }
}
