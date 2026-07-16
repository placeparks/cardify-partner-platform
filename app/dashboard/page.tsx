"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Code2, Copy, CreditCard, DollarSign, LogIn, PackageCheck, Percent, ShieldCheck } from "lucide-react"
import { signInWithGoogle } from "@/lib/supabase-browser"

export default function DashboardPage() {
  const [state, setState] = useState<any>({ loading: true })
  const [copied, setCopied] = useState(false)
  const [onboardingBusy, setOnboardingBusy] = useState(false)
  const [activePanel, setActivePanel] = useState<"dashboard" | "widget" | "revenue">("dashboard")
  const widgetCode = state.partner?.widgetCode || ""
  const metrics = state.metrics || { orders: 0, revenueCents: 0, partnerShareCents: 0 }

  useEffect(() => {
    async function loadDashboard() {
      await fetch("/api/stripe/connect/status", { cache: "no-store" }).catch(() => null)
      const response = await fetch("/api/partnership/me")
      const data = await response.json()
      setState({ ...data, loading: false, status: response.status })

      if (response.ok && !data.partner) {
        const navResponse = await fetch("/api/session/nav", { cache: "no-store" })
        const navData = await navResponse.json()
        if (navData.isAdmin) window.location.replace("/admin")
      }
    }

    loadDashboard()
  }, [])

  if (state.loading) return <section className="px-5 py-16 text-center text-slate-300">Loading dashboard...</section>

  if (state.status === 401) {
    return (
      <section className="mx-auto max-w-xl px-5 py-16 text-center">
        <h1 className="text-3xl font-black">Sign in to view your partner dashboard.</h1>
        <button onClick={() => signInWithGoogle("/dashboard")} className="button-primary mt-6">
          <LogIn className="h-4 w-4" />
          Sign in with Google
        </button>
      </section>
    )
  }

  if (!state.partner) {
    return (
      <section className="mx-auto max-w-xl px-5 py-16 text-center">
        <h1 className="text-3xl font-black">No partner application yet.</h1>
        <a href="/partnership" className="button-primary mt-6">Apply now</a>
      </section>
    )
  }

  async function copyWidgetCode() {
    await navigator.clipboard.writeText(widgetCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  async function startOnboarding() {
    setOnboardingBusy(true)
    try {
      const response = await fetch("/api/stripe/connect/onboard", { method: "POST" })
      const data = await response.json()
      if (!response.ok || !data.url) throw new Error(data.error || "Could not start Stripe onboarding")
      window.location.href = data.url
    } catch (caught) {
      setState((current: any) => ({
        ...current,
        error: caught instanceof Error ? caught.message : "Could not start Stripe onboarding",
      }))
      setOnboardingBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-10 text-[#dce1fb] md:px-6">
      <section className="mx-auto grid max-w-[1280px] gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="glass-panel hidden min-h-[560px] p-5 lg:block">
          <div className="font-mono text-2xl font-black tracking-[0.18em] text-[#00ff9d]">CARDIFY</div>
          <div className="mt-10 border-l-2 border-[#00ff9d] pl-4">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#00d1ff]">Partner portal</p>
            <p className="mt-2 text-sm text-[#b9cbbc]">{state.partner.business_name}</p>
          </div>
          <div className="mt-8 space-y-3 text-sm text-[#b9cbbc]">
            <RailButton icon={ShieldCheck} label="Dashboard" active={activePanel === "dashboard"} onClick={() => setActivePanel("dashboard")} />
            <RailButton icon={Code2} label="Widget code" active={activePanel === "widget"} onClick={() => setActivePanel("widget")} />
            <RailButton icon={DollarSign} label="Revenue summary" active={activePanel === "revenue"} onClick={() => setActivePanel("revenue")} />
          </div>
        </aside>

        <div className="min-w-0">
          <div className="glass-panel overflow-hidden">
            <div className="flex flex-col gap-5 border-b border-[#3b4a3f]/25 p-5 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-sm font-bold uppercase tracking-[0.28em] text-[#00ff9d]">Partner dashboard</p>
                <h1 className="mt-3 truncate text-4xl font-black text-[#f4fff3] md:text-5xl">{state.partner.business_name}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[#b9cbbc]">
                  <span>Status: <span className="font-bold text-[#00ff9d]">{state.partner.status}</span></span>
                  {state.partner.status === "approved" && (
                    <span className="inline-flex items-center gap-2 border border-[#00ff9d]/20 bg-[#00ff9d]/10 px-3 py-1 font-mono text-xs uppercase tracking-wider text-[#56ffa8]">
                      <CheckCircle2 className="h-4 w-4" />
                      Approved
                    </span>
                  )}
                </div>
              </div>
              <div className="border border-[#00d1ff]/25 bg-[#020617]/80 px-5 py-4 text-left md:text-right">
                <p className="font-mono text-xs uppercase tracking-wider text-[#b9cbbc]">Approved percentage</p>
                <p className="mt-1 text-4xl font-black text-[#00ff9d]">{state.partner.approved_percentage ?? state.partner.proposed_percentage}%</p>
              </div>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-4">
              <MetricCard icon={PackageCheck} label="Orders" value={metrics.orders} />
              <MetricCard icon={DollarSign} label="Revenue" value={formatMoney(metrics.revenueCents)} />
              <MetricCard icon={DollarSign} label="Your income" value={formatMoney(metrics.partnerShareCents)} />
              <MetricCard icon={Percent} label="Share" value={`${state.partner.approved_percentage ?? state.partner.proposed_percentage}%`} />
            </div>
          </div>

          {state.partner.status === "approved" && !widgetCode ? (
            <div className="glass-panel mt-6 grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="font-mono text-sm font-bold uppercase tracking-[0.22em] text-[#00d1ff]">Payout onboarding</p>
                <h2 className="mt-2 text-3xl font-black text-[#f4fff3]">Connect Stripe to unlock your widget.</h2>
                <p className="mt-3 max-w-2xl leading-7 text-[#b9cbbc]">
                  Your partnership is approved. Connect your Stripe account so partner income can be routed correctly before the widget is installed.
                </p>
                {state.error && <p className="mt-3 border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200">{state.error}</p>}
              </div>
              <button className="button-primary justify-center" onClick={startOnboarding} disabled={onboardingBusy}>
                <CreditCard className="h-4 w-4" />
                {onboardingBusy ? "Opening Stripe..." : "Connect Stripe"}
              </button>
            </div>
          ) : state.partner.status === "approved" ? (
            <PartnerPanel
              activePanel={activePanel}
              copied={copied}
              metrics={metrics}
              widgetCode={widgetCode}
              onCopy={copyWidgetCode}
            />
          ) : (
            <div className="glass-panel mt-6 p-6 text-[#b9cbbc]">
              Your application is not approved yet. Once approved, this page will show widget code, orders, and income.
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

function RailButton({ icon: Icon, label, active, onClick }: { icon: any; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 border px-3 py-3 text-left transition ${
        active
          ? "border-[#00ff9d]/20 bg-[#00ff9d]/10 text-[#56ffa8]"
          : "border-[#3b4a3f]/25 text-[#b9cbbc] hover:border-[#00d1ff]/35 hover:text-[#00d1ff]"
      }`}
    >
      <Icon className={`h-4 w-4 ${active ? "text-[#00ff9d]" : "text-[#00d1ff]"}`} />
      {label}
    </button>
  )
}

function PartnerPanel({
  activePanel,
  copied,
  metrics,
  widgetCode,
  onCopy,
}: {
  activePanel: "dashboard" | "widget" | "revenue"
  copied: boolean
  metrics: any
  widgetCode: string
  onCopy: () => void
}) {
  if (activePanel === "widget") {
    return (
      <div className="mt-6 grid min-w-0 gap-6">
        <WidgetCodeCard copied={copied} widgetCode={widgetCode} onCopy={onCopy} tall />
        <InstallInstructions widgetCode={widgetCode} />
      </div>
    )
  }

  if (activePanel === "revenue") {
    return (
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="glass-panel p-6">
          <p className="font-mono text-sm font-bold uppercase tracking-wider text-[#00d1ff]">Orders placed</p>
          <p className="mt-4 text-5xl font-black text-[#f4fff3]">{metrics.orders}</p>
        </div>
        <div className="glass-panel p-6">
          <p className="font-mono text-sm font-bold uppercase tracking-wider text-[#00d1ff]">Total revenue</p>
          <p className="mt-4 text-5xl font-black text-[#f4fff3]">{formatMoney(metrics.revenueCents)}</p>
        </div>
        <div className="glass-panel p-6">
          <p className="font-mono text-sm font-bold uppercase tracking-wider text-[#00d1ff]">Partner income</p>
          <p className="mt-4 text-5xl font-black text-[#00ff9d]">{formatMoney(metrics.partnerShareCents)}</p>
        </div>
        <div className="glass-panel p-6 lg:col-span-3">
          <p className="font-mono text-sm font-bold uppercase tracking-wider text-[#00d1ff]">Revenue summary</p>
          <div className="mt-5 grid gap-4 text-sm md:grid-cols-3">
            <SummaryRow label="Orders placed" value={metrics.orders} />
            <SummaryRow label="Total revenue" value={formatMoney(metrics.revenueCents)} />
            <SummaryRow label="Partner income" value={formatMoney(metrics.partnerShareCents)} highlight />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[1.45fr_0.75fr]">
      <WidgetCodeCard copied={copied} widgetCode={widgetCode} onCopy={onCopy} />

      <div className="grid gap-6">
        <div className="glass-panel p-5">
          <p className="font-mono text-sm font-bold uppercase tracking-wider text-[#00d1ff]">Payout status</p>
          <div className="mt-4 flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center border border-[#00ff9d]/25 bg-[#00ff9d]/10 text-[#56ffa8]">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <p className="font-bold text-[#f4fff3]">Stripe connected</p>
              <p className="mt-1 text-sm leading-6 text-[#b9cbbc]">Partner income is tracked from completed widget orders.</p>
            </div>
          </div>
        </div>

        <div className="glass-panel p-5">
          <p className="font-mono text-sm font-bold uppercase tracking-wider text-[#00d1ff]">Order summary</p>
          <div className="mt-4 space-y-3 text-sm">
            <SummaryRow label="Orders placed" value={metrics.orders} />
            <SummaryRow label="Total revenue" value={formatMoney(metrics.revenueCents)} />
            <SummaryRow label="Partner income" value={formatMoney(metrics.partnerShareCents)} highlight />
          </div>
        </div>
      </div>
    </div>
  )
}

function WidgetCodeCard({ copied, widgetCode, onCopy, tall = false }: { copied: boolean; widgetCode: string; onCopy: () => void; tall?: boolean }) {
  return (
    <div className="glass-panel min-w-0 overflow-hidden p-5">
      <div className="flex flex-col gap-3 border-b border-[#3b4a3f]/25 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-sm font-bold uppercase tracking-wider text-[#00d1ff]">Widget code</p>
          <p className="mt-1 text-sm text-[#b9cbbc]">Install this script on the approved partner website.</p>
        </div>
        <button className="button-secondary shrink-0 px-4 py-3" onClick={onCopy} title="Copy widget code">
          <Copy className="h-4 w-4" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className={`mt-5 block w-full overflow-auto whitespace-pre-wrap break-all border border-[#00d1ff]/20 bg-[#020617] p-5 font-mono text-xs leading-7 text-[#00ff9d] outline-none ${tall ? "min-h-40" : "min-h-32"}`}>
        {widgetCode}
      </pre>
    </div>
  )
}

function InstallInstructions({ widgetCode }: { widgetCode: string }) {
  return (
    <div className="glass-panel overflow-hidden p-5">
      <div className="flex flex-col gap-2 border-b border-[#3b4a3f]/25 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-sm font-bold uppercase tracking-wider text-[#00d1ff]">How to add it</p>
          <p className="mt-1 text-sm text-[#b9cbbc]">Use the example that matches the partner website stack.</p>
        </div>
      </div>
      <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-3">
        <InstructionBlock title="HTML">
          Paste the widget script before the closing body tag.
          <CodeBlock code={`<!-- before </body> -->\n${widgetCode}`} />
        </InstructionBlock>

        <InstructionBlock title="React">
          Add the script once inside a component effect.
          <CodeBlock code={`useEffect(() => {\n  const script = document.createElement("script")\n  script.src = "${getScriptSrc(widgetCode)}"\n  script.async = true\n  script.dataset.partnerKey = "${getWidgetAttr(widgetCode, "data-partner-key")}"\n  script.dataset.productName = "${getWidgetAttr(widgetCode, "data-product-name")}"\n  script.dataset.partnerShareBps = "${getWidgetAttr(widgetCode, "data-partner-share-bps")}"\n  script.dataset.accent = "${getWidgetAttr(widgetCode, "data-accent")}"\n  document.body.appendChild(script)\n  return () => script.remove()\n}, [])`} />
        </InstructionBlock>

        <InstructionBlock title="Next.js">
          Use the Next Script component on the page where the widget should appear.
          <CodeBlock code={`import Script from "next/script"\n\n<Script\n  src="${getScriptSrc(widgetCode)}"\n  data-partner-key="${getWidgetAttr(widgetCode, "data-partner-key")}"\n  data-product-name="${getWidgetAttr(widgetCode, "data-product-name")}"\n  data-partner-share-bps="${getWidgetAttr(widgetCode, "data-partner-share-bps")}"\n  data-accent="${getWidgetAttr(widgetCode, "data-accent")}"\n  strategy="afterInteractive"\n/>`} />
        </InstructionBlock>
      </div>
    </div>
  )
}

function InstructionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-bold text-[#f4fff3]">{title}</h3>
      <div className="mt-2 text-sm leading-6 text-[#b9cbbc]">{children}</div>
    </div>
  )
}

function CodeBlock({ code }: { code: string }) {
  return <pre className="mt-3 max-h-64 min-w-0 overflow-auto whitespace-pre-wrap break-all border border-[#00d1ff]/20 bg-[#020617] p-3 font-mono text-[11px] leading-5 text-[#00ff9d]">{code}</pre>
}

function getWidgetAttr(widgetCode: string, attr: string) {
  return widgetCode.match(new RegExp(`${attr}="([^"]*)"`))?.[1] || ""
}

function getScriptSrc(widgetCode: string) {
  return getWidgetAttr(widgetCode, "src")
}

function formatMoney(cents = 0) {
  return `$${(cents / 100).toFixed(2)}`
}

function MetricCard({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <div className="glass-card min-w-0 border border-[#3b4a3f]/25 p-4">
      <div className="mb-4 flex h-9 w-9 items-center justify-center border border-[#00d1ff]/20 bg-[#00d1ff]/10 text-[#00d1ff]">
        <Icon className="h-5 w-5" />
      </div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-[#b9cbbc]">{label}</p>
      <p className="mt-2 truncate text-2xl font-black text-[#f4fff3]">{value}</p>
    </div>
  )
}

function SummaryRow({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#3b4a3f]/20 pb-3 last:border-b-0 last:pb-0">
      <span className="text-[#b9cbbc]">{label}</span>
      <span className={highlight ? "font-black text-[#00ff9d]" : "font-bold text-[#f4fff3]"}>{value}</span>
    </div>
  )
}
