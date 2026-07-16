import Link from "next/link"
import { CheckCircle2, Code2, Copy, Eye, ShieldCheck } from "lucide-react"

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0c1324] text-[#dce1fb]">
      <section className="relative mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-8 px-4 py-16 md:px-6 lg:grid-cols-2">
        <div className="z-10">
          <div className="mb-4 inline-flex items-center border border-[#00ff9d]/30 bg-[#f4fff3]/10 px-3 py-1">
            <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-[#00ff9d]" />
            <span className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-[#56ffa8]">Partner Platform Live</span>
          </div>

          <h1 className="max-w-2xl font-sora text-[56px] font-extrabold leading-[1.02] text-[#f4fff3] md:text-[86px]">
            Custom Printed cards <span className="text-[#00ff9d]">without leaving</span> the platform.
          </h1>

          <p className="mt-7 max-w-xl text-lg leading-8 text-[#b9cbbc]">
            Partners install a tiny TCGPlaytest-powered checkout widget, customers upload artwork on the partner site, and Cardify tracks orders, revenue, and payouts.
          </p>

          <div className="mt-9 flex flex-wrap gap-4">
            <Link href="/partnership" className="rounded-lg bg-[#00ff9d] px-8 py-4 font-sora text-2xl font-bold text-[#007143] shadow-[0_0_20px_rgba(0,255,157,0.4)] transition hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(0,255,157,0.6)]">
              Apply for Partnership
            </Link>
            <Link href="/dashboard" className="rounded-lg border border-[#3b4a3f] bg-[#191f31] px-8 py-4 font-sora text-2xl font-bold text-[#f4fff3] transition hover:bg-[#23293c]">
              View API Docs
            </Link>
          </div>

          <div className="mt-8 flex items-center gap-4 border-t border-[#3b4a3f]/30 pt-4">
            <div className="flex -space-x-3">
              <div className="h-10 w-10 rounded-full border-2 border-[#0c1324] bg-[#2e3447]" />
              <div className="h-10 w-10 rounded-full border-2 border-[#0c1324] bg-[#2e3447]" />
              <div className="h-10 w-10 rounded-full border-2 border-[#0c1324] bg-[#2e3447]" />
            </div>
            <p className="font-mono text-sm font-medium text-[#b9cbbc]">Trusted by 50+ Elite Gaming Partners</p>
          </div>
        </div>

        <div className="relative flex items-center justify-center py-8">
          <div className="holographic-border glass-card relative aspect-[2.5/3.5] w-full max-w-sm rotate-3 overflow-hidden rounded-xl shadow-2xl transition duration-500 hover:rotate-0">
            <div className="flex h-full w-full flex-col p-2">
              <div className="mb-2 flex items-start justify-between">
                <span className="rounded bg-[#f4fff3]/20 px-2 py-0.5 font-mono text-[10px] text-[#00e38b]">STAGE 1</span>
                <div className="flex items-center gap-1 text-[#f4fff3]">
                  <span className="font-sora text-2xl font-semibold">130</span>
                  <Eye className="h-4 w-4 text-[#00ff9d]" />
                </div>
              </div>

              <div className="relative mb-2 flex-grow overflow-hidden rounded-lg bg-[#2e3447]/50">
                <img
                  src="/hero.png"
                  alt="Premium custom printed trading card artwork"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0c1324]/80 to-transparent" />
                <div className="absolute bottom-2 left-2">
                  <h2 className="font-sora text-2xl font-semibold text-[#f4fff3]">XOE 2.0</h2>
                  <p className="font-mono text-xs font-medium uppercase tracking-[0.1em] text-[#00ff9d]">Elite print run</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[#f4fff3]/80">
                  <span className="text-sm font-bold">Partner checkout</span>
                  <div className="flex">
                    <div className="energy-bar-segment" />
                    <div className="energy-bar-segment" />
                    <div className="energy-bar-segment" />
                    <div className="energy-bar-segment energy-bar-dim" />
                  </div>
                </div>
                <p className="text-[11px] italic leading-tight text-[#b9cbbc]">Upload artwork, pay securely, and keep customers on the partner website.</p>
                <div className="mt-4 flex items-end justify-between">
                  <span className="font-mono text-[8px] text-[#b9cbbc]">CARDIFY PARTNER PLATFORM</span>
                  <div className="flex gap-2">
                    <div className="h-4 w-4 rounded-full bg-[#a6e6ff]" />
                    <div className="h-4 w-4 rounded-full bg-[#ffb4ab]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute -z-10 aspect-[2.5/3.5] w-full max-w-sm -translate-x-12 translate-y-8 -rotate-6 rounded-xl border border-[#3b4a3f]/30 bg-[#070d1f] opacity-40" />
        </div>
      </section>

      <section className="mx-auto grid max-w-[1280px] grid-cols-1 gap-6 px-4 py-24 md:grid-cols-3 md:px-6">
        {[
          { icon: ShieldCheck, title: "Google verified", body: "Partners sign in with Supabase Google auth before applying. High-security, low-friction onboarding for elite creators.", color: "text-[#f4fff3]" },
          { icon: ShieldCheck, title: "Admin approval", body: "Authorized emails approve, decline, and set final percentage. We maintain quality through a rigorous vetting process.", color: "text-[#a6e6ff]" },
          { icon: Code2, title: "Widget delivery", body: "Approved partners see the code in dashboard and receive it by email. Integration takes minutes, not weeks.", color: "text-[#00ff9d]" },
        ].map((item) => (
          <div key={item.title} className="glass-card rounded-xl border border-[#3b4a3f]/20 p-6 transition hover:border-[#00ff9d]/50">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#23293c]">
              <item.icon className={`h-6 w-6 ${item.color}`} />
            </div>
            <h3 className={`mb-2 font-sora text-2xl font-semibold ${item.color}`}>{item.title}</h3>
            <p className="leading-7 text-[#b9cbbc]">{item.body}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-[1280px] border-t border-[#3b4a3f]/20 px-4 py-24 md:px-6">
        <div className="glass-card rounded-2xl p-6 md:p-8">
          <div className="flex flex-col gap-8 lg:flex-row">
            <div className="lg:w-1/2">
              <h2 className="mb-4 font-sora text-4xl font-bold text-[#f4fff3]">Seamless Checkout Widget</h2>
              <p className="mb-8 text-[#b9cbbc]">Your users never leave your brand. Our lightweight embed handles the complex logistics while you reap the rewards. It's the ultimate TCG-as-a-Service solution.</p>
              <ul className="mb-8 space-y-4">
                {["Automatic revenue split tracking", "Universal card format support", "Real-time status updates via email"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-[#f4fff3]" />
                    <span className="text-[#dce1fb]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative rounded-xl border border-[#3b4a3f]/30 bg-[#070d1f] p-6 shadow-inner lg:w-1/2">
              <div className="mb-4 flex items-center justify-between border-b border-[#3b4a3f]/20 pb-4">
                <div className="flex gap-2">
                  <div className="h-3 w-3 rounded-full bg-[#ffb4ab]/40" />
                  <div className="h-3 w-3 rounded-full bg-[#a6e6ff]/40" />
                  <div className="h-3 w-3 rounded-full bg-[#f4fff3]/40" />
                </div>
                <span className="font-mono text-[10px] text-[#b9cbbc]">cardify-widget-v1.js</span>
              </div>
              <pre className="overflow-x-auto font-mono text-xs leading-5 text-[#b7eaff]">{`<script>
  window.CardifyConfig = {
    partnerId: "CARDIFY_001",
    theme: "neon-noir",
    onSuccess: (order) => {
      console.log("Card order!", order);
    }
  };
</script>
<div id="cardify-root"></div>`}</pre>
              <button className="absolute bottom-4 right-4 flex items-center gap-2 rounded bg-[#f4fff3]/10 p-2 text-[#00ff9d] transition hover:bg-[#f4fff3]/20">
                <Copy className="h-4 w-4" />
                <span className="font-mono text-[10px]">Copy Snippet</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-24 text-center">
        <h2 className="mb-4 font-sora text-5xl font-extrabold text-[#f4fff3]">Ready to scale your TCG ecosystem?</h2>
        <p className="mx-auto mb-8 max-w-2xl text-[#b9cbbc]">Join the elite network of partners who are redefining the future of digital and physical card gaming through Cardify.</p>
        <Link href="/partnership" className="inline-flex rounded-xl bg-[#00ff9d] px-12 py-5 font-sora text-2xl font-extrabold text-[#007143] shadow-[0_0_30px_rgba(0,255,157,0.4)] transition hover:scale-105">
          APPLY FOR PARTNERSHIP
        </Link>
      </section>

      <footer className="mt-24 border-t border-[#3b4a3f]/20 bg-[#070d1f] py-8">
        <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-3 px-4 md:flex-row md:px-6">
          <div>
            <span className="font-sora text-xl font-extrabold text-[#dce1fb]">Cardify</span>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[#b9cbbc]">&copy; 2026 Cardify partner platform. All rights reserved.</p>
          </div>
          <div className="flex gap-6 font-mono text-xs uppercase tracking-widest text-[#b9cbbc]">
            <Link href="/partnership" className="transition hover:text-[#14d1ff]">Apply</Link>
            <Link href="/dashboard" className="transition hover:text-[#14d1ff]">Dashboard</Link>
            <Link href="/admin" className="transition hover:text-[#14d1ff]">Admin</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
