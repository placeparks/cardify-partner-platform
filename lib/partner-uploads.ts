import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { ApiError, hasPartnerTerms } from "@/lib/manufacturing-contract"
import { checked } from "@/lib/partner-api"
import { supabaseAdmin as db } from "@/lib/supabase-admin"

export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024
export const UPLOAD_SOURCE_SECONDS = 8 * 24 * 60 * 60
const bucketName = "partner-artwork"
const prefix = "partner-uploads"
type Grant = { path: string; partner: string; key: string; mode: string; origin: string; expires: number }
type Owner = { id: string; partner_id: string; mode: string }

function sign(body: string) {
  const key = process.env.PARTNER_INTERNAL_SECRET || ""
  if (key.length < 32) throw new ApiError(503, "uploads_unavailable", "Upload signing is not configured")
  return createHmac("sha256", key).update(`partner-upload:${body}`).digest("hex")
}

export function readUploadGrant(token: string | null): Grant {
  if (!token || token.length > 1800) throw new ApiError(403, "invalid_upload", "Invalid upload link")
  const [body, mac, extra] = token.split(".")
  if (extra || !body || !/^[a-f0-9]{64}$/.test(mac || "") || !timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(sign(body), "hex"))) throw new ApiError(403, "invalid_upload", "Invalid upload link")
  let grant: Grant
  try { grant = JSON.parse(Buffer.from(body, "base64url").toString()) } catch { throw new ApiError(403, "invalid_upload", "Invalid upload link") }
  if (!grant || typeof grant !== "object" || typeof grant.path !== "string" || !/^partner-uploads\/\d{4}-\d{2}-\d{2}\/[a-f0-9]{64}\.(png|jpg)$/.test(grant.path) || !["live", "test"].includes(grant.mode) || typeof grant.partner !== "string" || typeof grant.key !== "string" || typeof grant.origin !== "string") throw new ApiError(403, "invalid_upload", "Invalid upload link")
  if (!Number.isSafeInteger(grant.expires) || grant.expires <= Date.now()) throw new ApiError(410, "upload_expired", "Upload link expired; upload the image again")
  return grant
}

export function assertUploadOwner(url: string, owner: Owner) {
  const value = new URL(url)
  if (value.pathname !== "/v1/uploads/source") return
  const grant = readUploadGrant(value.searchParams.get("token"))
  if (grant.origin !== value.origin || grant.partner !== owner.partner_id || grant.mode !== owner.mode) throw new ApiError(403, "invalid_upload", "Upload belongs to another partner or key mode")
}

export async function createUpload(owner: Owner, input: any, origin: string) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(k => !["content_type", "size"].includes(k)) || !["image/png", "image/jpeg"].includes(input.content_type) || !Number.isSafeInteger(input.size) || input.size < 1 || input.size > UPLOAD_MAX_BYTES) throw new ApiError(400, "invalid_request", "Supply content_type (image/png or image/jpeg) and size (1–20,971,520 bytes)")
  const originUrl = new URL(origin)
  if (originUrl.protocol !== "https:" || originUrl.origin !== origin) throw new ApiError(503, "uploads_unavailable", "The partner API must use HTTPS for upload links")
  // Enforce size/type at storage ingress as well as during queued preflight.
  const bucket = checked(await db.storage.getBucket(bucketName))
  const mimeTypes = bucket?.allowed_mime_types
  if (!bucket || bucket.public || Number(bucket.file_size_limit) !== UPLOAD_MAX_BYTES || !Array.isArray(mimeTypes) || !["image/png", "image/jpeg"].every(type => mimeTypes.includes(type)) || mimeTypes.some(type => !["image/png", "image/jpeg"].includes(type))) throw new ApiError(503, "uploads_unavailable", "The private partner-artwork bucket needs a 20 MiB limit and PNG/JPEG types")
  const now = Date.now()
  const path = `${prefix}/${new Date(now).toISOString().slice(0, 10)}/${randomBytes(32).toString("hex")}.${input.content_type === "image/png" ? "png" : "jpg"}`
  const grant: Grant = { path, partner: owner.partner_id, key: owner.id, mode: owner.mode, origin, expires: now + UPLOAD_SOURCE_SECONDS * 1000 }
  const body = Buffer.from(JSON.stringify(grant)).toString("base64url")
  const token = `${body}.${sign(body)}`
  const signed = checked(await db.storage.from(bucketName).createSignedUploadUrl(path, { upsert: false }))
  if (!signed?.signedUrl) throw new ApiError(503, "uploads_unavailable", "Storage could not issue an upload link")
  return {
    upload_url: signed.signedUrl, method: "PUT", headers: { "Content-Type": input.content_type },
    image_url: `${origin}/v1/uploads/source?token=${token}`,
    upload_expires_at: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    expires_at: new Date(grant.expires).toISOString(), max_bytes: UPLOAD_MAX_BYTES,
  }
}

export async function uploadSource(request: Request) {
  const url = new URL(request.url)
  const grant = readUploadGrant(url.searchParams.get("token"))
  if (url.origin !== grant.origin) throw new ApiError(403, "invalid_upload", "Invalid upload origin")
  const key = checked(await db.from("partner_api_keys").select("*, partner:partnership_requests(*)").eq("id", grant.key).eq("partner_id", grant.partner).eq("mode", grant.mode).is("revoked_at", null).maybeSingle())
  if (!key?.partner || key.partner.status !== "approved" || key.partner.api_blocked_at || !hasPartnerTerms(key.partner)) throw new ApiError(403, "invalid_upload", "Upload access is unavailable")
  const file = await db.storage.from(bucketName).createSignedUrl(grant.path, 60)
  if (file.error || !file.data) throw new ApiError(404, "upload_not_found", "Upload the image before creating a cart")
  // Image bytes bypass Vercel's function body-size limit. The worker still
  // performs its normal size, format, dimension, hash and content checks.
  return new Response(null, { status: 307, headers: { Location: file.data.signedUrl, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } })
}

export async function cleanupUploads(deadline: number) {
  const storage = db.storage.from(bucketName)
  const cutoff = new Date(Date.now() - UPLOAD_SOURCE_SECONDS * 1000).toISOString().slice(0, 10)
  const days = checked(await storage.list(prefix, { limit: 100, sortBy: { column: "name", order: "asc" } })) || []
  let deleted = 0
  for (const day of days) {
    if (Date.now() >= deadline) break
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.name) || day.name >= cutoff) continue
    const files = checked(await storage.list(`${prefix}/${day.name}`, { limit: 100 })) || []
    const paths = files.filter(file => /^[a-f0-9]{64}\.(png|jpg)$/.test(file.name)).map(file => `${prefix}/${day.name}/${file.name}`)
    if (paths.length) { checked(await storage.remove(paths)); deleted += paths.length }
  }
  return deleted
}
