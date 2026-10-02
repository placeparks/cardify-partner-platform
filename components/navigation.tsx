"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { LayoutDashboard, LogIn, LogOut, Menu, X } from "lucide-react"
import { getSupabaseBrowserClient, signInWithGoogle, signOut } from "@/lib/supabase-browser"

export function Navigation() {
  const pathname = usePathname()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [canSeeDashboard, setCanSeeDashboard] = useState(false)
  const [canSeeAdmin, setCanSeeAdmin] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)

  useEffect(() => { setMenuOpen(false) }, [pathname])

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
  }, [pathname])

  return (
    <nav aria-label="Main navigation" onKeyDown={event => {
      if (event.key === "Escape" && menuOpen) { setMenuOpen(false); menuButton.current?.focus() }
    }} className="sticky top-0 z-50 border-b border-white/10 bg-[#0f172a]/95 px-4 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:px-5">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <Link href="/" aria-label="TCGPlaytest home" className="flex shrink-0 items-center gap-3 text-xl font-bold text-white">
          <Image src="/logo-word.svg" alt="" width={78} height={48} className="h-10 w-auto object-contain sm:h-12" priority />
          <span>TCGPlaytest</span>
        </Link>

        <button ref={menuButton} type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="partner-navigation" onClick={() => setMenuOpen(open => !open)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-cyan/40 text-cyan lg:hidden">
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
        <div id="partner-navigation" onClick={event => { if ((event.target as HTMLElement).closest("a")) setMenuOpen(false) }} className={`${menuOpen ? "flex" : "hidden"} max-h-[calc(100dvh-6rem)] w-full flex-col gap-2 overflow-y-auto font-mono text-xs uppercase tracking-wider lg:flex lg:max-h-none lg:w-auto lg:flex-row lg:overflow-visible lg:items-center`}>
          <Link href="/docs" className="flex min-h-11 items-center px-3 py-2 text-cyan">API docs</Link>
          {canSeeAdmin && <Link href="/admin/manufacturing" className="flex min-h-11 items-center px-3 py-2 text-cyan">Operations</Link>}
          <Link href="/partnership" className="flex min-h-11 items-center border border-cyan/25 bg-white/[0.03] px-3 py-2 text-cyan transition hover:border-green hover:text-green">
            Partnership
          </Link>
          {canSeeDashboard && (
            <Link href="/dashboard" className="flex min-h-11 items-center gap-2 border border-cyan/25 bg-white/[0.03] px-3 py-2 text-cyan transition hover:border-green hover:text-green">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
          )}
          {/* Partnership administration lives in the testing dashboard.
          {canSeeAdmin && (
            <Link href="/admin" className="hidden border border-cyan/25 bg-white/[0.03] px-3 py-2 text-cyan transition hover:border-green hover:text-green sm:inline-flex">
              <ShieldCheck className="h-4 w-4" />
              Admin
            </Link>
          )} */}
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
