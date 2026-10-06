import { buildLlmsText } from "@/lib/api-documentation"

export const dynamic = "force-dynamic"
export function GET() {
  return new Response(buildLlmsText(), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } })
}
