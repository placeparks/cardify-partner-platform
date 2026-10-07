import Link from "next/link"
import { createCartExample, documentationConfig, documentationExamples, validationErrors } from "@/lib/api-documentation"
import { CUSTOMER_RIGHTS_STATEMENT } from "@/lib/manufacturing-contract"

export const dynamic = "force-dynamic"

function Code({ label, children }: { label: string; children: string }) {
  return <pre tabIndex={0} aria-label={label} className="max-w-full overflow-auto rounded border border-cyan-300/20 bg-slate-950 p-4 text-xs leading-6 text-emerald-300 sm:p-5">{children}</pre>
}
function Fields({ label, rows }: { label: string; rows: [string, string][] }) {
  return <div role="region" aria-label={label} tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm [&_th]:p-3 [&_td]:p-3"><thead><tr><th>Field / limit</th><th>Description</th></tr></thead><tbody>{rows.map(([name,description]) => <tr key={name} className="border-t border-white/10"><td className="align-top font-mono">{name}</td><td>{description}</td></tr>)}</tbody></table></div>
}
const pretty = (value: unknown) => JSON.stringify(value, null, 2)

export default function DocsPage() {
  const config = documentationConfig()
  const examples = documentationExamples(config.baseUrl)
  const sample = `// YOUR server: authenticate the customer and load their selected order.
const API_BASE = ${JSON.stringify(config.baseUrl)};
const response = await fetch(API_BASE + "/v1/carts", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + process.env.TCGP_API_KEY,
    "Content-Type": "application/json",
    "Idempotency-Key": customerOrder.revisionId
  },
  body: JSON.stringify({
    external_ref: customerOrder.id,
    return_url: new URL("/order-complete", process.env.STORE_ORIGIN).href,
    items: [{ image_url: frontUrl, back_image_url: backUrl, quantity: 3 }]
  })
});
const cart = await response.json();
if (!response.ok) throw new Error(cart.error.message);
// Save cart.id against this customer's order. Relay the cart JSON to your UI.
// On a network error, retry these SAME instructions with the SAME Idempotency-Key.

// YOUR server: check cart ownership before proxying a browser's status request.
const statusResponse = await fetch(API_BASE + "/v1/carts/" + ownedCartId, {
  headers: { Authorization: "Bearer " + process.env.TCGP_API_KEY },
  cache: "no-store"
});
const status = await statusResponse.json();
if (!statusResponse.ok) throw new Error(status.error.message);
// Relay JSON to your UI. Poll every 3–5 seconds while validating.
// Redirect only if status.status === "open", to status.checkout_url.
// Stop on failed/expired/blocked/cancelled/converted; show the relevant outcome.`
  return <article className="mx-auto min-w-0 max-w-4xl space-y-6 px-5 py-12 leading-8">
    <h1 className="text-3xl font-black sm:text-4xl">Partner API: create, check, checkout</h1>
    <p>Upload customer artwork directly to TCGPlaytest storage or supply existing image URLs, wait for validation, then send the customer to checkout. Partners need only a server-side API key; no storage account is needed for direct uploads. All endpoints below use the <code>/v1</code> path.</p>
    <section aria-labelledby="api-base" className="space-y-3 rounded border border-cyan-300/20 bg-slate-950 p-4 sm:p-6">
      <h2 id="api-base" className="text-xl font-bold">API base URL</h2>
      <p><code className="break-all">{config.baseUrl}</code></p>
      <p>This is the API origin for this deployment. Use keys created in this environment. The checkout website can be different: always follow the returned <code>checkout_url</code>.</p>
      <div className="flex flex-wrap gap-x-6 gap-y-2"><a href="/openapi.json" className="underline">OpenAPI 3.1 schema (JSON)</a><a href="/llms.txt" className="underline">llms.txt for coding agents</a></div>
    </section>

    <section id="before-you-start" className="scroll-mt-24 space-y-3 rounded border border-emerald-300/20 p-4 sm:p-6">
      <h2 className="text-2xl font-bold">Before you start</h2>
      <p>A person completes these account steps before an agent or server can use the API:</p>
      <ol className="list-decimal space-y-2 pl-6">
        <li>Sign in with Google and complete the <Link href="/partnership" className="underline">partner application</Link>, including the HTTPS website where your integration runs. Completed new applications activate automatically; access can later be revoked.</li>
        <li>In the <Link href="/dashboard" className="underline">dashboard</Link>, accept the current <strong>Partner terms</strong>. Acceptance is once per version.</li>
        <li>Choose your integration: for the <a href="#widget" className="underline">standalone widget</a>, copy your personalized snippet and connect finished card images. For a server API integration, create a test/live key under <strong>1. Server-side API keys</strong>. Keep that secret on your server; the standalone widget does not need it.</li>
        <li>For lifecycle notifications, configure <strong>2. Order webhooks</strong> and copy its separate signing secret. See <a href="#webhooks" className="underline">webhook setup</a>.</li>
      </ol>
      <p>No Stripe Connect account is required. A test key runs artwork validation and opens a non-paying preview; it cannot charge, print or ship. A live key enables payment checkout when that deployment is configured for it.</p>
    </section>

    <h2 className="text-2xl font-bold">Create → poll → redirect</h2>
    <ol className="list-decimal space-y-3 pl-6">
      <li><code>POST /v1/carts</code> returns <strong>202 Accepted</strong>, <code>status: validating</code>, and no checkout URL.</li>
      <li>A separate background worker downloads, checks and applies automatic print bleed to both fronts and backs. Poll <code>GET /v1/carts/&#123;id&#125;</code> every 3–5 seconds, honoring <code>Retry-After</code>. Progress may remain unchanged while a job waits for the worker.</li>
      <li>When <code>status</code> is <code>open</code>, redirect to <code>checkout_url</code>. The customer accepts image rights and pays at TCGPlaytest checkout.</li>
      <li>Confirm payment from a signed <code>order.paid</code> webhook or the order API. TCGPlaytest prints from the already-checked files; payment does not trigger another source download.</li>
    </ol>
    <p><strong>Automatic bleed is handled by the API.</strong> Submit finished-card artwork; partners do not need to add bleed. Before checkout opens, TCGPlaytest applies the website’s standard 2 mm auto-bleed around a 63 × 88 mm finished card, using the same mask and corner treatment. Recognized artwork with existing bleed is preserved at 2 mm or cropped from 3 mm to 2 mm, without adding a second margin. A 1500 × 2100 image becomes 1596 × 2196 pixels. The dashboard and production use the prepared file. Optional SHA-256 values must still describe the original submitted bytes. Both source and prepared files remain private, scoped to that cart, and follow its expiry/retention and legal holds.</p>
    <p>Send <code>Authorization: Bearer &lt;your API key&gt;</code> on server-side upload-grant, cart and order API requests, and <code>Content-Type: application/json</code> on POST. Never expose keys in browser code or the widget. Signed storage PUTs and image-reference reads use their temporary URL capability instead, without a bearer key. Cart and order reads are scoped to the partner and key mode.</p>

    <section id="uploads" className="scroll-mt-24 space-y-4">
      <h2 className="text-2xl font-bold">Direct uploads — no partner storage setup</h2>
      <p>If your website generates or receives image files, request a temporary upload link from your server. Files go straight to TCGPlaytest-owned private storage. Existing integrations that already have public HTTPS images can skip this step.</p>
      <Code label="Request upload link">{`// YOUR server: check customer/session ownership first.
const response = await fetch(${JSON.stringify(config.baseUrl)} + "/v1/uploads", {
  method: "POST",
  headers: { Authorization: "Bearer " + process.env.TCGP_API_KEY,
    "Content-Type": "application/json" },
  body: JSON.stringify({ content_type: "image/png", size: fileByteCount })
});
const grant = await response.json();
if (!response.ok) throw new Error(grant.error.message);
// Bind grant.image_url to this customer's session/order.
// Return the grant to your browser, never the API key.`}</Code>
      <p><strong>HTTP 201</strong> returns these fields. URLs below are illustrative; use the actual response unchanged.</p>
      <Code label="Upload grant response">{pretty({ upload_url: "https://storage.example/temporary-upload?token=SIGNED_UPLOAD", method: "PUT", headers: { "Content-Type": "image/png" }, image_url: `${config.baseUrl}/v1/uploads/source?token=SIGNED_REFERENCE`, upload_expires_at: "2026-10-06T14:00:00.000Z", expires_at: "2026-10-14T12:00:00.000Z", max_bytes: 20971520 })}</Code>
      <Code label="Browser direct upload">{`// Browser: grant came from YOUR authenticated/session-protected server.
const uploaded = await fetch(grant.upload_url, {
  method: grant.method,
  headers: grant.headers,
  body: file, // raw PNG/JPEG File or Blob, not FormData, JSON or base64
  credentials: "omit",
  redirect: "error"
});
if (!uploaded.ok) throw new Error("Upload failed; request a fresh link and retry.");
// Tell YOUR server the upload finished. It checks ownership, then puts
// grant.image_url into items[].image_url or back_image_url in POST /v1/carts.
// Upload every required front/back before creating the cart. No finalize call.`}</Code>
      <p>For multiple files, reuse the same uploaded image URL wherever that image repeats, including shared backs. You can upload different files concurrently with a small limit, such as three transfers at a time. Upload-grant requests still share the API rate limit; respect <code>Retry-After</code> and create the cart only after every required upload succeeds. New carts start background validation after the cart response, with a scheduled worker for recovery. Continue polling until the cart is open; upload success alone does not open checkout.</p>
      <Fields label="Direct upload rules" rows={[
        ["POST /v1/uploads body", 'Only content_type ("image/png" or "image/jpeg") and size (integer 1–20,971,520 bytes). Metadata only.'],
        ["upload_url / method / headers", "PUT raw file bytes using the returned headers. No partner API key, storage account credentials or cookies are sent to storage. Browser uploads bypass the application server's body-size limit."],
        ["upload_expires_at", "RFC 3339 timestamp: upload link expires after 2 hours. It permits one new object and cannot overwrite it. On a failed/uncertain PUT, request a new grant and upload again."],
        ["image_url / expires_at", "Opaque signed image reference, valid for 8 days. Keep it private and use it unchanged. It belongs to the issuing partner and key mode; source access stops if that key is revoked. Create the cart promptly."],
        ["Validation", "Successful upload does not mean print-ready. The cart's background worker still checks format, full decoding, size, dimensions, hashes and content. Test keys support uploads and validation, but cannot pay."],
        ["Storage and retention", "TCGPlaytest stores the source and validated artwork. Maintenance removes expired source staging files, normally within the following day. Each cart gets its own checked files under normal cart/order retention; partners need no cleanup job."],
        ["Errors", "400 invalid_request: fix metadata. 403 invalid_upload: wrong/tampered partner reference. 404 upload_not_found: PUT not completed. 410 upload_expired: upload again. 503 uploads_unavailable: platform configuration needs attention. Standard authentication and rate-limit errors also apply."],
      ]}/>
      <p>Do not share or log signed URLs. The source-reference GET is exempt from key rate limits and redirects to a short-lived read link. Upload grants count toward the shared write limit; honor <code>Retry-After</code>. There is no <code>/finalize</code> endpoint.</p>
    </section>

    <section id="create-cart" className="scroll-mt-24 space-y-4">
      <h2 className="text-2xl font-bold">POST /v1/carts</h2>
      <p><code>Idempotency-Key</code> is required: 1–200 visible ASCII characters (<code>0x21–0x7E</code>), with no spaces. For example, <code>store-order-1042-rev1</code>. Use one value per order revision; retry identical instructions with the same value. Keys are scoped to partner and test/live mode.</p>
      <Fields label="Create cart request fields" rows={[
        ["items", `Required array of 1–${config.maxCards} items. The sum of all quantities must also be at most ${config.maxCards}.`],
        ["items[].image_url", "Required front-image HTTPS URL: an API-issued image_url after successful upload, or your existing public image URL."],
        ["items[].quantity", `Required positive integer. Maximum ${config.maxCards}, subject to the cart-wide total.`],
        ["items[].back_image_url", "Back-image HTTPS URL. Required unless a shared top-level back_image_url is supplied. An item-specific back overrides the shared back."],
        ["items[].sha256 / back_sha256", "Optional 64-character hexadecimal SHA-256 of exact front/back file bytes, case-insensitive. Omit or use null for server-computed hashes. A mismatch fails that item/side."],
        ["back_image_url / back_sha256", "Optional shared back URL and hash. Used only for items without an item-specific back URL; an item-specific back uses its own back_sha256."],
        ["card_stock", 'Optional; only "standard" is supported, and is the default.'],
        ["external_ref", "Optional string of at most 200 UTF-16 code units (200 ordinary characters); no format restriction. Omitted/empty input becomes null. Returned for your reference; does not enforce uniqueness or idempotency."],
        ["return_url", "Optional HTTPS URL on the exact registered website origin (scheme, hostname and port). Omit to use the registered website URL. A different subdomain is a different origin."],
      ]}/>
      <p>Unknown request fields are rejected. Do not send <code>certification</code>, <code>affiliate_code</code>, prices, artwork-library IDs or partner-terms fields. The server copies the authenticated partner&apos;s accepted terms version and timestamp onto each new cart.</p>
      <Code label="Create cart request JSON">{pretty(createCartExample)}</Code>
      <p>Example response: <strong>HTTP 202</strong> with <code>Retry-After: 3</code>. The example timestamps are illustrative; your actual <code>expires_at</code> is authoritative.</p>
      <Code label="202 validating cart response">{pretty(examples.validating)}</Code>
    </section>

    <h2 className="text-2xl font-bold">Artwork and request limits</h2>
    <p>These values reflect this deployment&apos;s configuration.</p>
    <Fields label="API limits" rows={[
      ["Cart size", `${config.maxCards} items maximum AND ${config.maxCards} total card copies.`],
      ["JSON body", "512,000 bytes maximum, including chunked requests."],
      ["Image URLs", "At most 2048 UTF-16 code units. HTTPS only, without credentials, fragments or ports other than 443. Must resolve to public IPv4 addresses; private/local addresses and IPv6-only hosts are not accepted."],
      ["File formats", "Single-frame PNG or JPEG that can be fully decoded. The file extension alone is not sufficient."],
      ["Image size", "At most 20 MiB (20,971,520 bytes) per file and 40,000,000 pixels (width × height)."],
      ["Minimum dimensions", `${config.minWidth} pixels wide × ${config.minHeight} pixels high; both dimensions must meet the minimum.`],
      ["Redirects", "At most 3 per download, with HTTPS/public-address checks on every hop."],
      ["Download timeout", "15 seconds total per URL attempt, including DNS, TLS, redirects and body reads. This is not the total queue-processing time for the cart."],
      ["Rate limit", `${config.rateLimit} requests per key per minute shared by upload-grant POSTs, cart POSTs and order GETs. Authenticated cart GETs are exempt. A 429 response includes Retry-After: 60.`],
    ]}/>
    <p>Keep source URLs reachable without authentication until validation finishes. Progress counts unique URLs, not copies. Each URL is checked once per cart in a normal run; an interrupted worker can retry. Files are stored privately at cart-specific paths and never reused across carts.</p>
    <Code label="Server integration example">{sample}</Code>

    <section id="cart-status" className="scroll-mt-24 space-y-4">
      <h2 className="text-2xl font-bold">GET /v1/carts/&#123;id&#125;</h2>
      <p>Use the exact <code>id</code> returned by POST. Successful reads return <strong>HTTP 200</strong> and <code>Retry-After: 3</code>, including when the cart has failed validation. POST and GET use the same cart response shape.</p>
      <Fields label="Cart response fields" rows={[
        ["id", "Opaque cart ID. Keep it to poll and associate the cart with your customer/order."],
        ["status", "validating, open, failed, converted, expired, blocked or cancelled; handling is listed below."],
        ["external_ref", "Your reference string, or null."],
        ["card_count / card_stock", 'Integer sum of item quantities; stock is "standard".'],
        ["affiliate_code", "Saved affiliate-code string copied at creation, or null. Read-only; existing carts keep their original setting."],
        ["progress.done / progress.total", "Integers: completed unique-URL checks (including failures) / all unique URLs in this cart."],
        ["errors", "Array of {item_index, side, code, message}. item_index is zero-based; side is front or back. Empty when no errors have been recorded."],
        ["partner_terms_version", "Partner terms version saved by the server, or null for older carts without that record."],
        ["mode", "test or live."],
        ["checkout_url", "Present only while status is open; otherwise the field is omitted, not null. Use it verbatim."],
        ["order_id", "Manufacturing order ID after payment is recorded; otherwise null. Use this for GET /v1/orders/{id}."],
        ["created_at / expires_at", "RFC 3339 timestamp strings with timezone, for example 2026-10-06T12:00:00.000Z. UTC may also be represented by +00:00; fractional seconds can vary."],
      ]}/>
      <ul className="list-disc space-y-2 pl-6">
        <li><code>validating</code>: continue polling. Errors can appear as checks finish; wait for the terminal result to get every bad item/side.</li>
        <li><code>open</code>: checks passed; redirect to <code>checkout_url</code>. Test mode opens a non-paying preview.</li>
        <li><code>failed</code>: stop polling, inspect all errors, fix the inputs and create a new cart with a new <strong>Idempotency-Key</strong>. Keep your existing API key.</li>
        <li><code>converted</code>: payment was recorded and an order ID is available; use order status/webhooks.</li>
        <li><code>expired</code>, <code>blocked</code>, <code>cancelled</code>: checkout is unavailable. Stop polling; do not retry blocked content. An expired cart needs a new cart and idempotency key.</li>
      </ul>
      <p>Example open response (test mode):</p><Code label="Open cart response">{pretty(examples.open)}</Code>
      <p>Example failed response with two errors for the same item:</p><Code label="Failed cart response">{pretty(examples.failed)}</Code>
    </section>

    <h2 className="text-2xl font-bold">Errors and retries</h2>
    <Fields label="Validation error codes" rows={validationErrors.map(([code,meaning]) => [code,meaning])}/>
    <p>Malformed requests fail immediately with this envelope; <code>item_index</code> is omitted when the error does not refer to an item:</p>
    <Code label="HTTP request error">{pretty({ error: { code: "invalid_request", message: "quantity must be a positive integer", item_index: 0 } })}</Code>
    <Fields label="HTTP errors" rows={[
      ["400 invalid_request", "Correct missing/invalid fields or headers. Remove certification if an older integration still sends it."],
      ["401 invalid_api_key", "Missing, invalid, revoked or unavailable key. Check the environment and account access."],
      ["403 terms_required / content_blocked", "A person must accept current terms in the dashboard, or submitted artwork is blocked. Do not bypass a block."],
      ["404 not_found", "Cart/order is not found for this partner and key mode. An unpaid cart has no manufacturing order yet."],
      ["409 idempotency_conflict", "The key was already used with different instructions. Use a new Idempotency-Key for the changed request."],
      ["413 invalid_request", "Request JSON exceeds 512,000 bytes. Send URLs, not image bytes or base64."],
      ["429 rate_limited", "Wait Retry-After: 60 seconds, then retry. Cart polling is exempt."],
      ["500 server_error", "Retry with backoff. Preserve the original body and Idempotency-Key for a POST."],
      ["503 live_not_enabled / checkout_unavailable / configuration_error", "Deployment setup is incomplete or invalid. Contact the platform operator; retry after it is resolved."],
    ]}/>
    <p>An identical POST retry returns the original cart: 202 while validating, otherwise 200. Reusing an idempotency key cannot reopen a failed or expired cart. After an ambiguous network failure, retry with the same key to avoid a duplicate cart.</p>

    <section id="orders" className="scroll-mt-24 space-y-4">
      <h2 className="text-2xl font-bold">GET /v1/orders/&#123;id&#125;</h2>
      <p>Use <code>cart.order_id</code> or the <code>data.id</code> from an <code>order.*</code> webhook. This is the manufacturing order ID, not a cart ID or Stripe session ID. Orders exist after live payment is recorded; test carts do not create manufacturing orders.</p>
      <Code label="Order status response">{pretty(examples.order)}</Code>
      <Fields label="Order response fields" rows={[
        ["id / cart_id", "Opaque order ID and originating cart ID."],
        ["status", "paid, in_production, shipped, cancelled or blocked. blocked indicates a manufacturing hold."],
        ["shipment", "Null when no shipment is attached; otherwise {carrier, tracking_number, tracking_url}. Carrier: up to 80 characters; tracking number: up to 150; tracking_url is HTTPS."],
        ["created_at / updated_at", "RFC 3339 timestamp strings with timezone; when the manufacturing order was created and last updated."],
        ["external_ref / card_count", "Your reference string or null, and integer sum of card quantities."],
      ]}/>
      <p>Signed events are the preferred update mechanism. If you reconcile through order GETs, they count toward the normal rate limit. A browser return to your site is not evidence of payment.</p>
    </section>

    <section id="webhooks" className="scroll-mt-24 space-y-4">
      <h2 className="text-2xl font-bold">Webhook setup and payloads</h2>
      <ol className="list-decimal space-y-2 pl-6">
        <li>Open <Link href="/dashboard" className="underline">Dashboard → 2. Order webhooks</Link>.</li>
        <li>Select <strong>Test</strong> or <strong>Live</strong>. Enter an HTTPS endpoint on the exact origin of your registered website, for example <code>https://shop.example/webhooks/tcgplaytest</code>.</li>
        <li>Select <strong>Save webhook</strong> and store the displayed <code>whsec_</code> signing secret on your server. It is shown once. Saving again rotates that mode&apos;s secret; update your receiver.</li>
      </ol>
      <p>Test and live settings are separate. Test carts can produce <code>cart.expired</code> after expiry and worker processing. Test keys cannot pay, so they produce no <code>order.paid</code>, production or shipment events. There is no synthetic-event endpoint; use the examples for local receiver tests.</p>
      <p>Live order events are <code>order.paid</code>, <code>order.in_production</code>, <code>order.shipped</code> and <code>order.cancelled</code>. Their envelope is <code>&#123;id, type, created_at, data&#125;</code>. Deduplicate by the <strong>top-level <code>id</code></strong>; <code>data.id</code> is the order ID. Each lifecycle transition has its own event ID; retries preserve it.</p>
      <Code label="Order shipped webhook payload">{pretty(examples.orderEvent)}</Code>
      <p>All <code>order.*</code> events use these <code>data</code> fields: <code>id</code>, <code>cart_id</code>, nullable <code>external_ref</code>, <code>status</code> and nullable <code>shipment</code>. Shipment has the same shape as in the order response. For <code>cart.expired</code>, <code>data.id</code> is the cart ID; there is no <code>cart_id</code>, <code>shipment</code> or order ID field:</p>
      <Code label="Cart expired webhook payload">{pretty(examples.expiredEvent)}</Code>
      <p><code>created_at</code> is an RFC 3339 timestamp with timezone. The envelope does not contain a <code>mode</code> field; select your test/live verifier using the webhook endpoint and its signing secret. No <code>cart.open</code>, <code>cart.failed</code> or <code>order.blocked</code> event is currently emitted; use cart polling and order reconciliation for those states.</p>
      <p>Verify <code>TCGP-Signature</code> as <code>t=unix_seconds,v1=hex_hmac</code>: compute HMAC-SHA256 over the exact <code>timestamp + "." + rawBody</code>, using your signing secret. Do not parse and reserialize JSON before verification. Compare signatures in constant time and reject timestamps outside a five-minute (±300 seconds) tolerance.</p>
      <p>After verification, durably store or enqueue the event and return any 2xx response within 15 seconds. Redirects are not followed. Failed deliveries retry up to 12 total attempts with increasing delays starting at 30 seconds and capped at one day; worker scheduling can delay attempts. Delivery is asynchronous, can repeat and has no ordering guarantee. Use order GET to reconcile the current state; contact support if deliveries are exhausted.</p>
    </section>

    <section id="widget" className="scroll-mt-24 space-y-4">
      <h2 className="text-2xl font-bold">Standalone checkout widget</h2>
      <p>The widget uses a public <code>widget_partner_key</code> assigned to your account automatically. Accept partner terms, copy the personalized snippet from your dashboard and connect your editor&apos;s finished images. You do not need a secret API key, your own storage or a server cart endpoint for this integration.</p>
      <p>Clicking the widget button opens a TCGPlaytest-branded modal with each design&apos;s front, matching back, quantity and total card count. The customer reviews the cards, then clicks <strong>Proceed to checkout</strong>. Only then do uploads and validation begin. Once the artwork is ready, the widget opens hosted checkout for contact/shipping details, image-rights confirmation and payment. The modal does not collect payment details.</p>
      <ol className="list-decimal space-y-2 pl-6">
        <li>Under <strong>3. Add TCGPlaytest to your website</strong>, add any additional HTTPS website origins. Your registered website is allowed automatically. Exact origins only: production and preview domains must be added separately; no wildcards or localhost.</li>
        <li>Copy your snippet. Use <code>data-mode="test"</code> for a non-paying preview, or <code>data-mode="live"</code> for the configured checkout website. Use the snippet&apos;s partner-platform and checkout origins together.</li>
        <li>Pass finished PNG/JPEG <code>Blob</code>/<code>File</code> objects or async functions that return them. Return <code>{'{ items, sharedBack }'}</code> to apply one selected back to every design. The widget handles back selection, previews and uploads. Quantities count physical cards.</li>
      </ol>
      <Code label="Standalone widget browser integration">{`// Run after the personalized widget script has loaded.
// Export the finished card design, including its text and frame.
TCGPlaytest.configure({
  getItems: async () => ({
    sharedBack: sharedBackFile,
    items: [
      { label: "My card", front: () => renderFinishedFront(), quantity: 4 },
      { label: "Another card", front: () => renderAnotherFront(), quantity: 1 }
    ]
  }),
  externalRef: "optional-shop-order-reference"
});
// The default floating button opens the branded front/back review modal.
// For your own button, add data-auto-button="false" to the snippet:
printButton.onclick = () => TCGPlaytest.open().catch(error => {
  console.error(error.message); // The widget also shows the error in its dialog.
});
// After editing the deck, reset a previous attempt before starting a new one:
// TCGPlaytest.reset();
// Keep the default dialog to show previews and Proceed to checkout.
// Advanced custom UIs can explicitly opt out with showDialog:false.`}</Code>
      <p>The widget requests an opaque one-hour customer session, uploads directly to TCGPlaytest-owned private storage, creates one cart and polls every four seconds. It redirects only after validation opens the cart. The backend copies your accepted terms and saved affiliate preference. Orders and cart analytics belong to your partner account. The customer certifies image rights at checkout.</p>
      <p>The widget uploads up to three files at a time and uploads a reused shared-back Blob only once per attempt. Retrying in the same page keeps successfully uploaded files, including completed fronts whose backs still need uploading. No extra partner configuration is required. Session expiry can require a new attempt. Upload quotas still apply; validation runs in the background after upload.</p>
      <p><code>sharedBack</code> overrides every item&apos;s back, including generated reverse faces, in both the preview and the uploaded order. Partners supply that image once; they do not implement the selection rule or checkout UI. To keep different backs, omit <code>sharedBack</code> and provide <code>back</code> on every item. The original array return shape remains supported for individual front/back pairs. A shared back can also be an async Blob factory.</p>
      <p>The optional <code>label</code> names a design in the preview. Front/back image factories are cached for the review attempt, so checkout uploads the same files the customer reviewed. Designs are paginated in groups of six, with quantities shown per design. Closing the modal before proceeding creates no uploads or cart. The preview shows supplied artwork; 2 mm print bleed is prepared by the backend during validation.</p>
      <p>Retries reuse the submitted cart, including after a page refresh in the same tab. The modal offers <strong>Resume checkout</strong> and <strong>Use current designs</strong> for a previous attempt. A resumed cart after refresh explicitly reports that its previews are unavailable; it never substitutes new images into that cart. To change a submitted order programmatically, call <code>TCGPlaytest.reset()</code> when the widget is closed. Failed or expired carts need a new attempt; no API-key rotation is needed. The widget must receive your images through the frontend connection above; a script cannot discover arbitrary editor data automatically.</p>
      <Fields label="Standalone widget protocol" rows={[
        ["POST /api/widget/sessions", "JSON {partner_key, mode}. Returns 201 {token, expires_at, mode, max_cards, max_image_bytes}. Browser Origin must match an allowed website. No secret API key."],
        ["POST /api/widget/uploads", "Bearer session token; JSON {request_id: UUID, content_type, size}. Returns 201 {id, upload_url, method: PUT, headers, max_bytes, upload_expires_at}. PUT the bytes to that URL without the session token or cookies. Reuse request_id only for an identical grant retry."],
        ["POST /api/widget/cart", "Bearer session token; JSON {items:[{front_upload_id, back_upload_id, quantity}], external_ref?}. Only files from this session are accepted. Returns the cart shape documented above, 202 while validating. One immutable cart per session supplies idempotency automatically."],
        ["GET /api/widget/cart", "Bearer session token. Returns only that session's cart; there is no arbitrary cart ID parameter. Polling does not consume upload or session quotas."],
        ["Limits", "Default: 60 new sessions per partner/hour; 100 upload grants per session; 500 grants per partner/rolling 24 hours. Each grant reserves up to 20 MiB regardless of claimed size. The operator can configure these limits. Normal image and cart limits still apply."],
        ["Storage lifetime", "Storage upload grants last two hours and cannot overwrite an existing object. Unused staging files are removed after the one-hour session plus the grant window. Claimed staging files expire with the cart, subject to that minimum window and legal holds. Validated print files follow the cart retention policy."],
        ["Errors", "401 widget_session_required/expired: start a new session. 403 origin_not_allowed/widget_unavailable/invalid_upload: fix account, website or file ownership. 409 idempotency_conflict: reset for changed inputs. 429 widget_limit: honor Retry-After; repeated quota failures need the operator. Normal validation errors are returned on the cart."],
      ]}/>
      <p>The public code is an identifier, not a secret or proof of the caller&apos;s identity. Allowed origins restrict browser use; they do not authenticate non-browser callers. The service enforces expiring sessions, upload quotas, partner status and file ownership independently. Keep the session token private to the customer&apos;s tab.</p>
      <p>Existing snippets without <code>data-partner-key</code> keep the legacy server-launcher behavior using your own cart endpoint. New snippets use the standalone flow above.</p>
    </section>
    <section id="affiliate" className="scroll-mt-24 space-y-4">
      <h2 className="text-2xl font-bold">Optional affiliate code</h2>
      <p>Approved affiliates can enable <strong>Your affiliate link</strong> in the <Link href="/dashboard" className="underline">partner dashboard</Link>. The saved account preference applies to new API and widget carts. Keys do not contain the code; do not send an <code>affiliate_code</code> request field. Checkout prefills the saved code and applies existing eligibility, discount and self-referral rules. Customers can remove or replace it. Existing carts keep their original setting.</p>
    </section>
    <h2 className="text-2xl font-bold">Expiry and retention</h2>
    <p>This deployment creates carts with a {config.expiryHours}-hour lifetime from creation, including validation time. Always use the returned <code>expires_at</code>. New payment sessions cannot be started with less than 32 minutes left. Expired unpaid and failed carts are queued for cleanup; outstanding payment attempts are reconciled before deletion. Paid files remain for production, then for {config.retentionDays} days after shipment or cancellation, with recorded legal holds respected. These are file-retention rules; metadata and hashes remain.</p>
    <h2 className="text-2xl font-bold">Partner terms and customer rights</h2>
    <p>Partners do not promise they own every image their customers submit. Under the <Link href="/terms" className="underline">partner terms</Link>, partners must:</p>
    <ul className="list-disc space-y-2 pl-6"><li>Not knowingly send unlawful or infringing content.</li><li>Promptly remove content and stop sending it when TCGPlaytest forwards a complaint.</li><li>Cooperate with complaints, including providing order references.</li><li>Accept that TCGPlaytest may refuse, cancel or hold orders, and suspend partners who repeatedly send infringing content.</li></ul>
    <p>The customer gives the actual rights certification through a required checkout checkbox: “{CUSTOMER_RIGHTS_STATEMENT}” We retain the customer&apos;s cart ID, acceptance timestamp, statement and terms version separately from the partner&apos;s acceptance.</p>
    <p>When partner terms change, API requests return <code>403 terms_required</code> until a person accepts the current terms in the dashboard. Existing API keys do not need rotation. Requests still containing <code>certification</code> receive <code>400 invalid_request</code>; remove that field.</p>
  </article>
}
