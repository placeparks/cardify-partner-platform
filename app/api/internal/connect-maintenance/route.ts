import { api, cronAuth } from '@/lib/partner-api'
import { maintainConnect } from '@/lib/connect-settlement'
export const maxDuration=300
export async function GET(request:Request){return api(async()=>{cronAuth(request);return Response.json(await maintainConnect())})}
