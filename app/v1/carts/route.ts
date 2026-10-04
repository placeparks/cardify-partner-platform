import { NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { api, authenticate, checked, digest, json, publicCart, secret } from "@/lib/partner-api"
import { ApiError, CERTIFICATION, partnerReturnUrl, validateCart } from "@/lib/manufacturing-contract"

export const runtime = "nodejs"
export async function POST(request: Request) { return api(async () => {
  const key = await authenticate(request)
  if (key.mode === "live" && (process.env.PARTNER_LIVE_ENABLED !== "true" || !(Number(process.env.PARTNER_MIN_IMAGE_WIDTH)>0) || !(Number(process.env.PARTNER_MIN_IMAGE_HEIGHT)>0))) throw new ApiError(503,"live_not_enabled","Live handoff awaits production configuration")
  const idempotency = request.headers.get("idempotency-key")
  if (!idempotency || !/^[\x21-\x7e]{1,200}$/.test(idempotency)) throw new ApiError(400, "invalid_request", "Idempotency-Key is required (1–200 printable characters)")
  const body = validateCart(await json(request), Number(process.env.PARTNER_MAX_CARDS || 1000))
  const returnUrl = partnerReturnUrl(body.return_url, key.partner.website_url)
  const requestHash = digest(JSON.stringify(body))
  const existing = checked(await db.from("partner_carts").select("*").eq("partner_id", key.partner_id).eq("mode", key.mode).eq("idempotency_key", idempotency).maybeSingle())
  if (existing) {
    if (existing.request_hash !== requestHash) throw new ApiError(409, "idempotency_conflict", "That key was used with different manufacturing instructions")
    return NextResponse.json(publicCart(existing), { status: existing.status === "validating" ? 202 : 200, headers: { "Cache-Control": "no-store", "Retry-After": "3" } })
  }
  const origin = key.mode === "test" ? new URL(request.url).origin : process.env.TCGPLAYTEST_CHECKOUT_ORIGIN
  if (!origin) throw new ApiError(503, "checkout_unavailable", "Live checkout is not configured")
  const token = secret("")
  const id = secret("cart_")
  const now = new Date()
  const expiryHours = Number(process.env.PARTNER_CART_EXPIRY_HOURS || 168)
  const retentionDays = Number(process.env.PARTNER_ARTWORK_RETENTION_DAYS || 30)
  if (!Number.isInteger(expiryHours) || expiryHours < 1 || expiryHours > 168 || !Number.isInteger(retentionDays) || retentionDays < 0 || retentionDays > 365) throw new ApiError(503, "configuration_error", "Artwork retention configuration is invalid")
  const cart = { id, partner_id: key.partner_id, api_key_id: key.id, mode: key.mode, status: "validating", external_ref: body.external_ref,
    card_count: body.card_count, card_stock: body.card_stock, affiliate_code: key.partner.checkout_affiliate_code || null, return_url: returnUrl,
    certification: body.certification, certification_text: body.certification ? CERTIFICATION : {}, submitted_by: key.partner.user_id,
    flow_version: 2, validation_done: 0, validation_total: 0, validation_errors: [], retention_days: retentionDays,
    idempotency_key: idempotency, request_hash: requestHash, checkout_token_hash: digest(token),
    checkout_url: `${origin.replace(/\/$/, "")}/partner-checkout/${token}`, order_id: null,
    created_at: now.toISOString(), expires_at: new Date(now.getTime() + expiryHours * 3600_000).toISOString() }
  const files = body.items.flatMap((item: any, index: number) => [
    { item_index: index, side: "front", quantity: item.quantity, source_url: item.image_url, source_origin: new URL(item.image_url).origin, expected_sha256: item.sha256 },
    { item_index: index, side: "back", quantity: item.quantity, source_url: item.back_image_url, source_origin: new URL(item.back_image_url).origin, expected_sha256: item.back_sha256 },
  ])
  const result = checked(await db.rpc("partner_create_cart", { p_cart: cart, p_files: files }))
  if (result.conflict) throw new ApiError(409, "idempotency_conflict", "That key was used with different manufacturing instructions")
  if (result.blocked) throw new ApiError(403, "content_blocked", "A submitted file is blocked")
  // The transaction queues URLs. Only the separately scheduled worker downloads them.
  return NextResponse.json(publicCart(result), { status: result.status === "validating" ? 202 : 200, headers: { "Cache-Control": "no-store", "Retry-After": "3" } })
}) }
