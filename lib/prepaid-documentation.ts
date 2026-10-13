const str={type:'string'}
const integer={type:'integer',minimum:0}
const ref=(name:string)=>({$ref:`#/components/schemas/${name}`})
const obj=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required})
const json=(schema:unknown)=>({'application/json':{schema}})
const requestBody=(name:string)=>({required:true,content:json(ref(name))})
const idem={name:'Idempotency-Key',in:'header',required:true,schema:{type:'string',pattern:'^[!-~]{1,200}$'},description:'Save one stable value for these exact instructions. Retry ambiguous failures with the same body and key.'}
const id={name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}}
const errors=Object.fromEntries([400,401,402,403,404,409,429,500,503].map(s=>[s,{description:s===402?'Insufficient available credit':s===409?'Expired/unavailable reservation, hold or idempotency conflict':'Request failed; see error.code. Retry safely.',content:json(ref('ApiError'))}]))
const result=(name:string,status=200)=>({[status]:{description:'Success',content:json(ref(name))},...errors})
export const prepaidSchemas={
  PrepaidShipping:obj({name:{...str,maxLength:200},email:{...str,format:'email',maxLength:254},line1:{...str,maxLength:200},line2:{...str,maxLength:200},city:{...str,maxLength:200},state:{...str,maxLength:200,description:'Required for US, CA and AU.'},postal_code:{...str,maxLength:200},country:{...str,pattern:'^[A-Z]{2}$'},phone:{...str,maxLength:200}},['name','email','line1','city','postal_code','country']),
  PrepaidQuoteRequest:obj({cart_id:str,shipping:ref('PrepaidShipping')}),
  PrepaidQuote:obj({mode:{const:'test',description:'Present when Stripe test credentials were used.'},simulated:{const:true},id:{...str,format:'uuid'},cart_id:str,currency:{const:'USD'},printing_cents:integer,shipping_cents:integer,tax_cents:integer,total_cents:integer,
    funding_model:{enum:['cards_credit','credit_all'],description:'New quotes use cards_credit. Historical funded orders retain credit_all.'},credit_cents:{...integer,description:'Printing cost only for new quotes.'},customer_payment_cents:{...integer,description:'Shipping plus fulfillment tax, paid separately by the customer.'},
    customer_payment_status:{enum:['not_required','pending','open','paid','expired','review','refund_pending','refunded']},checkout_expires_at:{type:['string','null'],format:'date-time'},checkout_url:{...str,format:'uri',description:'Only while a submitted customer checkout is open. Redirect the owning customer to this URL unchanged.'},
    status:{enum:['quoted','reserved','released','consumed','expired'],description:'Consumed means printing credit was spent; check customer_payment_status and order_id before claiming a manufacturing order.'},expires_at:{...str,format:'date-time'},order_id:{type:['string','null'],description:'Null until both payments have funded manufacturing.'},refunded_at:{type:['string','null'],format:'date-time'}},['id','cart_id','currency','printing_cents','shipping_cents','tax_cents','total_cents','funding_model','credit_cents','customer_payment_cents','customer_payment_status','checkout_expires_at','status','expires_at','order_id','refunded_at']),
  PrepaidAcceptance:obj({accepted:{const:true},terms_version:{const:'2026-10-04-v2'},email:{...str,format:'email'},accepted_at:{...str,format:'date-time',description:'Actual customer acceptance time, on/after cart creation. Persist this value; never regenerate it for retries.'},image_quality_accepted:{type:'boolean',description:'Must be true when the cart has artwork warnings; show them to the customer first.'}},['accepted','terms_version','email','accepted_at']),
  PrepaidOrderRequest:obj({quote_id:{...str,format:'uuid'},acceptance:ref('PrepaidAcceptance')}),
  PrepaidFundedOrder:obj({order_id:{type:['string','null']},cart_id:str,funding:{enum:['printing_credit_customer_shipping_tax','prepaid_credit']},quote:ref('PrepaidQuote'),status_url:str,checkout_url:{...str,format:'uri'}},['order_id','cart_id','funding','quote','status_url']),
  PrepaidBalance:obj({mode:{const:'test',description:'Present for the isolated test wallet.'},simulated:{const:true},currency:{const:'USD'},balance_cents:{type:'integer'},reserved_cents:integer,available_cents:{type:'integer'},spending_blocked:{type:'boolean'},ledger:{type:'array',items:obj({id:{type:'integer'},amount_cents:{type:'integer'},balance_after_cents:{type:'integer'},kind:{enum:['topup','topup_adjustment','order','refund']},reference:str,description:str,created_at:{...str,format:'date-time'}})},next_before:{type:['string','null']}},['currency','balance_cents','reserved_cents','available_cents','spending_blocked','ledger','next_before']),
}
export const prepaidPaths={
  '/v1/prepaid/balance':{get:{operationId:'getPrepaidBalance',tags:['Prepaid'],summary:'Read your active-mode USD balance and 50 ledger entries',parameters:[{name:'before',in:'query',schema:{type:'string',pattern:'^[0-9]{1,18}$'},description:'Use next_before to fetch older entries.'}],responses:result('PrepaidBalance')}},
  '/v1/prepaid/quotes':{post:{operationId:'createPrepaidQuote',tags:['Prepaid'],summary:'Quote printing, shipping and tax for a validated prepaid cart',description:'Requires prepaid terms and settlement=prepaid. An existing live partner API key works with either Stripe environment; Stripe credentials select the payment environment. Test credentials use isolated balances and simulated orders. Immutable address and price. Expires in at most 30 minutes, or sooner with the cart. No balance is reserved yet. Identical retries return the saved quote.',parameters:[idem],requestBody:requestBody('PrepaidQuoteRequest'),responses:{...result('PrepaidQuote',201),'200':{description:'Idempotent replay',content:json(ref('PrepaidQuote'))}}}},
  '/v1/prepaid/quotes/{id}':{get:{operationId:'getPrepaidQuote',tags:['Prepaid'],summary:'Read an owned quote and its reservation/funding state',parameters:[id],responses:result('PrepaidQuote')}},
  '/v1/prepaid/quotes/{id}/reserve':{post:{operationId:'reservePrepaidCredit',tags:['Prepaid'],summary:'Reserve printing credit before charging your customer for cards',description:'Reserves printing_cents only. No body. Idempotent by quote ID. One active reservation per cart. Does not extend expires_at. Returns 402 for insufficient funds; no printing occurs.',parameters:[id],responses:result('PrepaidQuote')}},
  '/v1/prepaid/quotes/{id}/release':{post:{operationId:'releasePrepaidCredit',tags:['Prepaid'],summary:'Release an unused reservation',description:'No body. Idempotent by quote ID. Released or expired quotes cannot be reserved again. Cannot release funded orders; contact support about cancellation.',parameters:[id],responses:result('PrepaidQuote')}},
  '/v1/prepaid/orders':{post:{operationId:'submitPrepaidOrder',tags:['Prepaid'],summary:'Spend printing credit and open customer shipping/tax checkout',description:'Confirm the card-sale payment in your own store first. Atomically spends printing_cents once and returns 202 with checkout_url, order_id:null and a quote status_url. Redirect the owning customer to Stripe to pay shipping_cents + tax_cents. Both payments must be verified before manufacturing and order.paid. A retry after funding returns 200 with the manufacturing ID. Persist acceptance/body/key. Cart must have more than 65 minutes remaining; customer checkout expires one hour after submission. Verified unpaid expiry automatically returns printing credit. Never infer payment from the browser return.',parameters:[idem],requestBody:requestBody('PrepaidOrderRequest'),responses:{...result('PrepaidFundedOrder'),'202':{description:'Printing credit spent; customer shipping/tax payment required. Follow checkout_url and poll the quote through your server.',content:json(ref('PrepaidFundedOrder'))}}}},
}
export function prepaidCurl(base:string){return `# YOUR SERVER only. Store TCGP_API_KEY in an environment variable.
API_BASE="${base}"
# Keep the same tcgp_live_ partner key when switching Stripe credentials.
# 1. Create artwork cart; poll it using GET /v1/carts/{id} until open.
curl --fail-with-body "$API_BASE/v1/carts" \\
  -H "Authorization: Bearer $TCGP_API_KEY" -H 'Content-Type: application/json' \\
  -H 'Idempotency-Key: shop-order-1042-artwork-v1' \\
  -d '{"settlement":"prepaid","external_ref":"shop-order-1042","items":[{"image_url":"https://your-shop.example/front.png","quantity":10}]}'

# Replace CART_ID with the returned cart ID after validation is open.
curl --fail-with-body "$API_BASE/v1/prepaid/quotes" \\
  -H "Authorization: Bearer $TCGP_API_KEY" -H 'Content-Type: application/json' \\
  -H 'Idempotency-Key: shop-order-1042-quote-v1' \\
  -d '{"cart_id":"CART_ID","shipping":{"name":"Customer Name","email":"buyer@example.com","line1":"123 Main St","city":"Seattle","state":"WA","postal_code":"98101","country":"US"}}'

# Save the returned quote ID and expires_at. Reserve BEFORE charging customer.
QUOTE_ID="REPLACE_WITH_QUOTE_UUID"
curl --fail-with-body -X POST "$API_BASE/v1/prepaid/quotes/$QUOTE_ID/reserve" \\
  -H "Authorization: Bearer $TCGP_API_KEY"

# Confirm payment for CARDS in your store (do not also collect the quoted
# shipping/fulfillment tax). Then prepare and persist order.json:
# {"quote_id":"the saved UUID","acceptance":{"accepted":true,
# "terms_version":"2026-10-04-v2","email":"buyer@example.com",
# "accepted_at":"the actual saved RFC3339 customer acceptance timestamp",
# "image_quality_accepted":true}}
# Show the exact rights statement and any warnings before recording acceptance.
curl --fail-with-body "$API_BASE/v1/prepaid/orders" \\
  -H "Authorization: Bearer $TCGP_API_KEY" -H 'Content-Type: application/json' \\
  -H 'Idempotency-Key: shop-order-1042-submit-v1' --data-binary @order.json

# HTTP 202: send the customer to checkout_url to pay shipping + fulfillment tax.
# order_id stays null until Stripe confirms payment. Poll the quote on your server:
curl --fail-with-body "$API_BASE/v1/prepaid/quotes/$QUOTE_ID" \\
  -H "Authorization: Bearer $TCGP_API_KEY"
# If still open, honor checkout_expires_at; do not create another payment.
# In live mode only, order_id + confirmed funding or signed order.paid confirms manufacturing.
# In test mode these identify a simulated order; mode:test and simulated:true are returned.

# BEFORE submission, if the customer's card purchase fails, release the reservation:
# curl --fail-with-body -X POST "$API_BASE/v1/prepaid/quotes/$QUOTE_ID/release" \\
#   -H "Authorization: Bearer $TCGP_API_KEY"
# AFTER submission, release is unavailable. Verified unpaid Stripe expiry returns
# printing credit automatically. Use a new cart for a fresh attempt; handle your
# own card-sale refund separately. Never charge your customer twice.`}
export const prepaidLanguageExamples=[
  ['Node.js',`// savedOrder is loaded from YOUR database, owned by this customer.
// Its body and key were saved once, after verified customer payment.
const response = await fetch(process.env.TCGP_API_BASE + '/v1/prepaid/orders', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + process.env.TCGP_API_KEY,
    'Content-Type': 'application/json', 'Idempotency-Key': savedOrder.submissionKey },
  body: JSON.stringify(savedOrder.submissionBody)
});
const result = await response.json();
if (!response.ok) throw new Error(result.error.message);
// Save result.quote.id and result.status_url. HTTP 202 is a successful submission.
// If result.checkout_url exists, redirect this customer there for shipping/tax.
// Poll the quote on YOUR server; save order_id only once it is non-null.
// On timeout, retry this exact body and key.`],
  ['Python',`import os, requests
# Load saved_body and saved_submission_key from your database.
# Confirm your customer payment before reaching this step.
response = requests.post(
    os.environ['TCGP_API_BASE'] + '/v1/prepaid/orders',
    headers={'Authorization': 'Bearer ' + os.environ['TCGP_API_KEY'],
             'Idempotency-Key': saved_submission_key},
    json=saved_body, timeout=30)
response.raise_for_status()
order = response.json()
# Save order['quote']['id'] and order['status_url']; 202 means customer payment pending.
# Redirect this customer to order['checkout_url'] when present.
# Poll the quote server-side until order_id exists or payment expires/needs review.
# Reuse the same body/key after network errors.`],
  ['PHP',`<?php
// Load $savedBody and $savedSubmissionKey from your database.
// Call only after your server confirms the customer's payment.
$curl = curl_init(getenv('TCGP_API_BASE') . '/v1/prepaid/orders');
curl_setopt_array($curl, [
  CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30,
  CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . getenv('TCGP_API_KEY'),
    'Content-Type: application/json', 'Idempotency-Key: ' . $savedSubmissionKey],
  CURLOPT_POSTFIELDS => json_encode($savedBody, JSON_THROW_ON_ERROR)
]);
$raw = curl_exec($curl);
if ($raw === false) throw new RuntimeException('Network error; retry the saved request.');
$status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
curl_close($curl);
$result = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
if ($status >= 400) throw new RuntimeException($result['error']['message']);
// Persist $result['quote']['id'] and $result['status_url']; accept HTTP 202.
// Redirect the owning customer to $result['checkout_url'] if present.
// Poll the quote through your server. order_id is null until both payments clear.
// Do not generate new acceptance timestamps on retry.`],
]
export const prepaidLlms=`
## Prepaid fulfillment (optional server API, test and live)
- Automatic hosted API checkout: keep the existing server API key and ordinary POST /v1/carts → poll → checkout_url integration. Omit settlement (defaults to hosted). With prepaid enabled, current prepaid terms accepted and enough available credit, the platform spends printing credit and collects only shipping plus fulfillment tax from the customer. Otherwise it charges the full normal customer checkout. No partial credit use and no partner-side prepaid calls required. The funding decision is fixed before payment creation; retries cannot switch paths or charge twice. Payment setup errors after selection require retry, never silent full-price fallback. Standalone widget sessions retain normal checkout. Both funded and full-payment paths automatically redirect to the validated return_url after verified payment/order; the partner success page still verifies its saved cart and order.
- Mode is detected automatically from STRIPE_SECRET_KEY: sk_test_/rk_test_ selects test, live credentials select live. No additional mode variable or separate test tables. Use the same tcgp_live_ partner API key with either Stripe credential set. Terms are accepted once per version for both. Both platform apps must use the same Stripe account/environment, matching credit webhook signing secret and Stripe Tax configuration. One mode per deployment; finish pending checkouts before switching credentials and redeploy. Use separate deployments for concurrent testing/live traffic. Test balances never become live funds.
- Test quotes, balances and order reads include mode:test and simulated:true. Paid test shipping checkout creates only a simulated order and an order.paid event on the Test webhook with data.simulated:true. Never prints or ships; no production/shipment events. Hosted test checkout/widget remains a non-paying preview.
- Partner dashboard: accept prepaid terms and buy USD credit using Stripe. Balance changes only after signed/verified payment reconciliation; browser return never credits money. Top-up $10–$5,000; processing fees are absorbed by the platform in this version.
- Optional advanced flow only: existing keys remain valid. Use settlement:"prepaid" in POST /v1/carts to explicitly quote/reserve/submit instead of using automatic hosted checkout. Test keys can spend isolated test credit on a deployment using Stripe test credentials. They never create production orders. Settlement cannot change on a cart.
- Poll artwork to open. Prepaid carts omit checkout_url. POST /v1/prepaid/quotes {cart_id,shipping:{name,email,line1,line2?,city,state?,postal_code,country,phone?}} with a stable Idempotency-Key. Costs are current printing/shipping rates and Stripe Tax, in integer USD cents, without coupons/affiliate rewards. Keep the quote private from the shopper if exposing only retail prices.
- New quotes use funding_model:cards_credit: credit_cents equals printing_cents; customer_payment_cents equals shipping_cents + tax_cents. Legacy funded quotes retain credit_all. Customer tax is the quoted fulfillment tax on printing/shipping, not a calculation of the partner's retail markup/tax obligations. Do not charge shipping/quoted tax in your own checkout as well.
- POST /v1/prepaid/quotes/{id}/reserve (no body) before charging the customer for cards. Reserves printing cost only. Quote/reservation expires at expires_at (up to 30 minutes); retries do not extend it. Submission needs more than 65 minutes of cart life remaining. 402 insufficient_credit means do not charge your customer.
- Collect the current exact rights statement and quality acknowledgment, customer email and actual accepted_at on/after cart creation. Persist body/key. Confirm your own card-sale payment server-side, then POST /v1/prepaid/orders {quote_id,acceptance:{accepted:true,terms_version:"2026-10-04-v2",email,accepted_at,image_quality_accepted?}}. This debits only printing once, returns 202 with checkout_url, order_id:null, quote and status_url. Redirect the customer to returned Stripe checkout to pay shipping + fulfillment tax directly to TCGPlaytest. Never regenerate acceptance/key on retry. Manufacturing starts only after verified customer payment. Browser return is not proof.
- GET /v1/prepaid/quotes/{id} reads persisted payment state; poll through your server every 5 seconds or slower, honor rate limits. customer_payment_status pending/open: wait or resume the same checkout_url; paid + order_id: manufacturing funded; expired: printing credit returned, start a NEW cart or refund your retail card charge; review/refund_pending/refunded: stop and contact support. Only unused pre-submission holds can be released. Checkout lasts one hour after submission; only Stripe-confirmed unpaid expiry returns printing credit. An unknown checkout-create response is retried with the original parameters and must be reviewed by support if unresolved past the idempotency window.
- GET /v1/prepaid/balance returns balance_cents, available_cents, reserved_cents, spending_blocked and ledger (50 entries; next_before cursor). Payment refunds/disputes can create negative balances and block spending.
- Track manufacturing via GET /v1/orders/{id} and signed order.* events. order.paid for split funding means printing credit AND customer shipping/tax payment are confirmed; it does not verify your separate retail card payment. After approved cancellation, admin refund returns only printing credit and queues the customer's shipping/tax Stripe refund plus tax reversal. Legacy orders retain full-credit refunds. Refunds/disputes put unshipped production on hold; partial customer refunds require operator review and tax reconciliation. The partner refunds its own card-sale charge separately. No partial credit refund/cash withdrawal API.
`
