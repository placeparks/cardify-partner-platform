export async function GET(request: Request) {
  const quantity = Number(new URL(request.url).searchParams.get('quantity'))
  const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=60' }
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) {
    return Response.json({ error: 'Choose between 1 and 1,000 cards.' }, { status: 400, headers })
  }
  try {
    const origin = process.env.TCGPLAYTEST_CHECKOUT_ORIGIN || 'https://www.tcgplaytest.com'
    const url = new URL('/api/print-estimate', origin)
    url.searchParams.set('quantity', String(quantity))
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(8000), next: { revalidate: 60 } })
    const estimate = await response.json()
    if (!response.ok || estimate.currency !== 'USD' || estimate.quantity !== quantity ||
      !Number.isSafeInteger(estimate.unit_amount) || estimate.unit_amount < 0 ||
      estimate.subtotal_amount !== estimate.unit_amount * quantity) throw new Error('Invalid estimate')
    return Response.json(estimate, { headers })
  } catch {
    return Response.json({ error: 'Price estimate unavailable. You can still review the final price at checkout.' },
      { status: 503, headers: { ...headers, 'Cache-Control': 'no-store' } })
  }
}
