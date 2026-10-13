'use client'
import { useEffect,useState } from 'react'
import Link from 'next/link'
import { PREPAID_TERMS,PREPAID_TERMS_VERSION } from '@/lib/prepaid-contract'
const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100)
export function PrepaidCredit({standalone=false}:{standalone?:boolean}) {
  const [data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[accepted,setAccepted]=useState(false),[amount,setAmount]=useState('100')
  const [attempt,setAttempt]=useState<{amount:number,key:string}|null>(null)
  async function load() {
    const response=await fetch('/api/partnership/credit',{cache:'no-store'}),result=await response.json()
    if (!response.ok) throw new Error(result.error?.message || 'Balance unavailable')
    setData(result);setError('')
  }
  useEffect(()=>{load().catch(e=>setError(e.message))},[])
  async function enable() {
    setBusy(true);setError('')
    try {
      const response=await fetch('/api/partnership/credit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accepted,terms_version:PREPAID_TERMS_VERSION})}),result=await response.json()
      if (!response.ok) throw new Error(result.error?.message || 'Could not enable credit')
      await load()
    }catch(e){setError(e instanceof Error?e.message:'Request failed')}finally{setBusy(false)}
  }
  async function topup() {
    setBusy(true);setError('')
    try {
      if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw new Error('Enter a USD amount with at most two decimal places.')
      const cents=Math.round(Number(amount)*100)
      const saved=attempt?.amount===cents?attempt:{amount:cents,key:crypto.randomUUID()}
      setAttempt(saved)
      const response=await fetch('/api/partnership/credit/topups',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':saved.key},body:JSON.stringify({amount_cents:cents})}),result=await response.json()
      if (!response.ok) {if(result.error?.code==='topup_finished')setAttempt(null);throw new Error(result.error?.message || 'Top-up unavailable')}
      window.location.assign(result.checkout_url)
    }catch(e){setError(e instanceof Error?e.message:'Request failed')}finally{setBusy(false)}
  }
  if (data?.enabled===false) return standalone ? <section className="glass-panel space-y-3 rounded-2xl p-6"><h2 className="text-xl font-semibold">Credit purchases are currently unavailable</h2><p className="text-slate-300">Prepaid printing has not been enabled on this platform yet. Contact TCGPlaytest for help.</p><Link href="/dashboard" className="inline-flex min-h-11 items-center text-cyan-300 underline">Return to dashboard</Link></section> : null
  const cents=/^\d+(\.\d{1,2})?$/.test(amount)?Math.round(Number(amount)*100):0
  const validAmount=Number.isSafeInteger(cents)&&cents>=1000&&cents<=500000
  return <section id="prepaid" className={`glass-panel scroll-mt-24 space-y-5 p-4 sm:p-6 ${standalone?'rounded-2xl':''}`}>
    {standalone ? <h2 className="text-xl font-semibold">Your printing balance</h2> : <div><p className="text-sm font-mono text-cyan-300">YOUR CARDS. OUR FULFILLMENT.</p><h2 className="mt-2 text-2xl font-bold">Prepaid printing credit</h2><p className="mt-3 text-slate-300">Your credit pays for card printing only. Customers pay shipping and quoted fulfillment tax directly to TCGPlaytest through Stripe. Printing starts after both are funded.</p><Link href="/dashboard/credits" className="mt-3 inline-flex min-h-11 items-center text-cyan-300 underline">Open your credit wallet →</Link></div>}
    {error && <p role="alert" className="rounded border border-red-400/50 p-3 text-red-200">{error}</p>}
    {!data && (error ? <button className="button-secondary" onClick={()=>load().catch(e=>setError(e.message))}>Retry loading balance</button> : <p role="status">Loading balance…</p>)}
    {data && !data.accepted && <><p className="text-sm leading-7 text-slate-300">{PREPAID_TERMS}</p><label className="flex gap-3"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} className="mt-1 h-5 w-5 shrink-0"/><span>I accept the prepaid fulfillment terms ({PREPAID_TERMS_VERSION}).</span></label><button className="button-primary" disabled={busy||!accepted} onClick={enable}>Enable prepaid fulfillment</button></>}
    {data?.accepted && <>
      <div className="grid gap-4 sm:grid-cols-3">{[['Available',data.balance.available_cents],['Reserved',data.balance.reserved_cents],['Total balance',data.balance.balance_cents]].map(([label,value])=><div key={label} className="rounded-xl border border-white/10 bg-slate-950/50 p-5"><p className="text-sm text-slate-300">{label}</p><p className="mt-2 text-3xl font-semibold">{money(Number(value))}</p></div>)}</div>
      {data.balance.spending_blocked && <p className="text-amber-200">Spending is paused because of a payment reversal or dispute. Contact support to review your account.</p>}
      <form className="space-y-4 rounded-xl border border-white/10 bg-slate-950/40 p-4 sm:p-5" onSubmit={e=>{e.preventDefault();topup()}}>
        <fieldset disabled={busy}><legend className="mb-3 font-semibold">Choose a top-up amount</legend><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[50,100,250,500].map(value=><button key={value} type="button" aria-pressed={cents===value*100} onClick={()=>setAmount(String(value))} className={`min-h-12 rounded-lg border px-3 py-3 text-base font-semibold transition ${cents===value*100?'border-emerald-300 bg-emerald-300/10 text-emerald-200':'border-white/15 bg-white/[0.025] text-slate-200 hover:border-emerald-300/60'}`}>${value}</button>)}</div></fieldset>
        <div className="flex flex-wrap items-end gap-3"><label className="space-y-2"><span className="block text-sm text-slate-300">Add credit (USD)</span><input type="number" min="10" max="5000" step="0.01" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)} className="input-recessed w-44 p-3" required aria-describedby="credit-amount-help"/></label><p id="credit-amount-help" className="py-3 text-sm text-slate-400">Or enter any amount from $10 to $5,000.</p></div>
        {validAmount&&<p className="text-sm text-slate-300">You pay <strong className="text-white">{money(cents)}</strong> and receive <strong className="text-emerald-300">{money(cents)} printing credit</strong>.</p>}
        <div className="flex flex-wrap gap-3"><button className="button-primary" disabled={busy||!validAmount}>{busy?'Please wait…':standalone?'Continue to Stripe':'Add credit with Stripe'}</button><button type="button" className="button-secondary" disabled={busy} onClick={()=>load().catch(e=>setError(e.message))}>Refresh balance</button></div>
      </form>
      <p className="text-sm text-slate-300">$10–$5,000 per top-up. Credit appears after payment confirmation. Your API and widget checkout automatically use enough available credit for printing; otherwise the customer pays normally. Credit-funded checkout gives the customer one hour to pay shipping and tax. Confirmed unpaid expiry returns the printing credit.</p>
      <Link href="/docs#prepaid" className="text-cyan-300 underline">Prepaid API integration guide</Link>
      <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left text-sm"><caption className="py-3 text-left font-semibold">Recent transactions</caption><thead><tr className="text-slate-300"><th className="p-3">Date</th><th className="p-3">Details</th><th className="p-3 text-right">Amount</th><th className="p-3 text-right">Balance</th></tr></thead><tbody>{data.ledger?.map((row:any)=><tr key={row.id} className="border-t border-white/10"><td className="p-3 whitespace-nowrap">{new Date(row.created_at).toLocaleDateString()}</td><td className="p-3">{row.description}</td><td className={`p-3 text-right ${row.amount_cents>0?'text-emerald-300':'text-slate-100'}`}>{row.amount_cents>0?'+':''}{money(row.amount_cents)}</td><td className="p-3 text-right">{money(row.balance_after_cents)}</td></tr>)}</tbody></table>{!data.ledger?.length&&<p className="p-3 text-slate-400">No transactions yet.</p>}</div>
    </>}
  </section>
}
