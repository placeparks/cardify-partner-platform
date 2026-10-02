import { NextResponse } from "next/server"
import { api, adminSession, checked, json } from "@/lib/partner-api"
import { ApiError } from "@/lib/manufacturing-contract"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { POST as productionManifest } from "@/app/api/internal/production/route"
import { httpsUrl } from "@/lib/manufacturing-contract"
export async function GET() { return api(async () => {
  await adminSession()
  return NextResponse.json({
    orders:checked(await db.from("partner_manufacturing_orders").select("*,cart:partner_carts(card_count,external_ref,partner_artwork(id,item_index,side,state,legal_hold,delete_after))").order("created_at",{ascending:false}).limit(100)),
    webhookFailures:checked(await db.from("partner_webhook_events").select("id,partner_id,event_type,attempts").is("delivered_at",null).gte("attempts",12).limit(100)),
    cases:checked(await db.from("partner_takedown_cases").select("*").order("created_at",{ascending:false}).limit(100)),events:checked(await db.from("partner_audit_events").select("*").order("id",{ascending:false}).limit(100))},{headers:{"Cache-Control":"no-store"}})
}) }
export async function POST(request: Request) { return api(async () => {
  const user = await adminSession(); const body = await json(request)
  if (body.action === "manifest") {
    return productionManifest(new Request("http://internal/production",{method:"POST",headers:{Authorization:`Bearer ${process.env.PARTNER_INTERNAL_SECRET}`},body:JSON.stringify({order_id:body.id})}))
  } else if (body.action === "order_status") {
    if (!["in_production","shipped","cancelled"].includes(body.status)) throw new ApiError(400,"invalid_request","Invalid production status")
    const order=checked(await db.from("partner_manufacturing_orders").select("cart_id").eq("id",body.id).single())
    if (!order) throw new ApiError(404,"not_found","Order not found")
    const shipment=body.status==='shipped'?{carrier:String(body.carrier||'').slice(0,80),tracking_number:String(body.tracking_number||'').slice(0,150),tracking_url:httpsUrl(body.tracking_url,'tracking_url')}:null
    if(shipment&&(!shipment.carrier||!shipment.tracking_number))throw new ApiError(400,"invalid_request","Carrier and tracking number are required")
    checked(await db.rpc("partner_order_event",{p_cart:order.cart_id,p_order:body.id,p_status:body.status,p_shipment:shipment}))
  } else if (body.action === "replay") {
    checked(await db.from("partner_webhook_events").update({attempts:0,next_attempt_at:new Date().toISOString()}).eq("id",body.id).is("delivered_at",null))
  } else if (body.action === "block") {
    if (!["partner","key","cart","sha256"].includes(body.target) || typeof body.reason !== "string" || body.reason.trim().length < 3) throw new ApiError(400,"invalid_request","Target and reason required")
    checked(await db.rpc("partner_enforce",{p_target:body.target,p_id:body.id,p_reason:body.reason,p_actor:user.id}))
  } else if (body.action === "notice") {
    if (typeof body.notice !== "string" || body.notice.length < 20 || body.notice.length > 20000) throw new ApiError(400,"invalid_request","Record the received notice")
    checked(await db.from("partner_takedown_cases").insert({partner_id:body.partner_id||null,cart_id:body.cart_id||null,sha256:body.sha256||null,notice:{text:body.notice,recorded_by:user.id}}))
  } else if (body.action === "case") {
    if (!["under_review","actioned","counter_notice","court_action","resolved","rejected"].includes(body.status)) throw new ApiError(400,"invalid_request","Invalid case status")
    const existing = checked(await db.from("partner_takedown_cases").select("*").eq("id",body.id).single())
    const record = checked(await db.from("partner_takedown_cases").update({status:body.status,admin_notes:String(body.notes||"").slice(0,10000),
      counter_notice:body.counter_notice?{text:String(body.counter_notice).slice(0,20000),received_at:new Date().toISOString()}:existing.counter_notice,
      repeat_infringement:body.repeat_infringement === true,updated_at:new Date().toISOString()}).eq("id",body.id).select().single())
    // Explicit adjudication by an administrator, never automatic guilt from a raw notice.
    if (record.repeat_infringement && record.partner_id) checked(await db.rpc("partner_enforce",{p_target:"partner",p_id:record.partner_id,p_reason:`Repeat-infringer enforcement: case ${record.id}`,p_actor:user.id}))
    if (body.status === "actioned") {
      if (record.sha256) checked(await db.rpc("partner_enforce",{p_target:"sha256",p_id:record.sha256,p_reason:`Notice ${record.id}`,p_actor:user.id}))
      if (record.cart_id) checked(await db.rpc("partner_enforce",{p_target:"cart",p_id:record.cart_id,p_reason:`Notice ${record.id}`,p_actor:user.id}))
    }
  } else if (body.action === "retention") {
    if (typeof body.reason !== "string" || body.reason.length < 3) throw new ApiError(400,"invalid_request","A retention reason is required")
    const files = checked(await db.from("partner_artwork").update({legal_hold:body.legal_hold === true,delete_after:body.legal_hold === true?null:new Date().toISOString()}).eq("id",body.id).not("state","in","(deleting,deleted)").select("id"))
    if (!files?.length) throw new ApiError(409,"retention_conflict","File is already being deleted, deleted, or unavailable")
    checked(await db.from("partner_audit_events").insert({entity_type:"artwork",entity_id:body.id,action:"retention_review",actor:user.id,details:{reason:body.reason,legal_hold:body.legal_hold===true}}))
  } else throw new ApiError(400,"invalid_request","Unknown action")
  return NextResponse.json({ok:true})
}) }
