import Link from "next/link"
import { Code2, PackageCheck, ShieldCheck } from "lucide-react"
export default function HomePage() {
  return <div className="min-h-screen px-5 py-16"><section className="mx-auto max-w-6xl">
    <p className="font-mono uppercase tracking-widest text-[#00ff9d]">TCGPlaytest • Partner manufacturing API</p>
    <h1 className="mt-6 max-w-4xl text-5xl font-black leading-tight md:text-7xl">Your artwork.<br/><span className="text-[#00ff9d]">Our print floor.</span></h1>
    <p className="mt-8 max-w-2xl text-lg leading-8 text-slate-300">Build the customer experience on your website. Your server submits certified, client-supplied manufacturing instructions. TCGPlaytest handles checkout at standard rates, printing, and fulfillment.</p>
    <div className="my-8 flex flex-wrap gap-4"><Link className="button-primary" href="/partnership">Apply for widget and API access</Link><Link className="button-secondary" href="/docs">Read the integration guide</Link></div>
    <div className="glass-panel my-12 p-6 font-mono text-sm leading-8 text-cyan-200">Customer → Your website → Your server → TCGPlaytest Manufacturing API → Print / fulfillment</div>
    <div className="grid gap-6 md:grid-cols-3">{[
      {icon:Code2,title:"Widget and REST API",text:"Add our checkout button or build your own integration. Both use your server and the same TCGPlaytest checkout. No Stripe Connect account is required."},
      {icon:PackageCheck,title:"Affiliate codes included",text:"Customers can enter an affiliate code when checking out a partner order. Existing TCGPlaytest discount and reward rules apply."},
      {icon:ShieldCheck,title:"Manufacturing only",text:"You supply every front and back and certify reproduction rights. We temporarily process those files for production and fulfillment."},
    ].map(item=><div className="glass-panel p-6" key={item.title}><item.icon className="mb-5 text-[#00ff9d]"/><h2 className="text-xl font-bold">{item.title}</h2><p className="mt-4 leading-7 text-slate-300">{item.text}</p></div>)}</div>
    <p className="mt-12 max-w-3xl leading-7 text-slate-300">TCGPlaytest does not supply an artwork library, choose or substitute artwork, or license or verify intellectual-property rights. Production processing may include resizing, cropping, bleed generation, color conversion, preflight, imposition, and RIP preparation.</p>
    <footer className="mt-16 flex flex-wrap gap-6 border-t border-white/10 pt-6 text-sm"><Link href="/terms">Manufacturing API terms</Link><Link href="/dmca">Copyright notices</Link><Link href="/dashboard">Partner dashboard</Link><span>© 2026 Cardify LLC · TCGPlaytest</span></footer>
  </section></div>
}
