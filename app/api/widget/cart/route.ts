import { widgetCart, widgetStatus, widgetApi, widgetOptions } from "@/lib/widget-session"
export const runtime = "nodejs"
export const OPTIONS = widgetOptions
export async function POST(request: Request) { return widgetApi(request, () => widgetCart(request)) }
export async function GET(request: Request) { return widgetApi(request, () => widgetStatus(request)) }
