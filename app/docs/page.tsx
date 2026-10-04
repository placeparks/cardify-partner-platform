import Link from "next/link"
const sample = `// POST /api/tcgplaytest/cart on YOUR server
// Authenticate your customer and load their selected order from your database.
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
// Save cart.id against this customer's order. Return the cart JSON (HTTP 202).
// No checkout_url is returned while status is "validating".

// GET /api/tcgplaytest/cart?cart_id=... on YOUR server
// Check that the requested cart belongs to the signed-in customer first.
const status = await fetch(API_BASE + "/v1/carts/" + ownedCartId, {
  headers: { Authorization: "Bearer " + process.env.TCGP_API_KEY },
  cache: "no-store"
});
// Relay the JSON. Your browser/widget polls this route every 3–5 seconds.
// Redirect only when status === "open", using the returned checkout_url.`
const errors = [
  ["image_unreachable","URL could not be fetched or did not return HTTP 200."],
  ["image_url_unsafe","URL or redirect is not public HTTPS; local/private destinations are blocked."],
  ["image_redirect_limit","More than three redirects."],
  ["image_timeout","Download exceeded the time limit."],
  ["image_too_large","More than 20 MiB."],
  ["image_invalid","Not a decodable, single-frame PNG/JPEG."],
  ["image_dimensions_invalid","Below the print team's configured minimum width or height."],
  ["image_pixels_exceeded","More than 40 megapixels."],
  ["image_hash_mismatch","An optional supplied SHA-256 does not match the downloaded bytes."],
  ["content_blocked","Artwork cannot be accepted."],
  ["validation_unavailable","Validation/storage could not complete. Create a new cart or contact support."],
]
export default function DocsPage() { return <article className="mx-auto max-w-4xl space-y-6 px-5 py-12 leading-8">
  <h1 className="text-3xl font-black sm:text-4xl">Partner API: create, check, checkout</h1>
  <p>URL flow v2 uses the existing <code>/v1</code> endpoints. Authenticate from your server with a <code>tcgp_test_</code> or <code>tcgp_live_</code> bearer key. The API base is your partner platform origin. Keep keys on your server.</p>
  <ol className="list-decimal space-y-3 pl-6">
    <li>Submit front and back image URLs when the customer places an order. <code>POST /v1/carts</code> returns <strong>202 Accepted</strong> with <code>status: validating</code> and no checkout URL.</li>
    <li>A background worker downloads and checks the files. Poll <code>GET /v1/carts/&#123;id&#125;</code> every 3–5 seconds.</li>
    <li>When status is <code>open</code>, redirect to <code>checkout_url</code>. The customer accepts the image-rights terms and pays at TCGPlaytest checkout.</li>
    <li>TCGPlaytest prints from those already-checked files. Payment does not trigger another source download.</li>
  </ol>
  <h2 className="text-2xl font-bold">Submit client-supplied URLs</h2>
  <p>Each item requires <code>image_url</code>, a positive integer <code>quantity</code>, and a back supplied using item-level or shared top-level <code>back_image_url</code>. Images must be public HTTPS PNG/JPEG files. Maximum size is 20 MiB per file and 40 megapixels. The project default minimum is 744 pixels wide by 1040 pixels high. Up to three redirects are allowed, with public-address checks at every hop. Keep URLs available until validation finishes.</p>
  <p><code>sha256</code> and <code>back_sha256</code> are optional. TCGPlaytest computes the hash of the downloaded bytes; a supplied mismatch fails that item. Do not send <code>certification</code> or a partner-terms version in the request. TCGPlaytest records the authenticated partner's accepted terms version and acceptance timestamp on each new cart, on the server side. The customer gives the image-rights certification through the required checkout checkbox before payment.</p>
  <h2 className="text-2xl font-bold">Partner terms and responsibilities</h2>
  <p>Accept the <Link href="/terms" className="underline">partner terms</Link> once per version in the dashboard before using API or widget checkout. Partners do not promise they own every image their customers submit. Partners must:</p>
  <ul className="list-disc space-y-2 pl-6"><li>Not knowingly send unlawful or infringing content.</li><li>Promptly remove content and stop sending it when TCGPlaytest forwards a complaint.</li><li>Cooperate with complaints, including providing order references.</li><li>Accept that TCGPlaytest may refuse, cancel or hold orders, and suspend partners who repeatedly send infringing content.</li></ul>
  <p>The customer confirms: “I confirm I own these images or have permission to reproduce them, and I accept responsibility for the content of this order.” We retain the customer's cart ID, acceptance timestamp, statement and terms version separately from the partner's acceptance. When terms change, the API returns <code>403 terms_required</code> until the partner accepts in the dashboard; existing keys do not need to be rotated. Requests still containing <code>certification</code> receive <code>400 invalid_request</code>; remove that field.</p>
  <p>Only standard stock is supported. Optional <code>external_ref</code> is returned in status responses. <code>return_url</code> must be on your registered HTTPS website; otherwise that website is used. Confirm payment through signed order webhooks or the order API, not a browser return.</p>
  <pre tabIndex={0} aria-label="Server integration example" className="overflow-auto rounded border border-cyan-300/20 bg-slate-950 p-4 text-xs leading-6 text-emerald-300 sm:p-5">{sample}</pre>
  <h2 className="text-2xl font-bold">Cart status</h2>
  <p>Cart GET responses include <code>id</code>, <code>status</code>, <code>progress: &#123;done, total&#125;</code>, <code>errors</code>, <code>expires_at</code>, <code>order_id</code>, <code>partner_terms_version</code>, card counts and the saved affiliate code. Progress counts unique URLs, not card copies. Each URL is checked once per cart in a normal validation run; an interrupted worker can retry safely. Files are never reused across carts.</p>
  <ul className="list-disc space-y-2 pl-6"><li><code>validating</code>: checks are running; keep polling.</li><li><code>open</code>: every file passed; <code>checkout_url</code> is now included.</li><li><code>failed</code>: checks finished with errors for every bad item, including <code>item_index</code> (zero-based), <code>side</code>, <code>code</code>, and <code>message</code>. Fix the inputs and create a new cart with a new idempotency key.</li><li><code>converted</code>, <code>expired</code>, <code>blocked</code>, or <code>cancelled</code>: checkout is unavailable; a converted cart includes its order ID.</li></ul>
  <p>Authenticated cart GETs are exempt from the 60 requests per key per minute write/order limit. Poll every 3–5 seconds and honor <code>Retry-After</code>. Do not rotate keys while a cart is validating. Test keys run the same artwork checks but cannot charge, print, or ship.</p>
  <h2 className="text-2xl font-bold">Validation errors</h2>
  <div role="region" aria-label="Validation errors" tabIndex={0} className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm [&_th]:p-3 [&_td]:p-3"><thead><tr><th>Code</th><th>Meaning</th></tr></thead><tbody>{errors.map(([code,text])=><tr key={code}><td className="font-mono">{code}</td><td>{text}</td></tr>)}</tbody></table></div>
  <p>Malformed requests fail immediately with JSON <code>{'{"error":{"code":"invalid_request","message":"…","item_index":0}}'}</code>. Other HTTP errors include 401 authentication, 403 unavailable access, 404 not found, 409 idempotency conflict, 413 oversized JSON, 429 rate limit, and 503 configuration/unavailability. File failures appear in the cart's <code>errors</code> array before checkout becomes available.</p>
  <h2 className="text-2xl font-bold">Retries and retention</h2>
  <p><code>Idempotency-Key</code> is required. Identical retries return the original cart (202 while validating, otherwise 200); changed instructions return 409. An expired or failed cart cannot be reopened by reusing its key. Files are stored privately at a cart-specific path. Expired unpaid and failed carts are queued for cleanup; outstanding payment attempts are reconciled before deletion. Paid files remain for production and the configured retention period, with recorded legal holds respected. The project defaults are a 7-day cart lifetime and 30-day artwork retention after shipment or cancellation. The cart's <code>expires_at</code> is authoritative.</p>
  <section id="widget" className="scroll-mt-24 space-y-4"><h2 className="text-2xl font-bold">Checkout widget</h2>
    <p>Copy the script from your dashboard after implementing the two server routes above. The widget calls your same-origin <code>POST /api/tcgplaytest/cart</code>, then polls <code>GET /api/tcgplaytest/cart?cart_id=…</code> until the cart opens. Authenticate the customer, verify order ownership on both routes, and apply your shop's CSRF protection. Return the API's cart JSON; never expose the API key.</p>
    <p>Customize routes using <code>data-cart-endpoint</code> and <code>data-cart-status-endpoint</code>. For a custom button use <code>data-auto-button="false"</code> and <code>{'TCGPlaytest.open({createCart, pollCart})'}</code>; both callbacks call your own authenticated server. The widget shows failures and redirects only to a validated TCGPlaytest checkout URL. Use signed webhooks for payment confirmation.</p>
    <p>There are no manufacturing API upload, pre-signed upload, or finalize endpoints. Your website hosts or supplies the URLs.</p>
  </section>
  <section id="affiliate" className="scroll-mt-24 space-y-4"><h2 className="text-2xl font-bold">Optional affiliate code</h2><p>Approved affiliates can enable <strong>Your affiliate link</strong> in the <Link href="/dashboard" className="underline">partner dashboard</Link>. The saved account preference applies to new API and widget carts. Keys do not contain the code; do not send an <code>affiliate_code</code> request field. Checkout prefills the saved code and applies existing eligibility, discount and self-referral rules. Customers can remove or replace it. Existing carts keep their original setting.</p></section>
  <h2 className="text-2xl font-bold">Order webhooks</h2>
  <p><code>GET /v1/orders/&#123;id&#125;</code> returns production and shipment status. Webhook events include <code>order.paid</code>, <code>order.in_production</code>, <code>order.shipped</code>, <code>order.cancelled</code> and <code>cart.expired</code>. Deduplicate by event ID.</p>
  <p>Verify <code>TCGP-Signature</code> as <code>t=unix_seconds,v1=hex_hmac</code>: HMAC-SHA256 over the exact <code>timestamp + "." + rawBody</code> using your signing secret. Compare in constant time and reject timestamps more than five minutes old. Respond with 2xx; failed deliveries retry with exponential delays up to 12 attempts.</p>
  <Link className="underline" href="/terms">Manufacturing responsibilities and API terms</Link>
</article> }
