import { NextResponse } from "next/server"
import { api, checked, digest, internalAuth, json } from "@/lib/partner-api"
import { ApiError } from "@/lib/manufacturing-contract"
import { supabaseAdmin as db } from "@/lib/supabase-admin"

// Admin order previews only. Payment/production still use the production route.
export async function POST(request: Request) { return api(async () => {
  internalAuth(request)
  const body = await json(request)
  if (!/^cart_[a-f0-9]{64}$/.test(body.cart_id || "")) throw new ApiError(400,"invalid_request","Valid cart required")
  const hex = digest(`tcgplaytest:${body.cart_id}`)
  const orderId = `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`
  if (body.order_id !== orderId) throw new ApiError(404,"not_found","Cart does not belong to this order")
  const cart = checked(await db.from("partner_carts").select("*,partner:partnership_requests(status,api_blocked_at)").eq("id",body.cart_id).maybeSingle())
  if (!cart || cart.mode !== "live") throw new ApiError(404,"not_found","Partner cart not found")
  if (cart.status !== "open" || Date.parse(cart.expires_at) <= Date.now() || cart.partner?.status !== "approved" || cart.partner?.api_blocked_at || cart.order_id) throw new ApiError(409,"preview_unavailable","Cart is expired, unavailable, or already converted")
  const files = checked(await db.from("partner_artwork").select("*").eq("cart_id",cart.id).order("item_index")) || []
  const hashes = files.flatMap((f:any)=>[f.actual_sha256,f.expected_sha256]).filter(Boolean)
  const blocks = hashes.length ? checked(await db.from("partner_content_blocks").select("sha256").in("sha256",hashes)) || [] : []
  if (blocks.length || files.some((f:any)=>f.state === "blocked")) throw new ApiError(403,"content_blocked","Artwork is blocked")
  const previewReady = cart.validation_total > 0 && cart.validation_done === cart.validation_total && files.length > 0 && files.every((f:any)=>f.state === "stored" && !f.deleted_at && f.actual_sha256 && f.storage_path === `carts/${cart.id}/${f.actual_sha256}`)
  const headers = {"Cache-Control":"private, no-store"}
  if (body.include_urls === false) return NextResponse.json({order_id:orderId,cart_id:cart.id,status:"pending",ready:false,preview_ready:previewReady,
    error:previewReady ? null : "This cart has no validated artwork available for preview. Older carts may need to be recreated.",
    files:files.map((f:any)=>({id:f.id,item_index:f.item_index,side:f.side,quantity:f.quantity,state:f.state,last_error:f.last_error}))},{headers})
  if (!previewReady) throw new ApiError(409,"artwork_not_ready","Validated artwork is not available for this cart")
  const file = files.find((f:any)=>f.id === body.file_id)
  if (!file) throw new ApiError(404,"not_found","File does not belong to this cart")
  const signed = checked(await db.storage.from("partner-artwork").createSignedUrl(file.storage_path,60))
  checked(await db.from("partner_audit_events").insert({partner_id:cart.partner_id,entity_type:"cart",entity_id:cart.id,action:"file_previewed",actor:typeof body.actor === "string" ? body.actor.slice(0,150) : "dashboard",details:{order_id:orderId,file_id:file.id}}))
  return NextResponse.json({files:[{id:file.id,url:signed!.signedUrl}]},{headers})
}) }
