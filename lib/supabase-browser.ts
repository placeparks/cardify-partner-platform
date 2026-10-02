"use client"

import { createBrowserClient } from "@supabase/ssr"

let client: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseBrowserClient() {
  if (!client) client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  return client
}

export async function signInWithGoogle(nextPath = "/dashboard") {
  const supabase = getSupabaseBrowserClient()
  const origin = window.location.origin
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}` },
  })
}

export async function signOut() {
  const supabase = getSupabaseBrowserClient()
  await supabase.auth.signOut()
  window.location.href = "/"
}
