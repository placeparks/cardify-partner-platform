import { NextResponse } from "next/server"
import { getSignedInUser, isPartnershipAdmin } from "@/lib/partnership"
import { reviewPartnership, revokePartnership } from "@/lib/partnership-review"
import { ApiError } from "@/lib/manufacturing-contract"

export const maxDuration = 60

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await getSignedInUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  if (!(await isPartnershipAdmin(user.id, user.email))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  try {
    const result = body?.action === "revoke" ? await revokePartnership(id, body, user.email || user.id) : await reviewPartnership(id, body, user.email || user.id)
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "Could not save this decision." }, { status: error instanceof ApiError ? error.status : 500 })
  }
}
