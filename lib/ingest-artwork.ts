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
  // Decode every pixel to reject truncated/corrupt files. Statistics also did
  // expensive entropy, sharpness and channel analysis that checkout never uses.
  try { await sharp(bytes,{limitInputPixels:40_000_000,failOn:"warning"}).raw().toBuffer() }
  catch { throw new ApiError(422,"image_invalid","Image could not be fully decoded") }
  const recommendedWidth=Number(process.env.PARTNER_MIN_IMAGE_WIDTH)||744, recommendedHeight=Number(process.env.PARTNER_MIN_IMAGE_HEIGHT)||1040
  const warning=metadata.width<recommendedWidth || metadata.height<recommendedHeight
    ? {code:"image_low_resolution",width:metadata.width,height:metadata.height,recommended_width:recommendedWidth,recommended_height:recommendedHeight,message:"Low-resolution artwork may print blurry or pixelated. You can still order it."} : null
  return {sha256:digest(bytes),contentType:metadata.format==="png"?"image/png":"image/jpeg",warning}
}

async function storeCheckedFile(path: string, bytes: Buffer, file: {sha256:string;contentType:string}) {
  const upload=await db.storage.from("partner-artwork").upload(path,bytes,{contentType:file.contentType,upsert:false})
  if (upload.error) {
    const existing=checked(await db.storage.from("partner-artwork").download(path))
    if (!existing || digest(Buffer.from(await existing.arrayBuffer()))!==file.sha256) throw new Error("Storage unavailable")
  }
}

export async function downloadArtworkSource(source: string) {
  const url = new URL(source)
  const origins = [process.env.NEXT_PUBLIC_TCGPLAYTEST_APP_URL, process.env.NEXT_PUBLIC_CARDIFY_APP_URL,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
    .flatMap(value => { try { const parsed = new URL(value!); return parsed.protocol === "https:" ? [parsed.origin] : [] } catch { return [] } })
  if (url.protocol === "https:" && !url.username && !url.password && !url.hash && origins.includes(url.origin)
    && ["/v1/uploads/source", "/api/widget/source"].includes(url.pathname)) {
    // Run the exact same source authorization locally, avoiding an HTTPS trip
    // back into our own deployment. Never shortcut arbitrary external URLs or
    // bypass grant signatures, revocation, expiry, terms or widget ownership.
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const resolveSource = async () => url.pathname === "/v1/uploads/source"
        ? (await import("@/lib/partner-uploads")).uploadSource(new Request(source))
        : (await import("@/lib/widget-session")).widgetSource(new Request(source))
      const download = async () => {
        const response = await resolveSource()
        const location = response.headers.get("Location")
        if (response.status !== 307 || !location) throw new ApiError(422, "image_unreachable", "Artwork source unavailable")
        // Keep the bounded downloader, DNS checks and total redirect allowance.
        return safeRequest(location, { maxRedirects: 2 })
      }
      return await Promise.race([download(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ApiError(422, "image_timeout", "Artwork source timed out")), 15000)
      })])
    } finally { clearTimeout(timer) }
  }
  return safeRequest(source, { maxRedirects: 3 })
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
            const download=await downloadArtworkSource(job.source_url)
            if (download.status!==200) throw new ApiError(422,"image_unreachable","Image URL did not return 200")
            bytes=download.bytes
          }
          const file=await preflight(bytes)
          if (!checked(await db.rpc("partner_reserve_validation",{p_job:job.id,p_lease:job.lease_token,p_hash:file.sha256,p_type:file.contentType}))) continue
          const [qualityResult,blockResult]=await Promise.all([
            db.rpc("partner_record_artwork_quality",{p_job:job.id,p_lease:job.lease_token,p_warning:file.warning}),
            db.from("partner_content_blocks").select("sha256").eq("sha256",file.sha256),
          ])
          if (!checked(qualityResult)) continue
          const blocked=checked(blockResult)||[]
          if (blocked.length) throw new ApiError(422,"content_blocked","Artwork blocked")
          const path=`carts/${job.cart_id}/${file.sha256}`
          // Keep the source hash for optional client SHA verification and takedowns.
          // The separately tracked output is what the dashboard and production read.
          const sourceBytes=bytes
          // Drain both operations before finishing/retrying the lease, even if
          // either fails. Storage can run while the CPU prepares the bleed.
          const [stored,prepared]=await Promise.allSettled([
            storeCheckedFile(path,sourceBytes,file),
            (async()=>{
              let printBytes:Buffer|undefined
              if (job.print_version===PRINT_PROCESSING_VERSION && job.print_storage_path && job.print_sha256) {
                const saved=await db.storage.from("partner-artwork").download(job.print_storage_path)
                if (saved.data) {
                  const candidate=Buffer.from(await saved.data.arrayBuffer())
                  if (digest(candidate)===job.print_sha256) printBytes=candidate
                }
              }
              printBytes ||= await preparePrintArtwork(sourceBytes)
              // Existing 2 mm artwork is returned unchanged, so its exact bytes
              // have already passed full decoding, size, format and hash checks.
              const printFile=printBytes===sourceBytes?file:await preflight(printBytes)
              return {printBytes,printFile}
            })(),
          ])
          if (stored.status==="rejected") throw stored.reason
          if (prepared.status==="rejected") throw prepared.reason
          const {printBytes,printFile}=prepared.value
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
