import { buildOpenApi } from "@/lib/api-documentation"

export const dynamic = "force-dynamic"
export function GET() {
  return Response.json(buildOpenApi(), { headers: { "Cache-Control": "no-store" } })
}
