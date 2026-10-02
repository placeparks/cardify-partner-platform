import { NextResponse } from "next/server"
import { api, checked, internalAuth, json } from "@/lib/partner-api"
import { ApiError, httpsUrl } from "@/lib/manufacturing-contract"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
export async function POST(request: Request) { return api(async () => {
  internalAuth(request); const body = await json(request)
  if (!body.cart_id || !body.order_id || !["paid","in_production","shipped","cancelled"].includes(body.status)) throw new ApiError(400,"invalid_request","Cart, order and valid lifecycle status required")
  let shipment = null
  if (body.status === "shipped") {
    if (typeof body.shipment?.carrier !== "string" || typeof body.shipment?.tracking_number !== "string") throw new ApiError(400,"invalid_request","Shipment requires carrier and tracking number")
    shipment = { carrier: body.shipment.carrier.slice(0,80), tracking_number: body.shipment.tracking_number.slice(0,150), tracking_url: httpsUrl(body.shipment.tracking_url,"tracking_url") }
  }
  checked(await db.rpc("partner_order_event", { p_cart: body.cart_id, p_order: body.order_id, p_status: body.status, p_shipment: shipment }))
  return NextResponse.json({ received: true })
}) }
