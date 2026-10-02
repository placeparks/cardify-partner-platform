import { NextResponse } from "next/server"
import { getSignedInUser } from "@/lib/partnership"
import { supabaseAdmin } from "@/lib/supabase-admin"

export async function POST(request: Request) {
  const { user } = await getSignedInUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({error:"Invalid JSON"},{status:400})
  const {data:existing,error:lookupError} = await supabaseAdmin.from("partnership_requests").select("status,api_blocked_at").eq("user_id",user.id).maybeSingle()
  if (lookupError) return NextResponse.json({error:"Could not check application"},{status:500})
  if (existing && (existing.status !== "pending" || existing.api_blocked_at)) return NextResponse.json({error:"Contact support to change a reviewed application"},{status:409})
  const proposedPercentage = Number(body.proposedPercentage)

  let website: URL
  try { website = new URL(body.websiteUrl) } catch { return NextResponse.json({error:"Valid website URL required"},{status:400}) }
  if (website.protocol !== "https:" || website.username || website.password) return NextResponse.json({error:"Use an HTTPS website URL"},{status:400})
  if (!body.businessName || !body.websiteUrl || !Number.isFinite(proposedPercentage) || proposedPercentage < 0 || proposedPercentage > 30) {
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
