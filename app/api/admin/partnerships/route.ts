import { NextResponse } from "next/server"
import { getSignedInUser, isPartnershipAdmin } from "@/lib/partnership"
import { supabaseAdmin } from "@/lib/supabase-admin"

export async function GET() {
  const { user } = await getSignedInUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  if (!(await isPartnershipAdmin(user.id, user.email))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from("partnership_requests")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: data || [] })
}
