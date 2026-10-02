import { NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { api, authenticate, checked, digest, json, publicCart, secret } from "@/lib/partner-api"
import { ApiError, CERTIFICATION, validateCart } from "@/lib/manufacturing-contract"

export const runtime = "nodejs"
export async function POST(request: Request) { return api(async () => {
  const key = await authenticate(request)
  if (key.mode === "live" && (process.env.PARTNER_LIVE_ENABLED !== "true" || !(Number(process.env.PARTNER_MIN_IMAGE_WIDTH)>0) || !(Number(process.env.PARTNER_MIN_IMAGE_HEIGHT)>0))) throw new ApiError(503,"live_not_enabled","Live handoff awaits production configuration")
  const idempotency = request.headers.get("idempotency-key")
  if (!idempotency || !/^[\x21-\x7e]{1,200}$/.test(idempotency)) throw new ApiError(400, "invalid_request", "Idempotency-Key is required (1–200 printable characters)")
  const body = validateCart(await json(request), Number(process.env.PARTNER_MAX_CARDS || 1000))
  if (body.return_url && new URL(body.return_url).origin !== new URL(key.partner.website_url).origin) throw new ApiError(400, "invalid_request", "return_url must belong to the approved partner website")
  const requestHash = digest(JSON.stringify(body))
  const existing = checked(await db.from("partner_carts").select("*").eq("partner_id", key.partner_id).eq("mode", key.mode).eq("idempotency_key", idempotency).maybeSingle())
  if (existing) {
    if (existing.request_hash !== requestHash) throw new ApiError(409, "idempotency_conflict", "That key was used with different manufacturing instructions")
    return NextResponse.json(publicCart(existing), { headers: { "Cache-Control": "no-store" } })
  }
  const origin = key.mode === "test" ? new URL(request.url).origin : process.env.TCGPLAYTEST_CHECKOUT_ORIGIN
  if (!origin) throw new ApiError(503, "checkout_unavailable", "Live checkout is not configured")
  const token = secret("")
  const id = secret("cart_")
  const now = new Date()
  const cart = { id, partner_id: key.partner_id, api_key_id: key.id, mode: key.mode, status: "open", external_ref: body.external_ref,
    card_count: body.card_count, card_stock: body.card_stock, affiliate_code: null, return_url: body.return_url,
    certification: body.certification, certification_text: CERTIFICATION, submitted_by: key.partner.user_id,
    idempotency_key: idempotency, request_hash: requestHash, checkout_token_hash: digest(token),
    checkout_url: `${origin.replace(/\/$/, "")}/partner-checkout/${token}`, order_id: null,
    created_at: now.toISOString(), expires_at: new Date(now.getTime() + 7 * 86400_000).toISOString() }
  const files = body.items.flatMap((item: any, index: number) => [
    { item_index: index, side: "front", quantity: item.quantity, source_url: item.image_url, source_origin: new URL(item.image_url).origin, expected_sha256: item.sha256 },
    { item_index: index, side: "back", quantity: item.quantity, source_url: item.back_image_url, source_origin: new URL(item.back_image_url).origin, expected_sha256: item.back_sha256 },
  ])
  const result = checked(await db.rpc("partner_create_cart", { p_cart: cart, p_files: files }))
  if (result.conflict) throw new ApiError(409, "idempotency_conflict", "That key was used with different manufacturing instructions")
  if (result.blocked) throw new ApiError(403, "content_blocked", "A submitted file is blocked")
  return NextResponse.json(publicCart(result), { status: 201, headers: { "Cache-Control": "no-store" } })
}) }
