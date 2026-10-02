import Link from "next/link"
const sample = `const response = await fetch(API_BASE + "/v1/carts", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + process.env.TCGP_API_KEY,
    "Content-Type": "application/json",
    "Idempotency-Key": customerOrder.id,
  },
  body: JSON.stringify({
    external_ref: customerOrder.id,
    card_stock: "standard",
    items: [{ image_url: frontUrl, sha256: frontSha256,
      back_image_url: backUrl, back_sha256: backSha256, quantity: 3 }],
    certification: {
      client_supplied: true,
      reproduction_authorized: true,
      manufacturing_only: true,
      terms_version: "2026-10-02"
    }
  })
});
const cart = await response.json();
if (!response.ok) throw new Error(cart.error.message);
// Send only this URL to the customer's browser.
return { checkout_url: cart.checkout_url };`
export default function DocsPage() {return <article className="mx-auto max-w-4xl space-y-6 px-5 py-12 leading-8"><h1 className="text-4xl font-black">Partner REST API v1</h1><p>Authenticate from your server with a <code>tcgp_test_</code> or <code>tcgp_live_</code> bearer key. The base URL is the deployed partner platform origin. Never expose API keys in browser code.</p>
  <table className="w-full text-left"><thead><tr><th>Endpoint</th><th>Purpose</th></tr></thead><tbody><tr><td>POST /v1/carts</td><td>Create a certified cart and checkout link</td></tr><tr><td>GET /v1/carts/&#123;id&#125;</td><td>Cart status, expiry, and order ID</td></tr><tr><td>GET /v1/orders/&#123;id&#125;</td><td>Production and shipment status, without customer or payment details</td></tr></tbody></table>
  <h2 className="text-2xl font-bold">Submit only when the customer orders</h2><p>Provide HTTPS PNG/JPEG front and back URLs, their SHA-256 hashes, and positive integer quantities. There is no supplied default back. A shared back can be submitted using top-level back_image_url and back_sha256. Only standard stock is enabled. Optional external_ref is returned in status responses. Optional return_url must use your approved website origin.</p><p>Unlike the original draft PDF, cart creation stores instructions and source references without downloading artwork. Keep URLs available until paid-order ingestion finishes. File content must match the submitted hashes. Invalid or unavailable files hold production; they are never substituted. Test mode validates instructions without downloading, charging, printing, or shipping.</p>
  <pre className="overflow-auto rounded border border-cyan-300/20 bg-slate-950 p-5 text-xs leading-6 text-emerald-300">{sample}</pre>
  <h2 className="text-2xl font-bold">Retries and limits</h2><p>Idempotency-Key is required. Reusing it with identical instructions returns the original cart; changed instructions return 409. Keys remain reserved for the lifetime of the cart record, exceeding the draft’s 24-hour guarantee. Defaults: 1,000 cards per cart, 60 requests per key per minute, seven-day cart expiry, 20 MiB per image, and 40 megapixels. Production dimensions are configured by the print team. Limits may be lowered at deployment.</p><p>Errors are JSON: <code>{'{"error":{"code":"invalid_request","message":"…","item_index":0}}'}</code>. Statuses include 400 validation, 401 invalid key, 403 blocked content, 404 not found, 409 conflict, 413 oversized request, 429 rate limit (Retry-After: 60), and 503 unavailable. Download/preflight errors occur after payment and prevent production.</p>
  <h2 className="text-2xl font-bold">Affiliates and webhooks</h2><p>Partners do not need an affiliate code to create API keys or carts. Customers can enter an optional affiliate code at TCGPlaytest checkout; the existing code validation, discount eligibility, self-referral checks, and paid-order rewards apply. No partner code is automatically selected. The cart affiliate_code field remains null for new carts; the validated customer code is recorded on the paid order in the main TCGPlaytest app. Configure separate test/live webhook URLs in the dashboard. Events include order.paid, order.in_production, order.shipped, order.cancelled, and cart.expired. Deduplicate by event ID.</p><p>Verify TCGP-Signature as <code>t=unix_seconds,v1=hex_hmac</code>. Calculate HMAC-SHA256 of the exact <code>timestamp + "." + rawBody</code> using your signing secret, compare in constant time, and reject timestamps more than five minutes old. Respond with 2xx. Failed deliveries retry with exponential delays up to 12 attempts; contact operations for replay after exhaustion.</p><Link className="text-cyan-300 underline" href="/terms">Manufacturing responsibilities and API terms</Link>
</article>}
