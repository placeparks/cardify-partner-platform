import { api, authenticate, json } from "@/lib/partner-api"
import { createUpload } from "@/lib/partner-uploads"

export const runtime = "nodejs"
export async function POST(request: Request) { return api(async () => {
  const key = await authenticate(request)
  const upload = await createUpload(key, await json(request), new URL(request.url).origin)
  return Response.json(upload, { status: 201, headers: { "Cache-Control": "no-store" } })
}) }
