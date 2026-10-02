import { NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { api, authenticate, checked } from "@/lib/partner-api"
import { ApiError } from "@/lib/manufacturing-contract"
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return api(async () => {
  const key = await authenticate(request)
  const { id } = await context.params
  const order = checked(await db.from("partner_manufacturing_orders").select("id,cart_id,status,shipment,created_at,updated_at,cart:partner_carts(external_ref,card_count)").eq("id", id).eq("partner_id", key.partner_id).eq("mode", key.mode).maybeSingle()) as any
  if (!order) throw new ApiError(404, "not_found", "Order not found")
  const { cart, ...safe } = order
  return NextResponse.json({ ...safe, external_ref: cart.external_ref, card_count: cart.card_count }, { headers: { "Cache-Control": "no-store" } })
}) }
