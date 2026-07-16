import { NextResponse } from "next/server"
import { getSignedInUser } from "@/lib/partnership"
import { supabaseAdmin } from "@/lib/supabase-admin"

export async function POST(request: Request) {
  const { user } = await getSignedInUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  const body = await request.json()
  const proposedPercentage = Number(body.proposedPercentage)

  if (!body.businessName || !body.websiteUrl || Number.isNaN(proposedPercentage)) {
    return NextResponse.json({ error: "Business name, website, and percentage are required" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("partnership_requests")
    .upsert({
      user_id: user.id,
      email: user.email,
      full_name: body.fullName || user.user_metadata?.full_name || null,
      business_name: body.businessName,
      website_url: body.websiteUrl,
      audience: body.audience || null,
      proposed_percentage: proposedPercentage,
      status: "pending",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: data })
}
