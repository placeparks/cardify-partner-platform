"use client"

import { useEffect, useState } from "react"
import { Copy, CreditCard, LogIn } from "lucide-react"
import { signInWithGoogle } from "@/lib/supabase-browser"

export default function DashboardPage() {
  const [state, setState] = useState<any>({ loading: true })
  const [copied, setCopied] = useState(false)
  const [onboardingBusy, setOnboardingBusy] = useState(false)
  const widgetCode = state.partner?.widgetCode || ""

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
    <section className="mx-auto w-full max-w-5xl overflow-hidden px-5 py-10">
      <p className="font-mono text-sm font-bold uppercase tracking-[0.28em] text-green">Partner dashboard</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="min-w-0">
          <h1 className="text-4xl font-black">{state.partner.business_name}</h1>
          <p className="mt-2 text-slate-300">Status: <span className="font-bold text-green">{state.partner.status}</span></p>
        </div>
        <div className="panel px-5 py-4 text-left sm:text-right">
          <p className="text-xs uppercase tracking-wider text-slate-400">Approved percentage</p>
          <p className="text-3xl font-black text-green">{state.partner.approved_percentage ?? state.partner.proposed_percentage}%</p>
        </div>
      </div>

      {state.partner.status === "approved" && !widgetCode ? (
        <div className="panel mt-8 grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-2xl font-black">Complete payout onboarding</h2>
            <p className="mt-2 max-w-2xl leading-7 text-slate-300">
              Your partnership is approved. Connect your Stripe account before installing the widget so partner income can be routed correctly.
            </p>
            {state.error && <p className="mt-3 text-sm text-red-300">{state.error}</p>}
          </div>
          <button className="button-primary justify-center" onClick={startOnboarding} disabled={onboardingBusy}>
            <CreditCard className="h-4 w-4" />
            {onboardingBusy ? "Opening Stripe..." : "Connect Stripe"}
          </button>
        </div>
      ) : state.partner.status === "approved" ? (
        <div className="mt-8 grid min-w-0 gap-5">
          <div className="panel min-w-0 overflow-hidden p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-cyan">Widget code</h2>
              <button className="button-secondary shrink-0 px-3 py-2" onClick={copyWidgetCode} title="Copy widget code">
                <Copy className="h-4 w-4" />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <textarea
              className="mt-4 block h-32 w-full resize-none overflow-auto border border-cyan/20 bg-ink p-4 font-mono text-xs leading-6 text-green outline-none"
              readOnly
              value={widgetCode}
              aria-label="Widget code"
            />
          </div>

          <div className="grid min-w-0 gap-4 sm:grid-cols-3">
            {[
              ["Orders", state.metrics.orders],
              ["Revenue", `$${(state.metrics.revenueCents / 100).toFixed(2)}`],
              ["Your income", `$${(state.metrics.partnerShareCents / 100).toFixed(2)}`],
            ].map(([label, value]) => (
              <div key={label} className="panel p-5">
                <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
                <p className="mt-2 text-3xl font-black">{value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="panel mt-8 p-6 text-slate-300">
          Your application is not approved yet. Once approved, this page will show widget code, orders, and income.
        </div>
      )}
    </section>
  )
}
