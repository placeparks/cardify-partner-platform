"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { signInWithGoogle } from "@/lib/supabase-browser"
import { TERMS_VERSION } from "@/lib/manufacturing-contract"
export default function DashboardPage() {
  const [state,setState] = useState<any>(null), [error,setError] = useState(""), [busy,setBusy] = useState(false)
  const [accepted,setAccepted] = useState(false), [credential,setCredential] = useState("")
  const [webhook,setWebhook] = useState(""), [mode,setMode] = useState("test")
  const [widgetCopied, setWidgetCopied] = useState(false)
  async function load() {
    const response = await fetch("/api/partnership/me",{cache:"no-store"});const data=await response.json()
    if (!response.ok && response.status!==401) throw new Error(data.error || "Dashboard unavailable")
    setState({...data,status:response.status})
  }
  useEffect(()=>{load().catch(e=>setError(e.message))},[])
  async function action(path:string,body:any) {
    setBusy(true);setError("");setCredential("")
    try {
      const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
      const data=await response.json();if(!response.ok)throw new Error(data.error?.message||data.error||"Request failed")
      if(data.key||data.signing_secret)setCredential(data.key||data.signing_secret)
      await load()
    }catch(e){setError(e instanceof Error?e.message:"Request failed")}finally{setBusy(false)}
  }
  if(!state)return <div className="p-10" role="status">{error||"Loading partner dashboard…"}</div>
  if(state.status===401)return <section className="mx-auto max-w-xl p-10"><h1 className="text-3xl font-bold">Partner dashboard</h1><button className="button-primary mt-6" onClick={()=>signInWithGoogle("/dashboard")}>Sign in with Google</button></section>
  const partner=state.partner
  if(!partner)return <section className="p-10">No application yet. <Link className="text-cyan-300" href="/partnership">Apply for access</Link></section>
  return <div className="mx-auto max-w-6xl space-y-6 px-5 py-10">
    <div><p className="font-mono text-[#00ff9d]">TCGPlaytest partner portal</p><h1 className="mt-3 text-4xl font-black">{partner.business_name}</h1><p className="mt-3">Application: {partner.status} {partner.api_blocked_at&&"· API access suspended"}</p></div>
    {error&&<p className="border border-red-400 p-4 text-red-200" role="alert">{error}</p>}
    {partner.status!=="approved"?<p className="glass-panel p-6">{partner.status === "declined" ? "Your application was declined. Contact TCGPlaytest for help with your application." : "Your application is under review. Widget and API access become available after approval."}</p>:partner.api_blocked_at?<p className="glass-panel p-6">Widget and API access are suspended. Contact TCGPlaytest about your account review.</p>:<>
      <p className="text-slate-300">Your partnership includes both a checkout widget and REST API access. Customers pay through TCGPlaytest checkout; no Stripe Connect account is needed.</p>
      <div className="grid gap-4 sm:grid-cols-2">{[["API carts",state.apiMetrics?.carts||0],["Manufacturing orders",state.apiMetrics?.orders||0]].map(([label,value])=><div className="glass-panel p-5" key={label}><p className="text-sm text-slate-300">{label}</p><p className="mt-2 break-all text-2xl font-bold text-[#00ff9d]">{value}</p></div>)}</div>
      <section className="glass-panel space-y-5 p-6"><h2 className="text-2xl font-bold">1. Server-side API keys</h2><p className="text-slate-300">No Stripe Connect is needed for cart handoff. Test carts cannot be charged, printed, or shipped. Keys are shown once; rotating a key immediately revokes the previous key for that mode.</p><label className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>I accept the <Link href="/terms" className="text-cyan-300 underline">manufacturing API terms ({TERMS_VERSION})</Link>, including responsibility for submitted content and indemnification of TCGPlaytest / Cardify LLC.</span></label><div className="grid gap-4 sm:grid-cols-2">{["test","live"].map(m=><div className="border border-white/10 p-4" key={m}><h3 className="font-bold capitalize">{m} key</h3><p className="my-3 font-mono text-sm">{state.apiKeys?.find((k:any)=>k.mode===m)?.key_prefix?`${state.apiKeys.find((k:any)=>k.mode===m).key_prefix}…`:"Not created"}</p><button className="button-primary" disabled={!accepted||busy} onClick={()=>action("/api/partnership/keys",{mode:m,accept_terms:accepted,terms_version:TERMS_VERSION})}>Create / rotate {m} key</button></div>)}</div></section>
      {credential&&<section className="border border-emerald-400 bg-emerald-950 p-5" role="status"><p>Save this secret on your server now. It will not be shown again.</p><pre className="my-4 whitespace-pre-wrap break-all">{credential}</pre><button className="button-secondary" onClick={()=>navigator.clipboard.writeText(credential).catch(()=>setError("Copy failed; select the secret manually."))}>Copy secret</button><button className="ml-4" onClick={()=>setCredential("")}>Hide</button></section>}
      <section className="glass-panel space-y-4 p-6"><h2 className="text-2xl font-bold">2. Order webhooks</h2><p>Use an HTTPS endpoint on your approved website. Saving rotates its signing secret.</p><form className="flex flex-wrap gap-3" onSubmit={e=>{e.preventDefault();action("/api/partnership/webhook",{mode,url:webhook})}}><select className="input-recessed p-3" value={mode} onChange={e=>setMode(e.target.value)}><option value="test">Test</option><option value="live">Live</option></select><input aria-label="Webhook URL" className="input-recessed flex-1 p-3" type="url" required placeholder="https://your-site.com/webhooks/tcgplaytest" value={webhook} onChange={e=>setWebhook(e.target.value)}/><button className="button-secondary" disabled={busy}>Save webhook</button></form></section>
      <section className="glass-panel p-6"><h2 className="text-2xl font-bold">Build your integration</h2><p className="mt-4">Customers can enter an optional affiliate code during TCGPlaytest checkout. Existing discount and reward rules apply. Partners do not need an affiliate code to use the API.</p><p className="my-4 leading-7">Your server submits each front and back, file hashes, quantities, and three explicit rights certifications. Artwork is fetched only after payment. Keep client URLs available until ingestion succeeds.</p><Link className="button-primary" href="/docs">API documentation and example</Link></section>
      <section className="glass-panel space-y-4 p-6">
        <h2 className="text-2xl font-bold">3. Your checkout widget</h2>
        <p>Add this script to your website to show a “Print with TCGPlaytest” button. Connect <code>/api/tcgplaytest/cart</code> on your server to the REST API using a key from above. The button opens the customer's checkout, including affiliate-code discounts.</p>
        <p className="text-slate-300">Your server loads the customer's selected artwork, submits the rights certifications, and returns the checkout link. Keep API keys on your server.</p>
        {partner.widgetCode && <><pre className="overflow-auto whitespace-pre-wrap break-all rounded bg-slate-950 p-4 text-sm text-emerald-300">{partner.widgetCode}</pre>
          <button className="button-primary" onClick={async()=>{try{await navigator.clipboard.writeText(partner.widgetCode);setWidgetCopied(true)}catch{setError("Copy failed; select the widget code manually.")}}}>{widgetCopied ? "Widget code copied" : "Copy widget code"}</button></>}
        <Link className="ml-4 text-cyan-300 underline" href="/docs#widget">Widget setup guide</Link>
      </section>
    </>}
  </div>
}
