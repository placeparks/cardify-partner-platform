"use client"

import { useEffect, useState } from "react"
import { Check, X } from "lucide-react"
import { signInWithGoogle } from "@/lib/supabase-browser"

export default function AdminPage() {
  const [state, setState] = useState<any>({ loading: true, requests: [] })
  const [savingId, setSavingId] = useState("")

  async function load() {
    const response = await fetch("/api/admin/partnerships")
    const data = await response.json()
    setState({ ...data, loading: false, status: response.status })
  }

  useEffect(() => {
    load()
  }, [])

  async function decide(id: string, status: "approved" | "declined", approvedPercentage?: number, adminNotes?: string) {
    setSavingId(id)
    await fetch(`/api/admin/partnerships/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, approvedPercentage, adminNotes }),
    })
    setSavingId("")
    await load()
  }

  if (state.loading) return <section className="px-5 py-16 text-center text-slate-300">Loading admin...</section>

  if (state.status === 401) {
    return (
      <section className="mx-auto max-w-xl px-5 py-16 text-center">
        <h1 className="text-3xl font-black">Sign in to review partner requests.</h1>
        <button onClick={() => signInWithGoogle("/admin")} className="button-primary mt-6">Sign in with Google</button>
      </section>
    )
  }

  if (state.status === 403) {
    return <section className="px-5 py-16 text-center text-red-300">This admin page is limited to authorized emails.</section>
  }

  return (
    <section className="mx-auto max-w-6xl px-5 py-12">
      <p className="font-mono text-sm font-bold uppercase tracking-[0.28em] text-green">Admin</p>
      <h1 className="mt-4 text-4xl font-black">Partnership requests</h1>

      <div className="mt-8 grid gap-4">
        {state.requests.map((request: any) => (
          <RequestCard key={request.id} request={request} saving={savingId === request.id} onDecide={decide} />
        ))}
        {state.requests.length === 0 && <div className="panel p-6 text-slate-300">No partnership requests yet.</div>}
      </div>
    </section>
  )
}

function RequestCard({ request, saving, onDecide }: { request: any; saving: boolean; onDecide: Function }) {
  const [percentage, setPercentage] = useState(String(request.approved_percentage ?? request.proposed_percentage ?? 2))
  const [notes, setNotes] = useState(request.admin_notes || "")

  return (
    <article className="panel grid gap-5 p-5 lg:grid-cols-[1fr_280px]">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-black">{request.business_name}</h2>
          <span className="border border-cyan/30 px-2 py-1 font-mono text-xs uppercase text-cyan">{request.status}</span>
        </div>
        <p className="mt-2 text-sm text-slate-300">{request.email} · {request.website_url}</p>
        <p className="mt-4 text-sm leading-6 text-slate-300">{request.audience || "No audience notes provided."}</p>
        {request.widget_partner_key && (
          <p className="mt-3 font-mono text-xs text-green">Partner key: {request.widget_partner_key}</p>
        )}
      </div>

      <div className="grid gap-3">
        <label className="text-sm text-slate-300">
          Approved percentage
          <input className="field mt-2" type="number" min="0" max="30" step="0.1" value={percentage} onChange={(event) => setPercentage(event.target.value)} />
        </label>
        <textarea className="field min-h-20" placeholder="Admin notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
        <button disabled={saving} onClick={() => onDecide(request.id, "approved", Number(percentage), notes)} className="button-primary">
          <Check className="h-4 w-4" />
          Approve
        </button>
        <button disabled={saving} onClick={() => onDecide(request.id, "declined", Number(percentage), notes)} className="button-secondary border-pink/60 text-pink hover:border-pink hover:text-pink">
          <X className="h-4 w-4" />
          Decline
        </button>
      </div>
    </article>
  )
}
