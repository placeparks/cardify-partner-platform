import { NextResponse } from "next/server"
import { api, checked, internalAuth, json } from "@/lib/partner-api"
import { ApiError, partnerReturnUrl } from "@/lib/manufacturing-contract"
import { supabaseAdmin as db } from "@/lib/supabase-admin"

// Called by the checkout server after it has verified a paid order. Never use
// a browser-supplied redirect URL or infer the partner from a Referer header.
export async function POST(request: Request) { return api(async () => {
  internalAuth(request)
  const body = await json(request)
  if (typeof body.cart_id !== "string" || typeof body.order_id !== "string") {
    throw new ApiError(400, "invalid_request", "Cart and order IDs are required")
  }
  const cart = checked(await db.from("partner_carts")
    .select("id,order_id,mode,return_url,partner:partnership_requests(website_url)")
    .eq("id", body.cart_id).eq("order_id", body.order_id).maybeSingle()) as any
  if (!cart || cart.mode !== "live" || !cart.order_id) throw new ApiError(404, "not_found", "Paid partner cart not found")
  // Older carts without return_url also return to their registered website.
  return NextResponse.json({ return_url: partnerReturnUrl(cart.return_url, cart.partner?.website_url) },
    { headers: { "Cache-Control": "no-store" } })
}) }
