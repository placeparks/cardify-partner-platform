import { NextResponse } from "next/server"
import { api, checked, internalAuth, json } from "@/lib/partner-api"
import { ApiError } from "@/lib/manufacturing-contract"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
export async function POST(request: Request) { return api(async () => {
  internalAuth(request); const body = await json(request)
  const order = checked(await db.from("partner_manufacturing_orders").select("*,partner:partnership_requests(api_blocked_at)").eq("id",body.order_id).maybeSingle())
  if (!order || !["paid","in_production"].includes(order.status) || order.partner.api_blocked_at) throw new ApiError(409,"production_blocked","Order is not available for production")
  const files = checked(await db.from("partner_artwork").select("*").eq("cart_id",order.cart_id).order("item_index")) || []
  if (!files.length || files.some((f:any)=>!["stored","processed"].includes(f.state) || !f.storage_path)) throw new ApiError(409,"artwork_not_ready","All client files must pass ingestion before production")
  const blocks = checked(await db.from("partner_content_blocks").select("sha256").in("sha256",files.map((f:any)=>f.actual_sha256))) || []
  if (blocks.length) throw new ApiError(403,"content_blocked","Artwork is blocked")
  const manifest = []
  for (const file of files) {
    const signed = checked(await db.storage.from("partner-artwork").createSignedUrl(file.storage_path,60))
    manifest.push({id:file.id,item_index:file.item_index,side:file.side,quantity:file.quantity,sha256:file.actual_sha256,url:signed!.signedUrl})
  }
  checked(await db.from("partner_audit_events").insert({partner_id:order.partner_id,entity_type:"production",entity_id:order.id,action:"files_accessed",actor:"production_service",details:{file_ids:files.map((f:any)=>f.id)}}))
  return NextResponse.json({order_id:order.id,files:manifest},{headers:{"Cache-Control":"no-store"}})
}) }
