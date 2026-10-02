import { supabaseAdmin as db } from "@/lib/supabase-admin"
import { digest } from "@/lib/partner-api"
export const dynamic = "force-dynamic"
export const metadata = { title: "TCGPlaytest test cart", robots: { index:false,follow:false } }
export default async function TestCheckout({params}:{params:Promise<{token:string}>}) {
  const {token}=await params
  const {data:cart,error}=await db.from("partner_carts").select("card_count,status,expires_at,partner:partnership_requests(api_blocked_at)").eq("mode","test").eq("checkout_token_hash",digest(token)).maybeSingle()
  const available=!error&&cart&&cart.status==='open'&&Date.parse(cart.expires_at)>Date.now()&&!(cart.partner as any)?.api_blocked_at
  return <section className="mx-auto max-w-2xl space-y-5 p-10"><p className="font-mono text-amber-300">TEST MODE</p><h1 className="text-3xl font-bold">{available?'Cart handoff validated':'Test cart unavailable'}</h1>{available&&<><p>{cart.card_count} cards</p><p>No charge, printing, shipping, or artwork download will occur. Customers can enter an optional affiliate code during live checkout. Use a live key when your integration is ready.</p></>}</section>
}
