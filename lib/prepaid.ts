import { supabaseAdmin as db } from '@/lib/supabase-admin'
import { checked } from '@/lib/partner-api'
import { ApiError } from '@/lib/manufacturing-contract'
import { creditError, PREPAID_TERMS_VERSION, prepaidName, prepaidMode } from '@/lib/prepaid-contract'

export async function creditRpc(name: string, body: Record<string,unknown>) {
  const result = await db.rpc('partner_prepaid_rpc', {p_name:prepaidName(name),p_body:body,p_mode:prepaidMode()})
  if (result.error) creditError(result.error)
  return result.data
}
export async function requireAccount(partner: string) {
  const account = checked(await db.from(prepaidName('partner_credit_accounts')).select('terms_version').eq('partner_id',partner).maybeSingle())
  if (!account || account.terms_version!==PREPAID_TERMS_VERSION) throw new ApiError(403,'prepaid_terms_required','Accept the current prepaid terms in the partner dashboard first.')
  return account
}
export async function commerce(path: string, body: unknown) {
  const origin = process.env.TCGPLAYTEST_CHECKOUT_ORIGIN
  const secret = process.env.PARTNER_INTERNAL_SECRET
  if (!origin || !secret || secret.length<32) throw new ApiError(503,'prepaid_unavailable','Fulfillment connection is not configured.')
  const url = new URL(origin)
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new ApiError(503,'prepaid_unavailable','Fulfillment origin must use HTTPS.')
  const response = await fetch(`${url.origin}/api/partner/prepaid/${path}`,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)})
  const data = await response.json()
  if (!response.ok) {
    // Preserve known, public-safe quote diagnostics across the service boundary.
    // Do not forward arbitrary upstream error text or credentials to customers.
    const quoteMessages: Record<string,string> = {
      prepaid_disabled:'Printing-credit checkout is not enabled.',
      prepaid_stripe_missing:'The payment service is not configured.',
      prepaid_stripe_mode_mismatch:'The store’s payment configuration does not match.',
      prepaid_tax_mode_mismatch:'The tax service returned a different payment environment.',
      prepaid_tax_invalid_result:'The tax service returned an unusable quote. Please try again.',
      prepaid_tax_authentication:'The tax service could not authenticate this store.',
      prepaid_tax_permission:'The store’s payment key cannot access tax calculations.',
      prepaid_tax_connection:'The tax service could not be reached. Please retry this checkout.',
      prepaid_tax_rate_limit:'The tax service is busy. Please wait briefly and retry this checkout.',
      prepaid_tax_idempotency:'This quote conflicts with an earlier attempt. Contact your store before retrying.',
      prepaid_tax_address:'Tax could not be calculated for this address. Check the street, state, postal code and country.',
      prepaid_tax_settings:'The store’s tax setup is incomplete.',
      prepaid_tax_unavailable:'The shipping and tax quote is unavailable. Contact your store or retry later.',
    }
    if (path==='quote' && Object.hasOwn(quoteMessages, data?.code)) {
      console.error('Fulfillment quote rejected', {code:data.code,status:response.status})
      throw new ApiError(data.code==='prepaid_tax_address'?400:data.code==='prepaid_tax_idempotency'?409:503, data.code, `${quoteMessages[data.code]} (${data.code})`)
    }
    console.error('Fulfillment service rejected request', {operation:path,status:response.status})
    throw new ApiError(response.status === 400 ? 400 : 503, response.status === 400 ? 'invalid_shipping' : 'fulfillment_unavailable', response.status === 400 ? 'Check the shipping address and supported destination.' : 'Fulfillment service is unavailable. Retry the same request.')
  }
  return data
}
export async function deliverPrepaidJobs() {
  if (prepaidMode()==='test') return {delivered:0,failed:0,simulated:true}
  const jobs = checked(await db.rpc('partner_prepaid_claim_jobs')) || []
  let delivered=0, failed=0
  for (const job of jobs) {
    try {
      const result = await commerce('fulfill',{quote_id:job.quote_id})
      if (result.quote_id !== job.quote_id || result.received !== true) throw new Error('Unconfirmed delivery')
      checked(await db.from('partner_prepaid_jobs').update({delivered_at:new Date().toISOString(),...(result.refunded ? {refund_delivered_at:new Date().toISOString()} : {}),lease_token:null,lease_until:null,last_error:null})
        .eq('quote_id',job.quote_id).eq('lease_token',job.lease_token))
      delivered++
    } catch {
      checked(await db.from('partner_prepaid_jobs').update({lease_token:null,lease_until:null,last_error:'Fulfillment delivery failed; retry scheduled.',next_attempt_at:new Date(Date.now()+Math.min(3600,15*2**Math.min(job.attempts,8))*1000).toISOString()}).eq('quote_id',job.quote_id).eq('lease_token',job.lease_token))
      failed++
    }
  }
  return {delivered,failed}
}
