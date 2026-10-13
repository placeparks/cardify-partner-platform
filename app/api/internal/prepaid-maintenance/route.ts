import { api, cronAuth } from '@/lib/partner-api'
import { deliverPrepaidJobs } from '@/lib/prepaid'
import { maintainCustomerPayments } from '@/lib/prepaid-customer-payment'
export const maxDuration=300
export async function GET(request: Request) {return api(async()=>{
  cronAuth(request)
  const payments=await maintainCustomerPayments()
  return Response.json({payments,delivery:await deliverPrepaidJobs()})
})}
