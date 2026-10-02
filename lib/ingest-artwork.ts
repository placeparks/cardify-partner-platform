import sharp from "sharp"
import { checked, digest } from "@/lib/partner-api"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { safeRequest } from "@/lib/safe-download"

// Shared by the scheduled worker and authenticated production requests. Never
// fetch client artwork until a live manufacturing order has recorded payment.
export async function ingestArtwork(cartId: string, deadline = Date.now() + 20000) {
  const result = { ingested: 0, failures: 0 }
  const order = checked(await db.from("partner_manufacturing_orders")
    .select("status,mode,partner:partnership_requests(api_blocked_at)").eq("cart_id",cartId).maybeSingle())
  if (!order || order.mode !== "live" || order.status !== "paid" || (order.partner as any)?.api_blocked_at) return result
  const now = new Date().toISOString()
  const files = checked(await db.from("partner_artwork").select("*").eq("cart_id",cartId)
    .eq("state","pending").lte("next_attempt_at",now).order("item_index").limit(4)) || []
  for (const file of files) {
    if (Date.now() >= deadline) break
    try {
      const blocks = checked(await db.from("partner_content_blocks").select("sha256").eq("sha256",file.expected_sha256)) || []
      if (blocks.length) {
        checked(await db.rpc("partner_enforce",{p_target:"cart",p_id:cartId,p_reason:"Submitted file is blocked",p_actor:"maintenance"}))
        break
      }
      const downloaded = await safeRequest(file.source_url)
      if (downloaded.status !== 200) throw new Error("image_unreachable")
      const sha256 = digest(downloaded.bytes)
      if (sha256 !== file.expected_sha256) throw new Error("image_hash_mismatch")
      const metadata = await sharp(downloaded.bytes, {limitInputPixels:40_000_000}).metadata()
      if (!["png","jpeg"].includes(metadata.format || "") || !metadata.width || !metadata.height || (metadata.pages || 1) !== 1) throw new Error("image_invalid")
      if (metadata.width < Number(process.env.PARTNER_MIN_IMAGE_WIDTH || 1) || metadata.height < Number(process.env.PARTNER_MIN_IMAGE_HEIGHT || 1)) throw new Error("image_dimensions_invalid")
      await sharp(downloaded.bytes, {limitInputPixels:40_000_000}).stats()
      const path = `${file.cart_id}/${file.id}`
      checked(await db.storage.from("partner-artwork").upload(path,downloaded.bytes,{contentType:metadata.format === "png" ? "image/png" : "image/jpeg",upsert:true}))
      checked(await db.from("partner_artwork").update({storage_path:path,actual_sha256:sha256,state:"stored",received_at:now,source_url:null,last_error:null})
        .eq("id",file.id).eq("state","pending"))
      result.ingested++
    } catch (error) {
      result.failures++
      const code = error instanceof Error && ["image_unreachable","image_hash_mismatch","image_invalid","image_dimensions_invalid"].includes(error.message) ? error.message : "ingestion_failed"
      const attempts = file.ingestion_attempts + 1
      checked(await db.from("partner_artwork").update({ingestion_attempts:attempts,last_error:code,next_attempt_at:new Date(Date.now()+Math.min(86400,60*2**attempts)*1000).toISOString()}).eq("id",file.id).eq("state","pending"))
      checked(await db.from("partner_audit_events").insert({entity_type:"artwork",entity_id:file.id,action:"ingestion_failed",actor:"maintenance",details:{cart_id:file.cart_id,code,attempts}}))
      if (attempts >= 12) checked(await db.rpc("partner_enforce",{p_target:"cart",p_id:file.cart_id,p_reason:`Artwork ingestion failed: ${code}`,p_actor:"maintenance"}))
    }
  }
  return result
}
