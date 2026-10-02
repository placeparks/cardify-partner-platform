import { NextResponse } from "next/server"
import { api, internalAuth, json } from "@/lib/partner-api"
import { isPartnershipAdmin } from "@/lib/partnership"
import { ApiError } from "@/lib/manufacturing-contract"
import { listPartnershipRequests, reviewPartnership, reviewFields } from "@/lib/partnership-review"

export const maxDuration = 60

export async function POST(request: Request) { return api(async () => {
  internalAuth(request)
  const body = await json(request)
  // Only the authenticated dashboard server may attest to this identity.
  const actor = body?.reviewer
  if (!actor || typeof actor.userId !== "string" || typeof actor.email !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(actor.userId) || !/^[^\s@,()]+@[^\s@,()]+\.[^\s@,()]+$/.test(actor.email) ||
    !await isPartnershipAdmin(actor.userId, actor.email)) {
    throw new ApiError(403, "admin_required", "Your dashboard account also needs partnership admin access. Add its email to PARTNERSHIP_ADMIN_EMAILS on the partner app.")
  }
  let result
  if (body.action === "list") {
    result = await listPartnershipRequests(body.status ?? "pending", body.page ?? 1)
  } else if (body.action === "review") {
    if (typeof body.expectedUpdatedAt !== "string" || !body.expectedUpdatedAt) throw new ApiError(400, "invalid_request", "Refresh the application before submitting a decision.")
    const reviewed = await reviewPartnership(body.id, body, actor.email, true)
    const safeRequest = Object.fromEntries(reviewFields.split(",").map(field => [field, reviewed.request[field]]))
    result = { request: safeRequest, email: reviewed.email }
  } else throw new ApiError(400, "invalid_request", "Unsupported partnership action.")
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } })
}) }
