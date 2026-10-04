import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { api, digest, internalAuth } from "@/lib/partner-api"
import { ApiError } from "@/lib/manufacturing-contract"
import { validateQueuedArtwork } from "@/lib/ingest-artwork"
export const runtime = "nodejs"
export const maxDuration = 60
export const dynamic = "force-dynamic"
export async function POST(request: Request) { return api(async()=>{
  internalAuth(request)
  return NextResponse.json(await validateQueuedArtwork(),{headers:{"Cache-Control":"no-store"}})
}) }
export async function GET(request: Request) { return api(async()=>{
  const secret=process.env.CRON_SECRET
  if (!secret || secret.length<32 || !timingSafeEqual(Buffer.from(digest(request.headers.get("authorization")||"")),Buffer.from(digest(`Bearer ${secret}`)))) throw new ApiError(401,"authentication_required","Invalid worker credential")
  return NextResponse.json(await validateQueuedArtwork(),{headers:{"Cache-Control":"no-store"}})
}) }
