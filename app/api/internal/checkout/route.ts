import { NextResponse } from "next/server"
import { api, checked, digest, internalAuth, json } from "@/lib/partner-api"
import { ApiError } from "@/lib/manufacturing-contract"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
export async function POST(request: Request) { return api(async () => {
  internalAuth(request); const body = await json(request)
  const cart = checked(await db.from("partner_carts").select("*,partner:partnership_requests(status,api_blocked_at)").eq("checkout_token_hash", digest(String(body.token || ""))).maybeSingle())
  if (!cart || cart.mode !== "live") throw new ApiError(404,"not_found","Live cart not found")
  if (cart.status !== "open" || Date.parse(cart.expires_at) <= Date.now() || cart.partner.api_blocked_at || cart.partner.status !== "approved") throw new ApiError(409,"cart_unavailable","Cart is no longer available")
  const files = checked(await db.from("partner_artwork").select("item_index,side,quantity,state,expected_sha256").eq("cart_id",cart.id).order("item_index")) || []
  const blocks = checked(await db.from("partner_content_blocks").select("sha256").in("sha256",files.map((f:any)=>f.expected_sha256))) || []
  if (files.some((f:any)=>f.state === "blocked") || blocks.length) throw new ApiError(403,"content_blocked","Artwork is blocked")
  // The commerce app receives manufacturing counts, never source artwork before payment.
  return NextResponse.json({ id: cart.id, card_count: cart.card_count, affiliate_code: cart.affiliate_code, external_ref: cart.external_ref,
    expires_at: cart.expires_at, certification: cart.certification, partner_id: cart.partner_id,
    items: files.filter((f:any)=>f.side === "front").map((f:any)=>({ id: `${cart.id}_${f.item_index}`, quantity: f.quantity, finish: "standard" })) }, { headers: { "Cache-Control": "no-store" } })
}) }
