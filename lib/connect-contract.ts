import { ApiError } from '@/lib/manufacturing-contract'
export const CONNECT_TERMS_VERSION='2026-10-14-connect-v1'
export const CONNECT_TERMS='Connect orders do not spend printing credit. TCGPlaytest retains the quoted printing and shipping charges and collected tax. Stripe payment-processing fees are deducted from your card-sale margin. 95% of the remaining non-negative earnings is transferred after verified payment; 5% (rounded up to the next cent) is reserved for 15 days from payment. Bank availability follows Stripe’s schedule. Refunds reduce your remaining earnings dollar-for-dollar, up to those earnings; disputes pause transfers and can reverse earlier transfers. Unresolved recovery or account restrictions pause further transfers. Release is automatic when eligible, subject to Stripe availability. TCGPlaytest handles the customer payment and fulfillment; you remain responsible for your selling price and lawful artwork.'
export function connectEnabled(){if(process.env.PARTNER_CONNECT_ENABLED!=='true')throw new ApiError(503,'connect_disabled','Connect checkout is not enabled.')}
export function connectAmounts(retail:number,printing:number,fee:number,refunded=0){
 if(![retail,printing,fee,refunded].every(n=>Number.isSafeInteger(n)&&n>=0)||retail<printing)throw Error('Invalid settlement amounts')
 const earnings=Math.max(0,retail-printing-fee),reserve=Math.ceil(earnings*5/100)
 return {earnings,reserve,initial:earnings-reserve,remaining:Math.max(0,earnings-refunded)}
}
export function transferTarget(retail:number,printing:number,fee:number,refunded:number,releaseAt:number,now:number,blocked:boolean){
 const n=connectAmounts(retail,printing,fee,refunded)
 return blocked?0:now>=releaseAt?n.remaining:Math.min(n.initial,n.remaining)
}
