import { NextResponse } from "next/server"
import { api, checked, digest, internalAuth, json } from "@/lib/partner-api"
import { ApiError, CUSTOMER_TERMS_VERSION } from "@/lib/manufacturing-contract"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
export async function POST(request: Request) { return api(async () => {
  internalAuth(request); const body = await json(request)
  const cart = checked(await db.from("partner_carts").select("*,partner:partnership_requests(status,api_blocked_at)").eq("checkout_token_hash", digest(String(body.token || ""))).maybeSingle())
  if (!cart || cart.mode !== "live") throw new ApiError(404,"not_found","Live cart not found")
  if (cart.status !== "open" || Date.parse(cart.expires_at) <= Date.now() || cart.partner.api_blocked_at || cart.partner.status !== "approved") throw new ApiError(409,"cart_unavailable","Cart is no longer available")
  const files = checked(await db.from("partner_artwork").select("item_index,side,quantity,state,expected_sha256,actual_sha256,storage_path,print_sha256").eq("cart_id",cart.id).order("item_index")) || []
  const hashes = files.flatMap((f:any)=>[f.actual_sha256,f.expected_sha256,f.print_sha256]).filter(Boolean)
  const blocks = hashes.length ? checked(await db.from("partner_content_blocks").select("sha256").in("sha256",hashes)) || [] : []
  if (files.some((f:any)=>f.state === "blocked") || blocks.length) throw new ApiError(403,"content_blocked","Artwork is blocked")
  if (!files.length || files.some((f:any)=>f.state !== "stored" || !f.storage_path)) throw new ApiError(409,"artwork_not_ready","Artwork has not passed validation")
  let acceptance = null
  if (body.acceptance !== undefined) {
    // Preserve the exact version for checkout pages already open during rollout.
    if (body.acceptance?.accepted !== true || ![CUSTOMER_TERMS_VERSION, "2026-10-04"].includes(body.acceptance?.terms_version) || typeof body.acceptance?.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.acceptance.email.trim()) || body.acceptance.email.length > 254) throw new ApiError(400,"rights_acceptance_required","Accept the current image-rights terms before payment")
    acceptance = checked(await db.rpc("partner_accept_checkout",{p_cart:cart.id,p_email:body.acceptance.email.trim(),p_version:body.acceptance.terms_version}))
  }
  // The commerce app receives counts only; production later signs these same files.
  return NextResponse.json({ id: cart.id, card_count: cart.card_count, affiliate_code: cart.affiliate_code, external_ref: cart.external_ref,
    expires_at: cart.expires_at, partner_id: cart.partner_id, warnings: cart.artwork_warnings || [],
    partner_terms_version: cart.partner_terms_version, partner_terms_accepted_at: cart.partner_terms_accepted_at,
    customer_terms_version: CUSTOMER_TERMS_VERSION, customer_acceptance: acceptance,
    items: files.filter((f:any)=>f.side === "front").map((f:any)=>({ id: `${cart.id}_${f.item_index}`, quantity: f.quantity, finish: "standard" })) }, { headers: { "Cache-Control": "no-store" } })
}) }
