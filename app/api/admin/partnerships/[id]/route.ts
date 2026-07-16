import { NextResponse } from "next/server"
import { getSignedInUser, isPartnershipAdmin, makePartnerKey, sendDecisionEmail } from "@/lib/partnership"
import { supabaseAdmin } from "@/lib/supabase-admin"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await getSignedInUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  if (!(await isPartnershipAdmin(user.id, user.email))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const status = body.status === "approved" ? "approved" : "declined"

  const { data: current, error: currentError } = await supabaseAdmin
    .from("partnership_requests")
    .select("*")
    .eq("id", id)
    .single()

  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 404 })

  const { data, error } = await supabaseAdmin
    .from("partnership_requests")
    .update({
      status,
      approved_percentage: status === "approved" ? Number(body.approvedPercentage || current.proposed_percentage) : null,
      admin_notes: body.adminNotes || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.email,
      widget_partner_key: status === "approved" ? (current.widget_partner_key || makePartnerKey()) : current.widget_partner_key,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const email = await sendDecisionEmail(data).catch((caught) => ({
    sent: false,
    reason: caught instanceof Error ? caught.message : "Gmail send crashed before returning a response.",
  }))

  return NextResponse.json({ request: data, email })
}
