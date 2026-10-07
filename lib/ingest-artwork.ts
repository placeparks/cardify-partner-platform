import sharp, { type Metadata } from "sharp"
import { checked, digest } from "@/lib/partner-api"
import { ApiError } from "@/lib/manufacturing-contract"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { safeRequest } from "@/lib/safe-download"
import { preparePrintArtwork, PRINT_PROCESSING_VERSION } from "@/lib/print-bleed"

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

async function storeCheckedFile(path: string, bytes: Buffer, file: {sha256:string;contentType:string}) {
  const upload=await db.storage.from("partner-artwork").upload(path,bytes,{contentType:file.contentType,upsert:false})
  if (upload.error) {
    const existing=checked(await db.storage.from("partner-artwork").download(path))
    if (!existing || digest(Buffer.from(await existing.arrayBuffer()))!==file.sha256) throw new Error("Storage unavailable")
  }
}

// Called after a new cart response and by the scheduled recovery worker.
// Cart responses never wait for downloads. URL deduplication is cart-scoped.
export async function validateQueuedArtwork(deadline=Date.now()+40000) {
  const result={checked:0,failures:0}
  let stopped=false
  async function worker() {
    try {
      while (!stopped && Date.now()+20000<deadline) {
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
          await storeCheckedFile(path,bytes,file)
          // Keep the source hash for optional client SHA verification and takedowns.
          // The separately tracked output is what the dashboard and production read.
          let printBytes:Buffer|undefined
          if (job.print_version===PRINT_PROCESSING_VERSION && job.print_storage_path && job.print_sha256) {
            const saved=await db.storage.from("partner-artwork").download(job.print_storage_path)
            if (saved.data) {
              const candidate=Buffer.from(await saved.data.arrayBuffer())
              if (digest(candidate)===job.print_sha256) printBytes=candidate
            }
          }
          printBytes ||= await preparePrintArtwork(bytes)
          const printFile=await preflight(printBytes)
          const printBlocked=checked(await db.from("partner_content_blocks").select("sha256").eq("sha256",printFile.sha256))||[]
          if (printBlocked.length) throw new ApiError(422,"content_blocked","Prepared artwork blocked")
          if (!checked(await db.rpc("partner_reserve_print_artwork",{p_job:job.id,p_lease:job.lease_token,p_hash:printFile.sha256,p_version:PRINT_PROCESSING_VERSION}))) continue
          if (printFile.sha256!==file.sha256) await storeCheckedFile(`carts/${job.cart_id}/${printFile.sha256}`,printBytes,printFile)
        } catch (error) { result.failures++;errorCode=error instanceof ApiError ? error.code : "validation_unavailable" }
        checked(await db.rpc("partner_finish_validation",{p_job:job.id,p_lease:job.lease_token,p_error:errorCode}))
        result.checked++
      }
    } catch (error) {
      stopped=true
      throw error
    }
  }
  // Claims are leased atomically by the database. Limit decoding/bleed work to
  // two jobs to bound memory for large images, and retain the deadline buffer.
  // Drain already claimed jobs even if another worker hits a database failure.
  const outcomes=await Promise.allSettled([worker(),worker()])
  for (const outcome of outcomes) if (outcome.status==="rejected") throw outcome.reason
  return result
}
