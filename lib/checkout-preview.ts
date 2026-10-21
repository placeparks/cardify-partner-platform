import { isMcpCart } from './mcp-receipt'
import { createHash } from "node:crypto"
import { ApiError } from "./manufacturing-contract"

const PAGE_SIZE = 6
const checked = (result: any): any => {
  if (result.error) throw new Error("Preview could not be loaded")
  return result.data
}
const unavailable = () => new ApiError(409, "preview_unavailable", "This preview is no longer available")

// Accept only the checkout capability, never an arbitrary cart ID or storage path.
// Kept separate from the route so authorization and storage isolation are testable.
export async function checkoutPreview(db: any, body: any, now = Date.now()) {
  if (!/^[a-f0-9]{64}$/.test(body?.token || "") || !Number.isInteger(body?.page ?? 1)
    || (body.page ?? 1) < 1 || (body.page ?? 1) > 167) {
    throw new ApiError(400, "invalid_request", "Valid preview token and page required")
  }
  const cart = checked(await db.from("partner_carts")
    .select("id,mode,status,settlement,customer_payment_only,idempotency_key,connect_account_id,expires_at,card_count,artwork_warnings,partner:partnership_requests(status,api_blocked_at)")
    .eq("checkout_token_hash", createHash("sha256").update(body.token).digest("hex")).maybeSingle())
  if (!cart || !/^cart_[a-f0-9]{64}$/.test(cart.id) || cart.mode !== "live"
    || cart.status !== "open" || cart.settlement === "prepaid"
    || !Number.isFinite(Date.parse(cart.expires_at)) || Date.parse(cart.expires_at) <= now
    || cart.partner?.status !== "approved" || cart.partner?.api_blocked_at) throw unavailable()

  // A 1,000-card cart can contain 2,000 sides. Fetch bounded pages below the
  // default PostgREST row cap; range(0,1999) alone would still be truncated.
  // No customer, payment or source URL data is read.
  const files: any[] = []
  for (let offset = 0; offset < 2000; offset += 500) {
    const batch = checked(await db.from("partner_artwork")
      .select("item_index,side,quantity,state,deleted_at,storage_path,actual_sha256,expected_sha256,print_storage_path,print_sha256")
      .eq("cart_id", cart.id).order("item_index").order("side").range(offset, offset + 499)) || []
    files.push(...batch)
    if (batch.length < 500) break
  }
  if (!files.length || files.some((f: any) => f.state !== "stored" || f.deleted_at)) throw unavailable()
  const designs = new Map<number, { item_index: number; quantity: number; front?: any; back?: any }>()
  for (const file of files) {
    if (!Number.isInteger(file.item_index) || file.item_index < 0 || !["front", "back"].includes(file.side)
      || !Number.isInteger(file.quantity) || file.quantity < 1 || file.quantity > 1000) throw unavailable()
    const design = designs.get(file.item_index) || { item_index: file.item_index, quantity: file.quantity }
    if (design.quantity !== file.quantity || (design as any)[file.side]) throw unavailable()
    ;(design as any)[file.side] = file
    designs.set(file.item_index, design)
  }
  const all = Array.from(designs.values()).sort((a, b) => a.item_index - b.item_index)
  if (all.some(d => !d.front || !d.back) || all.reduce((n, d) => n + d.quantity, 0) !== cart.card_count
    || cart.card_count > 1000) throw unavailable()
  const pages = Math.ceil(all.length / PAGE_SIZE), page = body.page ?? 1
  if (page > pages) throw new ApiError(404, "page_not_found", "Preview page not found")
  const selected = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const sides = selected.flatMap(d => [d.front, d.back])
  const hashes = Array.from(new Set(sides.flatMap(f => [f.actual_sha256, f.expected_sha256, f.print_sha256]).filter(Boolean)))
  const blocks = hashes.length ? checked(await db.from("partner_content_blocks").select("sha256").in("sha256", hashes)) || [] : []
  if (blocks.length) throw new ApiError(403, "content_blocked", "Artwork is blocked")

  const paths = sides.map(f => {
    const path = f.print_storage_path || f.storage_path
    const hash = f.print_storage_path ? f.print_sha256 : f.actual_sha256
    if (!/^[a-f0-9]{64}$/.test(hash || "") || path !== `carts/${cart.id}/${hash}`) throw unavailable()
    return path as string
  })
  const ttl = Math.min(900, Math.floor((Date.parse(cart.expires_at) - now) / 1000))
  if (ttl < 1) throw unavailable()
  const signed = checked(await db.storage.from("partner-artwork").createSignedUrls(Array.from(new Set(paths)), ttl)) || []
  const urls = new Map<string, string>()
  for (const entry of signed) {
    if (entry.error || !paths.includes(entry.path)) throw unavailable()
    const url = new URL(entry.signedUrl)
    if (url.protocol !== "https:" || url.username || url.password) throw unavailable()
    urls.set(entry.path, url.href)
  }
  const side = (file: any) => {
    const url = urls.get(file.print_storage_path || file.storage_path)
    if (!url) throw unavailable()
    // The validation worker normalizes prepared print files to 2 mm bleed.
    // Legacy files without a prepared print path are shown uncropped.
    return { url, trimmed: !!file.print_storage_path }
  }
  return {
    card_count: cart.card_count, pricing_channel: isMcpCart(cart) ? 'mcp' : 'partner', design_count: all.length, page, pages,
    expires_at: cart.expires_at,
    images_expire_at: new Date(now + ttl * 1000).toISOString(),
    items: selected.map(d => ({ item_index: d.item_index, quantity: d.quantity, front: side(d.front), back: side(d.back),
      low_resolution: (cart.artwork_warnings || []).some((w: any) => w.code === "image_low_resolution" && w.item_index === d.item_index) })),
  }
}
