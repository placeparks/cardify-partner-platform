import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { api, checked, digest, json, publicCart, secret } from "@/lib/partner-api"
import { ApiError, DEFAULT_CARD_BACK_PATH, hasPartnerTerms, validateCart } from "@/lib/manufacturing-contract"
import { scheduleCartValidation } from "@/lib/validation-dispatch"

const BUCKET = "partner-artwork"
const MAX_BYTES = 20 * 1024 * 1024
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const unavailable = () => new ApiError(403, "widget_unavailable", "This widget is unavailable. Check the partner's status, accepted terms and allowed website origins.")

export function widgetOrigins(partner: any): string[] {
  const values = [partner.website_url, ...(partner.widget_allowed_origins || [])]
  return [...new Set(values.flatMap(value => {
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? [url.origin] : [] } catch { return [] }
  }))]
}
function requestOrigin(request: Request) {
  const value = request.headers.get("origin") || ""
  try { const url = new URL(value); if (url.protocol === "https:" && url.origin === value) return value } catch { /* Reject missing/null/malformed origins. */ }
  throw new ApiError(403, "origin_not_allowed", "Open the widget on a registered HTTPS website.")
}
function active(partner: any) {
  if (!partner || partner.status !== "approved" || partner.api_blocked_at || partner.access_revoked_at || !hasPartnerTerms(partner)) throw unavailable()
}
function limit(name: string, fallback: number, maximum: number) {
  const value = Number(process.env[name] || fallback)
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new ApiError(503, "configuration_error", `${name} is invalid`)
  return value
}
function sourceMac(id: string) {
  const key = process.env.PARTNER_INTERNAL_SECRET || ""
  if (key.length < 32) throw new ApiError(503, "widget_unavailable", "Widget upload signing is not configured")
  return createHmac("sha256", key).update(`widget-source:${id}`).digest("hex")
}
function sourceUrl(request: Request, id: string) {
  return `${new URL(request.url).origin}/api/widget/source?id=${id}&token=${sourceMac(id)}`
}
function cors(response: Response, origin: string) {
  response.headers.set("Access-Control-Allow-Origin", origin)
  response.headers.set("Vary", "Origin")
  response.headers.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
  response.headers.set("Access-Control-Expose-Headers", "Retry-After")
  response.headers.set("Cache-Control", "no-store")
  return response
}
// Preflight carries no credentials and returns no data. Every actual request
// checks the saved partner origin and, except session creation, an opaque token.
export async function widgetOptions(request: Request) {
  return api(async () => cors(new Response(null, { status: 204 }), requestOrigin(request)))
}
export async function widgetApi(request: Request, work: () => Promise<Response>) {
  return api(async () => {
    const origin = requestOrigin(request)
    // Errors are readable in the caller's browser; no partner/customer data is
    // returned before authorization. CORS is not used as authentication.
    return cors(await api(work), origin)
  })
}
export async function widgetSession(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (wses_[a-f0-9]{64})$/)?.[1]
  if (!token) throw new ApiError(401, "widget_session_required", "Start a new widget checkout.")
  const session = checked(await db.from("partner_widget_sessions").select("*, partner:partnership_requests(*)").eq("token_hash", digest(token)).maybeSingle())
  if (!session || Date.parse(session.expires_at) <= Date.now()) throw new ApiError(401, "widget_session_expired", "Your widget session expired. Start a new checkout.")
  active(session.partner)
  if (session.origin !== requestOrigin(request) || !widgetOrigins(session.partner).includes(session.origin)) throw unavailable()
  return session
}
function rpcResult(result: any) {
  if (result?.error === "quota") throw new ApiError(429, "widget_limit", "Widget capacity reached. Please try again later or contact the partner.")
  if (result?.error === "unavailable") throw unavailable()
  if (result?.error === "conflict") throw new ApiError(409, "idempotency_conflict", "This session already contains different cards. Start a new checkout.")
  if (result?.error === "upload") throw new ApiError(403, "invalid_upload", "Use files uploaded in this widget session.")
  return result
}
export async function startWidgetSession(request: Request) {
  const input = await json(request)
  if (!input || Object.keys(input).some(k => !["partner_key", "mode"].includes(k)) || typeof input.partner_key !== "string" || !/^partner_[a-f0-9]{24,32}$/.test(input.partner_key) || !["test", "live"].includes(input.mode)) throw new ApiError(400, "invalid_request", "Supply your public partner_key and test/live mode.")
  const partner = checked(await db.from("partnership_requests").select("*").eq("widget_partner_key", input.partner_key).maybeSingle())
  active(partner)
  const origin = requestOrigin(request)
  if (!widgetOrigins(partner).includes(origin)) throw new ApiError(403, "origin_not_allowed", "Add this website's HTTPS origin to Widget websites in the partner dashboard.")
  if (input.mode === "live" && (process.env.PARTNER_LIVE_ENABLED !== "true" || !(Number(process.env.PARTNER_MIN_IMAGE_WIDTH) > 0) || !(Number(process.env.PARTNER_MIN_IMAGE_HEIGHT) > 0))) throw new ApiError(503, "live_not_enabled", "Live checkout is not configured on this deployment.")
  sourceMac("configuration-check")
  const token = secret("wses_")
  const result = rpcResult(checked(await db.rpc("partner_widget_start", { p_partner: partner.id, p_hash: digest(token), p_origin: origin, p_mode: input.mode,
    p_limit: limit("WIDGET_SESSIONS_PER_HOUR", 60, 1000) })))
  return Response.json({ token, expires_at: result.expires_at, mode: input.mode, max_cards: Number(process.env.PARTNER_MAX_CARDS || 1000), max_image_bytes: MAX_BYTES }, { status: 201 })
}
export async function widgetUpload(request: Request) {
  const session = await widgetSession(request), input = await json(request)
  if (!input || Object.keys(input).some(k => !["content_type", "size", "request_id"].includes(k)) || !uuid.test(input.request_id || "") || !["image/png", "image/jpeg"].includes(input.content_type) || !Number.isSafeInteger(input.size) || input.size < 1 || input.size > MAX_BYTES) throw new ApiError(400, "invalid_request", "Supply request_id, PNG/JPEG content_type and a file size up to 20 MiB.")
  const bucket = checked(await db.storage.getBucket(BUCKET))
  const mimeTypes = bucket?.allowed_mime_types
  if (!bucket || bucket.public || Number(bucket.file_size_limit) !== MAX_BYTES || !Array.isArray(mimeTypes) || mimeTypes.length !== 2 || !["image/png", "image/jpeg"].every(m => mimeTypes.includes(m))) throw new ApiError(503, "uploads_unavailable", "Configure the private partner-artwork bucket for PNG/JPEG, maximum 20 MiB.")
  const id = randomUUID(), path = `widget-uploads/${session.id}/${id}.${input.content_type === "image/png" ? "png" : "jpg"}`
  const upload = rpcResult(checked(await db.rpc("partner_widget_reserve_upload", { p_session: session.id, p_request: input.request_id, p_id: id, p_path: path, p_type: input.content_type, p_size: input.size,
    p_session_limit: limit("WIDGET_UPLOADS_PER_SESSION", 100, 2000), p_daily_limit: limit("WIDGET_UPLOADS_PER_PARTNER_DAY", 500, 10000) })))
  // Supabase tokens are fixed to one new object, cannot overwrite it, and last
  // two hours. Reserve a full 20 MiB slot even if the client declares less.
  const signed = checked(await db.storage.from(BUCKET).createSignedUploadUrl(upload.path, { upsert: false }))
  if (!signed?.signedUrl) throw new ApiError(503, "uploads_unavailable", "Storage could not issue an upload link")
  return Response.json({ id: upload.id, upload_url: signed.signedUrl, method: "PUT", headers: { "Content-Type": upload.content_type }, max_bytes: MAX_BYTES,
    upload_expires_at: new Date(Date.now() + 7200000).toISOString() }, { status: 201 })
}
export async function widgetCart(request: Request) {
  const session = await widgetSession(request), input = await json(request)
  if (!input || Object.keys(input).some(k => !["items", "external_ref"].includes(k)) || !Array.isArray(input.items) || !input.items.length || input.items.length > Number(process.env.PARTNER_MAX_CARDS || 1000)) throw new ApiError(400, "invalid_request", "Send items with front_upload_id and quantity. Include back_upload_id only for a custom or double-sided back.")
  for (const item of input.items) if (!item || Object.keys(item).some(k => !["front_upload_id", "back_upload_id", "quantity"].includes(k)) || !uuid.test(item.front_upload_id || "") || (item.back_upload_id != null && !uuid.test(item.back_upload_id))) throw new ApiError(400, "invalid_request", "Use front/back upload IDs from this session. Omit the back to use the TCGPlaytest back.")
  const ids = [...new Set<string>(input.items.flatMap((item: any) => [item.front_upload_id, item.back_upload_id].filter(Boolean)))]
  const uploads = checked(await db.from("partner_widget_uploads").select("id").eq("session_id", session.id).in("id", ids)) || []
  if (uploads.length !== ids.length) throw new ApiError(403, "invalid_upload", "Use files uploaded in this widget session.")
  const body = validateCart({ items: input.items.map((item: any) => ({ image_url: sourceUrl(request, item.front_upload_id), ...(item.back_upload_id ? { back_image_url: sourceUrl(request, item.back_upload_id) } : {}), quantity: item.quantity })), ...(input.external_ref !== undefined ? { external_ref: input.external_ref } : {}) }, Number(process.env.PARTNER_MAX_CARDS || 1000), new URL(DEFAULT_CARD_BACK_PATH, request.url).href)
  const origin = session.mode === "test" ? new URL(request.url).origin : process.env.TCGPLAYTEST_CHECKOUT_ORIGIN
  if (!origin) throw new ApiError(503, "checkout_unavailable", "Checkout is not configured.")
  const hours = limit("PARTNER_CART_EXPIRY_HOURS", 168, 168), retention = Number(process.env.PARTNER_ARTWORK_RETENTION_DAYS || 30)
  if (!Number.isInteger(retention) || retention < 0 || retention > 365) throw new ApiError(503, "configuration_error", "Invalid retention period")
  const token = secret("")
  const cart = { id: secret("cart_"), partner_id: session.partner_id, api_key_id: null, widget_session_id: session.id, mode: session.mode, status: "validating",
    external_ref: body.external_ref, card_count: body.card_count, card_stock: body.card_stock, affiliate_code: session.partner.checkout_affiliate_code || null,
    return_url: session.partner.website_url, certification: null, certification_text: {}, submitted_by: session.partner.user_id,
    flow_version: 2, validation_done: 0, validation_total: 0, validation_errors: [], retention_days: retention,
    idempotency_key: `widget:${session.id}`, request_hash: digest(JSON.stringify(body)), checkout_token_hash: digest(token),
    checkout_url: `${origin.replace(/\/$/, "")}/partner-checkout/${token}`, order_id: null,
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + hours * 3600000).toISOString() }
  const files = body.items.flatMap((item: any, index: number) => [
    { item_index: index, side: "front", quantity: item.quantity, source_url: item.image_url, source_origin: new URL(item.image_url).origin, expected_sha256: null },
    { item_index: index, side: "back", quantity: item.quantity, source_url: item.back_image_url, source_origin: new URL(item.back_image_url).origin, expected_sha256: null },
  ])
  const result = rpcResult(checked(await db.rpc("partner_widget_create_cart", { p_session: session.id, p_cart: cart, p_files: files, p_uploads: ids })))
  scheduleCartValidation(result, cart.id)
  return Response.json(publicCart(result), { status: result.status === "validating" ? 202 : 200, headers: { "Retry-After": "3" } })
}
export async function widgetStatus(request: Request) {
  const session = await widgetSession(request)
  // No caller-supplied cart ID: this token can only read its one cart. Polling
  // never consumes the upload/session quotas or the REST API write limit.
  const cart = checked(await db.from("partner_carts").select("*").eq("widget_session_id", session.id).eq("partner_id", session.partner_id).eq("mode", session.mode).maybeSingle())
  if (!cart) throw new ApiError(404, "not_found", "Create this session's cart first.")
  return Response.json(publicCart(cart), { headers: { "Retry-After": "3" } })
}
export async function widgetSource(request: Request) {
  const url = new URL(request.url), id = url.searchParams.get("id") || "", token = url.searchParams.get("token") || ""
  if (!uuid.test(id) || !timingSafeEqual(Buffer.from(digest(token)), Buffer.from(digest(sourceMac(id))))) throw new ApiError(403, "invalid_upload", "Invalid artwork source")
  const upload = checked(await db.from("partner_widget_uploads").select("*, session:partner_widget_sessions(*, partner:partnership_requests(*))").eq("id", id).maybeSingle())
  if (!upload || upload.deleted_at || Date.parse(upload.source_expires_at) <= Date.now() || !upload.cart_id) throw new ApiError(410, "upload_expired", "Artwork source is unavailable")
  active(upload.session?.partner)
  const file = checked(await db.storage.from(BUCKET).createSignedUrl(upload.path, 60))
  if (!file?.signedUrl) throw new ApiError(404, "upload_not_found", "Artwork is not available in storage")
  return new Response(null, { status: 307, headers: { Location: file.signedUrl, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } })
}
export async function cleanupWidgetUploads(deadline: number) {
  // A grant can be exercised until two hours after the customer's 1-hour
  // session ends; never delete an unclaimed path before that window closes.
  const due = checked(await db.from("partner_widget_uploads").select("id,path,cart_id").is("deleted_at", null).lte("cleanup_after", new Date().toISOString()).limit(100)) || []
  let deleted = 0
  for (const upload of due) {
    if (Date.now() >= deadline) break
    if (upload.cart_id) {
      // Use an explicit query result here so an active legal hold is preserved.
      const hold = await db.from("partner_artwork").select("id", { count: "exact", head: true }).eq("cart_id", upload.cart_id).eq("legal_hold", true)
      if (hold.error) throw new Error("Could not check artwork hold")
      if (hold.count) continue
    }
    checked(await db.storage.from(BUCKET).remove([upload.path]))
    checked(await db.from("partner_widget_uploads").update({ deleted_at: new Date().toISOString() }).eq("id", upload.id))
    deleted++
  }
  return deleted
}
