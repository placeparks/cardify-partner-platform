import { NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { api, authenticate, checked, publicCart } from "@/lib/partner-api"
import { ApiError } from "@/lib/manufacturing-contract"
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return api(async () => {
  const key = await authenticate(request)
  const { id } = await context.params
  const cart = checked(await db.from("partner_carts").select("*").eq("id", id).eq("partner_id", key.partner_id).eq("mode", key.mode).maybeSingle())
  if (!cart) throw new ApiError(404, "not_found", "Cart not found")
  return NextResponse.json(publicCart(cart), { headers: { "Cache-Control": "no-store" } })
}) }
