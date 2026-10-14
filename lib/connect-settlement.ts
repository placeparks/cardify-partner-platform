import { supabaseAdmin as db } from '@/lib/supabase-admin'
import { checked } from '@/lib/partner-api'
import { connectAmounts, transferTarget } from '@/lib/connect-contract'
import { accountReady, connectMode, connectRpc, connectSessionCheck, connectStripe } from '@/lib/connect'

const enc=encodeURIComponent
async function list(path:string){
 const rows:any[]=[];let cursor=''
 for(let i=0;i<30;i++){
  const page=await connectStripe(`${path}${path.includes('?')?'&':'?'}limit=100${cursor?`&starting_after=${enc(cursor)}`:''}`)
  if(!Array.isArray(page.data))throw Error('Incomplete Stripe list')
  rows.push(...page.data);if(!page.has_more)return rows
  if(!page.data.length)throw Error('Incomplete Stripe list');cursor=page.data[page.data.length-1].id
 }
 throw Error('Stripe reconciliation needs review')
}
async function patch(o:any,values:any){const rows=checked(await db.from('partner_connect_orders').update(values).eq('id',o.id).eq('lease_token',o.lease_token).gt('lease_until',new Date().toISOString()).select('id'));if(!rows?.length)throw Error('Connect lease lost')}
function verifyTransfer(o:any,t:any){if(t.destination!==o.account_id||t.currency!=='usd'||t.source_transaction!==o.charge_id||t.transfer_group!==`connect_${o.id}`||t.livemode!==(o.payment_mode==='live')||!Number.isSafeInteger(t.amount)||!Number.isSafeInteger(t.amount_reversed)||t.amount_reversed<0||t.amount_reversed>t.amount)throw Error('Transfer mismatch')}
async function completeOperation(o:any,op:any,transfers:any[],allowNew=true){
 let found:any
 if(op.status==='manual_review')throw Error('Manual transfer review required')
 if(op.kind==='transfer')found=transfers.find(t=>t.metadata?.connect_operation_id===op.id)
 else found=(await list(`/transfers/${enc(op.source_transfer)}/reversals`)).find(t=>t.metadata?.connect_operation_id===op.id)
 if(!found){
  if(op.kind==='transfer'&&!allowNew)throw Error('Pending transfer paused for reconciliation')
  // Stripe retains idempotency keys for at least 24h. Beyond our shorter window,
  // reconcile remote objects; never create a replacement payment/transfer blindly.
  if(Date.now()-Date.parse(op.created_at)>23*3600000){checked(await db.from('partner_connect_operations').update({status:'manual_review'}).eq('id',op.id));throw Error('Manual transfer review required')}
  await patch(o,{lease_until:new Date(Date.now()+300000).toISOString()})
  const params=new URLSearchParams({amount:String(op.amount_cents),'metadata[connect_operation_id]':op.id,'metadata[connect_order_id]':o.id})
  let path:string
  if(op.kind==='transfer'){
   params.set('currency','usd');params.set('destination',o.account_id);params.set('source_transaction',o.charge_id);params.set('transfer_group',`connect_${o.id}`);path='/transfers'
  }else path=`/transfers/${enc(op.source_transfer)}/reversals`
  found=await connectStripe(path,params,`connect-operation-${op.id}`)
 }
 if(found.amount!==op.amount_cents||found.metadata?.connect_operation_id!==op.id)throw Error('Operation mismatch')
 if(op.kind==='transfer')verifyTransfer(o,found)
 else if(found.transfer!==op.source_transfer)throw Error('Reversal mismatch')
 await patch(o,{lease_until:new Date(Date.now()+300000).toISOString()})
 checked(await db.from('partner_connect_operations').update({stripe_id:found.id,status:'succeeded',completed_at:new Date().toISOString()}).eq('id',op.id))
}
export async function settleConnect(o:any){
 if(!o.stripe_session_id){await patch(o,{status:Date.parse(o.checkout_expires_at)<Date.now()?'expired':'pending',next_sync_at:new Date(Date.now()+3600000).toISOString()});return}
 const s=await connectStripe(`/checkout/sessions/${enc(o.stripe_session_id)}`);connectSessionCheck(o,s)
 if(s.payment_status!=='paid'){
  if(!['open','expired'].includes(s.status))throw Error('Payment not settled')
  await patch(o,{status:s.status==='expired'?'expired':'pending',next_sync_at:new Date(Date.now()+(s.status==='expired'?86400000:60000)).toISOString()});return
 }
 const intentId=typeof s.payment_intent==='string'?s.payment_intent:s.payment_intent?.id
 const intent=await connectStripe(`/payment_intents/${enc(intentId)}?expand[]=latest_charge.balance_transaction`)
 const charge=intent.latest_charge,txn=charge?.balance_transaction
 const tax=s.total_details?.amount_tax
 if(intent.status!=='succeeded'||intent.currency!=='usd'||intent.livemode!==(o.payment_mode==='live')||intent.amount_received!==s.amount_total||intent.amount!==s.amount_total||intent.metadata?.connect_order_id!==o.id||intent.metadata?.connect_hash!==o.request_hash||!charge?.paid||!charge.captured||charge.amount!==s.amount_total||charge.currency!=='usd'||!Number.isSafeInteger(tax)||tax<0||s.amount_total!==o.retail_cents+o.shipping_cents+tax||!txn||typeof txn!=='object'||txn.currency!=='usd'||txn.source!==charge.id||!Number.isSafeInteger(txn.fee)||txn.fee<0)throw Error('Unverified Connect payment')
 if(o.charge_id&&o.charge_id!==charge.id)throw Error('Charge changed')
 o.charge_id=charge.id
 const [refunds,disputes,partner,account,cart]=await Promise.all([
  list(`/refunds?payment_intent=${enc(intent.id)}`),list(`/disputes?payment_intent=${enc(intent.id)}`),
  db.from('partnership_requests').select('status,api_blocked_at,access_revoked_at').eq('id',o.partner_id).single().then(checked),
  connectStripe(`/accounts/${enc(o.account_id)}`),db.from('partner_carts').select('status').eq('id',o.cart_id).single().then(checked),
 ])
 if(!partner||!cart)throw Error('Connect partner or cart unavailable')
 if(refunds.some(r=>r.payment_intent!==intent.id||r.currency!=='usd'||!Number.isSafeInteger(r.amount)||r.amount<0||!['succeeded','pending','requires_action','failed','canceled'].includes(r.status)))throw Error('Refund mismatch')
 const refunded=refunds.filter(r=>r.status==='succeeded').reduce((n,r)=>n+r.amount,0)
 if(refunded!==charge.amount_refunded||refunded>s.amount_total)throw Error('Refund state still settling')
 const disputed=disputes.some(d=>!['won','warning_closed'].includes(d.status))
 if(disputes.some(d=>d.payment_intent!==intent.id||d.currency!=='usd'||!Number.isSafeInteger(d.amount)||d.amount<=0||!['warning_needs_response','warning_under_review','warning_closed','needs_response','under_review','won','lost'].includes(d.status)))throw Error('Dispute mismatch')
 const pendingRefund=refunds.some(r=>['pending','requires_action'].includes(r.status))
 const amounts=connectAmounts(o.retail_cents,o.printing_cents,txn.fee,refunded)
 const paidAt=o.paid_at||new Date(charge.created*1000).toISOString(),releaseAt=new Date(Date.parse(paidAt)+15*86400000).toISOString()
 const shortfall=o.retail_cents-o.printing_cents-txn.fee<0
 await patch(o,{charge_id:charge.id,paid_at:paidAt,release_at:releaseAt,total_cents:s.amount_total,tax_cents:tax,fee_cents:txn.fee,earnings_cents:amounts.earnings,reserve_cents:amounts.reserve,snapshot:{refunded_cents:refunded,disputed,pending_refund:pendingRefund,fee_shortfall_cents:Math.max(0,txn.fee-(o.retail_cents-o.printing_cents))}})
 let transfers=await list(`/transfers?transfer_group=${enc(`connect_${o.id}`)}`)
 transfers.forEach(t=>verifyTransfer(o,t))
 const pending=checked(await db.from('partner_connect_operations').select('*').eq('order_id',o.id).in('status',['pending','manual_review']).maybeSingle())
 if(pending){await completeOperation(o,pending,transfers,!disputed&&!pendingRefund&&refunded===0&&partner.status==='approved'&&!partner.api_blocked_at&&!partner.access_revoked_at&&accountReady(account)&&!['blocked','cancelled'].includes(cart.status));transfers=await list(`/transfers?transfer_group=${enc(`connect_${o.id}`)}`);transfers.forEach(t=>verifyTransfer(o,t))}
 const net=()=>transfers.reduce((n,t)=>n+t.amount-t.amount_reversed,0)
 // A restriction pauses new money, but does not prevent refund recovery.
 const otherDebt=checked(await db.from('partner_connect_orders').select('id').eq('partner_id',o.partner_id).eq('payment_mode',o.payment_mode).eq('status','recovery_required').neq('id',o.id).limit(1))
 const restricted=partner.status!=='approved'||partner.api_blocked_at||partner.access_revoked_at||!accountReady(account)||['blocked','cancelled'].includes(cart.status)||otherDebt?.length||shortfall
 const target=transferTarget(o.retail_cents,o.printing_cents,txn.fee,refunded,Date.parse(releaseAt),Date.now(),disputed)
 let state=disputed?'disputed':shortfall?'recovery_required':pendingRefund||restricted?'paused':Date.now()<Date.parse(releaseAt)?'reserve_held':'released'
 // Process at most three money operations per invocation; cron continues any
 // remaining reversals. Each operation has a durable ID before calling Stripe.
 for(let attempt=0;attempt<3;attempt++){
  const delta=target-net();if(!delta)break
  if(delta>0&&(pendingRefund||restricted))break
  const source=delta<0?[...transfers].reverse().find(t=>t.amount>t.amount_reversed):null
  if(delta<0&&!source)throw Error('Reversal source missing')
  const op=await connectRpc('partner_connect_operation',{p_order:o.id,p_lease:o.lease_token,p_kind:delta>0?'transfer':'reversal',p_amount:delta>0?delta:Math.min(-delta,source.amount-source.amount_reversed),p_source:source?.id||null})
  await completeOperation(o,op,transfers)
  transfers=await list(`/transfers?transfer_group=${enc(`connect_${o.id}`)}`);transfers.forEach(t=>verifyTransfer(o,t))
 }
 if(net()>target)state='recovery_required'
 const next=Math.min(Date.now()+((state==='released'||state==='expired')?86400000:900000),Date.parse(releaseAt)>Date.now()?Date.parse(releaseAt):Infinity)
 await patch(o,{status:state,last_error:shortfall?'Stripe fees exceed the partner margin. Contact support to settle the shortfall.':null,snapshot:{refunded_cents:refunded,disputed,pending_refund:pendingRefund,transferred_cents:net(),fee_shortfall_cents:Math.max(0,txn.fee-(o.retail_cents-o.printing_cents))},next_sync_at:new Date(next).toISOString()})
}
export async function maintainConnect(){
 let processed=0,failed=0
 for(let i=0;i<3;i++){
  const [o]=await connectRpc('partner_connect_claim',{p_mode:connectMode()})||[];if(!o)break
  try{await settleConnect(o);processed++}
  catch(error){failed++;console.error('Connect reconciliation deferred',{order_id:o.id,message:error instanceof Error?error.message:'Unknown error'});await patch(o,{status:'recovery_required',last_error:'Settlement needs reconciliation. Transfers remain queued; contact support if this persists.',next_sync_at:new Date(Date.now()+300000).toISOString()})}
  finally{checked(await db.from('partner_connect_orders').update({lease_token:null,lease_until:null}).eq('id',o.id).eq('lease_token',o.lease_token))}
 }
 return {processed,failed}
}
