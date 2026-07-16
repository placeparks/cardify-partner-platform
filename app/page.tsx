import Link from "next/link"
import { ArrowRight, BadgeDollarSign, Code2, Eye, Printer, Sparkles } from "lucide-react"

export default function HomePage() {
  return (
    <main className="relative overflow-hidden">
      <section className="mx-auto grid min-h-[calc(100vh-73px)] max-w-6xl content-center gap-12 px-5 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 border border-green/30 bg-green/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-green">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green" />
            Partner platform live
          </div>

          <h1 className="mt-6 max-w-3xl text-5xl font-black leading-tight md:text-7xl">
            Custom Printed cards <span className="text-green drop-shadow-[0_0_18px_rgba(22,163,74,0.55)]">without leaving</span> the platform.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            Partners install a tiny TCGPlaytest-powered checkout widget, customers upload artwork on the partner site, and Cardify tracks orders, revenue, and payouts.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/partnership" className="button-primary shadow-[0_0_24px_rgba(22,163,74,0.35)]">
              Apply for partnership
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/dashboard" className="button-secondary">
              Partner dashboard
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-cyan/20 pt-5">
            <div className="flex -space-x-3">
              <div className="h-10 w-10 rounded-full border-2 border-[#05070d] bg-gradient-to-br from-green to-cyan" />
              <div className="h-10 w-10 rounded-full border-2 border-[#05070d] bg-gradient-to-br from-pink-400 to-cyan" />
              <div className="h-10 w-10 rounded-full border-2 border-[#05070d] bg-gradient-to-br from-slate-500 to-green" />
            </div>
            <p className="font-mono text-xs uppercase tracking-wider text-slate-400">Built for partner storefronts and card communities</p>
          </div>
        </div>

        <div className="relative flex items-center justify-center py-8">
          <div className="absolute h-72 w-72 bg-green/15 blur-3xl" />
          <div className="absolute h-72 w-72 translate-x-16 translate-y-16 bg-cyan/10 blur-3xl" />

          <div className="holo-card relative w-full max-w-sm rotate-3 overflow-hidden rounded-lg bg-white/[0.06] p-3 shadow-2xl backdrop-blur-xl transition duration-500 hover:rotate-0">
            <div className="flex items-start justify-between">
              <span className="bg-green/15 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-green">Stage 1</span>
              <div className="flex items-center gap-1 text-green">
                <span className="text-xl font-black">130</span>
                <Eye className="h-4 w-4" />
              </div>
            </div>

            <div className="relative mt-3 aspect-[2.5/3.25] overflow-hidden rounded-md bg-slate-900">
              <img
                src="https://images.unsplash.com/photo-1607827448387-a67db1383b59?auto=format&fit=crop&w=900&q=80"
                alt="Premium custom printed trading card artwork"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#05070d] via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <h2 className="text-3xl font-black text-white">XOE 2.0</h2>
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-green">Elite print run</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-200">Partner checkout</span>
                <div className="flex gap-1">
                  <span className="h-3 w-1 bg-green" />
                  <span className="h-3 w-1 bg-green" />
                  <span className="h-3 w-1 bg-green" />
                  <span className="h-3 w-1 bg-green/20" />
                </div>
              </div>
              <p className="text-xs leading-5 text-slate-400">Upload artwork, pay securely, and keep customers on the partner website.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-5 pb-14 md:grid-cols-3">
        {[
          ["Google verified", "Partners sign in with Supabase Google auth before applying."],
          ["Admin approval", "Authorized emails approve, decline, and set final percentage."],
          ["Widget delivery", "Approved partners connect Stripe, then receive widget code by dashboard and email."],
        ].map(([title, text], index) => {
          const Icon = index === 0 ? Printer : index === 1 ? BadgeDollarSign : Code2
          return (
            <div key={title} className="glass-panel p-5 transition hover:border-green/50">
              <Icon className="h-7 w-7 text-green" />
              <h2 className="mt-4 font-mono text-sm font-bold uppercase tracking-wider text-white">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">{text}</p>
            </div>
          )
        })}
      </section>

      <div className="pointer-events-none absolute left-6 top-28 hidden items-center gap-2 text-green/30 lg:flex">
        <Sparkles className="h-4 w-4" />
        <span className="font-mono text-xs uppercase tracking-[0.2em]">Cardify</span>
      </div>
    </main>
  )
}
