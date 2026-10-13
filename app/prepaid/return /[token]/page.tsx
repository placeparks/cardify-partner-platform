import { notFound, redirect } from 'next/navigation'
import { PaymentReturnRefresh } from '@/components/payment-return-refresh'
import { supabaseAdmin as db } from '@/lib/supabase-admin'
import { checked } from '@/lib/partner-api'
import { partnerReturnUrl } from '@/lib/manufacturing-contract'
import { prepaidMode, prepaidName } from '@/lib/prepaid-contract'
export const dynamic='force-dynamic'
export const metadata={title:'Your card order | TCGPlaytest',robots:{index:false,follow:false},referrer:'no-referrer' as const}
export default async function CustomerPaymentReturn({params}:{params:Promise<{token:string}>}) {
  const {token}=await params
  if (!/^[a-f0-9]{64}$/.test(token)) notFound()
  const test=prepaidMode()==='test'
  const q=checked(await db.from(prepaidName('partner_prepaid_quotes')).select('id,cart_id,order_id,simulated_status,customer_payment_status,customer_refund_required,refunded_at,shipping_cents,tax_cents,stripe_checkout_url,checkout_expires_at').eq('payment_mode',prepaidMode()).eq('customer_return_token',token).maybeSingle())
  if (!q) notFound()
  // A redirect/URL parameter never confirms payment. Only reconciled database
  // state can show success, and the registered partner origin controls return.
  const cart:any=checked(await db.from('partner_carts').select('return_url,partner:partnership_requests(website_url)').eq('id',q.cart_id).single())
  const order=test?(q.simulated_status?{status:q.simulated_status}:null):q.order_id?checked(await db.from('partner_manufacturing_orders').select('status').eq('id',q.order_id).maybeSingle()):null
  const paid=q.customer_payment_status==='paid' && !q.refunded_at && !q.customer_refund_required && order && ['paid','in_production','shipped'].includes(order.status)
  const expired=q.customer_payment_status==='expired'
  const review=q.customer_payment_status==='review' || q.customer_refund_required || ['refunded','refund_pending'].includes(q.customer_payment_status) || order?.status==='blocked' || order?.status==='cancelled'
  let destination:string|null=null
  try {destination=partnerReturnUrl(paid?cart.return_url:null,cart.partner?.website_url)} catch { /* A changed registered origin must not create an open redirect. */ }
  if (paid && destination) redirect(destination)
  const resume=q.customer_payment_status==='open' && q.stripe_checkout_url && Date.parse(q.checkout_expires_at)>Date.now()
  const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100)
  return <section className="mx-auto max-w-xl px-5 py-16"><div className="glass-panel space-y-6 rounded-2xl p-6 sm:p-10">
    {!paid && !expired && !review && <PaymentReturnRefresh />}
    {test&&<p className="rounded-lg border border-amber-300/40 bg-amber-300/10 p-4 text-amber-100">Test mode · Simulated payments only. This order will not be printed or shipped.</p>}
    <p className="font-mono text-sm text-cyan-300">YOUR CARD ORDER</p>
    <h1 className="text-3xl font-bold">{paid?(test?'Your test order is confirmed':'Your order is confirmed'):expired?'Checkout expired':review?'Your order needs a review':'Complete your shipping payment'}</h1>
    <p className="leading-7 text-slate-300">{paid?(test?'Your test printing credit and test shipping payment are confirmed. The sandbox flow is complete. No production order was created.':'Your store funded the printing, and your shipping and tax payment is confirmed. Your order can now move to fulfillment.'):expired?'No shipping payment was completed. Printing credit has been returned to your store. Contact your store to arrange a new order or a refund of your card purchase.':review?'Printing is paused or the order was cancelled. Contact your store or TCGPlaytest support about this order. Any refund of shipping and tax is separate from the card purchase paid to your store.':test?'Complete the simulated shipping payment using a Stripe test card. Refresh this page after payment to check confirmation.':'Printing will begin after your shipping and tax payment is confirmed. If you just paid, confirmation may take a moment; refresh the status below.'}</p>
    <dl className="space-y-3 border-y border-white/10 py-5"><div className="flex justify-between"><dt>Shipping</dt><dd>{money(q.shipping_cents)}</dd></div><div className="flex justify-between"><dt>Fulfillment tax</dt><dd>{money(q.tax_cents)}</dd></div><div className="flex justify-between font-semibold"><dt>Customer payment</dt><dd>{money(q.shipping_cents+q.tax_cents)}</dd></div></dl>
    <div className="flex flex-wrap gap-4">{resume&&<a className="button-primary" href={q.stripe_checkout_url} rel="noreferrer">Pay shipping and tax</a>}{!paid&&!expired&&<a className="button-secondary" href={`/prepaid/return/${token}`}>Refresh status</a>}{destination&&<a className="text-cyan-300 underline" href={destination} rel="noreferrer">Return to your store</a>}</div>
    <p className="text-sm text-slate-400">Shipping and fulfillment by TCGPlaytest / Cardify LLC.</p>
  </div></section>
}
