"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { signInWithGoogle } from "@/lib/supabase-browser"
import { TERMS_VERSION, PARTNER_TERMS_STATEMENT, hasPartnerTerms } from "@/lib/manufacturing-contract"
import { AffiliatePreference } from "@/components/affiliate-preference"
export default function DashboardPage() {
  const [state,setState] = useState<any>(null), [error,setError] = useState(""), [busy,setBusy] = useState(false)
  const [accepted,setAccepted] = useState(false), [credential,setCredential] = useState("")
  const [webhook,setWebhook] = useState(""), [mode,setMode] = useState("test")
  const [widgetCopied, setWidgetCopied] = useState(false)
  const [widgetOrigins, setWidgetOrigins] = useState("")
  const [affiliateChoice, setAffiliateChoice] = useState<boolean | undefined>(undefined)
  const [affiliatePending, setAffiliatePending] = useState(true)
  async function load() {
    const response = await fetch("/api/partnership/me",{cache:"no-store"});const data=await response.json()
    if (!response.ok && response.status!==401) throw new Error(data.error || "Dashboard unavailable")
    setState({...data,status:response.status})
    setWidgetOrigins((data.partner?.widget_allowed_origins || []).join("\n"))
  }
  useEffect(()=>{load().catch(e=>setError(e.message))},[])
  const welcomePartnerId = state?.partner?.status === "approved" && !state.partner.api_blocked_at &&
    !state.partner.access_revoked_at && !state.partner.welcome_email_sent_at ? state.partner.id : null
  useEffect(() => {
    if (!welcomePartnerId) return
    // Claims and retry delays are enforced on the server. Access never waits for email.
    fetch("/api/partnership/welcome", { method: "POST" }).catch(() => {})
  }, [welcomePartnerId])
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
  const termsAccepted=hasPartnerTerms(partner)
  return <div className="mx-auto max-w-6xl space-y-6 px-5 py-10">
    <div><p className="font-mono text-[#00ff9d]">TCGPlaytest partner portal</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">{partner.business_name}</h1><p className="mt-3">Application: {partner.status} {partner.api_blocked_at&&"· API access suspended"}</p></div>
    {error&&<p className="border border-red-400 p-4 text-red-200" role="alert">{error}</p>}
    {partner.status!=="approved"?<p className="glass-panel p-4 sm:p-6">{partner.status === "declined" ? "Your application was declined. Contact TCGPlaytest for help with your application." : "Automatic activation is unavailable. Contact TCGPlaytest to complete your account setup."}</p>:partner.api_blocked_at?<p className="glass-panel p-4 sm:p-6">Widget and API access are revoked. Contact TCGPlaytest about your account review.</p>:<>
      <p className="text-slate-300">Set up your API integration and checkout widget below.</p>
      <div className="grid gap-4 sm:grid-cols-2">{[["API + widget carts",state.apiMetrics?.carts||0],["Manufacturing orders",state.apiMetrics?.orders||0]].map(([label,value])=><div className="glass-panel p-5" key={label}><p className="text-sm text-slate-300">{label}</p><p className="mt-2 break-all text-2xl font-bold text-[#00ff9d]">{value}</p></div>)}</div>
      <section className="glass-panel space-y-5 p-4 sm:p-6">
        <h2 className="text-2xl font-bold">Partner terms</h2>
        <p className="leading-7 text-slate-300">{PARTNER_TERMS_STATEMENT}</p>
        {termsAccepted ? <p className="text-emerald-300" role="status">Partner terms accepted. <Link href="/terms" className="underline">View version {TERMS_VERSION}</Link>. Your existing API keys can be used.</p> : <>
          <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={accepted} disabled={busy} onChange={e=>setAccepted(e.target.checked)}/><span>I accept the <Link href="/terms" className="text-cyan-300 underline">partner terms ({TERMS_VERSION})</Link>, including the content and complaint-handling obligations.</span></label>
          <button className="button-primary" disabled={!accepted||busy} onClick={()=>action("/api/partnership/terms",{accept_terms:accepted,terms_version:TERMS_VERSION})}>Accept partner terms</button>
          <p className="text-sm text-slate-300">Accept once for this version. You do not need to rotate an existing API key.</p>
        </>}
      </section>
      <section className="glass-panel space-y-5 p-4 sm:p-6"><h2 className="text-2xl font-bold">1. Server-side API keys</h2><p className="text-slate-300">Test carts cannot be charged, printed, or shipped. Keys are shown once; rotating a key immediately revokes the previous key for that mode.</p><AffiliatePreference disabled={busy} onChange={setAffiliateChoice} onPending={setAffiliatePending} /><div className="grid gap-4 sm:grid-cols-2">{["test","live"].map(m=><div className="border border-white/10 p-4" key={m}><h3 className="font-bold capitalize">{m} key</h3><p className="my-3 font-mono text-sm">{state.apiKeys?.find((k:any)=>k.mode===m)?.key_prefix?`${state.apiKeys.find((k:any)=>k.mode===m).key_prefix}…`:"Not created"}</p><button className="button-primary" disabled={!termsAccepted||busy||affiliatePending} onClick={()=>action("/api/partnership/keys",{mode:m,...(affiliateChoice !== undefined ? {use_affiliate:affiliateChoice} : {})})}>Create / rotate {m} key</button></div>)}</div></section>
      {credential&&<section className="border border-emerald-400 bg-emerald-950 p-5" role="status"><p>Save this secret on your server now. It will not be shown again.</p><pre className="my-4 whitespace-pre-wrap break-all">{credential}</pre><button className="button-secondary" onClick={()=>navigator.clipboard.writeText(credential).catch(()=>setError("Copy failed; select the secret manually."))}>Copy secret</button><button className="ml-4" onClick={()=>setCredential("")}>Hide</button></section>}
      <section className="glass-panel space-y-4 p-4 sm:p-6"><h2 className="text-2xl font-bold">2. Order webhooks</h2><p>Use an HTTPS endpoint on your registered website. Saving rotates its signing secret.</p><form className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]" onSubmit={e=>{e.preventDefault();action("/api/partnership/webhook",{mode,url:webhook})}}><select aria-label="Webhook environment" className="input-recessed w-full p-3" value={mode} onChange={e=>setMode(e.target.value)}><option value="test">Test</option><option value="live">Live</option></select><input aria-label="Webhook URL" className="input-recessed w-full min-w-0 p-3" type="url" required placeholder="https://your-site.com/webhooks/tcgplaytest" value={webhook} onChange={e=>setWebhook(e.target.value)}/><button className="button-secondary" disabled={busy}>Save webhook</button></form></section>
      <section className="glass-panel p-4 sm:p-6"><h2 className="text-2xl font-bold">Build your integration</h2><p className="my-4 leading-7">Your server submits front and back image URLs and quantities, then checks the cart status. Once the artwork passes validation, customers continue to checkout, accept image rights, and pay.</p><Link className="button-primary" href="/docs">API documentation and example</Link></section>
      <section className="glass-panel space-y-4 p-4 sm:p-6">
        <h2 className="text-2xl font-bold">3. Add TCGPlaytest to your website</h2>
        <p>Add a “Print with TCGPlaytest” button to your store. Customers choose their cards on your website, then continue to TCGPlaytest to pay for printing and delivery.</p>
        <p className="text-slate-300">Copy your personalized snippet and connect your editor&apos;s finished front/back images using the <Link href="/docs#widget" className="text-cyan-300 underline">setup guide</Link>. TCGPlaytest handles storage, validation and checkout. No secret API key or server cart endpoint is required for the widget.</p>
        <p className="text-sm text-slate-300">Your public partner code identifies your business. The saved affiliate preference applies to widget orders too. The registered website is allowed automatically: <span className="break-all">{partner.website_url}</span></p>
        <form className="space-y-3" onSubmit={e=>{e.preventDefault();action("/api/partnership/widget",{origins:widgetOrigins.split(/\s+/).filter(Boolean)})}}>
          <label className="block" htmlFor="widget-origins">Additional widget websites (one HTTPS origin per line)</label>
          <textarea id="widget-origins" className="input-recessed w-full min-w-0 p-3" rows={3} placeholder="https://your-shop.vercel.app" value={widgetOrigins} onChange={e=>setWidgetOrigins(e.target.value)}/>
          <button className="button-secondary" disabled={busy}>Save widget websites</button>
        </form>
        {!termsAccepted && <p>Accept the partner terms above to unlock your personalized snippet.</p>}
        {partner.widgetCode && <><pre className="overflow-auto whitespace-pre-wrap break-all rounded bg-slate-950 p-4 text-sm text-emerald-300">{partner.widgetCode}</pre>
          <button className="button-primary" onClick={async()=>{try{await navigator.clipboard.writeText(partner.widgetCode);setWidgetCopied(true)}catch{setError("Copy failed; select the widget code manually.")}}}>{widgetCopied ? "Widget code copied" : "Copy widget code"}</button></>}
        <Link className="flex min-h-11 w-fit items-center text-cyan-300 underline" href="/docs#widget">Widget setup guide</Link>
      </section>
    </>}
  </div>
}
