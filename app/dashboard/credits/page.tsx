'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, ShieldCheck, Wallet } from 'lucide-react'
import { PrepaidCredit } from '@/components/prepaid-credit'
import { hasPartnerTerms } from '@/lib/manufacturing-contract'
import { signInWithGoogle } from '@/lib/supabase-browser'

export default function CreditsPage() {
  const [state, setState] = useState<any>(null)
  const [error, setError] = useState('')
  const [returned, setReturned] = useState(false)

  async function load() {
    setError('')
    try {
      const response = await fetch('/api/partnership/me', {cache:'no-store'})
      const data = await response.json()
      if (!response.ok && response.status !== 401) throw new Error(data.error?.message || data.error || 'Your account could not be loaded.')
      setState({...data, status:response.status})
    } catch (e) { setError(e instanceof Error ? e.message : 'Your account could not be loaded.') }
  }

  useEffect(() => {
    load()
    setReturned(new URLSearchParams(window.location.search).get('credit') === 'return')
  }, [])

  const partner = state?.partner
  const active = partner?.status === 'approved' && !partner.api_blocked_at && !partner.access_revoked_at

  return <div className="mx-auto max-w-6xl space-y-8 px-5 py-8 sm:py-12">
    <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-300 hover:text-white"><ArrowLeft className="h-4 w-4" aria-hidden="true"/> Back to dashboard</Link>
    <header className="max-w-2xl space-y-3">
      <p className="flex items-center gap-2 font-mono text-sm uppercase tracking-widest text-emerald-300"><Wallet className="h-4 w-4" aria-hidden="true"/> Partner wallet</p>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Buy printing credits</h1>
      <p className="leading-7 text-slate-300">Keep your next card order ready to print. Add credit to your partner balance with a secure Stripe payment.</p>
    </header>
    {error && <div className="rounded-xl border border-red-400/40 p-5"><p role="alert" className="text-red-200">{error}</p><button className="button-secondary mt-4" onClick={load}>Try again</button></div>}
    {!state && !error && <p role="status">Loading your partner account…</p>}
    {state?.status === 401 ? <section className="glass-panel space-y-4 rounded-2xl p-6 sm:p-8"><h2 className="text-xl font-semibold">Sign in to your partner account</h2><p className="text-slate-300">Your credits belong to your partner account. Sign in to view your balance and buy more.</p><button className="button-primary" onClick={() => signInWithGoogle('/dashboard/credits')}>Sign in with Google</button></section>
      : state && !partner ? <section className="glass-panel space-y-4 rounded-2xl p-6"><h2 className="text-xl font-semibold">Create your partner account</h2><p>Complete your partner application to buy printing credits.</p><Link className="button-primary" href="/partnership">Apply for partner access</Link></section>
      : state && !active ? <p className="glass-panel rounded-2xl p-6">Credit purchases require an active, approved partner account. Contact TCGPlaytest about your account access.</p>
      : active && !hasPartnerTerms(partner) ? <section className="glass-panel space-y-4 rounded-2xl p-6"><h2 className="text-xl font-semibold">Accept the partner terms first</h2><p>Open your dashboard to accept the current partner terms, then return here to buy credits.</p><Link className="button-primary" href="/dashboard">Review partner terms</Link></section>
      : active && <>
        {returned && <p role="status" className="rounded-xl border border-cyan/30 bg-cyan/5 p-5 text-slate-200">Welcome back. Your balance updates after payment confirmation. If your payment is still processing, wait a moment and select Refresh balance.</p>}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <PrepaidCredit standalone />
          <aside className="space-y-6 rounded-2xl border border-white/10 bg-white/[0.025] p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><ShieldCheck className="h-5 w-5" aria-hidden="true"/> Secure payment with Stripe</div>
            <div><h2 className="font-semibold">What your credit covers</h2><p className="mt-2 text-sm leading-6 text-slate-300">Credit pays for card printing. Customers pay shipping and quoted fulfillment tax separately through Stripe.</p></div>
            <div><h2 className="font-semibold">Dollar for dollar</h2><p className="mt-2 text-sm leading-6 text-slate-300">A $100 payment adds $100 in USD printing credit. Buy between $10 and $5,000 at a time.</p></div>
            <div><h2 className="font-semibold">Used automatically at checkout</h2><p className="mt-2 text-sm leading-6 text-slate-300">Your API and widget checkout use credit when the available balance covers printing. Otherwise, the customer pays the full order normally. Printing starts after payment is confirmed.</p></div>
            <Link className="inline-flex min-h-11 items-center text-sm text-cyan-300 underline" href="/docs#prepaid">Read the integration guide</Link>
          </aside>
        </div>
      </>}
  </div>
}
