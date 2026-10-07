import { createHmac } from "node:crypto"
import { NextResponse } from "next/server"
import { api, checked, internalAuth, cronAuth } from "@/lib/partner-api"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { safeRequest } from "@/lib/safe-download"
import { decrypt } from "@/lib/webhook-secrets"
import { deliverWelcomeEmail } from "@/lib/partner-welcome"
import { cleanupUploads } from "@/lib/partner-uploads"

export const runtime = "nodejs"
export const maxDuration = 60
export async function POST(request: Request) { return api(async () => { internalAuth(request); return maintain() }) }
export async function GET(request: Request) { return api(async () => { cronAuth(request); return maintain() }) }
async function maintain() {
  const started = Date.now()
  const now = new Date().toISOString(); const result = { deleted: 0, delivered: 0, failures: 0, welcomeEmailSent: false }
  // One claimed message per run, with a shared 12-second email deadline.
  result.welcomeEmailSent = (await deliverWelcomeEmail()).sent
  const expired = checked(await db.from("partner_carts").select("id,created_at,flow_version,acceptances:partner_checkout_acceptances(id)").in("status",["open","validating"]).lte("expires_at",now).is("payment_reconciled_at",null).limit(10)) || []
  for (const cart of expired) {
    if (cart.flow_version === 2 && !cart.acceptances?.length) continue
    if (Date.now()-started>23000) break
    try {
      const response=await fetch(`${process.env.TCGPLAYTEST_CHECKOUT_ORIGIN}/api/partner/reconcile-cart`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${process.env.PARTNER_INTERNAL_SECRET}`},body:JSON.stringify({cart_id:cart.id,created_at:cart.created_at}),signal:AbortSignal.timeout(10000),redirect:"error"})
      if (!response.ok) throw new Error("Reconciliation unavailable")
      const payment=await response.json()
      if (payment.state==="paid") checked(await db.rpc("partner_order_event",{p_cart:cart.id,p_order:payment.order_id,p_status:"paid",p_shipment:null}))
      else if (payment.state==="unpaid") checked(await db.from("partner_carts").update({payment_reconciled_at:now}).eq("id",cart.id).in("status",["open","validating"]))
    } catch { result.failures++ }
  }

  // Expiration and its webhook are atomic, so an interrupted run cannot lose the event.
  checked(await db.rpc("partner_expire_carts"))
  const due = checked(await db.rpc("partner_claim_cleanup")) || []
  for (const file of due) {
    if (Date.now()-started>40000) break
    const paths=[...new Set<string>([file.storage_path,file.print_storage_path].filter(Boolean))]
    if (paths.length) checked(await db.storage.from("partner-artwork").remove(paths))
    checked(await db.from("partner_artwork").update({state:"deleted",source_url:null,storage_path:null,print_storage_path:null,deleted_at:now}).eq("id",file.id).eq("legal_hold",false))
    result.deleted++
  }
  const events = checked(await db.from("partner_webhook_events").select("*").is("delivered_at",null).lte("next_attempt_at",now).lt("attempts",12).limit(10)) || []
  for (const event of events) {
    if (Date.now()-started > 45000) break
    const settings = checked(await db.from("partner_webhook_settings").select("*").eq("partner_id",event.partner_id).eq("mode",event.mode).maybeSingle())
    if (!settings) continue
    let delivered = false
    try {
      const raw = JSON.stringify(event.payload), timestamp = Math.floor(Date.now()/1000)
      const signature = createHmac("sha256",decrypt(settings.secret_ciphertext)).update(`${timestamp}.${raw}`).digest("hex")
      const response = await safeRequest(settings.url,{method:"POST",body:raw,headers:{"Content-Type":"application/json","TCGP-Signature":`t=${timestamp},v1=${signature}`},maxBytes:64_000})
      delivered = response.status >= 200 && response.status < 300
    } catch { result.failures++ }
    checked(await db.from("partner_webhook_events").update({attempts:event.attempts+1,delivered_at:delivered?now:null,next_attempt_at:new Date(Date.now()+Math.min(86400,30*2**event.attempts)*1000).toISOString()}).eq("id",event.id))
    if (delivered) result.delivered++
  }
  checked(await db.from("partner_api_rate_windows").delete().lt("window_at",new Date(Date.now()-86400_000).toISOString()))
  let uploadsDeleted = 0
  if (Date.now() - started < 45000) {
    try { uploadsDeleted = await cleanupUploads(started + 50000) } catch { result.failures++ }
  }
  return NextResponse.json({ ...result, uploadsDeleted })
}
