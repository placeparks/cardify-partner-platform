"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, CheckCircle2, Clock3, Code2, LayoutDashboard, Mail, Percent, ShieldCheck, X, XCircle } from "lucide-react"
import { signInWithGoogle } from "@/lib/supabase-browser"

export default function AdminPage() {
  const [state, setState] = useState<any>({ loading: true, requests: [] })
  const [savingId, setSavingId] = useState("")
  const [notice, setNotice] = useState("")
  const [activePanel, setActivePanel] = useState<"overview" | "pending" | "approved" | "declined" | "widget">("overview")

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
  const approvedRequests = useMemo(() => (state.requests || []).filter((request: any) => request.status === "approved"), [state.requests])
  const declinedRequests = useMemo(() => (state.requests || []).filter((request: any) => request.status === "declined"), [state.requests])
  const widgetRequests = useMemo(() => (state.requests || []).filter((request: any) => request.status === "approved" && request.widget_partner_key), [state.requests])
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
    <main className="min-h-screen bg-[#020617] text-[#dce1fb]">
      <aside className="fixed bottom-0 left-0 top-16 z-20 hidden w-64 flex-col border-r border-[#3b4a3f]/30 bg-[#070d1f]/90 p-4 backdrop-blur-2xl lg:flex">
        <div className="mb-8 mt-4 flex items-center gap-3 px-2">
          <span className="flex h-10 w-10 items-center justify-center rounded bg-[#00ff9d] text-[#00391f]">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="font-mono text-sm font-bold text-[#f4fff3]">Cardify Admin</p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#00ff9d]">Review access</p>
          </div>
        </div>

        <nav className="space-y-2 text-sm">
          <AdminRailItem icon={LayoutDashboard} label="Overview" active={activePanel === "overview"} onClick={() => setActivePanel("overview")} />
          <AdminRailItem icon={Clock3} label="Pending" active={activePanel === "pending"} onClick={() => setActivePanel("pending")} />
          <AdminRailItem icon={CheckCircle2} label="Approved" active={activePanel === "approved"} onClick={() => setActivePanel("approved")} />
          <AdminRailItem icon={Code2} label="Widget access" active={activePanel === "widget"} onClick={() => setActivePanel("widget")} />
        </nav>
      </aside>

      <section className="mx-auto max-w-[1280px] px-4 pb-12 pt-8 md:px-6 lg:ml-64">
        <header className="mb-8">
          <h1 className="text-4xl font-black text-[#f4fff3]">Admin Review Panel</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#b9cbbc]">
            Manage partnership requests, review submitted shop details, and set the final partner percentage.
          </p>
        </header>

        <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total requests" value={stats.total} tone="green" icon={Mail} active={activePanel === "overview"} onClick={() => setActivePanel("overview")} />
          <StatCard label="Pending apps" value={stats.pending} tone="cyan" icon={Clock3} active={activePanel === "pending"} onClick={() => setActivePanel("pending")} />
          <StatCard label="Approved" value={stats.approved} tone="green" icon={CheckCircle2} active={activePanel === "approved"} onClick={() => setActivePanel("approved")} />
          <StatCard label="Declined" value={stats.declined} tone="pink" icon={XCircle} active={activePanel === "declined"} onClick={() => setActivePanel("declined")} />
        </section>

        <div className="mb-6 flex items-center gap-2 border border-[#00ff9d]/20 bg-[#00ff9d]/10 px-4 py-3 font-mono text-xs uppercase tracking-wider text-[#56ffa8] md:w-fit">
          <ShieldCheck className="h-4 w-4" />
          Authorized admin
        </div>

        {notice && (
          <div className="mt-6 border border-[#14d1ff]/25 bg-[#070d1f] p-4 text-sm text-[#dce1fb]">
            {notice}
          </div>
        )}

        <section className="grid gap-6 xl:grid-cols-[1.55fr_0.8fr]">
          <AdminContent
            activePanel={activePanel}
            approvedRequests={approvedRequests}
            declinedRequests={declinedRequests}
            pendingRequests={pendingRequests}
            reviewedRequests={reviewedRequests}
            savingId={savingId}
            widgetRequests={widgetRequests}
            onDecide={decide}
          />

          <aside className="space-y-6">
            <div className="glass-panel overflow-hidden">
              <div className="border-b border-[#00ff9d]/20 bg-[#00ff9d]/10 px-5 py-4">
                <h3 className="font-sora text-xl font-bold text-[#00ff9d]">Review queue</h3>
              </div>
              <div className="space-y-4 p-5">
                <QueueRow label="Pending" value={stats.pending} tone="cyan" />
                <QueueRow label="Approved" value={stats.approved} tone="green" />
                <QueueRow label="Declined" value={stats.declined} tone="pink" />
              </div>
            </div>

            <div className="glass-panel p-5">
              <p className="font-mono text-sm font-bold uppercase tracking-wider text-[#00d1ff]">Current actions</p>
              <div className="mt-4 space-y-3 text-sm leading-6 text-[#b9cbbc]">
                <p>Approve partners after checking their submitted shop details.</p>
                <p>Set the final percentage before approval.</p>
                <p>Approved partners receive dashboard access and widget code.</p>
              </div>
            </div>
          </aside>
        </section>

      </section>
    </main>
  )
}

function AdminContent({
  activePanel,
  approvedRequests,
  declinedRequests,
  pendingRequests,
  reviewedRequests,
  savingId,
  widgetRequests,
  onDecide,
}: {
  activePanel: "overview" | "pending" | "approved" | "declined" | "widget"
  approvedRequests: any[]
  declinedRequests: any[]
  pendingRequests: any[]
  reviewedRequests: any[]
  savingId: string
  widgetRequests: any[]
  onDecide: Function
}) {
  if (activePanel === "pending") {
    return (
      <div className="space-y-6">
        <PanelHeading icon={Clock3} title="Pending Applications" detail={`${pendingRequests.length} waiting`} />
        <div className="grid gap-4 md:grid-cols-2">
          {pendingRequests.map((request: any) => (
            <RequestCard key={request.id} request={request} saving={savingId === request.id} onDecide={onDecide} compact />
          ))}
          {pendingRequests.length === 0 && <EmptyPanel>No pending partnership requests.</EmptyPanel>}
        </div>
      </div>
    )
  }

  if (activePanel === "approved") {
    return (
      <div className="space-y-6">
        <PanelHeading icon={CheckCircle2} title="Approved Partners" detail={`${approvedRequests.length} approved`} />
        <div className="grid gap-3">
          {approvedRequests.map((request: any) => (
            <ReviewedRequest key={request.id} request={request} />
          ))}
          {approvedRequests.length === 0 && <EmptyPanel>No approved partners yet.</EmptyPanel>}
        </div>
      </div>
    )
  }

  if (activePanel === "declined") {
    return (
      <div className="space-y-6">
        <PanelHeading icon={XCircle} title="Declined Requests" detail={`${declinedRequests.length} declined`} />
        <div className="grid gap-3">
          {declinedRequests.map((request: any) => (
            <ReviewedRequest key={request.id} request={request} />
          ))}
          {declinedRequests.length === 0 && <EmptyPanel>No declined requests.</EmptyPanel>}
        </div>
      </div>
    )
  }

  if (activePanel === "widget") {
    return (
      <div className="space-y-6">
        <PanelHeading icon={Code2} title="Widget Access" detail={`${widgetRequests.length} ready`} />
        <div className="grid gap-3">
          {widgetRequests.map((request: any) => (
            <WidgetAccessCard key={request.id} request={request} />
          ))}
          {widgetRequests.length === 0 && <EmptyPanel>No approved partners with widget access yet.</EmptyPanel>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PanelHeading icon={Clock3} title="Pending Applications" detail={`${pendingRequests.length} waiting`} />
      <div className="grid gap-4 md:grid-cols-2">
        {pendingRequests.map((request: any) => (
          <RequestCard key={request.id} request={request} saving={savingId === request.id} onDecide={onDecide} compact />
        ))}
        {pendingRequests.length === 0 && <EmptyPanel>No pending partnership requests.</EmptyPanel>}
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="border-b border-[#3b4a3f]/25 bg-[#0c1324]/70 px-5 py-4">
          <h2 className="font-sora text-xl font-bold text-[#f4fff3]">Reviewed partners</h2>
          <p className="mt-1 text-sm text-[#b9cbbc]">Approved and declined applications from the database.</p>
        </div>
        <div className="grid gap-3 p-4">
          {reviewedRequests.map((request: any) => (
            <ReviewedRequest key={request.id} request={request} />
          ))}
          {reviewedRequests.length === 0 && <div className="glass-card p-8 text-center text-[#b9cbbc]">No reviewed requests yet.</div>}
        </div>
      </div>
    </div>
  )
}

function PanelHeading({ icon: Icon, title, detail }: { icon: any; title: string; detail: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-2 font-sora text-2xl font-bold text-[#f4fff3]">
        <Icon className="h-5 w-5 text-[#00ff9d]" />
        {title}
      </h2>
      <span className="font-mono text-xs uppercase tracking-widest text-[#00d1ff]">{detail}</span>
    </div>
  )
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return <div className="glass-card border border-[#3b4a3f]/25 p-8 text-center text-[#b9cbbc] md:col-span-2">{children}</div>
}

function AdminRailItem({ icon: Icon, label, active = false, onClick }: { icon: any; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 px-4 py-3 text-left font-mono text-xs uppercase tracking-wider transition ${
      active
        ? "border-r-4 border-[#00ff9d] bg-[#00ff9d]/15 text-[#56ffa8] shadow-[inset_0_0_18px_rgba(0,255,157,0.12)]"
        : "text-[#b9cbbc] hover:bg-[#00d1ff]/10 hover:text-[#00d1ff]"
    }`}>
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function StatCard({ label, value, tone, icon: Icon, active = false, onClick }: { label: string; value: number; tone: "green" | "cyan" | "pink"; icon: any; active?: boolean; onClick?: () => void }) {
  const toneClasses = {
    green: "text-[#00ff9d] bg-[#00ff9d]/10 border-[#00ff9d]/20",
    cyan: "text-[#14d1ff] bg-[#14d1ff]/10 border-[#14d1ff]/20",
    pink: "text-[#ffb0cd] bg-[#ffb0cd]/10 border-[#ffb0cd]/20",
  }[tone]

  return (
    <button type="button" onClick={onClick} className={`glass-card rounded-xl p-5 text-left transition hover:border-[#00ff9d]/35 ${active ? "border border-[#00ff9d]/35 shadow-[0_0_24px_rgba(0,255,157,0.12)]" : ""}`}>
      <div className="mb-4 flex items-start justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded border ${toneClasses}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-[#b9cbbc]">{label}</p>
      <p className="mt-1 text-3xl font-black text-[#f4fff3]">{value}</p>
    </button>
  )
}

function RequestCard({ request, saving, onDecide, compact = false }: { request: any; saving: boolean; onDecide: Function; compact?: boolean }) {
  const [percentage, setPercentage] = useState(String(request.approved_percentage ?? request.proposed_percentage ?? 2))
  const [notes, setNotes] = useState(request.admin_notes || "")
  const isApproved = request.status === "approved"
  const isDeclined = request.status === "declined"

  return (
    <article className={`h-full border border-[#3b4a3f]/25 bg-[#0c1324]/70 p-5 transition hover:border-[#00ff9d]/45 hover:shadow-[0_0_22px_rgba(0,255,157,0.10)] ${compact ? "grid gap-5" : "grid gap-5 lg:grid-cols-[1fr_300px]"}`}>
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className={compact ? "text-xl font-black text-[#f4fff3]" : "text-2xl font-black text-[#f4fff3]"}>{request.business_name}</h3>
          <StatusBadge status={request.status} />
        </div>
        <div className="mt-3 grid gap-2 text-sm text-[#b9cbbc] md:grid-cols-2">
          <p className="break-all">{request.email}</p>
          <p className="break-all">{request.website_url}</p>
        </div>
        <p className={`mt-4 text-sm leading-6 text-[#dce1fb] ${compact ? "line-clamp-3" : ""}`}>{request.audience || "No audience notes provided."}</p>
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

function QueueRow({ label, value, tone }: { label: string; value: number; tone: "green" | "cyan" | "pink" }) {
  const toneClass = tone === "green" ? "bg-[#00ff9d]" : tone === "cyan" ? "bg-[#00d1ff]" : "bg-[#ffb0cd]"
  const width = `${Math.min(100, Math.max(8, value * 12))}%`

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-[#b9cbbc]">{label}</span>
        <span className="font-bold text-[#f4fff3]">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#2e3447]">
        <div className={`h-full ${toneClass}`} style={{ width }} />
      </div>
    </div>
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

function WidgetAccessCard({ request }: { request: any }) {
  return (
    <article className="border border-[#00d1ff]/25 bg-[#070d1f]/80 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-[#f4fff3]">{request.business_name}</h3>
          <p className="mt-2 break-all text-sm text-[#b9cbbc]">{request.website_url}</p>
        </div>
        <StatusBadge status={request.status} />
      </div>
      <div className="mt-4 border border-[#00ff9d]/20 bg-[#00ff9d]/10 p-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#56ffa8]">Partner key</p>
        <p className="mt-2 break-all font-mono text-xs text-[#00ff9d]">{request.widget_partner_key}</p>
      </div>
      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <AdminSummaryRow label="Approved percentage" value={`${request.approved_percentage ?? request.proposed_percentage ?? 2}%`} highlight />
        <AdminSummaryRow label="Contact" value={request.email} />
      </div>
    </article>
  )
}

function AdminSummaryRow({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="min-w-0 border border-[#3b4a3f]/20 bg-[#020617]/60 p-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-[#b9cbbc]">{label}</p>
      <p className={`mt-2 break-all text-sm font-bold ${highlight ? "text-[#00ff9d]" : "text-[#f4fff3]"}`}>{value}</p>
    </div>
  )
}
