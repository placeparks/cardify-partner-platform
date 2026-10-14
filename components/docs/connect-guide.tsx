import Link from 'next/link'
import { CodeExample } from './code-example'
export function ConnectGuide({baseUrl}:{baseUrl:string}){
 return <>
  <h2>One payment, separate partner earnings</h2><p>Connect is an optional server API flow for US partners. Set a selling price for the cards; TCGPlaytest adds delivery and applicable tax, collects the customer payment and fulfills the order. Accept payout terms and finish onboarding in <Link href="/dashboard/connect">Dashboard → Payouts</Link>.</p>
  <h2>Create a Connect cart</h2><p>Keep your existing live partner API key on your server. Add <code>settlement: "connect"</code> and <code>retail_amount_cents</code> to the usual cart request. The amount is the entire cart&apos;s card-sale subtotal in USD cents, excluding shipping and tax, and must cover printing. It is immutable; changed artwork, quantities or price require a new cart and idempotency key. Build this price from your saved order on your server, never directly from browser input.</p>
  <CodeExample label="Connect cart · cURL">{`curl --request POST '${baseUrl}/v1/carts' \\
  --header "Authorization: Bearer $TCGP_API_KEY" \\
  --header 'Content-Type: application/json' \\
  --header 'Idempotency-Key: shop-order-1042-connect-v1' \\
  --data '{
    "settlement": "connect",
    "retail_amount_cents": 2500,
    "external_ref": "shop-order-1042",
    "return_url": "https://your-store.example/order-complete",
    "items": [{"image_url": "https://your-store.example/artwork/front.png", "quantity": 10}]
  }'`}</CodeExample>
  <p>Upload artwork and poll as usual. When open, use <code>TCGPlaytest.checkout(cart)</code> for delivery details on your website, followed by Stripe payment and your registered return URL. Verify signed order events before marking live orders paid. Connect does not allow affiliate discounts or another payment for the same cards.</p>
  <h2>How earnings and the reserve work</h2><p>Partner earnings = card-sale subtotal − quoted printing cost − the actual Stripe fee on the customer payment. Shipping and collected tax stay with TCGPlaytest. Earnings cannot be negative; a processing-fee shortfall pauses transfers for review.</p><p>We transfer 95% of earnings after verifying payment. The other 5%, rounded up to a whole cent, becomes eligible for automatic transfer 15 days after payment. Worker scheduling and Stripe availability apply; arrival in a bank account follows Stripe&apos;s payout schedule. This reserve is not an extra fee.</p>
  <p>Example only: $25 card sale − $10 printing − $1.20 actual processing fee = $13.80 earnings. $13.11 transfers first, and $0.69 is reserved. Actual Stripe fees vary; the integration reads the charge&apos;s balance transaction.</p>
  <h2>Keep prepaid credit separate</h2><p>Connect carts never reserve or spend printing credit, even when a partner has a balance. Omitted or <code>hosted</code> settlement keeps the existing automatic credit-or-normal-checkout behavior. Explicit <code>prepaid</code> keeps the advanced prepaid API. Standalone widget carts continue the credit-or-normal-checkout flow; partner-set retail prices require the authenticated server API.</p>
  <h2>Refunds, disputes and account restrictions</h2><p>Issue refunds through the platform Stripe account. Verified refunds reduce remaining partner earnings dollar-for-dollar, capped at those earnings; the worker reverses excess earlier transfers. Open or lost disputes stop releases and recover transfers where Stripe permits. Pending refunds, restricted accounts and unresolved recovery pause new transfers. Review outstanding recovery in Stripe; a reserve does not eliminate platform liability for refunds or disputes.</p>
  <h2>Operator setup</h2><p>Run the Connect migration once on the partner database. Set <code>PARTNER_CONNECT_ENABLED=true</code> on both apps. Both apps must use the same Stripe platform account and payment environment. Keep the existing internal secret, origins and commerce webhook. Set the separate <code>STRIPE_CONNECT_WEBHOOK_SECRET</code> on the partner platform for <code>{baseUrl}/api/stripe/connect/webhook</code>.</p>
  <CodeExample label="Platform Stripe webhook events">{`checkout.session.completed
checkout.session.expired
payment_intent.succeeded
charge.refunded
refund.created
refund.updated
refund.failed
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
charge.dispute.funds_withdrawn
charge.dispute.funds_reinstated`}</CodeExample>
  <p>These events belong to your platform account. Run the authenticated <code>/api/internal/connect-maintenance</code> cron every minute. Keep enough money in the platform Stripe balance to cover reserves; automatic bank payouts must not drain those funds before release. Current and past refunds are reconciled from Stripe, so repeated or unordered webhooks cannot create additional earnings.</p><p>Stripe test credentials use separate connected accounts and simulated transfers; they never create manufacturing orders. Changing credentials does not require different SQL. Finish pending test attempts before switching deployments to live; live accounts require onboarding and their live webhook secret. Complete live Stripe Tax settings before taking payments.</p>
 </>
}
