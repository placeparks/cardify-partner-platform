import { ArrowRight, Braces, Code2, CreditCard, Layers3, Palette, Rocket, ShieldCheck } from 'lucide-react'
import { CodeExample } from './code-example'
import styles from './docs.module.css'

export function DocsOverview({ baseUrl }: { baseUrl: string }) {
  return <>
    <div className={styles.hero}>
      <span className={styles.eyebrow}>TCGPlaytest for developers</span>
      <h1>Your card experience.<br /><span>Our printing API.</span></h1>
      <p>Turn finished artwork into cards delivered to your customers. Build on your own website. We handle artwork validation, printing and shipping.</p>
      <div className={styles.heroLinks}><a href="/docs/first-order">First order in 10 minutes <ArrowRight size={15} /></a><a href="/docs/create-cart">Explore the API <ArrowRight size={14} /></a><a href="/docs/mcp">Order with AI · MCP <ArrowRight size={14} /></a></div>
    </div>
    <h2>From artwork to checkout</h2>
    <div className={styles.quickGrid}>
      <div className={styles.steps}>
        <div className={styles.step}><span>1</span><div><strong>Send your finished artwork</strong><p>Upload PNG or JPEG files directly to our storage, or use your existing HTTPS image URLs.</p></div></div>
        <div className={styles.step}><span>2</span><div><strong>Let us prepare it for print</strong><p>Create a cart and poll its status. We validate each image and add print bleed automatically.</p></div></div>
        <div className={styles.step}><span>3</span><div><strong>Checkout on your website</strong><p>Open embedded delivery details, continue to Stripe, then return to your own success page.</p></div></div>
      </div>
      <CodeExample label="Create a cart · cURL">{`curl --request POST '${baseUrl}/v1/carts' \\
  --header "Authorization: Bearer $TCGP_API_KEY" \\
  --header 'Content-Type: application/json' \\
  --header 'Idempotency-Key: order-1042-rev1' \\
  --data '{
    "external_ref": "order-1042",
    "items": [{
      "image_url": "https://your-store.example/front.png",
      "quantity": 3
    }]
  }'`}</CodeExample>
    </div>
    <p>The example uses a placeholder image URL. Use your own public artwork or a completed upload reference. Run it on your server or terminal, then save the returned cart ID against the customer&apos;s order.</p>
    <h2>Choose how you build</h2>
    <div className={styles.cards}>
      <a href="/docs/widget"><Layers3 size={22} /><strong>Drop-in widget <ArrowRight size={15} /></strong><p>Connect your finished card images. The widget handles review, uploads and checkout.</p></a>
      <a href="/docs/language-examples"><Code2 size={22} /><strong>Server-side API <ArrowRight size={15} /></strong><p>Own your storefront. Get started with cURL, Node.js, Python or PHP.</p></a>
      <a href="/docs/branding"><Palette size={22} /><strong>Make checkout yours <ArrowRight size={15} /></strong><p>Add your logo, colors and welcome message. Bring customers back to your website.</p></a>
      <a href="/docs/prepaid"><CreditCard size={22} /><strong>Pay with printing credit <ArrowRight size={15} /></strong><p>Fund printing from your balance. Customers pay shipping and fulfillment tax through Stripe.</p></a>
    </div>
    <div className={styles.callout}><ShieldCheck size={19} /><p><strong>Your key stays on your server.</strong> The REST API uses bearer authentication. The standalone widget uses a public partner identifier and does not need your secret key. For guest ordering through an AI assistant, the <a href="/docs/mcp">public MCP server</a> needs no customer account or API key and includes a private card preview before checkout.</p></div>
    <h2 id="api-base">One API. Your own storefront.</h2>
    <div className={styles.endpoint}><span>BASE URL</span><code>{baseUrl}</code></div>
    <p>This is the public partner API. Use the keys issued by your partner dashboard. Checkout may run on a different origin; pass the returned open cart to <code>TCGPlaytest.checkout(cart)</code>. Never construct checkout tokens or URLs yourself.</p>
    <div className={styles.heroLinks}><a href="/openapi.json"><Braces size={15} /> OpenAPI 3.1</a><a href="/docs/go-live"><Rocket size={15} /> Prepare to go live</a></div>
  </>
}

export function GoLiveGuide({ baseUrl }: { baseUrl: string }) {
  return <>
    <h2>Partner launch checklist</h2>
    <p>Use this checklist for your storefront. Platform deployment, database and Stripe account setup are handled by TCGPlaytest operations.</p>
    <ol className={styles.checklist}>
      <li><strong>Complete one verified sandbox order</strong><p>Follow <a href="/docs/first-order">First order in 10 minutes</a>. Confirm that your Test webhook verifies the signature, stores the expected order state and handles retries without clearing purchased items twice. A queued event or browser redirect is not proof.</p></li>
      <li><strong>Register the exact website origins</strong><p>Save your production HTTPS website in the dashboard. Add any extra widget origins separately. Your return URL and webhook URL must use the registered website origin. Confirm live delivery details open on an allowed origin and fail on an unlisted origin.</p></li>
      <li><strong>Use the live key on your server</strong><p>Create a live API key from the production dashboard and set your server API base to <code>{baseUrl}</code>. Never put the secret key in browser JavaScript. The standalone widget uses your public partner identifier with <code>data-mode="live"</code>.</p></li>
      <li><strong>Configure the Live order webhook</strong><p>Live and Test webhook settings and secrets are separate. Verify raw-body signatures, save event IDs durably and process each event once. Reconcile with the order API when events arrive late or out of order.</p></li>
      <li><strong>Check the storefront handoff</strong><p>Browser JavaScript calls <code>TCGPlaytest.checkout(cart)</code> for live delivery details. Stripe opens outside the iframe. Verify the saved cart and order on your server before showing payment confirmation or removing purchased quantities; preserve later cart edits.</p></li>
      <li><strong>Check optional funding and payouts</strong><p>Ordinary hosted checkout does not require Stripe Connect. If you use printing credit, accept its terms and fund the live balance. If you use Connect payouts, complete onboarding and confirm that your account is ready.</p></li>
      <li><strong>Arrange a controlled launch check</strong><p>The simulator does not verify actual payment totals, discounts, shipping charges, tax or payouts. Coordinate a Stripe test-mode check and final launch approval with TCGPlaytest before opening sales. Keep the tested order references and webhook evidence.</p></li>
    </ol>
    <h2>Common mistakes</h2>
    <div className={styles.callout}><p><strong>Test is not a payment rehearsal.</strong> Hosted/Connect sandbox checkout simulates payment and fulfillment; it never charges, prints or ships.</p></div>
    <div className={styles.callout}><p><strong>Staging is a different origin.</strong> Allow it explicitly when embedding, and use keys and webhook settings from the matching partner dashboard.</p></div>
    <div className={styles.callout}><p><strong>A configuration error needs operator help.</strong> For a 503, missing delivery details, exhausted webhook retries or a payment-mode error, send support the timestamp, cart ID and request ID. Do not send API keys or webhook secrets.</p></div>
    <p>References: <a href="/docs/embedded-checkout">embedded checkout</a>, <a href="/docs/webhooks">webhooks</a>, <a href="/docs/success-page">verified success pages</a>.</p>
  </>
}
