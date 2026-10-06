import { api } from "@/lib/partner-api"
import { uploadSource } from "@/lib/partner-uploads"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request) { return api(() => uploadSource(request)) }
