"use client"

import { FormEvent, useEffect, useState } from "react"
import { BarChart3, CheckCircle2, Code2, LogIn, Rocket, ShieldCheck } from "lucide-react"
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
    <main className="relative min-h-screen overflow-hidden bg-[#020617] px-4 py-16 text-[#dce1fb] md:px-6">
      <div className="pointer-events-none absolute inset-0 opacity-20">
        <div className="absolute left-1/4 top-24 h-64 w-64 rounded-full bg-[#00d1ff]/20 blur-3xl" />
        <div className="absolute bottom-20 right-1/4 h-64 w-64 rounded-full bg-[#00ff9d]/20 blur-3xl" />
      </div>

      <section className="relative z-10 mx-auto grid max-w-[1280px] gap-8 lg:grid-cols-12">
        <div className="flex flex-col justify-center lg:col-span-5">
          <div className="mb-4 inline-flex items-center gap-2">
            <span className="h-[2px] w-12 bg-[#00d1ff]" />
            <span className="font-mono text-sm uppercase tracking-[0.2em] text-[#00d1ff]">Partner portal</span>
          </div>

          <h1 className="font-sora text-4xl font-extrabold leading-tight text-[#dce1fb] md:text-5xl">
            Get your Cardify widget <span className="text-[#00d1ff]">for your store</span>
          </h1>
          <p className="mt-5 max-w-md text-lg leading-8 text-[#b9cbbc]">
            Sign in with Google first - it links your application to your partner account so you can track its status. Approved partners unlock the Cardify widget, Stripe payouts, and live order tracking.
          </p>

          <div className="mt-8 space-y-4">
            {[
              { icon: Rocket, title: "Partner checkout", body: "Customers upload artwork and pay without leaving your site." },
              { icon: BarChart3, title: "Revenue tracking", body: "Your dashboard shows orders, gross revenue, and your earnings in real time." },
              { icon: Code2, title: "Widget delivery", body: "Once approved and set up with Stripe, your embed code is in your dashboard and inbox." },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-4">
                <div className="glass-panel flex h-12 w-12 items-center justify-center text-[#00d1ff] transition group-hover:scale-110">
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-sora text-lg font-semibold text-[#f4fff3]">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-[#b9cbbc]">{item.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="glass-panel mt-10 hidden max-w-xs rotate-[-6deg] overflow-hidden rounded-xl p-3 opacity-80 lg:block">
            <img src="/partnership.png" alt="Cardify partnership application preview" className="aspect-[3/4] w-full rounded-lg object-cover" />
            <div className="mt-3 h-1 w-full bg-[#00d1ff]" />
            <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-[#00d1ff]">Cardify partner access</p>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="holographic-edge glass-panel relative overflow-hidden rounded-xl p-6 md:p-10">
            <div className="scanline-effect" />
            <div className="relative z-10">
              <div className="mb-8 flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#00d1ff]">Cardify access</p>
                  <h2 className="mt-2 font-sora text-3xl font-bold text-[#f4fff3]">Application</h2>
                </div>
                <div className="flex">
                  <div className="portal-energy-segment active" />
                  <div className="portal-energy-segment active" />
                  <div className="portal-energy-segment active" />
                  <div className="portal-energy-segment" />
                </div>
              </div>

              {submitted ? (
                <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                  <CheckCircle2 className="h-14 w-14 text-[#00ff9d]" />
                  <h2 className="mt-5 font-sora text-3xl font-black text-[#f4fff3]">Submitted</h2>
                  <p className="mt-3 max-w-md text-sm leading-6 text-[#b9cbbc]">
                    Your partnership application has been received. We will review it and email you once there is an update.
                  </p>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-6">
                  {!user ? (
                    <div className="border border-[#00d1ff]/20 bg-[#070d1f]/80 p-5">
                      <p className="text-sm leading-6 text-[#b9cbbc]">Sign in with Google first - it links your application to your partner account so you can track its status.</p>
                      <button type="button" onClick={() => signInWithGoogle("/partnership")} className="mt-4 inline-flex items-center gap-2 rounded bg-[#00ff9d] px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-[#00391f] transition hover:scale-[1.02]">
                        <LogIn className="h-4 w-4" />
                        Sign in with Google
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 border border-[#00ff9d]/25 bg-[#00ff9d]/10 p-4 text-sm text-[#56ffa8]">
                      <ShieldCheck className="h-5 w-5" />
                      Signed in as {user.email}
                    </div>
                  )}

                  <div className="grid gap-6 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="font-mono text-xs uppercase tracking-wider text-[#b9cbbc]">Full name</span>
                      <input className="input-recessed p-4 font-mono text-sm uppercase text-[#dce1fb]" required placeholder="ALEX MERCER" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
                    </label>
                    <label className="grid gap-2">
                      <span className="font-mono text-xs uppercase tracking-wider text-[#b9cbbc]">Email</span>
                      <input className="input-recessed p-4 font-mono text-sm uppercase text-[#dce1fb]" readOnly value={user?.email || "SIGN IN REQUIRED"} />
                    </label>
                  </div>

                  <label className="grid gap-2">
                    <span className="font-mono text-xs uppercase tracking-wider text-[#b9cbbc]">Business or store name</span>
                    <input className="input-recessed p-4 font-mono text-sm uppercase text-[#dce1fb]" required placeholder="YOUR SHOP OR STORE" value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} />
                  </label>

                  <label className="grid gap-2">
                    <span className="font-mono text-xs uppercase tracking-wider text-[#b9cbbc]">Website URL</span>
                    <input className="input-recessed w-full p-4 font-mono text-sm text-[#dce1fb]" required type="url" placeholder="https://yourwebsite.com" value={form.websiteUrl} onChange={(event) => setForm({ ...form, websiteUrl: event.target.value })} />
                  </label>

                  <label className="grid gap-2">
                    <span className="font-mono text-xs uppercase tracking-wider text-[#b9cbbc]">Proposed revenue share (%)</span>
                    <div className="flex items-center gap-3">
                      <input className="input-recessed w-full p-4 font-mono text-sm text-[#dce1fb]" required min="0" max="30" step="0.1" type="number" value={form.proposedPercentage} onChange={(event) => setForm({ ...form, proposedPercentage: event.target.value })} />
                      <span className="border border-[#00d1ff]/20 bg-[#070d1f]/80 px-4 py-4 font-mono text-sm text-[#00d1ff]">%</span>
                    </div>
                    <span className="text-xs leading-5 text-[#b9cbbc]">The percentage of each sale you'd like to keep. We'll confirm the split during review.</span>
                  </label>

                  <label className="grid gap-2">
                    <span className="font-mono text-xs uppercase tracking-wider text-[#b9cbbc]">Tell us about your audience</span>
                    <textarea className="input-recessed min-h-32 resize-none p-4 font-mono text-sm uppercase text-[#dce1fb]" placeholder="Monthly traffic, community size, and what you sell today." value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })} />
                  </label>

                  {message && <p className="border border-[#ffb4ab]/25 bg-[#93000a]/20 p-3 text-sm text-[#ffb4ab]">{message}</p>}

                  <button disabled={!user || busy} className="group relative w-full overflow-hidden rounded bg-[#00d1ff] py-4 font-sora text-sm font-bold uppercase tracking-[0.2em] text-[#003543] transition hover:-translate-y-0.5 hover:shadow-[0_0_25px_rgba(0,209,255,0.6)] disabled:cursor-not-allowed disabled:opacity-50">
                    <span className="relative z-10">{busy ? "Submitting..." : "Submit application"}</span>
                    <span className="absolute inset-0 -translate-x-full skew-x-12 bg-white/20 transition-transform duration-700 group-hover:translate-x-full" />
                  </button>
                  <p className="text-center font-mono text-xs uppercase tracking-wider text-[#b9cbbc]/60">We review most applications within 2 business days. You'll hear from us by email.</p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
