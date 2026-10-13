import { NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { api, authenticate, checked } from "@/lib/partner-api"
import { ApiError } from "@/lib/manufacturing-contract"
import { prepaidMode } from "@/lib/prepaid-contract"
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return api(async () => {
  const key = await authenticate(request)
  const { id } = await context.params
  if (prepaidMode()==='test' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
    const quote:any=checked(await db.from('partner_prepaid_quotes').select('order_id,cart_id,simulated_status,created_at,order_funded_at,cart:partner_carts!inner(external_ref,card_count,mode)').eq('order_id',id).eq('partner_id',key.partner_id).eq('payment_mode','test').eq('cart.mode',key.mode).maybeSingle())
    if (quote?.simulated_status) return NextResponse.json({id:quote.order_id,cart_id:quote.cart_id,status:quote.simulated_status,shipment:null,created_at:quote.order_funded_at,updated_at:quote.order_funded_at,external_ref:quote.cart.external_ref,card_count:quote.cart.card_count,mode:'test',simulated:true},{headers:{'Cache-Control':'no-store'}})
  }
  const order = checked(await db.from('partner_manufacturing_orders').select("id,cart_id,status,shipment,created_at,updated_at,cart:partner_carts(external_ref,card_count)").eq("id", id).eq("partner_id", key.partner_id).eq("mode", key.mode).maybeSingle()) as any
  if (!order) throw new ApiError(404, "not_found", "Order not found")
  const { cart, ...safe } = order
  return NextResponse.json({ ...safe, external_ref: cart.external_ref, card_count: cart.card_count }, { headers: { "Cache-Control": "no-store" } })
}) }
