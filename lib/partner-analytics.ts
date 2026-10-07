import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { ApiError } from "@/lib/manufacturing-contract"

type Row = Record<string, any>
export function analyticsWindow(period = "30", mode = "live", now = new Date()) {
  if (!["all", "7", "30", "90", "365"].includes(period) || !["live", "test"].includes(mode)) {
    throw new ApiError(400, "invalid_request", "Choose a valid analytics period and mode.")
  }
  return { period, mode, until: now.toISOString(), since: period === "all" ? null : new Date(now.getTime() - Number(period) * 86400000).toISOString() }
}

// Fetch every page, even when the database has a lower configured row cap.
// Fail visibly instead of returning a plausible but truncated total.
async function readRows(table: string, columns: string, filters: (query: any) => any) {
  const rows: Row[] = [], deadline = Date.now() + 35000
  for (;;) {
    const { data, error, count } = await filters(db.from(table).select(columns, { count: "exact" }))
      .order("id").range(rows.length, rows.length + 999).abortSignal(AbortSignal.timeout(Math.max(1, deadline - Date.now())))
    if (error || count === null || !Array.isArray(data)) throw new Error(`Could not read ${table}`)
    rows.push(...data)
    if (rows.length >= count) return rows
    if (!data.length || Date.now() > deadline || rows.length > 250000) throw new Error("Analytics scan incomplete; choose a shorter period")
  }
}

export function emptyPartnerMetrics() {
  return { carts: 0, cardsSubmitted: 0, converted: 0, affiliateCarts: 0,
    integrations: { api: { carts: 0, converted: 0, productionOrders: 0 }, widget: { carts: 0, converted: 0, productionOrders: 0 }, unknown: { carts: 0, converted: 0, productionOrders: 0 } },
    cartStatuses: Object.create(null) as Record<string, number>, validationErrors: Object.create(null) as Record<string, number>,
    productionOrders: 0, productionStatuses: Object.create(null) as Record<string, number>,
    activeKeys: 0, webhookEvents: 0, webhooksDelivered: 0, webhooksPending: 0, webhooksExhausted: 0,
    firstCartAt: null as string | null, lastCartAt: null as string | null }
}
function integrationSource(cart?: Row | null): "api" | "widget" | "unknown" {
  // Credential presence records actual cart traffic. Merely issuing a key is not usage.
  if (cart?.widget_session_id && !cart.api_key_id) return "widget"
  if (cart?.api_key_id && !cart.widget_session_id) return "api"
  return "unknown"
}
export function summarizePartnerActivity(carts: Row[], orders: Row[], keys: Row[], webhooks: Row[], now: string) {
  const total = emptyPartnerMetrics(), partners: Record<string, ReturnType<typeof emptyPartnerMetrics>> = {}
  const targets = (id: string) => [total, partners[id] ||= emptyPartnerMetrics()]
  for (const cart of carts) for (const metrics of targets(cart.partner_id)) {
    const source = metrics.integrations[integrationSource(cart)]
    const status = ["open", "validating"].includes(cart.status) && Date.parse(cart.expires_at) <= Date.parse(now) ? "expired" : cart.status
    metrics.carts++; metrics.cardsSubmitted += Number(cart.card_count) || 0
    // A later cancellation or enforcement hold must not erase a paid conversion.
    metrics.converted += cart.order_id || cart.status === "converted" ? 1 : 0
    source.carts++; source.converted += cart.order_id || cart.status === "converted" ? 1 : 0
    metrics.affiliateCarts += cart.affiliate_code ? 1 : 0
    metrics.cartStatuses[status] = (metrics.cartStatuses[status] || 0) + 1
    for (const error of Array.isArray(cart.validation_errors) ? cart.validation_errors : []) {
      const code = typeof error.code === "string" ? error.code : "unknown"
      metrics.validationErrors[code] = (metrics.validationErrors[code] || 0) + 1
    }
    if (!metrics.firstCartAt || cart.created_at < metrics.firstCartAt) metrics.firstCartAt = cart.created_at
    if (!metrics.lastCartAt || cart.created_at > metrics.lastCartAt) metrics.lastCartAt = cart.created_at
  }
  for (const order of orders) for (const metrics of targets(order.partner_id)) {
    metrics.productionOrders++
    metrics.integrations[integrationSource(order.cart)].productionOrders++
    metrics.productionStatuses[order.status] = (metrics.productionStatuses[order.status] || 0) + 1
  }
  for (const key of keys) for (const metrics of targets(key.partner_id)) metrics.activeKeys++
  for (const event of webhooks) for (const metrics of targets(event.partner_id)) {
    metrics.webhookEvents++
    if (event.delivered_at) metrics.webhooksDelivered++
    else if (event.attempts >= 12) metrics.webhooksExhausted++
    else metrics.webhooksPending++
  }
  return { total, partners }
}

export async function partnerAnalytics(period?: string, mode?: string) {
  const window = analyticsWindow(period, mode)
  const inPeriod = (query: any) => {
    query = query.eq("mode", window.mode).lte("created_at", window.until)
    return window.since ? query.gte("created_at", window.since) : query
  }
  const [carts, orders, keys, webhooks] = await Promise.all([
    readRows("partner_carts", "id,partner_id,api_key_id,widget_session_id,status,order_id,card_count,affiliate_code,validation_errors,created_at,expires_at", inPeriod),
    // Join the order's cart even when that cart predates the selected order period.
    readRows("partner_manufacturing_orders", "id,partner_id,status,cart:partner_carts!partner_manufacturing_orders_cart_id_fkey(api_key_id,widget_session_id)", inPeriod),
    readRows("partner_api_keys", "id,partner_id", q => q.eq("mode", window.mode).is("revoked_at", null)),
    readRows("partner_webhook_events", "id,partner_id,attempts,delivered_at", inPeriod),
  ])
  return { window, ...summarizePartnerActivity(carts, orders, keys, webhooks, window.until) }
}
