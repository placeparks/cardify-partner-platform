import { CodeExample } from './code-example'

export function SandboxGuide({ baseUrl }: { baseUrl: string }) {
  return <>
    <h2>Test an order from checkout to shipment</h2>
    <p>Use a <code>tcgp_test_</code> API key or a widget with <code>data-mode="test"</code>. Artwork validation is real; checkout and fulfillment are simulated. This works even when the platform uses live Stripe credentials. No charge, printing, shipping, credit deduction or Connect transfer occurs.</p>
    <ol>
      <li>Configure a <strong>Test order webhook</strong> in the dashboard. Save its signing secret on your server. It is separate from the Live webhook.</li>
      <li>Create a cart with your test key and real test artwork. Save the returned cart ID, your customer/session, and the exact selected items and quantities as an immutable checkout revision. Set <code>external_ref</code> to that revision and <code>return_url</code> to your thank-you page on the registered website origin.</li>
      <li>Poll the cart until <code>open</code>. Open its <code>checkout_url</code>. In the widget, click <strong>Open simulated checkout</strong>; this opens a full page, while live delivery checkout remains embedded.</li>
      <li>Use the dummy delivery details, select the simulation confirmation and click <strong>Complete simulated checkout</strong>. The fields are demonstration inputs and are not saved. A single <code>test_order_…</code> order and an <code>order.paid</code> test event are saved atomically. The cart becomes <code>converted</code>.</li>
      <li>Click <strong>Return to your store</strong>. After server verification, the saved return URL receives <code>cart_id</code>, <code>order_id</code>, <code>mode=test</code> and <code>simulated=true</code>. Existing query parameters are preserved. These browser parameters are hints, not proof of confirmation.</li>
      <li>Your server reads the saved cart and its <code>order_id</code> with the test key, verifies the simulated order, and removes only that revision&apos;s purchased quantities. Items added or changed afterwards stay in the cart. A repeated redirect or webhook must not remove items twice.</li>
    </ol>
    <h3>Server-only completion for automated tests</h3>
    <p>This uses the same validation and atomic order creation as the browser button. Only an open, unexpired test hosted/Connect cart belonging to the key is eligible. No Idempotency-Key is needed: completion is idempotent by cart. Repeats return the current order and do not emit another paid event.</p>
    <CodeExample label="Complete a test cart">{`curl --request POST '${baseUrl}/v1/test/carts/CART_ID/complete' \\
  --header "Authorization: Bearer $TCGP_TEST_API_KEY" \\
  --header 'Content-Type: application/json' \\
  --data '{"confirm_simulation":true}'`}</CodeExample>
    <h3>Verify before clearing purchased items</h3>
    <p>This example runs on your server. Implement the ownership lookup and transaction against your own store database. Keep test and live carts separate; never clear a live purchase using a simulated event.</p>
    <CodeExample label="Server verification pattern">{`// Load from your database using the signed-in customer, not a browser order_id.
const revision = await loadOwnedCheckoutRevision(customer.id);
const read = async path => {
  const response = await fetch(API_BASE + path, {
    headers: { Authorization: "Bearer " + process.env.TCGP_TEST_API_KEY },
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Order verification unavailable");
  return response.json();
};
const cart = await read("/v1/carts/" + revision.cartId);
if (revision.mode !== "test" || cart.mode !== "test" ||
    cart.status !== "converted" || !cart.order_id) return;
const order = await read("/v1/orders/" + cart.order_id);
if (order.cart_id !== revision.cartId || order.external_ref !== revision.externalRef ||
    order.mode !== "test" || order.simulated !== true ||
    !["paid", "in_production", "shipped"].includes(order.status)) return;

// One transaction: lock this revision, skip if already cleared,
// verify order.items (item_index + quantity) against its frozen snapshot,
// remove only those purchased quantities, then mark this revision cleared.
// Preserve later additions/edits. NEVER clear the customer's entire cart.
await clearPurchasedRevisionOnce(customer.id, revision, order);`}</CodeExample>
    <p>For a standalone widget, configure an async <code>onCartReady(cart)</code> callback to save the cart ID against your customer on your server before checkout opens. It is awaited and can run again on retries, so make it idempotent. Set <code>returnUrl</code> to your thank-you URL and <code>externalRef</code> to your saved revision. A public partner code is not customer authentication. You can use the same partner&apos;s test API key to read its widget cart/order.</p>
    <h3>Simulate production and shipment</h3>
    <p>Using the returned <code>test_order_…</code> ID, send <code>in_production</code>, then <code>shipped</code>. Each successful transition queues the matching signed Test webhook. Shipment uses a clearly marked dummy carrier and tracking link. You can instead send <code>cancelled</code> from paid or in-production; shipped/cancelled orders cannot start a new lifecycle. Create a new cart for another scenario.</p>
    <CodeExample label="Advance a simulated order">{`curl --request POST '${baseUrl}/v1/test/orders/TEST_ORDER_ID/events' \\
  --header "Authorization: Bearer $TCGP_TEST_API_KEY" \\
  --header 'Content-Type: application/json' \\
  --data '{"status":"in_production"}'

# Repeat with {"status":"shipped"} after production.
# Or {"status":"cancelled"} before shipment.
curl '${baseUrl}/v1/orders/TEST_ORDER_ID' \\
  --header "Authorization: Bearer $TCGP_TEST_API_KEY"`}</CodeExample>
    <p>Order responses include <code>mode: "test"</code>, <code>simulated: true</code> and the original item-index/quantity snapshot. Webhook <code>data</code> includes the same test markers. Event types are <code>order.paid</code>, <code>order.in_production</code>, <code>order.shipped</code> and <code>order.cancelled</code>. Repeating an already-emitted transition returns current state without re-emitting it. Invalid transitions return 409. Live keys return 403, other partners&apos; IDs return 404.</p>
    <h3>Webhook verification and delivery</h3>
    <p>Delivery uses the existing signed webhook queue and maintenance worker, so it is asynchronous. Verify the exact raw body with your <strong>Test</strong> signing secret, reject stale timestamps, deduplicate event IDs and handle events arriving out of order. Read current order status when necessary. Saving a simulation confirms it was queued, not that your endpoint accepted it. If nothing arrives, check the Test webhook URL, worker schedule and delivery attempts; see <a href="/docs/webhooks">webhook setup</a>. The shared API-key rate limit also applies to completion, event simulation and order reads.</p>
    <h3>Connect simulation and what remains to test</h3>
    <p>With a test key, send the usual <code>settlement: "connect"</code> and <code>retail_amount_cents</code> in the cart request. No Connect onboarding is required for this simulator. It exercises your order flow and echoes the supplied card retail price; it does not calculate or collect a customer total. Stripe checkout, pricing, discounts, tax, fees, transfers, reserves, refunds and payout onboarding still require a separate Stripe test-environment checkout. The prepaid sandbox keeps its existing flow and is not accepted by these new endpoints.</p>
    <p>Live orders always require real server-verified payment. Never treat <code>simulated: true</code> as real payment or send simulated orders to fulfillment.</p>
  </>
}
