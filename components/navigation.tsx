"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { LayoutDashboard, LogIn, LogOut, ShieldCheck } from "lucide-react"
import { getSupabaseBrowserClient, signInWithGoogle, signOut } from "@/lib/supabase-browser"

export function Navigation() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [canSeeDashboard, setCanSeeDashboard] = useState(false)
  const [canSeeAdmin, setCanSeeAdmin] = useState(false)

  async function refreshNavAccess() {
    const response = await fetch("/api/session/nav", { cache: "no-store" })
    const data = await response.json()
    setUserEmail(data.email ?? null)
    setCanSeeDashboard(Boolean(data.isApprovedPartner))
    setCanSeeAdmin(Boolean(data.isAdmin))
  }

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    refreshNavAccess()
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null)
      refreshNavAccess()
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return (
    <nav className="sticky top-0 z-50 border-b border-cyan/20 bg-ink/90 px-5 py-4 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link href="/" className="font-mono text-xl font-black tracking-[0.22em] text-green">
          CARDIFY
        </Link>

        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider">
          <Link href="/partnership" className="hidden border border-cyan/30 px-3 py-2 text-cyan transition hover:border-green hover:text-green sm:inline-flex">
            Partnership
          </Link>
          {canSeeDashboard && (
            <Link href="/dashboard" className="hidden border border-cyan/30 px-3 py-2 text-cyan transition hover:border-green hover:text-green sm:inline-flex">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
          )}
          {canSeeAdmin && (
            <Link href="/admin" className="hidden border border-cyan/30 px-3 py-2 text-cyan transition hover:border-green hover:text-green sm:inline-flex">
              <ShieldCheck className="h-4 w-4" />
              Admin
            </Link>
          )}
          {userEmail ? (
            <button onClick={signOut} className="button-secondary px-3 py-2">
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          ) : (
            <button onClick={() => signInWithGoogle("/partnership")} className="button-primary px-3 py-2">
              <LogIn className="h-4 w-4" />
              Google sign in
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}
