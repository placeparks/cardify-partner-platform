import { supabaseAdmin as db } from '@/lib/supabase-admin'
import { ApiError } from '@/lib/manufacturing-contract'
import { publicSandboxOrder, sandboxOrder, testCheckoutCart } from '@/lib/sandbox-checkout'
import { TestCheckout } from '@/components/test-checkout'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Simulated checkout · TCGPlaytest', robots: { index: false, follow: false } }

export default async function TestCheckoutPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    const cart = await testCheckoutCart(db, token)
    const order = cart.order_id ? publicSandboxOrder(await sandboxOrder(db, cart.partner_id, cart.order_id)) : null
    return <TestCheckout token={token} cardCount={cart.card_count} cartId={cart.id}
      connectRetail={cart.sandbox_retail_cents ?? null} initialOrder={order}
      qualityWarning={Array.isArray(cart.artwork_warnings) && cart.artwork_warnings.length > 0} />
  } catch (error) {
    if (!(error instanceof ApiError)) console.error('test_checkout_read_failed')
    return <section className="mx-auto max-w-2xl space-y-5 p-6 sm:p-10"><p className="text-amber-300">TEST MODE</p>
      <h1 className="text-3xl font-bold">Test checkout unavailable</h1>
      <p>{error instanceof ApiError ? error.message : 'The sandbox could not be loaded. Check the partner database migration and retry.'}</p>
      <a className="underline" href="/docs/sandbox">Test checkout guide</a></section>
  }
}
