"use client"

import { FormEvent, useEffect, useState } from "react"
import { CheckCircle2, LogIn } from "lucide-react"
import { getSupabaseBrowserClient, signInWithGoogle } from "@/lib/supabase-browser"

export default function PartnershipPage() {
  const [user, setUser] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({
    fullName: "",
    businessName: "",
    websiteUrl: "",
    audience: "",
    proposedPercentage: "2",
  })

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null)
      setForm((current) => ({
        ...current,
        fullName: data.user?.user_metadata?.full_name || "",
      }))
    })
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage("")

    try {
      const response = await fetch("/api/partnership/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not submit application")
      setSubmitted(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit application")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto grid max-w-6xl gap-8 px-5 py-12 lg:grid-cols-[0.9fr_1.1fr]">
      <div>
        <p className="font-mono text-sm font-bold uppercase tracking-[0.28em] text-green">Partnership</p>
        <h1 className="mt-4 text-4xl font-black leading-tight md:text-6xl">Bring premium card printing to your platform.</h1>
        <p className="mt-5 text-lg leading-8 text-slate-300">
          Apply with your platform details and suggested revenue percentage. Once approved, your dashboard shows the widget code and live affiliate performance.
        </p>
        <div className="mt-8 grid gap-3 text-sm text-slate-300">
          {["Customers stay on your website", "Orders save into our fulfillment database", "Approved partners receive widget code by email"].map((item) => (
            <div key={item} className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green" />
              {item}
            </div>
          ))}
        </div>
      </div>

      {submitted ? (
        <div className="panel flex min-h-[320px] flex-col items-center justify-center p-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-green" />
          <h2 className="mt-5 text-3xl font-black">Submitted</h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-300">
            Your partnership application has been received. We will review it and email you once there is an update.
          </p>
        </div>
      ) : (
      <form onSubmit={submit} className="panel grid gap-4 p-6">
        {!user ? (
          <div className="border border-cyan/20 bg-ink/70 p-5">
            <p className="text-sm text-slate-300">Sign in with Google first so we can connect the application to your partner account.</p>
            <button type="button" onClick={() => signInWithGoogle("/partnership")} className="button-primary mt-4">
              <LogIn className="h-4 w-4" />
              Sign in with Google
            </button>
          </div>
        ) : (
          <p className="border border-green/25 bg-green/10 p-3 text-sm text-green">Signed in as {user.email}</p>
        )}

        <input className="field" required placeholder="Full name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
        <input className="field" required placeholder="Business or platform name" value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} />
        <input className="field" required type="url" placeholder="Website URL" value={form.websiteUrl} onChange={(event) => setForm({ ...form, websiteUrl: event.target.value })} />
        <textarea className="field min-h-28" placeholder="Audience, traffic, or why this is a good fit" value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })} />
        <label className="grid gap-2 text-sm text-slate-300">
          Suggested partner percentage
          <input className="field" required min="0" max="30" step="0.1" type="number" value={form.proposedPercentage} onChange={(event) => setForm({ ...form, proposedPercentage: event.target.value })} />
        </label>
        {message && <p className="border border-cyan/20 bg-ink/70 p-3 text-sm text-slate-200">{message}</p>}
        <button disabled={!user || busy} className="button-primary">
          {busy ? "Submitting..." : "Submit application"}
        </button>
      </form>
      )}
    </section>
  )
}
