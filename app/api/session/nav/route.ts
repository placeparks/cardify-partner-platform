import { NextResponse } from "next/server"
import { getSignedInUser, isPartnershipAdmin } from "@/lib/partnership"
import { supabaseAdmin } from "@/lib/supabase-admin"

export async function GET() {
  const { user } = await getSignedInUser()

  if (!user) {
    return NextResponse.json({
      signedIn: false,
      email: null,
      isAdmin: false,
      isApprovedPartner: false,
    })
  }

  const [{ data: partner }, isAdmin] = await Promise.all([
    supabaseAdmin
      .from("partnership_requests")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle(),
    isPartnershipAdmin(user.id, user.email),
  ])

  return NextResponse.json({
    signedIn: true,
    email: user.email,
    isAdmin,
    isApprovedPartner: partner?.status === "approved",
  })
}
