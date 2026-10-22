'use client'

import { useState, type FormEvent } from 'react'

type Order = { id: string; status: string; mode: string; simulated: boolean }
type Props = { token: string; cardCount: number; cartId: string; connectRetail: number | null; qualityWarning: boolean; initialOrder: Order | null }

export function TestCheckout({ token, cardCount, cartId, connectRetail, qualityWarning, initialOrder }: Props) {
  const [order, setOrder] = useState(initialOrder)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function complete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!confirmed || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/test-checkout/${token}`, { method: 'POST', credentials: 'omit',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm_simulation: true }) })
      const value = await response.json()
      if (!response.ok) throw new Error(value.error?.message || 'Simulation could not be completed. Retry this cart.')
      setOrder(value)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Please retry.') }
    finally { setBusy(false) }
  }
  return <section className="mx-auto max-w-3xl space-y-6 p-5 sm:p-10">
    <div className="flex flex-wrap items-center justify-between gap-3"><span className="font-bold">TCGPlaytest</span><span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-4 py-1 text-sm font-semibold text-amber-200">TEST MODE · NO CHARGE</span></div>
    <div><h1 className="text-3xl font-bold">{order ? 'Simulated order confirmed' : 'Test your checkout'}</h1>
      <p className="mt-2 text-slate-300">{cardCount.toLocaleString()} cards · {connectRetail == null ? 'Hosted checkout' : 'Connect checkout simulation'}</p></div>
    <div className="rounded-xl border border-amber-300/30 bg-amber-300/5 p-4 text-sm text-amber-100">
      No payment, printing, shipping, credit deduction or Connect transfer will occur. This tests your order confirmation and return flow. Stripe screens, prices, discounts, tax and payouts are not exercised.
    </div>
    {connectRetail != null && <p>Configured card retail price: <strong>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(connectRetail / 100)}</strong>. This is your supplied value, not a charged or validated total.</p>}
    {order ? <div className="space-y-4 rounded-xl border border-emerald-300/30 bg-emerald-300/5 p-5" aria-live="polite">
      <h2 className="text-xl font-bold">{order.status === 'cancelled' ? 'Simulated order cancelled' : 'Test confirmation saved'}</h2>
      <p className="break-all font-mono text-sm">{order.id}</p><p>Status: <strong>{order.status}</strong> · simulated: true</p>
      <p>The test event is queued for your Test webhook. Your server can verify this order using its test API key.</p>
      {order.status !== 'cancelled' && <a className="button-primary inline-block" href={`/partner-checkout/return?token=${token}`}>Return to your store</a>}
      <p className="text-sm text-slate-300">Use the <a href="/docs/sandbox" className="underline">sandbox events API</a> to simulate production, shipment or cancellation.</p>
    </div> : <form onSubmit={complete} className="space-y-5 rounded-xl border border-white/15 bg-white/5 p-5 sm:p-6">
      <h2 className="text-xl font-bold">Sample delivery details</h2>
      <p className="text-sm text-slate-300">Use dummy details. These fields stay in your browser and are not saved or sent to a carrier.</p>
      <div className="grid gap-4 sm:grid-cols-2">{[
        ['Full name', 'text', 'Test Customer'], ['Email', 'email', 'customer@example.com'],
        ['Street address', 'text', '123 Test Street'], ['City', 'text', 'Test City'],
        ['State / province', 'text', 'CA'], ['Postal code', 'text', '94107'],
      ].map(([label, type, value]) => <label key={label} className="space-y-1 text-sm"><span>{label}</span><input required type={type} defaultValue={value} autoComplete="off" maxLength={200} className="block w-full rounded border border-slate-600 bg-slate-950 p-3 text-white" /></label>)}
      <label className="space-y-1 text-sm"><span>Country</span><select className="block w-full rounded border border-slate-600 bg-slate-950 p-3 text-white" defaultValue="US"><option value="US">United States</option><option value="CA">Canada</option><option value="GB">United Kingdom</option></select></label></div>
      {qualityWarning && <p role="note" className="rounded bg-amber-300/10 p-3 text-sm text-amber-200">Some artwork is low resolution. Live checkout requires the customer to acknowledge the print-quality warning.</p>}
      <label className="flex items-start gap-3"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" />
        <span>Simulate the customer accepting image rights{qualityWarning ? ' and the print-quality warning' : ''} and completing payment. This is a test confirmation only.</span></label>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <button className="button-primary w-full disabled:opacity-50" disabled={!confirmed || busy}>{busy ? 'Saving test order…' : 'Complete simulated checkout'}</button>
    </form>}
    <details className="text-sm text-slate-400"><summary>Test cart reference</summary><p className="mt-2 break-all font-mono">{cartId}</p></details>
  </section>
}
