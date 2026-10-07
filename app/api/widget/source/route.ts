import { api } from "@/lib/partner-api"
import { widgetSource } from "@/lib/widget-session"
export const runtime = "nodejs"
export async function GET(request: Request) { return api(() => widgetSource(request)) }
