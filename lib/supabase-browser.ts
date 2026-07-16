"use client"

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

let client: ReturnType<typeof createClientComponentClient> | null = null

export function getSupabaseBrowserClient() {
  if (!client) client = createClientComponentClient()
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
