import { isMcpCart, cartCardLimit } from '@/lib/mcp-receipt'
import { NextResponse } from "next/server"
import { api, checked, digest, internalAuth, json } from "@/lib/partner-api"
import { ApiError, CUSTOMER_TERMS_VERSION } from "@/lib/manufacturing-contract"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { checkoutBranding } from "@/lib/checkout-branding"
import { partnerReturnUrl } from "@/lib/manufacturing-contract"
export async function POST(request: Request) {
  const suppliedId = request.headers.get('X-TCGP-Checkout-Request-Id') || ''
  const requestId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(suppliedId)
    ? suppliedId : crypto.randomUUID()
  let reason = 'internal_auth_failed'
  let cartId: string | undefined, partnerId: string | undefined
  let databaseErrorCode: string | undefined, databaseStatus: number | undefined
  const checkedCheckout = <T,>(result: { data: T; error: any; status?: number }): T => {
    if (result.error) {
      // SQLSTATE/PostgREST codes and HTTP status are safe; raw messages, details,
      // hints and query bodies can contain customer data or private capabilities.
      const code = result.error.code
      if (typeof code === 'string' && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(code)) databaseErrorCode = code
      if (Number.isInteger(result.status) && result.status! >= 100 && result.status! <= 599) databaseStatus = result.status
    }
    return checked(result)
  }
  const fail = (status: number, code: string, message: string, cause: string): never => {
    reason = cause
    throw new ApiError(status, code, message)
  }
  const response = await api(async () => {
  const configuredSecret = process.env.PARTNER_INTERNAL_SECRET
  if (!configuredSecret) reason = 'internal_secret_missing'
  else if (configuredSecret.length < 32) reason = 'internal_secret_invalid'
  internalAuth(request)
  reason = 'invalid_request'
  const body = await json(request)
  if (!body || typeof body !== 'object' || !/^[a-f0-9]{64}$/.test(body.token || '')) {
    fail(400, 'invalid_request', 'A checkout token is required.', 'invalid_checkout_token')
  }
  reason = 'cart_lookup_failed'
  const cart = checkedCheckout(await db.from("partner_carts").select("*,partner:partnership_requests(status,api_blocked_at,checkout_branding,website_url,widget_allowed_origins)").eq("checkout_token_hash", digest(String(body.token || ""))).maybeSingle())
  if (!cart) fail(404, 'not_found', 'Live cart not found', 'cart_not_found')
  cartId = cart.id; partnerId = cart.partner_id
  if (cart.mode !== 'live') fail(404, 'not_found', 'Live cart not found', 'cart_not_live')
  if (cart.settlement === 'prepaid') fail(409,'prepaid_cart','This cart is funded through the partner prepaid API, not customer checkout.', 'prepaid_cart')
  const unavailable = (cause: string) => fail(409, 'cart_unavailable', 'Cart is no longer available', cause)
  if (!cart.partner) unavailable('partner_missing')
  if (cart.partner.api_blocked_at) unavailable('partner_blocked')
  if (cart.partner.status !== 'approved') unavailable('partner_not_approved')
  if (!Number.isFinite(Date.parse(cart.expires_at))) unavailable('cart_expiry_invalid')
  if (Date.parse(cart.expires_at) <= Date.now()) unavailable('cart_expired')
  if (cart.status !== 'open') unavailable('cart_not_open')
  reason = 'artwork_lookup_failed'
  if (!Number.isSafeInteger(cart.card_count) || cart.card_count < 1) unavailable('cart_quantity_invalid')
  if (isMcpCart(cart) && cart.card_count > cartCardLimit(cart)!) unavailable('cart_quantity_invalid')
  const files: any[] = []
  // Read all designs below PostgREST's row cap, including large MCP orders.
  for (let offset = 0; offset < cart.card_count * 2; offset += 500) {
    const batch = checkedCheckout(await db.from("partner_artwork").select("item_index,side,quantity,state,expected_sha256,actual_sha256,storage_path,print_sha256")
      .eq("cart_id",cart.id).order("item_index").order("side").range(offset, Math.min(offset + 499, cart.card_count * 2 - 1))) || []
    files.push(...batch)
    if (batch.length < 500) break
  }
  const hashes = Array.from(new Set<string>(files.flatMap((f:any)=>[f.actual_sha256,f.expected_sha256,f.print_sha256]).filter(Boolean)))
  reason = 'content_block_lookup_failed'
  const blocks: any[] = []
  // Keep URL-encoded hash filters small even when an order has many designs.
  for (let offset = 0; offset < hashes.length; offset += 50) {
    blocks.push(...(checkedCheckout(await db.from("partner_content_blocks").select("sha256").in("sha256",hashes.slice(offset, offset + 50))) || []))
  }
  if (files.some((f:any)=>f.state === "blocked") || blocks.length) fail(403,"content_blocked","Artwork is blocked",'content_blocked')
  if (!files.length) fail(409,"artwork_not_ready","Artwork has not passed validation",'artwork_missing')
  if (files.some((f:any)=>f.state !== "stored" || !f.storage_path)) fail(409,"artwork_not_ready","Artwork has not passed validation",'artwork_not_ready')
  const fronts = files.filter((f:any)=>f.side === "front")
  if (fronts.some((f:any)=>!Number.isSafeInteger(f.quantity) || f.quantity < 1)
    || fronts.reduce((sum:number,f:any)=>sum+f.quantity,0) !== cart.card_count) {
    fail(409,"artwork_not_ready","Artwork quantities do not match this cart",'artwork_quantity_mismatch')
  }
  let acceptance = null
  if (body.acceptance !== undefined) {
    // Preserve the exact version for checkout pages already open during rollout.
    if (body.acceptance?.accepted !== true || ![CUSTOMER_TERMS_VERSION, "2026-10-04"].includes(body.acceptance?.terms_version) || typeof body.acceptance?.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.acceptance.email.trim()) || body.acceptance.email.length > 254) fail(400,"rights_acceptance_required","Accept the current image-rights terms before payment",'rights_acceptance_required')
    reason = 'acceptance_save_failed'
    acceptance = checkedCheckout(await db.rpc("partner_accept_checkout",{p_cart:cart.id,p_email:body.acceptance.email.trim(),p_version:body.acceptance.terms_version}))
  }
  let partnerWebsite = null
  try { partnerWebsite = partnerReturnUrl(undefined, cart.partner.website_url) } catch {}
  reason = 'checkout_response_failed'
  // The commerce app receives counts and validated branding, never artwork credentials.
  return NextResponse.json({ id: cart.id, pricing_channel: isMcpCart(cart) ? 'mcp' : 'partner', card_count: cart.card_count, affiliate_code: cart.affiliate_code, external_ref: cart.external_ref,
    connect_retail_cents: cart.connect_retail_cents ?? null, connect_payment_mode: cart.connect_payment_mode ?? null,
    expires_at: cart.expires_at, partner_id: cart.partner_id, warnings: cart.artwork_warnings || [],
    branding: checkoutBranding(cart.partner.checkout_branding), partner_website: partnerWebsite,
    checkout_frame_origins: [partnerWebsite, ...(cart.partner.widget_allowed_origins || [])].filter(Boolean),
    partner_terms_version: cart.partner_terms_version, partner_terms_accepted_at: cart.partner_terms_accepted_at,
    customer_terms_version: CUSTOMER_TERMS_VERSION, customer_acceptance: acceptance,
    items: files.filter((f:any)=>f.side === "front").map((f:any)=>({ id: `${cart.id}_${f.item_index}`, quantity: f.quantity, finish: "standard" })) }, { headers: { "Cache-Control": "no-store" } })
  })
  response.headers.set('X-TCGP-Checkout-Request-Id', requestId)
  response.headers.set('Cache-Control', 'no-store')
  if (!response.ok) {
    const log = response.status >= 500 ? console.error : console.warn
    log(JSON.stringify({ event: 'partner_checkout_rejected', request_id: requestId,
      reason, status: response.status, ...(cartId ? { cart_id: cartId } : {}), ...(partnerId ? { partner_id: partnerId } : {}),
      ...(databaseErrorCode ? { database_error_code: databaseErrorCode } : {}),
      ...(databaseStatus ? { database_status: databaseStatus } : {}) }))
    response.headers.set('X-TCGP-Checkout-Reason', reason)
  }
  return response
}
