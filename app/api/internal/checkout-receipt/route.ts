import { NextResponse } from "next/server"
import { api, internalAuth, json } from "@/lib/partner-api"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { checkoutReceipt } from "@/lib/mcp-receipt"

export async function POST(request: Request) {
  return api(async () => {
    internalAuth(request)
    const result = await checkoutReceipt(supabaseAdmin, await json(request))
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } })
  })
}
