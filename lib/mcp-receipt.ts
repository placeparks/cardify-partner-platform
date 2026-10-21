import { MCP_MAX_CARDS } from "../utils/mcpPricing"
import { createHash } from "node:crypto"
import { ApiError } from "./manufacturing-contract"

// Existing MCP preparations already carry this namespaced, server-generated key.
// Ordinary API/widget carts, including other customer-payment-only carts, keep
// their registered store return URL.
export function isMcpCart(cart: any) {
  return cart?.customer_payment_only === true && /^mcp:[a-f0-9]{64}$/.test(cart.idempotency_key || "")
    && cart.mode === "live" && cart.settlement === "hosted" && !cart.connect_account_id
}

// Only the authenticated MCP cart classification receives the higher limit.
export function cartCardLimit(cart: any, partnerLimit = 1000): number | null {
  return isMcpCart(cart) ? MCP_MAX_CARDS : partnerLimit
}

export function mcpReceiptUrl(cart: any): string | undefined {
  if (!isMcpCart(cart)) return undefined
  const url = new URL(cart.checkout_url)
  const token = url.pathname.match(/^\/partner-checkout\/([a-f0-9]{64})$/)?.[1]
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !token
    || createHash("sha256").update(token).digest("hex") !== cart.checkout_token_hash) {
    throw new Error("MCP confirmation link is unavailable")
  }
  return `${url.href}/success`
}

const unavailable = () => new ApiError(404, "receipt_unavailable", "This confirmation link is unavailable or expired")
const checked = (result: any): any => {
  if (result.error) throw new Error("Order confirmation could not be loaded")
  return result.data
}

export async function checkoutReceipt(db: any, body: any, now = Date.now()) {
  if (!/^[a-f0-9]{64}$/.test(body?.token || "")) throw unavailable()
  const cart = checked(await db.from("partner_carts")
    .select("id,partner_id,mode,status,settlement,connect_account_id,customer_payment_only,idempotency_key,expires_at,card_count,order_id,partner:partnership_requests(status,api_blocked_at)")
    .eq("checkout_token_hash", createHash("sha256").update(body.token).digest("hex")).maybeSingle())
  if (!cart || !isMcpCart(cart) || !/^cart_[a-f0-9]{64}$/.test(cart.id)
    || !["validating", "open", "converted", "cancelled"].includes(cart.status)
    || !Number.isFinite(Date.parse(cart.expires_at)) || Date.parse(cart.expires_at) <= now
    || !Number.isSafeInteger(cart.card_count) || cart.card_count < 1
    || cart.partner?.status !== "approved" || cart.partner?.api_blocked_at) throw unavailable()

  const base = { card_count: cart.card_count, expires_at: cart.expires_at }
  if (!cart.order_id) {
    if (cart.status === "converted") throw new Error("Order confirmation is still syncing")
    return { ...base, state: cart.status === "cancelled" ? "cancelled" : "pending", payment_recorded: false }
  }
  if (!/^[a-f0-9-]{36}$/.test(cart.order_id)) throw unavailable()
  const order = checked(await db.from("partner_manufacturing_orders")
    .select("id,status,created_at,updated_at")
    .eq("id", cart.order_id).eq("cart_id", cart.id).eq("partner_id", cart.partner_id).eq("mode", "live").maybeSingle())
  if (!order || !["paid", "in_production", "shipped", "cancelled"].includes(order.status)) throw unavailable()
  // partner_order_event requires a verified paid event before any other state.
  // A pending commerce order or a browser URL alone is never proof of payment.
  return {
    ...base, state: order.status === "cancelled" ? "cancelled" : "confirmed",
    payment_recorded: true, order_id: order.id, order_status: order.status,
    confirmed_at: order.created_at, updated_at: order.updated_at,
  }
}
