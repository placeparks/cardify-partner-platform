'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { signInWithGoogle } from '@/lib/supabase-browser'
import { CONNECT_TERMS, CONNECT_TERMS_VERSION } from '@/lib/connect-contract'
const money=(v:number|null|undefined)=>v==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v/100)
export default function ConnectPage(){
 const [state,setState]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[accepted,setAccepted]=useState(false),[login,setLogin]=useState(false)
 async function load(){const r=await fetch('/api/partnership/connect',{cache:'no-store'});const d=await r.json();if(r.status===401){setLogin(true);return}if(!r.ok)throw Error(d.error?.message||'Could not load Connect.');setState(d);setError('')}
 useEffect(()=>{load().catch(e=>setError(e.message))},[])
 async function action(onboard:boolean){setBusy(true);setError('');try{
  const r=await fetch(onboard?'/api/stripe/connect/onboard':'/api/partnership/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(onboard?{}:{accepted:true,terms_version:CONNECT_TERMS_VERSION})});const d=await r.json();if(!r.ok)throw Error(d.error?.message||'Request failed.');if(d.url)window.location.assign(d.url);else await load()
 }catch(e){setError(e instanceof Error?e.message:'Request failed.')}finally{setBusy(false)}}
 return <main className="mx-auto max-w-6xl space-y-8 px-5 py-12">
  <Link className="text-cyan-300 underline" href="/dashboard">← Partner dashboard</Link>
  <header><p className="font-mono text-emerald-300">PARTNER PAYOUTS</p><h1 className="mt-3 text-4xl font-bold">Sell cards. Receive your share.</h1><p className="mt-4 max-w-3xl leading-7 text-slate-300">Set your selling price through the API. Customers pay once, TCGPlaytest handles printing and delivery, and your earnings go to your connected Stripe account.</p></header>
  {error&&<p role="alert" className="rounded-xl border border-red-400/40 p-5 text-red-200">{error}</p>}
  {login?<button className="button-primary" onClick={()=>signInWithGoogle('/dashboard/connect')}>Sign in with Google</button>:!state?<p role="status">Loading Connect…</p>:!state.enabled?<p className="glass-panel p-6">Connect is not enabled on this platform yet.</p>:<>
   <section className="grid gap-4 sm:grid-cols-3">{[['95%','Transferred after verified payment'],['5%','Reserved for 15 days'],['Separate','Connect never uses printing credit']].map(([title,copy])=><div key={title} className="glass-panel rounded-xl p-6"><p className="text-3xl font-bold text-emerald-300">{title}</p><p className="mt-3 text-slate-300">{copy}</p></div>)}</section>
   <section className="glass-panel space-y-5 rounded-xl p-6"><h2 className="text-2xl font-semibold">Connect your Stripe account</h2><p className="leading-7 text-slate-300">Available to US partners. Earnings are your card selling price minus printing and Stripe processing fees. Shipping and tax are retained by TCGPlaytest. Stripe’s bank payout schedule still applies.</p>
    <details className="rounded-lg border border-white/15 p-4"><summary className="cursor-pointer font-semibold">Payout and reserve terms</summary><p className="mt-4 leading-7 text-slate-300">{CONNECT_TERMS}</p><p className="mt-2 text-sm text-slate-400">Version {CONNECT_TERMS_VERSION}</p></details>
    {!state.accepted?<><label className="flex gap-3"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>I accept the payout and reserve terms.</span></label><button className="button-primary" disabled={!accepted||busy} onClick={()=>action(false)}>Accept terms</button></>:<><p className="text-emerald-300">{state.ready?'Stripe account ready to receive transfers.':'Complete Stripe onboarding to receive transfers.'}</p><button className="button-primary" disabled={busy} onClick={()=>action(true)}>{state.connected?'Update Stripe details':'Connect with Stripe'}</button></>}
    <Link href="/docs#connect" className="block text-cyan-300 underline">Connect API integration guide</Link>
   </section>
   <section className="glass-panel rounded-xl p-6"><div className="flex flex-wrap justify-between gap-4"><h2 className="text-2xl font-semibold">Recent earnings</h2><button disabled={busy} className="text-cyan-300 underline" onClick={()=>load().catch(e=>setError(e.message))}>Refresh</button></div><p className="my-4 text-sm text-slate-300">Latest 50 orders. Refunds and disputes can reduce the original reserve. Transfers can pause while Stripe or your account needs attention.</p>
    {!state.orders?.length?<p>No Connect orders yet.</p>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Order','Earnings','Transferred','5% reserve','Release eligible','Status'].map(v=><th className="whitespace-nowrap border-b border-white/15 p-3" key={v}>{v}</th>)}</tr></thead><tbody>{state.orders.map((o:any)=><tr key={o.id}><td className="p-3" title={o.cart_id}>{o.cart_id.slice(0,16)}…</td><td className="p-3">{money(o.earnings_cents)}</td><td className="p-3">{money(o.snapshot?.transferred_cents??0)}</td><td className="p-3">{money(o.reserve_cents)}</td><td className="p-3">{o.release_at?new Date(o.release_at).toLocaleString():'Awaiting payment'}</td><td className="p-3" title={o.last_error||''}>{o.status.replaceAll('_',' ')}</td></tr>)}</tbody></table></div>}
   </section>
  </>}
 </main>
}
