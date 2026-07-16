"use client"

import { useEffect, useState } from "react"
import { Copy, LogIn } from "lucide-react"
import { signInWithGoogle } from "@/lib/supabase-browser"

export default function DashboardPage() {
  const [state, setState] = useState<any>({ loading: true })
  const widgetCode = state.partner?.widgetCode || ""

  useEffect(() => {
    fetch("/api/partnership/me").then(async (response) => {
      const data = await response.json()
      setState({ ...data, loading: false, status: response.status })
    })
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

  return (
    <section className="mx-auto max-w-6xl px-5 py-12">
      <p className="font-mono text-sm font-bold uppercase tracking-[0.28em] text-green">Partner dashboard</p>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black">{state.partner.business_name}</h1>
          <p className="mt-2 text-slate-300">Status: <span className="font-bold text-green">{state.partner.status}</span></p>
        </div>
        <div className="panel px-5 py-4 text-right">
          <p className="text-xs uppercase tracking-wider text-slate-400">Approved percentage</p>
          <p className="text-3xl font-black text-green">{state.partner.approved_percentage ?? state.partner.proposed_percentage}%</p>
        </div>
      </div>

      {state.partner.status === "approved" ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="panel p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-cyan">Widget code</h2>
              <button className="button-secondary px-3 py-2" onClick={() => navigator.clipboard.writeText(widgetCode)}>
                <Copy className="h-4 w-4" />
                Copy
              </button>
            </div>
            <pre className="mt-4 overflow-auto border border-cyan/20 bg-ink p-4 text-xs leading-6 text-green">{widgetCode}</pre>
          </div>

          <div className="grid gap-4">
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
