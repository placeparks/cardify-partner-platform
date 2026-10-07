import { startWidgetSession, widgetApi, widgetOptions } from "@/lib/widget-session"
export const runtime = "nodejs"
export const OPTIONS = widgetOptions
export async function POST(request: Request) { return widgetApi(request, () => startWidgetSession(request)) }
