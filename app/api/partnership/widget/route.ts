import { api, checked, json, partnerSession } from "@/lib/partner-api"
import { ApiError } from "@/lib/manufacturing-contract"
import { supabaseAdmin as db } from "@/lib/supabase-admin"
export async function POST(request: Request) { return api(async () => {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new ApiError(403, "origin_not_allowed", "Save widget settings from your dashboard.")
  const { partner } = await partnerSession(), body = await json(request)
  if (!body || Object.keys(body).some(k => k !== "origins") || !Array.isArray(body.origins) || body.origins.length > 10) throw new ApiError(400, "invalid_request", "Supply up to 10 HTTPS website origins.")
  const origins = body.origins.map((value: unknown) => {
    let url: URL
    try { if (typeof value !== "string" || value.length > 500) throw Error(); url = new URL(value) } catch { throw new ApiError(400, "invalid_request", "Use HTTPS origins, for example https://your-shop.com.") }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || url.port) throw new ApiError(400, "invalid_request", "Use HTTPS origins without paths, ports or wildcards.")
    return url.origin
  })
  checked(await db.from("partnership_requests").update({ widget_allowed_origins: [...new Set(origins)] }).eq("id", partner.id))
  return Response.json({ saved: true })
}) }
