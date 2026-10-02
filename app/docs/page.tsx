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
    return_url: new URL("/order-complete", process.env.STORE_ORIGIN).href,
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
  <h2 className="text-2xl font-bold">Submit an order</h2><p>When a customer places an order, provide HTTPS PNG/JPEG front and back URLs, their SHA-256 hashes, positive integer quantities, and all three certifications shown below. A shared back can be submitted using top-level <code>back_image_url</code> and <code>back_sha256</code>. Only standard stock is available. Optional <code>external_ref</code> is returned in status responses. After payment confirmation, customers return to your registered website. To choose a specific page, supply <code>return_url</code> on that same HTTPS origin. Your server must still confirm payment through order webhooks or the order API.</p><p>Artwork is downloaded after payment. Keep URLs available until processing finishes, and ensure files match the submitted hashes. Invalid or unavailable files hold production. Test mode validates instructions without downloading artwork, charging, printing, or shipping.</p>
  <pre className="overflow-auto rounded border border-cyan-300/20 bg-slate-950 p-5 text-xs leading-6 text-emerald-300">{sample}</pre>
  <section id="widget" className="scroll-mt-24 space-y-4">
    <h2 className="text-2xl font-bold">Checkout widget</h2>
    <p>The widget adds a checkout button to your website and connects to the API through your server.</p>
    <ol className="list-decimal space-y-3 pl-6">
      <li>Accept the manufacturing terms and generate a server-side API key in your dashboard.</li>
      <li>Create <code>POST /api/tcgplaytest/cart</code> on your own website. Authenticate the customer and verify the request origin/CSRF protection. Load their selected order from your server, verify rights acceptance, and submit the manufacturing instructions using the API example above. Use a stable order revision ID as the idempotency key so retries do not create duplicate carts.</li>
      <li>Return JSON <code>{'{"checkout_url":"https://your-checkout-origin/partner-checkout/TOKEN"}'}</code> from that endpoint. Use the exact URL returned by the API. Never return the API key to the browser.</li>
      <li>Copy the widget script from your dashboard into your website. Set <code>data-cart-endpoint</code> if your server route has a different path. The widget sends a same-origin POST with an empty JSON object and your customer's cookies; your server must load the correct customer's cart.</li>
    </ol>
    <p>On click, the widget calls your server to create a cart and redirects the customer to TCGPlaytest checkout. Your account must have active API access.</p>
    <p>For a custom button, set <code>data-auto-button="false"</code> on the script and call <code>{'await TCGPlaytest.open({ createCart: yourCheckoutFunction })'}</code> on click. That function should call your own server, including any CSRF token your shop requires, and return the same JSON response. Handle a rejected promise by showing an error to the customer.</p>
    <p>Use signed order webhooks to confirm payment and fulfillment; opening checkout is not proof of payment. Test keys open a non-chargeable preview. Live keys open the main TCGPlaytest checkout. If you use a Content Security Policy, allow the partner platform in <code>script-src</code> and your own server in <code>connect-src</code>.</p>
    <p>If your site uses the previous upload popup, replace it with the current dashboard snippet and add the server endpoint above.</p>
  </section>
  <h2 className="text-2xl font-bold">Retries and limits</h2><p><code>Idempotency-Key</code> is required. Reusing it with identical instructions returns the original cart; changed instructions return 409. Use a unique key for each order revision. Keys remain reserved for the lifetime of the cart record. Default limits are 1,000 cards per cart, 60 requests per key per minute, seven-day cart expiry, 20 MiB per image, and 40 megapixels. Confirm current limits and minimum artwork dimensions with TCGPlaytest before integration.</p><p>Errors are JSON: <code>{'{"error":{"code":"invalid_request","message":"…","item_index":0}}'}</code>. Statuses include 400 validation, 401 invalid key, 403 blocked content, 404 not found, 409 conflict, 413 oversized request, 429 rate limit (Retry-After: 60), and 503 unavailable. Download/preflight errors occur after payment and prevent production.</p>
  <h2 className="text-2xl font-bold">Order webhooks</h2><p>Configure test and live webhook URLs in your dashboard. Events include <code>order.paid</code>, <code>order.in_production</code>, <code>order.shipped</code>, <code>order.cancelled</code>, and <code>cart.expired</code>. Deduplicate by event ID.</p><p>Verify <code>TCGP-Signature</code> as <code>t=unix_seconds,v1=hex_hmac</code>. Calculate HMAC-SHA256 of the exact <code>timestamp + "." + rawBody</code> using your signing secret, compare in constant time, and reject timestamps more than five minutes old. Respond with 2xx. Failed deliveries retry with exponential delays up to 12 attempts; contact TCGPlaytest to resend events after retries are exhausted.</p><Link className="text-cyan-300 underline" href="/terms">Manufacturing responsibilities and API terms</Link>
</article>}
