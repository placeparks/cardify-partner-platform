"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, CheckCircle2, Clock3, Mail, Percent, ShieldCheck, X, XCircle } from "lucide-react"
import { signInWithGoogle } from "@/lib/supabase-browser"

export default function AdminPage() {
  const [state, setState] = useState<any>({ loading: true, requests: [] })
  const [savingId, setSavingId] = useState("")
  const [notice, setNotice] = useState("")

  async function load() {
    const response = await fetch("/api/admin/partnerships", { cache: "no-store" })
    const data = await response.json()
    setState({ ...data, loading: false, status: response.status })
  }

  useEffect(() => {
    load()
  }, [])

  async function decide(id: string, status: "approved" | "declined", approvedPercentage?: number, adminNotes?: string) {
    setSavingId(id)
    setNotice("")
    const response = await fetch(`/api/admin/partnerships/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, approvedPercentage, adminNotes }),
    })
    const data = await response.json()
    if (!response.ok) {
      setNotice(data.error || "Could not update partnership request.")
    } else if (data.email?.sent) {
      setNotice(`${status === "approved" ? "Approved" : "Declined"} and email sent.`)
    } else {
      setNotice(`${status === "approved" ? "Approved" : "Declined"}, but email was not sent: ${data.email?.reason || "unknown Gmail error"}`)
    }
    setSavingId("")
    await load()
  }

  const stats = useMemo(() => {
    const requests = state.requests || []
    return {
      total: requests.length,
      pending: requests.filter((request: any) => request.status === "pending").length,
      approved: requests.filter((request: any) => request.status === "approved").length,
      declined: requests.filter((request: any) => request.status === "declined").length,
    }
  }, [state.requests])
  const pendingRequests = useMemo(() => (state.requests || []).filter((request: any) => request.status === "pending"), [state.requests])
  const reviewedRequests = useMemo(() => (state.requests || []).filter((request: any) => request.status !== "pending"), [state.requests])

  if (state.loading) {
    return (
      <section className="min-h-screen bg-[#020617] px-5 py-16 text-center text-[#b9cbbc]">
        Loading admin...
      </section>
    )
  }

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
    <main className="min-h-screen bg-[#020617] px-4 py-12 text-[#dce1fb] md:px-6">
      <section className="mx-auto max-w-[1280px]">
        <div className="glass-panel overflow-hidden">
          <div className="flex flex-col gap-5 border-b border-[#3b4a3f]/30 p-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-sm font-bold uppercase tracking-[0.28em] text-[#00ff9d]">Admin review panel</p>
            <h1 className="mt-3 text-4xl font-black text-[#f4fff3] md:text-5xl">Partnership control room</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#b9cbbc]">
              Review partner applications, set the final percentage, and approve or decline the request.
            </p>
          </div>
          <div className="flex items-center gap-2 border border-[#00ff9d]/20 bg-[#00ff9d]/10 px-4 py-3 font-mono text-xs uppercase tracking-wider text-[#56ffa8]">
            <ShieldCheck className="h-4 w-4" />
            Authorized admin
          </div>
          </div>

          <section className="grid gap-4 p-5 md:grid-cols-4">
            <StatCard label="Total requests" value={stats.total} tone="green" icon={Mail} />
            <StatCard label="Pending review" value={stats.pending} tone="cyan" icon={Clock3} />
            <StatCard label="Approved" value={stats.approved} tone="green" icon={CheckCircle2} />
            <StatCard label="Declined" value={stats.declined} tone="pink" icon={XCircle} />
          </section>
        </div>

        {notice && (
          <div className="mt-6 border border-[#14d1ff]/25 bg-[#070d1f] p-4 text-sm text-[#dce1fb]">
            {notice}
          </div>
        )}

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.45fr_0.75fr]">
          <div className="glass-panel overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-[#3b4a3f]/25 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-sora text-2xl font-bold text-[#f4fff3]">Pending applications</h2>
                <p className="mt-1 text-sm text-[#b9cbbc]">Only saved partnership requests appear here.</p>
              </div>
              <p className="font-mono text-xs uppercase tracking-widest text-[#00d1ff]">{stats.pending} waiting</p>
            </div>

            <div className="grid gap-4 p-4">
              {pendingRequests.map((request: any) => (
                <RequestCard key={request.id} request={request} saving={savingId === request.id} onDecide={decide} />
              ))}
              {pendingRequests.length === 0 && (
                <div className="glass-card p-8 text-center text-[#b9cbbc]">No pending partnership requests.</div>
              )}
            </div>
          </div>

          <div className="glass-panel overflow-hidden">
            <div className="border-b border-[#3b4a3f]/25 px-5 py-4">
              <h2 className="font-sora text-2xl font-bold text-[#f4fff3]">Reviewed requests</h2>
              <p className="mt-1 text-sm text-[#b9cbbc]">Approved and declined applications from the database.</p>
            </div>
            <div className="grid gap-3 p-4">
              {reviewedRequests.map((request: any) => (
                <ReviewedRequest key={request.id} request={request} />
              ))}
              {reviewedRequests.length === 0 && (
                <div className="glass-card p-8 text-center text-[#b9cbbc]">No reviewed requests yet.</div>
              )}
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}

function StatCard({ label, value, tone, icon: Icon }: { label: string; value: number; tone: "green" | "cyan" | "pink"; icon: any }) {
  const toneClasses = {
    green: "text-[#00ff9d] bg-[#00ff9d]/10 border-[#00ff9d]/20",
    cyan: "text-[#14d1ff] bg-[#14d1ff]/10 border-[#14d1ff]/20",
    pink: "text-[#ffb0cd] bg-[#ffb0cd]/10 border-[#ffb0cd]/20",
  }[tone]

  return (
    <div className="glass-card rounded-xl p-5">
      <div className="mb-4 flex items-start justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded border ${toneClasses}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-[#b9cbbc]">{label}</p>
      <p className="mt-1 text-3xl font-black text-[#f4fff3]">{value}</p>
    </div>
  )
}

function RequestCard({ request, saving, onDecide }: { request: any; saving: boolean; onDecide: Function }) {
  const [percentage, setPercentage] = useState(String(request.approved_percentage ?? request.proposed_percentage ?? 2))
  const [notes, setNotes] = useState(request.admin_notes || "")
  const isApproved = request.status === "approved"
  const isDeclined = request.status === "declined"

  return (
    <article className="grid gap-5 rounded-lg border border-[#3b4a3f]/25 bg-[#070d1f]/80 p-5 transition hover:border-[#00ff9d]/35 lg:grid-cols-[1fr_300px]">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-2xl font-black text-[#f4fff3]">{request.business_name}</h3>
          <StatusBadge status={request.status} />
        </div>
        <div className="mt-3 grid gap-2 text-sm text-[#b9cbbc] md:grid-cols-2">
          <p className="break-all">{request.email}</p>
          <p className="break-all">{request.website_url}</p>
        </div>
        <p className="mt-4 text-sm leading-6 text-[#dce1fb]">{request.audience || "No audience notes provided."}</p>
        <div className="mt-4 flex flex-wrap gap-3 font-mono text-xs uppercase tracking-wider text-[#b9cbbc]">
          <span className="border border-[#3b4a3f]/30 bg-[#0c1324] px-3 py-2">Requested {request.proposed_percentage ?? 2}%</span>
          {request.widget_partner_key && <span className="border border-[#00ff9d]/20 bg-[#00ff9d]/10 px-3 py-2 text-[#56ffa8]">Partner key saved</span>}
        </div>
      </div>

      {isApproved ? (
        <DecisionPanel icon={CheckCircle2} title="Approved" tone="green">
          <p>This partner can access the dashboard and widget code.</p>
          <div className="mt-4 border border-[#00ff9d]/20 bg-[#020617]/70 p-3">
            <p className="text-xs uppercase tracking-wider text-[#b9cbbc]">Approved percentage</p>
            <p className="mt-1 text-2xl font-black text-[#00ff9d]">{request.approved_percentage ?? request.proposed_percentage}%</p>
          </div>
        </DecisionPanel>
      ) : isDeclined ? (
        <DecisionPanel icon={XCircle} title="Declined" tone="pink">
          <p>This request is closed. The applicant will not see a partner dashboard.</p>
          {request.admin_notes && <p className="mt-4 border border-[#ffb0cd]/20 bg-[#020617]/70 p-3">{request.admin_notes}</p>}
        </DecisionPanel>
      ) : (
        <div className="grid content-start gap-3">
          <label className="text-sm text-[#b9cbbc]">
            Approved percentage
            <div className="mt-2 flex items-center gap-2">
              <input className="field" type="number" min="0" max="30" step="0.1" value={percentage} onChange={(event) => setPercentage(event.target.value)} />
              <Percent className="h-4 w-4 text-[#14d1ff]" />
            </div>
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
      )}
    </article>
  )
}

function StatusBadge({ status }: { status: string }) {
  const classes = status === "approved"
    ? "border-[#00ff9d]/25 bg-[#00ff9d]/10 text-[#56ffa8]"
    : status === "declined"
      ? "border-[#ffb0cd]/25 bg-[#ffb0cd]/10 text-[#ffb0cd]"
      : "border-[#14d1ff]/25 bg-[#14d1ff]/10 text-[#14d1ff]"

  return <span className={`border px-2 py-1 font-mono text-xs uppercase ${classes}`}>{status}</span>
}

function DecisionPanel({ icon: Icon, title, tone, children }: { icon: any; title: string; tone: "green" | "pink"; children: React.ReactNode }) {
  const classes = tone === "green"
    ? "border-[#00ff9d]/30 bg-[#00ff9d]/10 text-[#56ffa8]"
    : "border-[#ffb0cd]/30 bg-[#ffb0cd]/10 text-[#ffb0cd]"

  return (
    <div className={`grid content-start gap-3 border p-4 text-sm leading-6 ${classes}`}>
      <Icon className="h-8 w-8" />
      <div>
        <p className="font-mono text-sm font-bold uppercase tracking-wider">{title}</p>
        <div className="mt-2 text-[#dce1fb]">{children}</div>
      </div>
    </div>
  )
}

function ReviewedRequest({ request }: { request: any }) {
  return (
    <article className="border border-[#3b4a3f]/25 bg-[#070d1f]/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="min-w-0 truncate text-lg font-black text-[#f4fff3]">{request.business_name}</h3>
        <StatusBadge status={request.status} />
      </div>
      <p className="mt-3 break-all text-sm text-[#b9cbbc]">{request.email}</p>
      <p className="mt-2 break-all text-sm text-[#b9cbbc]">{request.website_url}</p>
      <div className="mt-4 flex items-center justify-between border-t border-[#3b4a3f]/20 pt-3 text-sm">
        <span className="text-[#b9cbbc]">Percentage</span>
        <span className="font-black text-[#00ff9d]">{request.approved_percentage ?? request.proposed_percentage ?? 2}%</span>
      </div>
    </article>
  )
}
