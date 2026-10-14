import { api, partnerSession } from '@/lib/partner-api'
import { ApiError } from '@/lib/manufacturing-contract'
import { onboardConnect } from '@/lib/connect'
export async function POST(request:Request){return api(async()=>{
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError(403,'origin_not_allowed','Use your partner dashboard.')
 const {partner}=await partnerSession()
 return Response.json(await onboardConnect(partner),{headers:{'Cache-Control':'no-store'}})
})}
