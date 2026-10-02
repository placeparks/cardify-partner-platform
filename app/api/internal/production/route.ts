import { NextResponse } from "next/server"
import { api, checked, internalAuth, json } from "@/lib/partner-api"
import { ApiError } from "@/lib/manufacturing-contract"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { ingestArtwork } from "@/lib/ingest-artwork"
export const maxDuration = 60
export async function POST(request: Request) { return api(async () => {
  internalAuth(request); const body = await json(request)
  const order = checked(await db.from("partner_manufacturing_orders").select("*,partner:partnership_requests(api_blocked_at)").eq("id",body.order_id).maybeSingle())
  if (!order) throw new ApiError(404,"not_found","Manufacturing order not found; check payment webhook delivery")
  if (body.prepare === true) await ingestArtwork(order.cart_id)
  // Re-read after preparation to honor holds applied while files were downloading.
  const current = checked(await db.from("partner_manufacturing_orders").select("status,shipment,partner:partnership_requests(api_blocked_at)").eq("id",order.id).single())
  if (!current) throw new ApiError(404,"not_found","Manufacturing order not found")
  const files = checked(await db.from("partner_artwork").select("*").eq("cart_id",order.cart_id).order("item_index")) || []
  const blocks = files.length ? checked(await db.from("partner_content_blocks").select("sha256").in("sha256",files.map((f:any)=>f.expected_sha256))) || [] : []
  const available = ["paid","in_production"].includes(current.status) && !(current.partner as any)?.api_blocked_at && !blocks.length
  const ready = available && files.length > 0 && files.every((f:any)=>["stored","processed"].includes(f.state) && f.storage_path)
  if (body.include_urls === false) return NextResponse.json({order_id:order.id,cart_id:order.cart_id,status:current.status,shipment:current.shipment,ready,
    files:files.map((f:any)=>({id:f.id,item_index:f.item_index,side:f.side,quantity:f.quantity,state:f.state,last_error:f.last_error,next_attempt_at:f.next_attempt_at}))}, {headers:{"Cache-Control":"no-store"}})
  if (!available) throw new ApiError(409,"production_blocked","Order is blocked, cancelled, or already shipped")
  if (!ready) throw new ApiError(409,"artwork_not_ready","All client files must pass ingestion before production")
  const selected = body.file_id ? files.filter((f:any)=>f.id === body.file_id) : files
  if (!selected.length) throw new ApiError(404,"not_found","File does not belong to this order")
  const manifest = []
  for (const file of selected) {
    const signed = checked(await db.storage.from("partner-artwork").createSignedUrl(file.storage_path,60))
    manifest.push({id:file.id,item_index:file.item_index,side:file.side,quantity:file.quantity,sha256:file.actual_sha256,url:signed!.signedUrl})
  }
  checked(await db.from("partner_audit_events").insert({partner_id:order.partner_id,entity_type:"production",entity_id:order.id,action:"files_accessed",actor:typeof body.actor === "string" ? body.actor.slice(0,150) : "production_service",details:{file_ids:selected.map((f:any)=>f.id)}}))
  return NextResponse.json({order_id:order.id,files:manifest},{headers:{"Cache-Control":"no-store"}})
}) }
