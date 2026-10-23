import { CodeExample } from './code-example'
import styles from './docs.module.css'

export function FirstOrderGuide({ baseUrl }: { baseUrl: string }) {
  return <>
    <h2>First order in 10 minutes</h2>
    <p>Start with one dummy card and follow a simulated order through payment, production, shipment and webhook processing. The built-in demo receiver works immediately: no receiver hosting, signing-secret setup or smoke-test environment variables are needed.</p>
    <ol className={styles.checklist}>
      <li><strong>Open your widget in test mode</strong><p>Copy your personalized script from the dashboard and change <code>data-mode="live"</code> to <code>data-mode="test"</code>. Keep the same public partner key and use an allowed website origin. Or create a cart using your server-side <code>tcgp_test_</code> API key and <a href="/docs/sandbox">the sandbox API</a>.</p></li>
      <li><strong>Add a dummy card</strong><p>Wait for artwork validation, then choose <strong>Open simulated checkout</strong>. API users open the returned <code>checkout_url</code>.</p></li>
      <li><strong>Complete simulated checkout</strong><p>Use the sample details and confirm the simulation. The order and built-in demo receipt are saved. Expand the paid event to see its payload, demo signature verification, simulated 503 → 200 retry and one state application.</p></li>
      <li><strong>Follow production and shipping</strong><p>Click <strong>Simulate production</strong>, then <strong>Simulate shipment</strong>. The order and demo receiver state advance together. Receipts remain visible when you reload the checkout while its link is valid.</p></li>
      <li><strong>Try failure cases</strong><p><strong>Replay duplicate</strong> increases delivery attempts without applying the event again. <strong>Try invalid signature</strong> demonstrates a 401 rejection without changing receiver state. Cancellation is available before shipment.</p></li>
    </ol>
    <aside className={styles.callout}><p><strong>Demo success is not external delivery.</strong> The built-in receiver runs locally inside the sandbox service with an ephemeral demonstration signing key. It does not contact your server, test the maintenance worker, clear your store cart or prove your webhook implementation.</p></aside>
    <details><summary>Optional: verify delivery to your own receiver</summary>
    <p>When you are ready to test an external integration, use the example below. This advanced path needs your HTTPS receiver and the platform delivery worker; queued delivery alone is not success.</p>
    <ol className={styles.checklist}>
      <li><strong>Get your test key</strong><p>Complete partner setup and accept the current terms in the <a href="/dashboard">dashboard</a>. Create a <code>tcgp_test_</code> key. Use the API host belonging to that dashboard; staging keys and production keys are not interchangeable by assumption.</p></li>
      <li><strong>Start the test receiver</strong><p>Download the <a href="/examples/sandbox-quickstart.zip">runnable Node.js 24 sandbox example</a>. It includes dummy artwork, a signature-verifying receiver, durable SQLite storage and a test runner. Put its receiver behind HTTPS on your registered website origin. In Dashboard → Order webhooks → <strong>Test</strong>, save <code>https://your-test-site.example/webhooks/tcgplaytest</code>. Store the displayed signing secret on the receiver server.</p><p>The receiver is only for test fixtures. It rejects live events and unknown runs. Keep its control token server-side, use a persistent disk, and proxy both <code>/webhooks/tcgplaytest</code> and <code>/runs</code> to its localhost port 8788.</p></li>
    </ol>
    <CodeExample label="Receiver server environment · replace placeholders">{`# Node.js 24; run in the extracted example directory.
# Put these values in your server's secret environment, not a public repository.
TCGP_TEST_WEBHOOK_SECRET=whsec_YOUR_TEST_WEBHOOK_SECRET
SMOKE_RECEIVER_TOKEN=YOUR_RANDOM_TOKEN_AT_LEAST_32_CHARACTERS
SMOKE_RECEIVER_DB=/persistent-volume/smoke-receiver.sqlite

node receiver.mjs`}</CodeExample>
    <p>Use your host&apos;s environment settings, or a private environment file with <code>node --env-file=.env.receiver receiver.mjs</code>. The secret is the dashboard&apos;s <strong>Test webhook signing secret</strong>, not your API key.</p>
    <ol start={3} className={styles.checklist}>
      <li><strong>Run your first sandbox order</strong><p>Set the following environment on your terminal/server. The example uploads the included dummy PNG, creates a one-card cart, waits for validation, completes simulated checkout, verifies the order, and waits for actual webhook delivery.</p></li>
    </ol>
    <CodeExample label="Test runner environment">{`SMOKE_PARTNER_ORIGIN=${baseUrl}
SMOKE_TEST_API_KEY=tcgp_test_YOUR_KEY
SMOKE_RECEIVER_ORIGIN=https://your-test-site.example
SMOKE_RECEIVER_TOKEN=THE_SAME_PRIVATE_CONTROL_TOKEN

node --env-file=.env.runner first-order.mjs`}</CodeExample>
    <p>On production, use <code>https://partner.tcgplaytest.com</code> with a <code>tcgp_test_</code> key and the Test webhook from that dashboard. Test mode still simulates payment and fulfillment on the production host. For a staging-only run, use <code>https://partner-test-two.vercel.app</code> with its own key and Test webhook; its matching commerce site is <code>https://testing123-prof.vercel.app</code>.</p>
    <ol start={4} className={styles.checklist}>
      <li><strong>Check the proof</strong><p>The runner prints a <code>test_order_…</code> ID. The receiver checks the raw-body HMAC signature and timestamp, intentionally returns 503 on the first paid delivery, and waits for the platform&apos;s actual retry. The paid event must be applied once. Three duplicate deliveries must leave its update count unchanged. Invalid signatures must return 401 without changing state. Simulated production/shipping events then update it to <code>shipped</code>. Only then does the runner print PASS.</p></li>
      <li><strong>Connect your own cart</strong><p>Save the cart ID and the purchased item snapshot against your authenticated customer before checkout. After a verified webhook or server-side order lookup, atomically mark that revision processed and remove only its purchased quantities. A redirect alone is never confirmation. See <a href="/docs/sandbox">the cart-clearing pattern and browser simulator</a>.</p></li>
    </ol>
    </details>
    <h2>Common mistakes</h2>
    <aside className={styles.callout}><p><strong>External “queued” is not delivered.</strong> A missing Test webhook setting does not block the built-in demo. To test your own endpoint, configure its URL and signing secret and check actual delivery and stored state. The optional external example fails if delivery times out.</p></aside>
    <aside className={styles.callout}><p><strong>Test checkout is a full page.</strong> Open the returned test <code>checkout_url</code>. For live embedded checkout, pass the complete owned cart JSON to browser JavaScript <code>TCGPlaytest.checkout(cart)</code> after loading your personalized widget script. PHP creates and returns the cart; it cannot run that browser function.</p></aside>
    <aside className={styles.callout}><p><strong>Keep environments and origins together.</strong> Create the test key and Test webhook on the same partner deployment. The webhook and return URL use your registered website origin; staging and production widget origins must be allowed separately. Never paste a secret API key into the widget snippet.</p></aside>
    <h2>What the sandbox proves</h2>
    <p>The default walkthrough exercises real uploads, artwork validation, cart ownership, simulated order creation and a persistent demo inbox with signature verification and duplicate protection. Its retry is simulated locally. Only the optional external receiver path tests network delivery and worker retries. Neither proves your store&apos;s cart-clearing implementation until you connect and test that code.</p>
    <p>It does not charge a card, validate actual Stripe totals, discounts, tax, payment authentication or Connect transfers, consume printing credit, print or ship. Its simulated shipping data is not a carrier shipment. Live iframe policy is a separate check. Run Stripe test-mode payment tests and a controlled launch review before accepting live customer payments.</p>
    <p>Next: <a href="/docs/go-live">partner launch checklist</a>, then <a href="/docs/webhooks">webhook reference</a> for event details and retry behavior.</p>
  </>
}
