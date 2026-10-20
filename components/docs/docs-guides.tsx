import { ArrowRight, Braces, CheckCircle2, Code2, CreditCard, Layers3, Palette, Rocket, ShieldCheck } from 'lucide-react'
import { CodeExample } from './code-example'
import styles from './docs.module.css'

export function DocsOverview({ baseUrl }: { baseUrl: string }) {
  return <>
    <div className={styles.hero}>
      <span className={styles.eyebrow}>TCGPlaytest for developers</span>
      <h1>Your card experience.<br /><span>Our printing API.</span></h1>
      <p>Turn finished artwork into cards delivered to your customers. Build on your own website. We handle artwork validation, printing and shipping.</p>
      <div className={styles.heroLinks}><a href="/docs/before-you-start">Start building <ArrowRight size={15} /></a><a href="/docs/create-cart">Explore the API <ArrowRight size={14} /></a><a href="/docs/mcp">Order with AI · MCP <ArrowRight size={14} /></a></div>
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
    <div className={styles.callout}><CheckCircle2 size={19} /><p><strong>The same integration runs live.</strong> Stripe credentials select the payment environment automatically. Your existing <code>tcgp_live_</code> partner API key stays valid. With the current migrations applied, there is no database switch or extra mode setting.</p></div>
    <h2>For partners integrating the API</h2>
    <ol className={styles.checklist}>
      <li><strong>Use your live partner API key</strong><p>Keep <code>TCGP_API_KEY</code> in your server environment. A <code>tcgp_test_</code> key opens a non-paying hosted preview. Stripe credentials belong to the platform; partners do not need Stripe Connect to use this API.</p></li>
      <li><strong>Register your production website</strong><p>Your HTTPS <code>return_url</code> must match your registered website origin exactly. Update your application&apos;s <code>STORE_ORIGIN</code> if your domain changes. Add any extra widget or checkout embedding origins in the dashboard.</p></li>
      <li><strong>Confirm orders on your server</strong><p>Configure your Live order webhook in the dashboard, verify signatures and deduplicate events. Your custom success page must verify the saved cart and order. A browser return is not proof of payment.</p></li>
      <li><strong>Fund printing, if you use credit</strong><p>Accept the prepaid terms and buy real printing credit. Test payments never fund the live balance. Eligible API and standalone widget carts use enough credit for the whole printing cost; otherwise the customer pays the normal full checkout. Test-mode widget previews do not spend credit.</p></li>
    </ol>
    <h2>For the platform operator</h2>
    <p>These settings belong to the partner platform and commerce deployments. Partners using the API do not need to configure them.</p>
    <ol className={styles.checklist}>
      <li><strong>Switch both deployments to the same live Stripe account</strong><p>Set <code>STRIPE_SECRET_KEY</code> to the live secret on both apps. Replace any Stripe publishable keys used by a frontend with their matching live keys. Finish or reconcile pending sandbox checkouts before switching; keep separate deployments if you need both environments active.</p></li>
      <li><strong>Use each live webhook endpoint&apos;s signing secret</strong><p>On the partner platform, set <code>STRIPE_CREDIT_WEBHOOK_SECRET</code> for <code>/api/stripe/credit-webhook</code>. On commerce, set <code>STRIPE_WEBHOOK_SECRET</code> for <code>/api/webhook</code>. These are separate Stripe endpoints with separate secrets. Neither is the partner order webhook secret shown in the dashboard.</p></li>
      <li><strong>Complete live Stripe Tax setup</strong><p>Configure the live account&apos;s tax settings, including its business address and relevant registrations. Live prepaid quotes use Stripe Tax and stop if tax calculation fails. Only prepaid quotes using test credentials skip Tax and return zero tax; this is not a tax exemption for live orders.</p><p>Restore any testing-only comments that disabled <code>automatic_tax</code> in ordinary commerce checkout before going live. The prepaid shipping checkout already uses its saved tax quote; do not add automatic tax there again.</p></li>
      <li><strong>Keep the platform connected and enabled</strong><p>Keep <code>PARTNER_PREPAID_ENABLED=true</code> on both apps and <code>PARTNER_LIVE_ENABLED=true</code> on the partner platform. Verify the HTTPS API and checkout origins, shared internal secret, existing storage/database migrations and scheduled validation/reconciliation workers. No new SQL is needed just to change Stripe credentials.</p></li>
      <li><strong>Redeploy and verify the complete flow</strong><p>Confirm webhook delivery and balance reconciliation, credit-funded and normal checkout, the partner success redirect, and manufacturing order creation before taking customer orders. Live keys alone do not verify those connections.</p></li>
    </ol>
    <h2>Credit webhook events</h2>
    <p>Create the live Stripe endpoint at <code>{baseUrl}/api/stripe/credit-webhook</code>. Enable the events handled by the credit receiver:</p>
    <CodeExample label="Stripe credit webhook · event selection">{`checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.expired
charge.refunded
refund.created
refund.updated
refund.failed
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
charge.dispute.funds_withdrawn
charge.dispute.funds_reinstated`}</CodeExample>
    <p>Keep the normal commerce payment webhook configured separately. Stripe verifies payments; the platform then updates the balance or order and sends signed partner lifecycle events.</p>
    <h2>What stays the same</h2>
    <p>Your application code, cart endpoints, existing live partner key, registered branding and current database schema can stay the same. Existing real balances remain intact; sandbox balances stay isolated. Buy real credit for real printing.</p>
    <h2>Resolve common launch errors</h2>
    <ul>
      <li><code>prepaid_disabled</code>: enable <code>PARTNER_PREPAID_ENABLED=true</code> on the commerce deployment and redeploy. Check the partner deployment too.</li>
      <li><code>prepaid_tax_settings</code>: finish live Stripe Tax setup in the Stripe account used by commerce. A missing tax configuration must not silently turn into a zero-tax live order.</li>
      <li><code>prepaid_stripe_mode_mismatch</code>: both deployments must use credentials from the same Stripe environment.</li>
      <li><code>prepaid_terms_required</code>: the partner needs to accept the current prepaid terms in their dashboard.</li>
    </ul>
    <p>Related Stripe documentation: <a href="https://docs.stripe.com/keys#switch-to-live-mode" target="_blank" rel="noreferrer">switching API keys</a>, <a href="https://docs.stripe.com/webhooks" target="_blank" rel="noreferrer">webhook endpoints</a>, and <a href="https://docs.stripe.com/tax/settings-api" target="_blank" rel="noreferrer">Tax settings</a>.</p>
  </>
}
