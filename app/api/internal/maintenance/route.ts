import { createHmac } from "node:crypto"
import sharp from "sharp"
import { NextResponse } from "next/server"
import { api, checked, digest, internalAuth } from "@/lib/partner-api"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { safeRequest } from "@/lib/safe-download"
import { decrypt } from "@/lib/webhook-secrets"

export const runtime = "nodejs"
export const maxDuration = 60
export async function POST(request: Request) { return api(async () => {
  internalAuth(request)
  const started = Date.now()
  const now = new Date().toISOString(); const result = { ingested: 0, deleted: 0, delivered: 0, failures: 0 }
  // Small batches keep retries bounded; uploads use deterministic paths and are safe to repeat.
  const paid = checked(await db.from("partner_manufacturing_orders").select("cart_id,partner:partnership_requests(api_blocked_at)").eq("status","paid").limit(20))
  for (const order of paid as any[]) {
    if (Date.now()-started > 20000) break
    if (order.partner.api_blocked_at) continue
    const files = checked(await db.from("partner_artwork").select("*").eq("cart_id",order.cart_id).eq("state","pending").lte("next_attempt_at",now).limit(4)) || []
    for (const file of files) {
      if (Date.now()-started > 20000) break
      try {
        const blocks = checked(await db.from("partner_content_blocks").select("sha256").eq("sha256",file.expected_sha256)) || []
        if (blocks.length) { checked(await db.from("partner_artwork").update({state:"blocked"}).eq("id",file.id)); continue }
        const downloaded = await safeRequest(file.source_url)
        if (downloaded.status !== 200) throw new Error("image_unreachable")
        const sha256 = digest(downloaded.bytes)
        if (sha256 !== file.expected_sha256) throw new Error("image_hash_mismatch")
        const metadata = await sharp(downloaded.bytes, { limitInputPixels: 40_000_000 }).metadata()
        if (!["png","jpeg"].includes(metadata.format || "") || !metadata.width || !metadata.height || (metadata.pages || 1) !== 1) throw new Error("image_invalid")
        const minWidth = Number(process.env.PARTNER_MIN_IMAGE_WIDTH || 1), minHeight = Number(process.env.PARTNER_MIN_IMAGE_HEIGHT || 1)
        if (metadata.width < minWidth || metadata.height < minHeight) throw new Error("image_dimensions_invalid")
        // Decode to verify the entire image, without replacing or creatively modifying it.
        await sharp(downloaded.bytes, { limitInputPixels: 40_000_000 }).stats()
        const path = `${file.cart_id}/${file.id}`
        checked(await db.storage.from("partner-artwork").upload(path,downloaded.bytes,{ contentType: metadata.format === "png" ? "image/png" : "image/jpeg", upsert:true }))
        checked(await db.from("partner_artwork").update({storage_path:path,actual_sha256:sha256,state:"stored",received_at:now,source_url:null}).eq("id",file.id).eq("state","pending"))
        result.ingested++
      } catch (error) {
        result.failures++
        const code = error instanceof Error && ["image_unreachable","image_hash_mismatch","image_invalid","image_dimensions_invalid"].includes(error.message) ? error.message : "ingestion_failed"
        const attempts = file.ingestion_attempts + 1
        checked(await db.from("partner_artwork").update({ingestion_attempts:attempts,last_error:code,next_attempt_at:new Date(Date.now()+Math.min(86400,60*2**attempts)*1000).toISOString()}).eq("id",file.id))
        checked(await db.from("partner_audit_events").insert({entity_type:"artwork",entity_id:file.id,action:"ingestion_failed",actor:"maintenance",details:{cart_id:file.cart_id,code,attempts}}))
        if (attempts >= 12) checked(await db.rpc("partner_enforce",{p_target:"cart",p_id:file.cart_id,p_reason:`Artwork ingestion failed: ${code}`,p_actor:"maintenance"}))
      }
    }
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
