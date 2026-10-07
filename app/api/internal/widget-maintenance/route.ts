import { api, cronAuth, internalAuth } from "@/lib/partner-api"
import { cleanupWidgetUploads } from "@/lib/widget-session"
export const runtime = "nodejs"
export const maxDuration = 60
export const dynamic = "force-dynamic"
async function clean() { return Response.json({ deleted: await cleanupWidgetUploads(Date.now() + 45000) }) }
export async function GET(request: Request) { return api(async () => { cronAuth(request); return clean() }) }
export async function POST(request: Request) { return api(async () => { internalAuth(request); return clean() }) }
