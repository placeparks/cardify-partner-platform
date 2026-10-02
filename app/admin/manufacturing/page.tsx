"use client"

import { useEffect, useState } from "react"

export default function ManufacturingAdmin() {

  const [data,setData]=useState<any>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[manifest,setManifest]=useState<any>(null)

  const [target,setTarget]=useState("cart"),[id,setId]=useState(""),[reason,setReason]=useState("")

  const [notice,setNotice]=useState(""),[partner,setPartner]=useState(""),[cart,setCart]=useState("")

  async function load(){const r=await fetch('/api/admin/manufacturing',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error?.message||'Access denied');setData(d)}

  useEffect(()=>{load().catch(e=>setError(e.message))},[])

  async function submit(body:any){setBusy(true);setError('');try{const r=await fetch('/api/admin/manufacturing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error?.message||'Action failed');if(d.files)setManifest(d);await load()}catch(e){setError(e instanceof Error?e.message:'Action failed')}finally{setBusy(false)}}

  return <div className="mx-auto max-w-6xl space-y-6 p-6"><h1 className="text-3xl font-bold">Manufacturing & copyright operations</h1>{error&&<p role="alert" className="text-red-300">{error}</p>}{data&&<>

    {manifest&&<section className="glass-panel p-6"><h2 className="text-xl font-bold">Private production files (links expire in 60 seconds)</h2>{manifest.files.map((f:any)=><p className="mt-3" key={f.id}><a className="text-cyan-300 underline" href={f.url} target="_blank" rel="noreferrer">Item {f.item_index+1} · {f.side} · {f.quantity} copies</a></p>)}</section>}

    <section className="glass-panel p-6"><h2 className="text-xl font-bold">Production queue</h2>{data.orders?.length===0&&<p className="mt-4">No paid API orders.</p>}{data.orders?.map((o:any)=><details key={o.id} className="my-4 border border-white/20 p-4"><summary>{o.id} · {o.status} · {o.cart.card_count} cards</summary><p className="my-3">Cart: {o.cart_id}</p><p>{o.cart.partner_artwork.map((f:any)=>`${f.side}: ${f.state}`).join(' / ')}</p><button className="button-secondary mt-4" disabled={busy} onClick={()=>submit({action:'manifest',id:o.id})}>Get production files</button><OrderStatus order={o} submit={submit} busy={busy}/>{o.cart.partner_artwork.map((f:any)=><p className="mt-3 text-sm" key={f.id}>File {f.id} · {f.legal_hold?'Legal hold':'Operational retention'} <button className="text-cyan-300 underline" disabled={busy||!reason.trim()} onClick={()=>submit({action:'retention',id:f.id,legal_hold:!f.legal_hold,reason})}>{f.legal_hold?'Release hold and schedule deletion':'Preserve for legal requirement'}</button></p>)}<p className="mt-3 text-xs">Use the reason field below before changing a retention hold. Release schedules immediate deletion.</p></details>)}</section>

    {data.webhookFailures?.length>0&&<section className="glass-panel p-6"><h2 className="text-xl font-bold">Exhausted webhook deliveries</h2>{data.webhookFailures.map((e:any)=><p className="my-3" key={e.id}>{e.id} · {e.event_type} <button className="text-cyan-300 underline" disabled={busy} onClick={()=>submit({action:'replay',id:e.id})}>Retry delivery</button></p>)}</section>}

    <section className="glass-panel space-y-4 p-6"><h2 className="text-xl font-bold">Block access or production</h2><p>Holds take effect for new checkout, ingestion, and production-file access. Coordinate physical production stoppage and refunds separately.</p><form className="grid gap-3 md:grid-cols-2" onSubmit={e=>{e.preventDefault();submit({action:'block',target,id,reason})}}><select className="input-recessed p-3" value={target} onChange={e=>setTarget(e.target.value)}>{['cart','partner','key','sha256'].map(t=><option key={t}>{t}</option>)}</select><input className="input-recessed p-3" required placeholder="Target ID or SHA-256" value={id} onChange={e=>setId(e.target.value)}/><input className="input-recessed p-3" required minLength={3} placeholder="Reason / case reference" value={reason} onChange={e=>setReason(e.target.value)}/><button disabled={busy} className="button-secondary">Apply block</button></form></section>

    <section className="glass-panel space-y-4 p-6"><h2 className="text-xl font-bold">Record a copyright notice</h2><form className="grid gap-3" onSubmit={e=>{e.preventDefault();submit({action:'notice',partner_id:partner,cart_id:cart,notice})}}><input className="input-recessed p-3" placeholder="Partner ID (if known)" value={partner} onChange={e=>setPartner(e.target.value)}/><input className="input-recessed p-3" placeholder="Cart ID (if known)" value={cart} onChange={e=>setCart(e.target.value)}/><textarea className="input-recessed min-h-32 p-3" required minLength={20} placeholder="Notice as received, claimant contact, work and material identification, declarations, signature" value={notice} onChange={e=>setNotice(e.target.value)}/><button disabled={busy} className="button-secondary">Record for review</button></form></section>

    <section className="glass-panel p-6"><h2 className="mb-4 text-xl font-bold">Takedown cases</h2>{data.cases.length===0&&<p>No recorded cases.</p>}{data.cases.map((c:any)=><CaseCard key={c.id} record={c} busy={busy} submit={submit}/>)}</section>

    <section className="glass-panel p-6"><h2 className="mb-4 text-xl font-bold">Recent audit trail</h2><div className="overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th>When</th><th>Entity</th><th>Action</th><th>Actor</th></tr></thead><tbody>{data.events.map((e:any)=><tr key={e.id}><td className="p-2">{e.created_at}</td><td className="p-2">{e.entity_type}<br/>{e.entity_id}</td><td className="p-2">{e.action}</td><td className="p-2">{e.actor}</td></tr>)}</tbody></table></div></section>

  </>}</div>

}

function CaseCard({record,busy,submit}:{record:any;busy:boolean;submit:(body:any)=>void}) {

  const [status,setStatus]=useState(record.status),[notes,setNotes]=useState(record.admin_notes||''),[counter,setCounter]=useState(''),[repeat,setRepeat]=useState(record.repeat_infringement)

  return <details className="my-4 border border-white/20 p-4"><summary className="cursor-pointer">{record.id} · {record.status}</summary><p className="my-4 whitespace-pre-wrap">{record.notice.text}</p><p>Partner: {record.partner_id||'Unassigned'} · Cart: {record.cart_id||'Unassigned'}</p><form className="mt-4 grid gap-3" onSubmit={e=>{e.preventDefault();submit({action:'case',id:record.id,status,notes,counter_notice:counter,repeat_infringement:repeat})}}><select className="input-recessed p-3" value={status} onChange={e=>setStatus(e.target.value)}>{['received','under_review','actioned','counter_notice','court_action','resolved','rejected'].map(s=><option key={s}>{s}</option>)}</select><textarea className="input-recessed p-3" placeholder="Review notes, notice delivery and follow-up dates" value={notes} onChange={e=>setNotes(e.target.value)}/><textarea className="input-recessed p-3" placeholder="Counter-notice as received (optional)" value={counter} onChange={e=>setCounter(e.target.value)}/><label><input type="checkbox" checked={repeat} onChange={e=>setRepeat(e.target.checked)}/> Enforce repeat-infringer termination for this partner</label><p className="text-sm text-slate-300">Actioned cases block the linked cart/file. Resolving a case does not automatically restart production or restore account access.</p><button className="button-secondary" disabled={busy}>Save case decision</button></form></details>

}



function OrderStatus({order,submit,busy}:{order:any;submit:(body:any)=>void;busy:boolean}) {

  const [status,setStatus]=useState('in_production'),[carrier,setCarrier]=useState(''),[tracking,setTracking]=useState(''),[url,setUrl]=useState('')

  return <form className="mt-4 grid gap-3" onSubmit={e=>{e.preventDefault();submit({action:'order_status',id:order.id,status,carrier,tracking_number:tracking,tracking_url:url})}}><select className="input-recessed p-3" value={status} onChange={e=>setStatus(e.target.value)}><option value="in_production">Start production</option><option value="shipped">Mark shipped</option><option value="cancelled">Cancel manufacturing</option></select>{status==='shipped'&&<><input className="input-recessed p-3" required placeholder="Carrier" value={carrier} onChange={e=>setCarrier(e.target.value)}/><input className="input-recessed p-3" required placeholder="Tracking number" value={tracking} onChange={e=>setTracking(e.target.value)}/><input className="input-recessed p-3" required type="url" placeholder="HTTPS tracking URL" value={url} onChange={e=>setUrl(e.target.value)}/></>}<button className="button-secondary" disabled={busy}>Update manufacturing status</button><p className="text-xs">Cancellation stops this manufacturing workflow. Issue any required refund through the payment operations workflow.</p></form>

}

