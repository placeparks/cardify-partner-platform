import { ingestArtwork } from "@/lib/ingest-artwork"
import { createHmac } from "node:crypto"
import { NextResponse } from "next/server"
import { api, checked, internalAuth } from "@/lib/partner-api"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { safeRequest } from "@/lib/safe-download"
import { decrypt } from "@/lib/webhook-secrets"
import { deliverWelcomeEmail } from "@/lib/partner-welcome"

export const runtime = "nodejs"
export const maxDuration = 60
export async function POST(request: Request) { return api(async () => {
  internalAuth(request)
  const started = Date.now()
  const now = new Date().toISOString(); const result = { ingested: 0, deleted: 0, delivered: 0, failures: 0, welcomeEmailSent: false }
  // One claimed message per run, with a shared 12-second email deadline.
  result.welcomeEmailSent = (await deliverWelcomeEmail()).sent
  // Small batches keep retries bounded; uploads use deterministic paths and are safe to repeat.
  const paid = checked(await db.from("partner_manufacturing_orders").select("cart_id,partner:partnership_requests(api_blocked_at)").eq("status","paid").limit(20))
  for (const order of paid as any[]) {
    if (Date.now()-started > 20000) break
    if (order.partner.api_blocked_at) continue
    const batch = await ingestArtwork(order.cart_id, started + 20000)
    result.ingested += batch.ingested
    result.failures += batch.failures
  }

  // Expiration and its webhook are atomic, so an interrupted run cannot lose the event.
  checked(await db.rpc("partner_expire_carts"))
  const due = checked(await db.rpc("partner_claim_cleanup")) || []
  for (const file of due) {
    checked(await db.storage.from("partner-artwork").remove([file.storage_path || `${file.cart_id}/${file.id}`]))
    checked(await db.from("partner_artwork").update({state:"deleted",source_url:null,storage_path:null,deleted_at:now}).eq("id",file.id).eq("legal_hold",false))
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
  return NextResponse.json(result)
}) }
