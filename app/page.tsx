import Link from "next/link"
import { ArrowRight, BadgeDollarSign, Code2, Printer } from "lucide-react"

export default function HomePage() {
  return (
    <section className="mx-auto grid min-h-[calc(100vh-73px)] max-w-6xl content-center gap-10 px-5 py-12 lg:grid-cols-[1.1fr_0.9fr]">
      <div>
        <p className="font-mono text-sm font-bold uppercase tracking-[0.28em] text-green">Cardify partner platform</p>
        <h1 className="mt-5 max-w-3xl text-5xl font-black leading-tight md:text-7xl">
          Printed cards without leaving the shop.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
          Partners install a tiny TCGPlaytest-powered checkout widget, customers upload artwork on the partner site, and Cardify tracks orders, revenue, and payouts.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/partnership" className="button-primary">
            Apply for partnership
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="panel p-6">
        <div className="grid gap-4">
          {[
            ["Google verified", "Partners sign in with Supabase Google auth before applying."],
            ["Admin approval", "Authorized emails approve, decline, and set final percentage."],
            ["Widget delivery", "Approved partners see the code in dashboard and receive it by email."],
          ].map(([title, text], index) => {
            const Icon = index === 0 ? Printer : index === 1 ? BadgeDollarSign : Code2
            return (
              <div key={title} className="border border-cyan/15 bg-ink/60 p-4">
                <Icon className="h-6 w-6 text-green" />
                <h2 className="mt-3 font-mono text-sm font-bold uppercase tracking-wider text-white">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
