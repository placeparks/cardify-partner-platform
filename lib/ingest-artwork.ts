import sharp, { type Metadata } from "sharp"
import { checked, digest } from "@/lib/partner-api"
import { ApiError } from "@/lib/manufacturing-contract"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { safeRequest } from "@/lib/safe-download"

export async function preflight(bytes: Buffer) {
  if (bytes.length>20*1024*1024) throw new ApiError(422,"image_too_large","Image exceeds 20 MiB")
  let metadata: Metadata
  try { metadata=await sharp(bytes,{limitInputPixels:false}).metadata() }
  catch { throw new ApiError(422,"image_invalid","Invalid image") }
  if (!["png","jpeg"].includes(metadata.format||"") || !metadata.width || !metadata.height || (metadata.pages||1)!==1) throw new ApiError(422,"image_invalid","Single-frame PNG/JPEG required")
  if (metadata.width*metadata.height>40_000_000) throw new ApiError(422,"image_pixels_exceeded","Image exceeds 40 MP")
  if (metadata.width<Number(process.env.PARTNER_MIN_IMAGE_WIDTH||744) || metadata.height<Number(process.env.PARTNER_MIN_IMAGE_HEIGHT||1040)) throw new ApiError(422,"image_dimensions_invalid","Image dimensions below minimum")
  try { await sharp(bytes,{limitInputPixels:40_000_000,failOn:"warning"}).stats() }
  catch { throw new ApiError(422,"image_invalid","Image could not be fully decoded") }
  return {sha256:digest(bytes),contentType:metadata.format==="png"?"image/png":"image/jpeg"}
}

// Only a separately scheduled queue worker calls this. No downloads in cart,
// checkout, payment or print handlers. URL deduplication is scoped to one cart.
export async function validateQueuedArtwork(deadline=Date.now()+40000) {
  const result={checked:0,failures:0}
  while (Date.now()+20000<deadline) {
    const [job]=checked(await db.rpc("partner_claim_validation"))||[]
    if (!job) break
    let errorCode:string|null=null
    try {
      if (job.attempts>3) throw new ApiError(422,"validation_unavailable","Worker retry limit reached")
      let bytes:Buffer|undefined
      if (job.storage_path) {
        const saved=await db.storage.from("partner-artwork").download(job.storage_path)
        if (saved.data) bytes=Buffer.from(await saved.data.arrayBuffer())
      }
      if (!bytes) {
        const download=await safeRequest(job.source_url,{maxRedirects:3})
        if (download.status!==200) throw new ApiError(422,"image_unreachable","Image URL did not return 200")
        bytes=download.bytes
      }
      const file=await preflight(bytes)
      if (!checked(await db.rpc("partner_reserve_validation",{p_job:job.id,p_lease:job.lease_token,p_hash:file.sha256,p_type:file.contentType}))) continue
      const blocked=checked(await db.from("partner_content_blocks").select("sha256").eq("sha256",file.sha256))||[]
      if (blocked.length) throw new ApiError(422,"content_blocked","Artwork blocked")
      const path=`carts/${job.cart_id}/${file.sha256}`
      const upload=await db.storage.from("partner-artwork").upload(path,bytes,{contentType:file.contentType,upsert:false})
      // Identical bytes from another URL in this same cart may already exist.
      // Never overwrite or reuse any other cart's object.
      if (upload.error) {
        const existing=checked(await db.storage.from("partner-artwork").download(path))
        if (!existing || digest(Buffer.from(await existing.arrayBuffer()))!==file.sha256) throw new Error("Storage unavailable")
      }
    } catch (error) { result.failures++;errorCode=error instanceof ApiError ? error.code : "validation_unavailable" }
    checked(await db.rpc("partner_finish_validation",{p_job:job.id,p_lease:job.lease_token,p_error:errorCode}))
    result.checked++
  }
  return result
}
