import { TERMS_VERSION } from "./manufacturing-contract"
import { prepaidPaths, prepaidSchemas, prepaidLlms } from './prepaid-documentation'

// Public documentation uses the canonical partner API, including on preview hosts.
// Read deployment limits only; never import database clients or credentials.
export function documentationConfig() {
  const baseUrl = "https://partner.tcgplaytest.com"
  return {
    baseUrl,
    widgetSessionsPerHour: Number(process.env.WIDGET_SESSIONS_PER_HOUR || 60),
    widgetUploadsPerSession: Number(process.env.WIDGET_UPLOADS_PER_SESSION || 2000),
    widgetUploadsPerDay: Number(process.env.WIDGET_UPLOADS_PER_PARTNER_DAY || 10000),
    maxCards: Number(process.env.PARTNER_MAX_CARDS || 1000),
    rateLimit: Math.min(600, Math.max(1, Number(process.env.PARTNER_RATE_LIMIT || 60))),
    minWidth: Number(process.env.PARTNER_MIN_IMAGE_WIDTH || 744),
    minHeight: Number(process.env.PARTNER_MIN_IMAGE_HEIGHT || 1040),
    expiryHours: Number(process.env.PARTNER_CART_EXPIRY_HOURS || 168),
    retentionDays: Number(process.env.PARTNER_ARTWORK_RETENTION_DAYS || 30),
  }
}

export const validationErrors = [
  ["image_unreachable", "The image host could not be reached, the response was incomplete, or the final response was not HTTP 200."],
  ["image_url_unsafe", "The URL or redirect is not public IPv4 HTTPS; private/local destinations are blocked."],
  ["image_redirect_limit", "More than three redirects."],
  ["image_timeout", "The 15-second total download deadline was exceeded, including DNS, TLS, redirects and body reads."],
  ["image_too_large", "Source or prepared print image exceeds 20 MiB (20,971,520 bytes)."],
  ["image_invalid", "Not a fully decodable, single-frame PNG/JPEG."],
  ["image_pixels_exceeded", "Source or image including automatic bleed exceeds 40,000,000 pixels (width × height)."],
  ["image_hash_mismatch", "An optional supplied SHA-256 does not match the downloaded bytes."],
  ["content_blocked", "This artwork cannot be accepted."],
  ["validation_unavailable", "Validation/storage could not complete. Create a new cart or contact support."],
] as const

export const createCartExample = {
  external_ref: "store-order-1042",
  return_url: "https://shop.example/order-complete",
  items: [{ image_url: "https://images.example/front.png", back_image_url: "https://images.example/back.jpg", quantity: 3 }],
}
const cartId = `cart_${"a".repeat(64)}`
const orderId = "00000000-0000-4000-a000-000000000042"
export function documentationExamples(baseUrl: string) {
  const validating = {
    id: cartId, status: "validating", external_ref: "store-order-1042", card_count: 3,
    card_stock: "standard", affiliate_code: null, progress: { done: 0, total: 2 }, errors: [], warnings: [],
    partner_terms_version: TERMS_VERSION, mode: "test", order_id: null,
    expires_at: "2026-10-13T12:00:00.000Z", created_at: "2026-10-06T12:00:00.000Z",
  }
  const shipment = { carrier: "Example carrier", tracking_number: "TRACK-1042", tracking_url: "https://shipping.example/track/TRACK-1042" }
  return {
    validating,
    open: { ...validating, status: "open", progress: { done: 2, total: 2 }, checkout_url: `${baseUrl}/partner-checkout/${"b".repeat(64)}` },
    failed: { ...validating, status: "failed", progress: { done: 2, total: 2 }, errors: [
      { item_index: 0, side: "front", code: "image_invalid", message: "Image is not a readable PNG or JPEG." },
      { item_index: 0, side: "back", code: "image_unreachable", message: "Image could not be downloaded." },
    ] },
    order: { id: orderId, cart_id: cartId, status: "shipped", shipment,
      created_at: "2026-10-06T12:10:00.000Z", updated_at: "2026-10-08T15:00:00.000Z",
      external_ref: "store-order-1042", card_count: 3 },
    orderEvent: { id: `evt_${"c".repeat(32)}`, type: "order.shipped", created_at: "2026-10-08T15:00:00.000Z",
      data: { id: orderId, cart_id: cartId, external_ref: "store-order-1042", status: "shipped", shipment } },
    expiredEvent: { id: `evt_${"d".repeat(32)}`, type: "cart.expired", created_at: "2026-10-13T12:00:01.000Z",
      data: { id: cartId, external_ref: "store-order-1042", status: "expired" } },
  }
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const string = { type: "string" }
const nullableString = { type: ["string", "null"] }
const timestamp = { type: "string", format: "date-time", description: "RFC 3339 timestamp with timezone; UTC uses Z or +00:00. Fractional seconds may be present." }
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false })

export function buildOpenApi(config = documentationConfig()) {
  const e = documentationExamples(config.baseUrl)
  const imageUrl = { type: "string", format: "uri", maxLength: 2048, pattern: "^[Hh][Tt][Tt][Pp][Ss]://", description: "Use the image_url returned by POST /v1/uploads after its PUT succeeds, or your existing public IPv4 HTTPS image URL. At most 2048 UTF-16 code units; no credentials, fragment or port other than 443. Each redirect is rechecked. Must serve PNG/JPEG bytes without an Authorization header." }
  const hash = { type: ["string", "null"], pattern: "^[a-fA-F0-9]{64}$", description: "Optional SHA-256 of the exact downloaded bytes, not a perceptual hash. A mismatch fails this item/side. Omit or use null to let TCGPlaytest compute it." }
  const quantity = { type: "integer", minimum: 1, maximum: config.maxCards, description: `Number of copies. The sum of all item quantities must be at most ${config.maxCards}.` }
  const externalRef = { type: "string", maxLength: 200, description: "Optional partner reference, at most 200 UTF-16 code units. No format restriction; not a uniqueness or idempotency key. Omitted/empty input is returned as null." }
  const errors = (statuses: number[]) => Object.fromEntries(statuses.map(status => [String(status), {
    description: ({400:"Invalid request",401:"Invalid, revoked or unavailable API key",403:"Terms acceptance required or artwork blocked",404:"Not found for this partner and key mode",409:"Idempotency key reused with different instructions",413:"JSON body exceeds 512,000 bytes",429:"Rate limit exceeded",500:"Internal error",503:"Live checkout or deployment configuration unavailable"} as Record<number,string>)[status],
    ...(status === 429 ? { headers: { "Retry-After": { schema: { type: "integer", const: 60 }, description: "Wait 60 seconds before retrying." } } } : {}),
    content: { "application/json": { schema: ref("ApiError") } },
  }]))
  const cartResponse = (description: string, examples: Record<string, unknown>) => ({ description,
    headers: { "Retry-After": { schema: { type: "integer", const: 3 }, description: "Poll after at least 3 seconds." } },
    content: { "application/json": { schema: ref("Cart"), examples: Object.fromEntries(Object.entries(examples).map(([name,value]) => [name,{value}])) } },
  })
  const idParameter = (description: string) => ({ name: "id", in: "path", required: true, description, schema: string })
  const orderStatuses = ["paid", "in_production", "shipped", "cancelled", "blocked"]
  return {
    openapi: "3.1.0",
    info: { title: "TCGPlaytest Partner API", version: "1.1.0", description: `Public /v1 artwork API: optional direct upload → create → poll → redirect. Upload to TCGPlaytest-owned storage or supply existing HTTPS image URLs. Human setup at ${config.baseUrl}/dashboard is required: sign in, complete the partner application, accept current partner terms and create a key. Keys stay on your server. Do not send certification, affiliate_code or pricing fields. There is no finalize endpoint. Customers certify image rights at hosted checkout. This document revision does not change the /v1 path version.` },
    servers: [{ url: config.baseUrl, description: "API base for this partner platform deployment; use keys issued by this environment." }],
    externalDocs: { url: `${config.baseUrl}/docs`, description: "Setup, constraints, responsibilities and integration guide" },
    security: [{ PartnerApiKey: [] }],
    tags: [{ name: "Uploads" }, { name: "Carts" }, { name: "Orders" }, { name: "Widget" }, { name: 'Prepaid' }],
    paths: {
      ...Object.fromEntries(Object.entries(prepaidPaths).map(([path, methods]) => [path,
        Object.fromEntries(Object.entries(methods).map(([method, operation]) => [method, {
          ...operation,
          description: ('description' in operation ? operation.description + ' ' : '') +
            `Counts toward the shared ${config.rateLimit} requests per API key per minute, including quote polling, balance reads, reserve/release and retries. This is not a separate prepaid allowance. Poll quotes every five seconds or slower and budget across all concurrent orders. On 429, honor Retry-After; retry mutations with the same body and idempotency key where required. Only authenticated cart-status GETs are exempt.`,
        }]))
      ])),
      "/v1/estimate": { get: { operationId: "estimatePrinting", security: [], summary: "Estimate standard-card printing before uploading",
        description: "Amounts are USD cents. Shipping, tax and discounts are excluded. Checkout recalculates the final price. A temporary estimate failure never blocks cart creation.",
        parameters: [{name:"quantity",in:"query",required:true,schema:{type:"integer",minimum:1,maximum:1000}}],
        responses: {"200":{description:"Printing estimate",content:{"application/json":{schema:object({currency:{type:"string",const:"USD"},quantity:{type:"integer"},unit_amount:{type:"integer"},subtotal_amount:{type:"integer"},excludes:{type:"array",items:{type:"string"}}})}}},...errors([400,503])} } },
      "/api/widget/sessions": { post: {
        operationId: "startWidgetSession", tags: ["Widget"], security: [], summary: "Start a standalone widget session using a public partner code",
        description: `The browser Origin must match the registered website or an additional widget origin. Requires active partnership and current terms. No API key. Configured quota: ${config.widgetSessionsPerHour} new sessions per partner/hour (default 60). Token expires in one hour and authorizes only this session's uploads and one cart. Widget quotas are separate from the API-key rate limit.`,
        parameters: [{name:"Origin",in:"header",required:true,schema:{type:"string",format:"uri"}}],
        requestBody: {required:true,content:{"application/json":{schema:object({partner_key:{type:"string",pattern:"^partner_[a-f0-9]{24,32}$"},mode:{type:"string",enum:["test","live"]}})}}},
        responses: {"201":{description:"Customer-scoped token; never log or share it.",content:{"application/json":{schema:object({token:string,expires_at:timestamp,mode:{type:"string",enum:["test","live"]},max_cards:{type:"integer"},max_image_bytes:{type:"integer",const:20971520}})}}},...errors([400,403,413,429,500,503])},
      }},
      "/api/widget/uploads": { post: {
        operationId:"createWidgetUpload",tags:["Widget"],security:[{WidgetSession:[]}],summary:"Reserve a session-owned direct-storage upload",
        description:`Send Origin and the session bearer token. Reuse request_id for an identical retry. Returns a two-hour non-overwriting storage grant. PUT raw bytes with returned headers, without the widget token or cookies. Configured quotas: ${config.widgetUploadsPerSession} grants/session and ${config.widgetUploadsPerDay} grants/partner/rolling 24 hours (defaults 2,000 and 10,000). Each grant reserves a full 20 MiB. Front and back images each use a grant; reusing an uploaded image for copies does not create extra uploads. Operator environment overrides apply.`,
        requestBody:{required:true,content:{"application/json":{schema:object({request_id:{type:"string",format:"uuid"},content_type:{type:"string",enum:["image/png","image/jpeg"]},size:{type:"integer",minimum:1,maximum:20971520}})}}},
        responses:{"201":{description:"Upload the bytes before creating the cart.",content:{"application/json":{schema:object({id:{type:"string",format:"uuid"},upload_url:{type:"string",format:"uri"},method:{type:"string",const:"PUT"},headers:object({"Content-Type":{type:"string",enum:["image/png","image/jpeg"]}}),max_bytes:{type:"integer",const:20971520},upload_expires_at:timestamp})}}},...errors([400,401,403,409,413,429,500,503])},
      }},
      "/api/widget/cart": {
        post:{operationId:"createWidgetCart",tags:["Widget"],security:[{WidgetSession:[]}],summary:"Create this session's single cart",description:"Send Origin and session bearer token. Upload IDs must belong to this session. Identical retries reuse the cart; changed inputs need a new session. No Idempotency-Key header, API key, certification or affiliate_code field. Attribution and terms are set by the backend.",
          requestBody:{required:true,content:{"application/json":{schema:object({items:{type:"array",minItems:1,maxItems:config.maxCards,items:object({front_upload_id:{type:"string",format:"uuid"},back_upload_id:{type:"string",format:"uuid"},quantity},["front_upload_id","quantity"])},external_ref:externalRef},["items"])}}},
          responses:{"202":cartResponse("Queued for validation",{validating:e.validating}),"200":cartResponse("Existing cart",{open:e.open,failed:e.failed}),...errors([400,401,403,409,413,429,500,503])}},
        get:{operationId:"getWidgetCart",tags:["Widget"],security:[{WidgetSession:[]}],summary:"Poll only the session's cart",description:"Send Origin and session bearer token. No arbitrary cart ID parameter. Poll every 3–5 seconds; reads are exempt from upload/session quotas. Follow checkout_url only when open.",responses:{"200":cartResponse("Current cart",{validating:e.validating,open:e.open,failed:e.failed}),...errors([401,403,404,500])}},
      },
      "/v1/uploads": { post: {
        operationId: "createUpload", tags: ["Uploads"], summary: "Get a temporary direct-to-TCGPlaytest-storage upload link",
        description: `Send metadata only with your server-side API key. No partner storage account is needed. Counts toward the shared ${config.rateLimit}/minute/key limit. PUT raw file bytes to upload_url with the returned headers, without the API key or cookies. Wait for a successful 2xx PUT, then use image_url unchanged in a cart front/back field. No finalize call. Links cannot overwrite existing files. Test and live keys are supported; hosted test checkout remains a non-paying preview. Prepaid sandbox supports Stripe test payments only. Upload success is not artwork validation: the cart worker performs all checks. On an uncertain PUT outcome, request a new upload link and retry the file.`,
        requestBody: { required: true, content: { "application/json": { schema: ref("CreateUpload"), example: { content_type: "image/png", size: 123456 } } } },
        responses: { "201": { description: "Scoped upload grant; do not log or share the signed URLs.", content: { "application/json": { schema: ref("UploadGrant") } } }, ...errors([400,401,403,413,429,500,503]) },
      } },
      "/v1/uploads/source": { get: {
        operationId: "readUploadedImage", tags: ["Uploads"], summary: "Resolve an API-issued image reference", security: [],
        description: "Use the returned image_url verbatim in a cart. This capability URL redirects to a short-lived private-storage read link. No bearer API key is sent. Access expires after 8 days and requires the issuing key and partner to remain active. It is not a checkout URL. Partners normally do not need to call this endpoint themselves.",
        parameters: [{ name: "token", in: "query", required: true, schema: { type: "string", maxLength: 1800 }, description: "Opaque signed capability already included in image_url." }],
        responses: { "307": { description: "Follow the HTTPS redirect to read the image.", headers: { Location: { schema: { type: "string", format: "uri" } } } }, ...errors([403,404,500]), "410": { description: "upload_expired: request a fresh upload grant and upload again.", content: { "application/json": { schema: ref("ApiError") } } } },
      } },
      "/v1/carts": { post: {
        operationId: "createCart", tags: ["Carts"], summary: "Queue URL validation and create a cart",
        description: `Returns 202 immediately while a separate worker checks artwork and prepares default 2 mm bleed on every front/back; recognized existing 2 mm bleed is preserved and 3 mm is cropped to 2 mm. Source hashes always refer to submitted bytes, and production uses the prepared image. The source and prepared file must each meet the size/pixel limits; no checkout_url until open. Request JSON is limited to 512,000 bytes. Maximum ${config.maxCards} items AND ${config.maxCards} total copies. Downloads allow 20 MiB/file, 40 MP, recommended ${config.minWidth}×${config.minHeight}; smaller readable images remain orderable with image_low_resolution warnings, 3 redirects and a 15-second total deadline per URL attempt. Identical retries with the same key return the original cart (202 validating; 200 otherwise). A failed cart requires corrected inputs and a new Idempotency-Key, not a new API key. Default deployment cart lifetime: ${config.expiryHours} hours from creation.`,
        parameters: [{ name: "Idempotency-Key", in: "header", required: true, description: "1–200 visible ASCII characters (0x21–0x7E); no spaces. Use a unique value per order revision. Scoped to partner + test/live mode; reuse only for identical retries.", schema: { type: "string", minLength: 1, maxLength: 200, pattern: "^[!-~]{1,200}$" }, example: "store-order-1042-rev1" }],
        requestBody: { required: true, content: { "application/json": { schema: ref("CreateCart"), example: createCartExample } } },
        responses: { "202": cartResponse("Artwork queued or still validating", {validating:e.validating}), "200": cartResponse("An idempotent replay of an existing cart which is no longer validating", {open:e.open,failed:e.failed}), ...errors([400,401,403,409,413,429,500,503]) },
      } },
      "/v1/carts/{id}": { get: {
        operationId: "getCart", tags: ["Carts"], summary: "Poll cart validation and checkout availability",
        description: `Poll every 3–5 seconds; authenticated cart GETs are exempt from the ${config.rateLimit} requests/key/minute limit. A failed cart still returns HTTP 200 with status failed and item errors. Checkout URLs are present only for open carts. Keep polling validating carts even if some errors are already visible; the complete list is available when failed.`,
        parameters: [idParameter("The exact cart.id returned by POST /v1/carts. Treat it as opaque.")],
        responses: { "200": cartResponse("Current cart, including all validation progress/errors", {validating:e.validating,open:e.open,failed:e.failed}), ...errors([401,403,404,500]) },
      } },
      "/v1/orders/{id}": { get: {
        operationId: "getOrder", tags: ["Orders"], summary: "Read manufacturing and shipment status",
        description: `Use cart.order_id or an order webhook's data.id, never the cart ID or Stripe session ID. Manufacturing orders exist only after live payment has been recorded. Paid prepaid sandbox orders are simulated, returned with mode:test and simulated:true, and never print or ship. Scoped to partner + key mode; test keys cannot retrieve live orders. Counts toward ${config.rateLimit} requests/key/minute. Browser return alone does not confirm payment.`,
        parameters: [idParameter("The manufacturing order ID from cart.order_id or an order webhook data.id. Treat it as opaque.")],
        responses: { "200": { description: "Order status", content: { "application/json": { schema: ref("Order"), example: e.order } } }, ...errors([401,403,404,429,500]) },
      } },
    },
    webhooks: { partnerEvent: { post: {
      operationId: "receivePartnerEvent", summary: "Receive a signed order or cart-expiry event", security: [],
      description: `Configure separately for test/live in Dashboard → 2. Order webhooks. Use an HTTPS URL on the exact registered website origin. Save webhook displays a whsec_ secret once and rotates any previous secret for that mode. Verify HMAC-SHA256(timestamp + '.' + exact raw body), use constant-time comparison and reject timestamps outside ±300 seconds. Deduplicate by top-level id. Return 2xx after durable receipt; failures retry up to 12 attempts. Delivery is asynchronous and ordering is not guaranteed. Test hosted carts can produce cart.expired. Prepaid sandbox additionally emits simulated order.paid/order.cancelled on the Test webhook with data.simulated:true, never production/shipment events. No synthetic-event endpoint is exposed.`,
      parameters: [{ name: "TCGP-Signature", in: "header", required: true, schema: string, description: "t=<Unix seconds>,v1=<64 lowercase hexadecimal HMAC-SHA256 characters>. This signature authenticates the webhook; a partner API bearer key is not sent." }],
      requestBody: { required: true, content: { "application/json": { schema: { oneOf: [ref("OrderEvent"), ref("CartExpiredEvent")] }, examples: { orderShipped: { value: e.orderEvent }, cartExpired: { value: e.expiredEvent } } } } },
      responses: { "200": { description: "Any 2xx acknowledges receipt. Respond within 15 seconds; redirects are not followed." } },
    } } },
    components: {
      securitySchemes: { WidgetSession: {type:"http",scheme:"bearer",bearerFormat:"wses_<64 lowercase hex>",description:"Opaque one-hour customer session from POST /api/widget/sessions, not a partner API key. Origin must match the issuing website."}, PartnerApiKey: { type: "http", scheme: "bearer", bearerFormat: "tcgp_test_<64 lowercase hex> or tcgp_live_<64 lowercase hex>", description: "Server-side key created in the dashboard. Test/live data are isolated. Rotating revokes the previous key for that mode." } },
      schemas: {
        ...prepaidSchemas,
        CreateUpload: object({ content_type: { type: "string", enum: ["image/png", "image/jpeg"] }, size: { type: "integer", minimum: 1, maximum: 20971520, description: "Exact file byte count; storage and the validation worker enforce the 20 MiB maximum independently." } }),
        UploadGrant: object({
          upload_url: { type: "string", format: "uri", description: "Temporary storage URL. PUT the raw file here, never multipart or JSON. Valid for 2 hours; upload once, no overwrite." },
          method: { type: "string", const: "PUT" }, headers: object({ "Content-Type": { type: "string", enum: ["image/png", "image/jpeg"] } }),
          image_url: { type: "string", format: "uri", description: "Opaque image reference to use unchanged in image_url/back_image_url after PUT succeeds. Bound to partner and key mode." },
          upload_expires_at: timestamp, expires_at: { ...timestamp, description: "Source-reference expiry, 8 days after grant creation. Create the cart promptly. Staging objects are removed by maintenance after expiry (normally within the following day); validated cart files follow normal cart/order retention." },
          max_bytes: { type: "integer", const: 20971520 },
        }),
        CreateCart: {
          ...object({
            retail_amount_cents: {type:'integer',minimum:50,maximum:5000000,description:'Required only for Connect: whole-cart card-sale subtotal in USD cents, excluding shipping/tax. Must cover printing cost. Immutable; server-authoritative partner price.'},
            settlement: {type:'string',enum:['hosted','prepaid','connect'],default:'hosted',description:'Omit for hosted checkout: server-API carts automatically spend eligible printing credit when sufficient, otherwise charge the customer normally. No extra partner integration is needed. Choose connect with retail_amount_cents for onboarded partners receiving earnings after printing and Stripe fees, with a 5% reserve for 15 days and no printing-credit debit. Choose prepaid only for the advanced quote/reserve/submit integration. Existing live partner keys work with either Stripe environment. Immutable per cart.'},
            items: { type: "array", minItems: 1, maxItems: config.maxCards, items: ref("CartItem") },
            back_image_url: { ...imageUrl, description: `${imageUrl.description} Shared back used when an item does not supply its own back_image_url. If neither is supplied, TCGPlaytest provides its default card back.` },
            back_sha256: hash, card_stock: { type: "string", enum: ["standard"], default: "standard" }, external_ref: externalRef,
            return_url: { ...imageUrl, description: "HTTPS return URL on the exact registered website_url origin (scheme/host/port). Omit to use the registered website URL. widget_allowed_origins does not authorize return domains. STORE_ORIGIN is only an example application environment variable; database changes do not update it. Return navigation is not payment confirmation; verify the order API or signed webhook." },
          }, ["items"]),
          allOf: [{if:{properties:{settlement:{const:'connect'}},required:['settlement']},then:{required:['retail_amount_cents']},else:{not:{required:['retail_amount_cents']}}}],
          description: "Only these fields are accepted. Do not send certification, affiliate_code, partner-terms fields or library IDs. retail_amount_cents is allowed only for Connect. Each item needs a back, supplied per item or shared at top level. Partner terms/affiliate settings are copied server-side.",
        },
        CartItem: object({ image_url: imageUrl, sha256: hash, quantity,
          back_image_url: { ...imageUrl, description: "Item-specific back; overrides the shared back. If supplied, back_sha256 also comes from this item, never the shared hash." }, back_sha256: hash }, ["image_url", "quantity"]),
        QualityWarning: object({ item_index: {type:"integer",minimum:0}, side:{type:"string",enum:["front","back"]}, code:{type:"string",const:"image_low_resolution"}, message:string, width:{type:"integer"}, height:{type:"integer"}, recommended_width:{type:"integer"}, recommended_height:{type:"integer"} }),
        ValidationError: object({ item_index: { type: "integer", minimum: 0, description: "Zero-based index in the submitted items array." }, side: { type: "string", enum: ["front","back"] }, code: { type: "string", enum: validationErrors.map(([code]) => code) }, message: string }),
        Cart: {
          ...object({
            retail_amount_cents: {type:'integer',minimum:50,maximum:5000000,description:'Present only for Connect carts.'},
            settlement: {type:'string',enum:['prepaid','connect'],description:'Connect never spends credit and exposes checkout_url when open. Prepaid never exposes checkout_url. Omitted means hosted checkout.'},
            id: { ...string, description: "Opaque cart identifier." }, status: { type: "string", enum: ["validating","open","failed","converted","expired","blocked","cancelled"] },
            external_ref: nullableString, card_count: { type: "integer", minimum: 1, description: "Sum of item quantities, not the number of URLs." }, card_stock: { type: "string", enum: ["standard"] },
            affiliate_code: { ...nullableString, description: "Saved account preference copied at cart creation; null when none. Read-only." },
            progress: object({ done: { type: "integer", minimum: 0, description: "Finished unique-URL jobs, including failures." }, total: { type: "integer", minimum: 0, description: "Distinct front/back URLs in this cart, not card copies." } }),
            errors: { type: "array", items: ref("ValidationError") }, warnings: { type:"array", items:ref("QualityWarning"), description:"Advisory only. Low-resolution artwork remains orderable after a customer warning." }, partner_terms_version: { ...nullableString, description: "Accepted partner version recorded server-side. Can be null on older carts." },
            mode: { type: "string", enum: ["test","live"] }, checkout_url: { type: "string", format: "uri", description: "Present only for open hosted-checkout carts; always omitted for prepaid carts. Pass the open cart to TCGPlaytest.checkout(cart) for embedded checkout, or navigate to this URL verbatim for a full-page handoff. Do not substitute the API origin. Test mode opens a non-paying preview." },
            order_id: { ...nullableString, description: "Manufacturing order identifier after payment is recorded; otherwise null." }, expires_at: timestamp, created_at: timestamp,
          }, ["id","status","external_ref","card_count","card_stock","affiliate_code","progress","errors","warnings","partner_terms_version","mode","order_id","expires_at","created_at"]),
          allOf: [{ if: { properties: { status: { const: "open" } }, required: ["status"], not: {properties:{settlement:{const:'prepaid'}},required:['settlement']} }, then: { required: ["checkout_url"] }, else: { not: { required: ["checkout_url"] } } }],
        },
        Shipment: object({ carrier: { type: "string", maxLength: 80 }, tracking_number: { type: "string", maxLength: 150 }, tracking_url: { type: "string", format: "uri", description: "HTTPS tracking link." } }),
        Order: object({ mode:{const:'test'}, simulated:{const:true}, id: string, cart_id: string, status: { type: "string", enum: orderStatuses }, shipment: { anyOf: [ref("Shipment"),{type:"null"}], description: "Null when no shipment is attached." }, created_at: timestamp, updated_at: timestamp, external_ref: nullableString, card_count: { type: "integer", minimum: 1 } }, ["id","cart_id","status","shipment","created_at","updated_at","external_ref","card_count"]),
        OrderEvent: object({ id: { ...string, description: "Unique event ID used for deduplication. Re-delivery keeps this ID." }, type: { type: "string", enum: ["order.paid","order.in_production","order.shipped","order.cancelled"] }, created_at: timestamp,
          data: object({ simulated:{const:true,description:"Present only on prepaid sandbox events, sent to the Test webhook."}, id: { ...string, description: "Manufacturing order ID, or simulated order ID for sandbox events." }, cart_id: string, external_ref: nullableString, status: { type: "string", enum: orderStatuses.filter(s => s !== "blocked") }, shipment: { anyOf: [ref("Shipment"),{type:"null"}] } }, ["id","cart_id","external_ref","status","shipment"]) }),
        CartExpiredEvent: object({ id: string, type: { type: "string", const: "cart.expired" }, created_at: timestamp,
          data: object({ id: { ...string, description: "Cart ID, not an order ID." }, external_ref: nullableString, status: { type: "string", const: "expired" } }) }),
        ApiError: object({ error: object({ code: string, message: string, item_index: { type: "integer", minimum: 0, description: "Present when a request error refers to a particular item." } }, ["code","message"]) }),
      },
    },
  }
}

export function buildLlmsText(config = documentationConfig()) {
  return `# TCGPlaytest Partner API

> Server-side card manufacturing integration. Upload directly to TCGPlaytest storage or supply existing image URLs, poll validation, then open checkout inside the partner page with TCGPlaytest.checkout(cart). Only the payment step opens Stripe.

API base URL: ${config.baseUrl}
API path version: /v1. OpenAPI document revision is not a new API path version.

## Public MCP ordering (no customer account or API key)
- [MCP setup and card previews](${config.baseUrl}/docs/mcp).
- Remote MCP URL: https://www.tcgplaytest.com/api/mcp on the MAIN website, not the partner API origin. Use www directly to avoid redirects. Transport: Streamable HTTP. Authentication: none. Do not ask the customer to apply for a partnership, create an API key or supply the operator's secrets.
- Platform setup: [ChatGPT](${config.baseUrl}/docs/mcp#mcp--chatgpt), [Claude](${config.baseUrl}/docs/mcp#mcp--claude), [Gemini](${config.baseUrl}/docs/mcp#mcp--gemini), [Codex](${config.baseUrl}/docs/mcp#mcp--codex), [Claude Code](${config.baseUrl}/docs/mcp#mcp--claude-code), [Gemini CLI](${config.baseUrl}/docs/mcp#mcp--gemini-cli), [Cursor](${config.baseUrl}/docs/mcp#mcp--cursor), [OpenAI Responses API](${config.baseUrl}/docs/mcp#mcp--openai-api). Provider accounts, availability and usage charges still apply; steps and official references are in the guide.
- Verify a new connection by requesting printing options and a 2-card US quote before preparing an order. A chat attachment is not automatically uploaded to MCP: the client must PUT the file bytes or supply a direct HTTPS image URL.
- Tools: get_card_printing_options; quote_card_order({quantity,country}); create_card_artwork_upload({content_type,size}); prepare_card_order({request_id,items:[{image_url,back_image_url?,quantity}]}); get_card_order_preparation({preparation_token}).
- Use actual full-quality public HTTPS PNG/JPEG artwork URLs, or first PUT bytes to the upload tool's returned upload_url using its headers, then use image_url. Never send a webpage URL or payment details. Omitted backs use the standard TCGPlaytest back.
- Maximum 1,000 total cards; standard stock/finish, finished size 63 x 88 mm. Each image is single-frame PNG/JPEG, at most 20 MiB and 40 million pixels.
- Generate a fresh random UUID request_id per new preparation; keep it private and reuse it with identical inputs on retries. Poll with preparation_token at least five seconds apart; honor Retry-After/retry_after_seconds.
- Only status open returns preview_url and checkout_url. Give preview_url to the customer first: it shows paired fronts/backs, quantities and low-resolution warnings, six designs per page. It needs no login. Continue to checkout opens the returned checkout URL.
- Customers enter delivery details, confirm image rights and review the final price before paying. The tools cannot charge, spend partner printing credit, trigger printing without successful payment, read admin/customer records or earn partner Connect payouts.
- Image links last up to 15 minutes, bounded by cart expiry. Reload previews refreshes them while the cart is open. The validated full-quality files remain the print source. Trim previews approximate the finished cut; final cutting/colors may vary.
- Keep preparation/upload/preview/checkout capabilities private: anyone holding a preview link can see that cart's artwork. The site operator's partner key/signing secret are never shared with MCP customers.
- HTTP GET in a browser returns 405 for the tool endpoint. 503 means disabled, unconfigured or unavailable; a customer key will not fix it. Browser MCP clients on another website may need that exact Origin allowed; server/desktop clients without Origin need no setting.
- The REST API account/key requirements below apply to partner integrations, not public MCP guest ordering.

## Partner REST API
${prepaidLlms}
- Rate limits: ALL /v1/prepaid endpoints share the ${config.rateLimit} requests per API key per minute allowance with upload-grant POSTs, cart POSTs and order GETs. This includes quote creation, quote GET polling, reserve, release, prepaid order submission, balance/ledger reads and retries. Quote polling is NOT exempt; only authenticated cart-status GETs are exempt. Poll quotes every five seconds or slower, budget across concurrent orders, and honor Retry-After on HTTP 429. Preserve the original body and idempotency key when retrying mutations.

## Stripe Connect payouts
Optional US partner server API flow. Complete Dashboard /dashboard/connect onboarding and terms. POST /v1/carts with settlement:"connect" and retail_amount_cents (whole card-sale subtotal, USD cents, 50–5000000, excluding shipping/tax, at least printing cost). Use the existing live partner key; Stripe credentials select payment environment. Upload/poll/embed/return as usual. Connect never spends prepaid credit, and cannot accept affiliate discounts. The standalone widget retains automatic credit-or-normal checkout; Connect retail pricing needs the server API.
Earnings = retail subtotal minus printing cost minus actual Stripe processing fee. Transfer 95% after verified payment; reserve 5% rounded up a cent for 15 days, then automatic eligible release to the connected Stripe balance. Bank arrival follows Stripe. Refunds reduce earnings and recover excess transfers. Disputes/restrictions/recovery pause transfers. Test Connect payments do not manufacture. Operator setup: same Stripe account on both apps, PARTNER_CONNECT_ENABLED=true, new Connect SQL, platform /api/stripe/connect/webhook with STRIPE_CONNECT_WEBHOOK_SECRET, existing commerce webhook and every-minute connect-maintenance cron. Retain enough platform balance for reserves. See /docs/connect.


## Start here
- [Developer documentation](${config.baseUrl}/docs): server-rendered topic pages covering setup, exact fields, limits, examples, errors, widget, webhooks and content obligations. Each topic has its own URL and readable HTML.
- [Going live](${config.baseUrl}/docs/go-live): partner launch steps and platform operator settings. Live Stripe credentials alone do not complete deployment setup; configure the live webhook secrets, live Tax, prepaid enablement and verify fulfillment. Existing schema and live partner keys remain valid.
- [OpenAPI 3.1 schema](${config.baseUrl}/openapi.json): requests, responses, security and webhook payloads.
- [Partner dashboard](${config.baseUrl}/dashboard): a human signs in with Google, completes the application, accepts the current partner terms and creates test/live keys. The human also configures the webhook URL and saves its displayed signing secret.
- [Partner terms](${config.baseUrl}/terms): do not knowingly send unlawful/infringing content; remove and stop forwarding notified content; cooperate on complaints; orders may be refused, held or cancelled and repeat offenders suspended.

## Support
- [Integration and order support](https://www.tcgplaytest.com/support) or email support@tcgplaytest.com. Include the endpoint, error code and cart/order reference; never send API keys, signing secrets or private artwork URLs.

## Contract
- [Checkout branding](${config.baseUrl}/docs/branding): saved in Dashboard > 4. Checkout branding, not cart request fields. Logo PNG/JPEG up to 200 KiB, name, accent, theme, preset font/layout/heading, plain-text welcome. Required warnings/acknowledgments, rights, fields, pricing, seller disclosure and payment are platform-controlled. No HTML/CSS/scripts or external logos. Both API and widget hosted checkout use the account settings; the widget modal and payment-provider pages are unchanged. Hosted test carts remain non-paying; dashboard provides a style preview.
- [Embedded checkout](${config.baseUrl}/docs/embedded-checkout): default widget behavior keeps delivery details, account branding and rights confirmation on the partner page. Server API clients replace their checkout_url redirect with TCGPlaytest.checkout(openCart) after loading the script with data-auto-button="false" and data-checkout-origin. Exact registered website and additional widget origins may frame checkout; return_url still requires the registered website origin. Only Stripe payment navigates away, then verified return goes to the partner success page. data-checkout-display="redirect" opts into a full-page handoff. No new key, SQL or environment setting.
- [Success pages](${config.baseUrl}/docs/success-page): return_url must use the exact HTTPS origin in the partner website_url. Additional widget origins do not authorize API return destinations. STORE_ORIGIN belongs to the partner application, not the API; update it and redeploy separately when changing website_url. Localhost HTTP cannot receive the payment return. Save cart ownership and verify order payment; return navigation alone is not proof.
- [Language examples](${config.baseUrl}/docs/language-examples): cURL/Bash with jq (including direct upload), Python 3 requests, PHP 8 cURL and Node.js. Keys only on server; preserve payload/idempotency on retries; scope reads to the owning customer; honor Retry-After.
- Authorization: Bearer <server-side partner API key>. Never put the key in browser/widget code.
- Auto-bleed is API-managed before a cart becomes open: 2 mm on a 63 x 88 mm finished card, using the website mask/corner rules. Partners submit finished artwork without implementing bleed. Recognized existing 2 mm bleed is preserved; 3 mm is cropped to 2 mm. Example: 1500x2100 becomes 1596x2196. Optional SHA-256 checks the original source, not the prepared file. Dashboard/production use prepared files. Both original and prepared files are private, cart-scoped, and share expiry/retention/holds. Source and prepared files each must fit 20 MiB and 40 MP. Existing orders are not retroactively processed.
- Optional POST /v1/uploads with {content_type: "image/png" or "image/jpeg", size: file byte count} returns 201 {upload_url, method: "PUT", headers: {"Content-Type": ...}, image_url, upload_expires_at, expires_at, max_bytes: 20971520}. No partner Blob/Supabase account or hosting is needed. PUT raw bytes to upload_url with only the returned headers, no API key/cookies. Upload link lasts 2 hours and cannot overwrite. After successful PUT, use image_url unchanged in the existing cart fields; no finalize call. Upload authorization uses the shared write rate limit; honor Retry-After. A failed/uncertain PUT can be retried with a fresh grant. The cart worker still performs all validation.
- image_url is a private signed capability, scoped to the partner and key mode and valid for 8 days; do not log/share it. Create the cart promptly. Issuing key revocation disables source access. Source staging files are removed by maintenance after expiry (normally within the following day). Validated cart files follow the retention rules below. Test keys support uploads; only prepaid sandbox supports simulated Stripe payments.
- POST /v1/carts requires Idempotency-Key: 1–200 visible ASCII characters, no spaces. Body: items with image_url, quantity and optional item/shared back_image_url (omitting both backs selects the TCGPlaytest default); optional hashes, external_ref, return_url, standard card_stock and settlement (hosted by default, or prepaid for enabled live accounts).
- Do not send certification, affiliate_code or partner-terms fields. retail_amount_cents is accepted only with settlement:connect. Terms version and saved affiliate preference are copied by the server. The customer certifies image rights at checkout; the partner still has the obligations above.
- New POST returns 202, status validating, no checkout_url. GET /v1/carts/{id} every 3–5 seconds; honor Retry-After. Polling is authenticated but exempt from the ${config.rateLimit}/minute/key shared upload, cart, order and prepaid limit.
- For an open hosted cart, pass the cart to TCGPlaytest.checkout(cart) to stay on the partner page. A full-page handoff can instead use checkout_url verbatim. Prepaid carts never expose checkout_url: after open, quote, reserve credit and submit through the prepaid endpoints below. For failed, inspect every errors entry (item_index is zero-based; side, code, message), fix inputs and create a new cart with a new Idempotency-Key. Do not rotate the API key. Other terminal states: converted, expired, blocked, cancelled. A converted prepaid cart confirms fulfillment funding, not the shopper's separate payment to your store.
- Maximum ${config.maxCards} items AND ${config.maxCards} total quantity; JSON body ≤512,000 bytes; external_ref ≤200 UTF-16 code units; HTTPS URLs ≤2048 UTF-16 code units.
- Artwork: public IPv4 HTTPS, PNG/JPEG single frame, ≤20 MiB, ≤40,000,000 pixels, recommended ${config.minWidth}×${config.minHeight}. Smaller readable files are accepted with warnings (code image_low_resolution, item_index, side, source width/height and recommended_width/recommended_height). Hosted checkout allows ordering after acknowledging the warning. At most 3 redirects. Total download deadline 15 seconds per URL attempt, including DNS/TLS/redirects/body. Private/local addresses are blocked.
- Optional SHA-256 is 64 hex characters over exact file bytes; a mismatch fails that item/side. Each URL is checked within its cart; validated files are never reused across carts. No source downloads after payment. Existing public HTTPS URL integrations continue to work; direct uploads are optional. There is no finalize endpoint.
- Current deployment: cart lifetime ${config.expiryHours} hours from creation; retention ${config.retentionDays} days after shipment/cancellation, subject to reconciliation and legal holds. expires_at is authoritative; all timestamp strings use RFC 3339 with timezone.
- GET /v1/orders/{id} uses cart.order_id or an order webhook data.id. It returns id, cart_id, status, shipment, created_at, updated_at, external_ref and card_count. Browser return is not proof of payment.
- Webhooks: order.paid, order.in_production, order.shipped, order.cancelled, cart.expired. Envelope: id, type, created_at, data. Deduplicate by top-level id. Verify TCGP-Signature (t=Unix seconds,v1=hex HMAC-SHA256) over timestamp + "." + exact raw body, with the signing secret, constant-time comparison and ±300-second tolerance. Respond 2xx after durable receipt. Up to 12 attempts; no delivery-order guarantee.
- Webhook endpoints must share the registered website origin. Test/live settings and secrets are separate; saving rotates the secret. Test keys validate artwork and may receive cart.expired. Prepaid sandbox emits simulated order.paid/order.cancelled to the Test webhook with data.simulated:true; no production/shipment events. No synthetic-event endpoint is provided.
- GET /v1/estimate?quantity=10 is public, no API key. Returns currency USD, quantity, unit_amount and subtotal_amount (integer cents), excludes shipping/tax/discounts. Final price is recalculated at checkout. Estimate failures do not block checkout.
## Standalone widget (no partner secret API key or partner storage)
- Copy the personalized script from the dashboard after accepting terms. data-partner-key is the public widget_partner_key, not an API secret. data-mode is test (non-paying preview) or live. Register each exact HTTPS website origin in the dashboard.
- After script load call TCGPlaytest.configure({getItems: async () => [{front: finishedPngBlob, back: backFile, quantity: 1}]}). Front/back can also be async Blob factories. The default button handles uploads, validation progress and embedded checkout on the partner page. For a custom button use data-auto-button="false" and TCGPlaytest.open().
- Item back takes priority over sharedBack; omit both to use the centrally hosted TCGPlaytest default. A double-sided card must supply its matching back. The modal renders up to three previews at once, shows low-resolution warnings, and fetches a print estimate immediately. TCGPlaytest.estimate(quantity) exposes that estimate for editor UI. No upload is needed for the default back.
- The branded widget owns an optional "Print both faces separately" action for a supplied front/back pair. The customer chooses it in the modal; partners do not add code or configuration. Both resulting cards use sharedBack or the TCGPlaytest default, preserving each face's original quantity. Previews, physical-card count and price estimate update before checkout. "Print front and back together" reverses the choice. Custom backs are never split automatically. Layout cannot change during upload/cart retries; "Use current designs" starts a new order. Headless calls preserve supplied pairs.
- Call TCGPlaytest.reset() after editing a previously submitted deck. Network retries and same-tab reloads resume the same submitted cart. The public-code widget does not call a partner-owned cart endpoint.
- POST /api/widget/sessions with {partner_key,mode} returns {token,expires_at,mode,max_cards,max_image_bytes}. Session lives one hour, is scoped to a partner, origin and mode, and can create only one cart.
- With Authorization: Bearer <session token>, POST /api/widget/uploads with {request_id: UUID,content_type,size} returns {id,upload_url,method,headers,max_bytes,upload_expires_at}. PUT bytes directly to the returned URL without Authorization/cookies. Storage grants last two hours and cannot overwrite.
- POST /api/widget/cart with {items:[{front_upload_id,back_upload_id?,quantity}],external_ref?}; only session-owned uploads accepted. GET /api/widget/cart polls that same cart. Both return the documented Cart shape. Use Origin and the session token on these calls, never a secret API key.
- Configured widget quotas: ${config.widgetSessionsPerHour} sessions/partner/hour, ${config.widgetUploadsPerSession} upload grants/session, ${config.widgetUploadsPerDay} grants/partner/rolling 24 hours. Defaults are 60, 2,000 and 10,000 respectively; operator environment overrides apply. These quotas are separate from the API-key rate limit. Each front/back upload consumes a grant reserving up to 20 MiB; copies can reuse an uploaded image. Identical request_id retries reuse the grant. Widget cart GET is exempt from session/upload quotas. Honor Retry-After on 429.
- Partner terms, affiliate setting, order ownership and analytics are assigned server-side. Public codes and Origin checks alone do not authenticate non-browser callers; expiring sessions, quotas and ownership checks limit public upload access.
`
}
