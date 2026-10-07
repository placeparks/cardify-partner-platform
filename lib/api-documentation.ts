import { TERMS_VERSION } from "./manufacturing-contract"

// Public documentation only. Read the same deployment limits as the API; never
// import database clients or credentials into the public schema.
export function documentationConfig() {
  const configured = process.env.NEXT_PUBLIC_TCGPLAYTEST_APP_URL || process.env.NEXT_PUBLIC_CARDIFY_APP_URL || process.env.CARDIFY_APP_URL
  const baseUrl = new URL(configured || "https://cardify-partner-platform.vercel.app").origin
  return {
    baseUrl,
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
  ["image_dimensions_invalid", "Below the configured minimum width or height."],
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
    card_stock: "standard", affiliate_code: null, progress: { done: 0, total: 2 }, errors: [],
    partner_terms_version: TERMS_VERSION, mode: "test", order_id: null,
    expires_at: "2026-10-13T12:00:00.000Z", created_at: "2026-10-06T12:00:00.000Z",
  }
  const shipment = { carrier: "Example carrier", tracking_number: "TRACK-1042", tracking_url: "https://shipping.example/track/TRACK-1042" }
  return {
    validating,
    open: { ...validating, status: "open", progress: { done: 2, total: 2 }, checkout_url: `${baseUrl}/partner-checkout/${"b".repeat(64)}` },
    failed: { ...validating, status: "failed", progress: { done: 2, total: 2 }, errors: [
      { item_index: 0, side: "front", code: "image_dimensions_invalid", message: "Image is smaller than the required dimensions." },
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
    tags: [{ name: "Uploads" }, { name: "Carts" }, { name: "Orders" }],
    paths: {
      "/v1/uploads": { post: {
        operationId: "createUpload", tags: ["Uploads"], summary: "Get a temporary direct-to-TCGPlaytest-storage upload link",
        description: `Send metadata only with your server-side API key. No partner storage account is needed. Counts toward the shared ${config.rateLimit}/minute/key limit. PUT raw file bytes to upload_url with the returned headers, without the API key or cookies. Wait for a successful 2xx PUT, then use image_url unchanged in a cart front/back field. No finalize call. Links cannot overwrite existing files. Test and live keys are supported; test keys still cannot pay. Upload success is not artwork validation: the cart worker performs all checks. On an uncertain PUT outcome, request a new upload link and retry the file.`,
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
        description: `Returns 202 immediately while a separate worker checks artwork and prepares default 2 mm bleed on every front/back; recognized existing 2 mm bleed is preserved and 3 mm is cropped to 2 mm. Source hashes always refer to submitted bytes, and production uses the prepared image. The source and prepared file must each meet the size/pixel limits; no checkout_url until open. Request JSON is limited to 512,000 bytes. Maximum ${config.maxCards} items AND ${config.maxCards} total copies. Downloads allow 20 MiB/file, 40 MP, minimum ${config.minWidth}×${config.minHeight}, 3 redirects and a 15-second total deadline per URL attempt. Identical retries with the same key return the original cart (202 validating; 200 otherwise). A failed cart requires corrected inputs and a new Idempotency-Key, not a new API key. Default deployment cart lifetime: ${config.expiryHours} hours from creation.`,
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
        description: `Use cart.order_id or an order webhook's data.id, never the cart ID or Stripe session ID. Manufacturing orders exist only after live payment has been recorded. Scoped to partner + key mode; test keys cannot retrieve live orders. Counts toward ${config.rateLimit} requests/key/minute. Browser return alone does not confirm payment.`,
        parameters: [idParameter("The manufacturing order ID from cart.order_id or an order webhook data.id. Treat it as opaque.")],
        responses: { "200": { description: "Order status", content: { "application/json": { schema: ref("Order"), example: e.order } } }, ...errors([401,403,404,429,500]) },
      } },
    },
    webhooks: { partnerEvent: { post: {
      operationId: "receivePartnerEvent", summary: "Receive a signed order or cart-expiry event", security: [],
      description: `Configure separately for test/live in Dashboard → 2. Order webhooks. Use an HTTPS URL on the exact registered website origin. Save webhook displays a whsec_ secret once and rotates any previous secret for that mode. Verify HMAC-SHA256(timestamp + '.' + exact raw body), use constant-time comparison and reject timestamps outside ±300 seconds. Deduplicate by top-level id. Return 2xx after durable receipt; failures retry up to 12 attempts. Delivery is asynchronous and ordering is not guaranteed. Test keys can produce cart.expired events, but no payment/production/shipment events. No synthetic-event endpoint is exposed.`,
      parameters: [{ name: "TCGP-Signature", in: "header", required: true, schema: string, description: "t=<Unix seconds>,v1=<64 lowercase hexadecimal HMAC-SHA256 characters>. This signature authenticates the webhook; a partner API bearer key is not sent." }],
      requestBody: { required: true, content: { "application/json": { schema: { oneOf: [ref("OrderEvent"), ref("CartExpiredEvent")] }, examples: { orderShipped: { value: e.orderEvent }, cartExpired: { value: e.expiredEvent } } } } },
      responses: { "200": { description: "Any 2xx acknowledges receipt. Respond within 15 seconds; redirects are not followed." } },
    } } },
    components: {
      securitySchemes: { PartnerApiKey: { type: "http", scheme: "bearer", bearerFormat: "tcgp_test_<64 lowercase hex> or tcgp_live_<64 lowercase hex>", description: "Server-side key created in the dashboard. Test/live data are isolated. Rotating revokes the previous key for that mode." } },
      schemas: {
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
            items: { type: "array", minItems: 1, maxItems: config.maxCards, items: ref("CartItem") },
            back_image_url: { ...imageUrl, description: `${imageUrl.description} Shared back used when an item does not supply its own back_image_url.` },
            back_sha256: hash, card_stock: { type: "string", enum: ["standard"], default: "standard" }, external_ref: externalRef,
            return_url: { ...imageUrl, description: "HTTPS return URL on the exact registered website origin (scheme/host/port). Omit to use the registered website URL. Return navigation is not payment confirmation." },
          }, ["items"]),
          allOf: [{ if: { not: { required: ["back_image_url"] } }, then: { properties: { items: { items: { required: ["back_image_url"] } } } } }],
          description: "Only these fields are accepted. Do not send certification, affiliate_code, partner-terms fields, prices or library IDs. Each item needs a back, supplied per item or shared at top level. Partner terms/affiliate settings are copied server-side.",
        },
        CartItem: object({ image_url: imageUrl, sha256: hash, quantity,
          back_image_url: { ...imageUrl, description: "Item-specific back; overrides the shared back. If supplied, back_sha256 also comes from this item, never the shared hash." }, back_sha256: hash }, ["image_url", "quantity"]),
        ValidationError: object({ item_index: { type: "integer", minimum: 0, description: "Zero-based index in the submitted items array." }, side: { type: "string", enum: ["front","back"] }, code: { type: "string", enum: validationErrors.map(([code]) => code) }, message: string }),
        Cart: {
          ...object({
            id: { ...string, description: "Opaque cart identifier." }, status: { type: "string", enum: ["validating","open","failed","converted","expired","blocked","cancelled"] },
            external_ref: nullableString, card_count: { type: "integer", minimum: 1, description: "Sum of item quantities, not the number of URLs." }, card_stock: { type: "string", enum: ["standard"] },
            affiliate_code: { ...nullableString, description: "Saved account preference copied at cart creation; null when none. Read-only." },
            progress: object({ done: { type: "integer", minimum: 0, description: "Finished unique-URL jobs, including failures." }, total: { type: "integer", minimum: 0, description: "Distinct front/back URLs in this cart, not card copies." } }),
            errors: { type: "array", items: ref("ValidationError") }, partner_terms_version: { ...nullableString, description: "Accepted partner version recorded server-side. Can be null on older carts." },
            mode: { type: "string", enum: ["test","live"] }, checkout_url: { type: "string", format: "uri", description: "Present only when open. Use verbatim; do not construct a URL or substitute the API origin. Test mode opens a non-paying preview." },
            order_id: { ...nullableString, description: "Manufacturing order identifier after payment is recorded; otherwise null." }, expires_at: timestamp, created_at: timestamp,
          }, ["id","status","external_ref","card_count","card_stock","affiliate_code","progress","errors","partner_terms_version","mode","order_id","expires_at","created_at"]),
          allOf: [{ if: { properties: { status: { const: "open" } }, required: ["status"] }, then: { required: ["checkout_url"] }, else: { not: { required: ["checkout_url"] } } }],
        },
        Shipment: object({ carrier: { type: "string", maxLength: 80 }, tracking_number: { type: "string", maxLength: 150 }, tracking_url: { type: "string", format: "uri", description: "HTTPS tracking link." } }),
        Order: object({ id: string, cart_id: string, status: { type: "string", enum: orderStatuses }, shipment: { anyOf: [ref("Shipment"),{type:"null"}], description: "Null when no shipment is attached." }, created_at: timestamp, updated_at: timestamp, external_ref: nullableString, card_count: { type: "integer", minimum: 1 } }),
        OrderEvent: object({ id: { ...string, description: "Unique event ID used for deduplication. Re-delivery keeps this ID." }, type: { type: "string", enum: ["order.paid","order.in_production","order.shipped","order.cancelled"] }, created_at: timestamp,
          data: object({ id: { ...string, description: "Manufacturing order ID." }, cart_id: string, external_ref: nullableString, status: { type: "string", enum: orderStatuses.filter(s => s !== "blocked") }, shipment: { anyOf: [ref("Shipment"),{type:"null"}] } }) }),
        CartExpiredEvent: object({ id: string, type: { type: "string", const: "cart.expired" }, created_at: timestamp,
          data: object({ id: { ...string, description: "Cart ID, not an order ID." }, external_ref: nullableString, status: { type: "string", const: "expired" } }) }),
        ApiError: object({ error: object({ code: string, message: string, item_index: { type: "integer", minimum: 0, description: "Present when a request error refers to a particular item." } }, ["code","message"]) }),
      },
    },
  }
}

export function buildLlmsText(config = documentationConfig()) {
  return `# TCGPlaytest Partner API

> Server-side card manufacturing integration. Upload directly to TCGPlaytest storage or supply existing image URLs, poll validation, then redirect the customer to hosted checkout.

API base URL: ${config.baseUrl}
API path version: /v1. OpenAPI document revision is not a new API path version.

## Start here
- [Complete single-page guide](${config.baseUrl}/docs): human setup, exact fields, limits, examples, errors, widget, webhooks and content obligations.
- [OpenAPI 3.1 schema](${config.baseUrl}/openapi.json): requests, responses, security and webhook payloads.
- [Partner dashboard](${config.baseUrl}/dashboard): a human signs in with Google, completes the application, accepts the current partner terms and creates test/live keys. The human also configures the webhook URL and saves its displayed signing secret.
- [Partner terms](${config.baseUrl}/terms): do not knowingly send unlawful/infringing content; remove and stop forwarding notified content; cooperate on complaints; orders may be refused, held or cancelled and repeat offenders suspended.

## Contract
- Authorization: Bearer <server-side partner API key>. Never put the key in browser/widget code.
- Auto-bleed is API-managed before a cart becomes open: 2 mm on a 63 x 88 mm finished card, using the website mask/corner rules. Partners submit finished artwork without implementing bleed. Recognized existing 2 mm bleed is preserved; 3 mm is cropped to 2 mm. Example: 1500x2100 becomes 1596x2196. Optional SHA-256 checks the original source, not the prepared file. Dashboard/production use prepared files. Both original and prepared files are private, cart-scoped, and share expiry/retention/holds. Source and prepared files each must fit 20 MiB and 40 MP. Existing orders are not retroactively processed.
- Optional POST /v1/uploads with {content_type: "image/png" or "image/jpeg", size: file byte count} returns 201 {upload_url, method: "PUT", headers: {"Content-Type": ...}, image_url, upload_expires_at, expires_at, max_bytes: 20971520}. No partner Blob/Supabase account or hosting is needed. PUT raw bytes to upload_url with only the returned headers, no API key/cookies. Upload link lasts 2 hours and cannot overwrite. After successful PUT, use image_url unchanged in the existing cart fields; no finalize call. Upload authorization uses the shared write rate limit; honor Retry-After. A failed/uncertain PUT can be retried with a fresh grant. The cart worker still performs all validation.
- image_url is a private signed capability, scoped to the partner and key mode and valid for 8 days; do not log/share it. Create the cart promptly. Issuing key revocation disables source access. Source staging files are removed by maintenance after expiry (normally within the following day). Validated cart files follow the retention rules below. Test keys support uploads but cannot pay.
- POST /v1/carts requires Idempotency-Key: 1–200 visible ASCII characters, no spaces. Body: items with image_url, quantity and item/shared back_image_url; optional hashes, external_ref, return_url and standard card_stock only.
- Do not send certification, affiliate_code, prices or partner-terms fields. Terms version and saved affiliate preference are copied by the server. The customer certifies image rights at checkout; the partner still has the obligations above.
- New POST returns 202, status validating, no checkout_url. GET /v1/carts/{id} every 3–5 seconds; honor Retry-After. Polling is authenticated but exempt from the ${config.rateLimit}/minute/key write/order limit.
- Redirect only for open, using checkout_url verbatim. For failed, inspect every errors entry (item_index is zero-based; side, code, message), fix inputs and create a new cart with a new Idempotency-Key. Do not rotate the API key. Other terminal states: converted, expired, blocked, cancelled.
- Maximum ${config.maxCards} items AND ${config.maxCards} total quantity; JSON body ≤512,000 bytes; external_ref ≤200 UTF-16 code units; HTTPS URLs ≤2048 UTF-16 code units.
- Artwork: public IPv4 HTTPS, PNG/JPEG single frame, ≤20 MiB, ≤40,000,000 pixels, at least ${config.minWidth}×${config.minHeight}. At most 3 redirects. Total download deadline 15 seconds per URL attempt, including DNS/TLS/redirects/body. Private/local addresses are blocked.
- Optional SHA-256 is 64 hex characters over exact file bytes; a mismatch fails that item/side. Each URL is checked within its cart; validated files are never reused across carts. No source downloads after payment. Existing public HTTPS URL integrations continue to work; direct uploads are optional. There is no finalize endpoint.
- Current deployment: cart lifetime ${config.expiryHours} hours from creation; retention ${config.retentionDays} days after shipment/cancellation, subject to reconciliation and legal holds. expires_at is authoritative; all timestamp strings use RFC 3339 with timezone.
- GET /v1/orders/{id} uses cart.order_id or an order webhook data.id. It returns id, cart_id, status, shipment, created_at, updated_at, external_ref and card_count. Browser return is not proof of payment.
- Webhooks: order.paid, order.in_production, order.shipped, order.cancelled, cart.expired. Envelope: id, type, created_at, data. Deduplicate by top-level id. Verify TCGP-Signature (t=Unix seconds,v1=hex HMAC-SHA256) over timestamp + "." + exact raw body, with the signing secret, constant-time comparison and ±300-second tolerance. Respond 2xx after durable receipt. Up to 12 attempts; no delivery-order guarantee.
- Webhook endpoints must share the registered website origin. Test/live settings and secrets are separate; saving rotates the secret. Test keys validate artwork and may receive cart.expired, but cannot create paid/production/shipment events. No synthetic-event endpoint is provided.
`
}
