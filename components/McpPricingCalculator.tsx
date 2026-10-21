'use client'

import { useId, useState } from 'react'
import { MCP_MAX_CARDS, MCP_SHIPPING_TIERS, mcpQuote } from '../utils/mcpPricing'
import styles from './McpPricingCalculator.module.css'

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
const destinations = [{ code: 'US', name: 'US' }, { code: 'CA', name: 'Canada' }, { code: 'GB', name: 'Worldwide' }]

export default function McpPricingCalculator() {
  const id = useId()
  const [input, setInput] = useState('18')
  const [country, setCountry] = useState('US')
  const [selectedSheet, setSelectedSheet] = useState<number | null>(null)
  const quantity = Number(input)
  let quote: ReturnType<typeof mcpQuote> | null = null
  try { quote = mcpQuote(quantity, country) } catch { /* Invalid input is explained beside the field. */ }
  const destination = destinations.find(d => d.code === country)!.name
  const sheet = quote ? Math.min(selectedSheet ?? quote.sheets, quote.sheets) : 1
  const filled = quote ? Math.min(18, quantity - (sheet - 1) * 18) : 0
  const nextRate = quantity < 18 ? 0 : quantity < 180 ? 35 : quantity < 504 ? 30 : 26
  const nextShipping = quote?.shipping_band.next_increase_at
  const bandLabel = quote ? `${quote.shipping_band.from.toLocaleString()}–${quote.shipping_band.through.toLocaleString()}` : ''
  function change(value: string) { setInput(value); setSelectedSheet(null) }

  return <section className={styles.calculator} aria-label="MCP price calculator">
    <div className={styles.heading}><span>MCP ORDERS</span><h3>See what your cards will cost</h3><p>$34.95 covers the first 18 cards. Pay per additional card after that.</p></div>
    <div className={styles.layout}>
      <div className={styles.controls}>
        <fieldset className={styles.destinations}><legend>Ship to</legend>{destinations.map(d => <label key={d.code} className={country === d.code ? styles.active : ''}>
          <input type="radio" name={`${id}-destination`} value={d.code} checked={country === d.code} onChange={() => setCountry(d.code)} />{d.name}
        </label>)}</fieldset>
        <label className={styles.quantityLabel} htmlFor={`${id}-quantity`}>Cards in the order</label>
        <div className={styles.quantity}>
          <input aria-label="Adjust card quantity" type="range" min="1" max={MCP_MAX_CARDS} value={quote ? quantity : 1} onChange={e => change(e.target.value)} />
          <input id={`${id}-quantity`} aria-describedby={`${id}-hint`} aria-invalid={!quote} type="number" min="1" max={MCP_MAX_CARDS} step="1" value={input} onChange={e => change(e.target.value)} />
        </div>
        <p id={`${id}-hint`} className={styles.hint}>Maximum 10,080 cards (560 sheets) per MCP order.</p>
        {!quote && <p role="alert">Enter a whole number from 1 to 10,080 cards.</p>}
        {quote && <>
          <div className={styles.total} aria-live="polite" aria-atomic="true"><strong>{money(quote.estimated_total_before_tax_cents)}</strong><span>Order total with {destination === 'Worldwide' ? 'international' : destination} shipping, before tax and discounts</span></div>
          <dl className={styles.breakdown}>
            <div><dt>Sheets of 18</dt><dd>{quote.sheets.toLocaleString()} {quantity % 18 ? '(last partly filled)' : 'full'}</dd></div>
            <div><dt>Sheet 1 · cards 1–18</dt><dd>{money(3495)}</dd></div>
            {quote.bands.map(band => <div key={band.from}><dt>Cards {band.from}–{band.through ?? 'onward'} · {band.cents}¢ each <small>({band.cards.toLocaleString()} cards)</small></dt><dd>{money(band.subtotal_cents)}</dd></div>)}
            <div className={styles.subtotal}><dt>Card price</dt><dd>{money(quote.cards_subtotal_cents)}</dd></div>
            <div><dt>Shipping · {destination}, {bandLabel} cards</dt><dd>{money(quote.shipping_cents)}</dd></div>
            <div><dt>Average per card, excluding shipping</dt><dd>{money(quote.average_card_price_cents)}</dd></div>
          </dl>
          <p className={styles.nudge}>{quantity === MCP_MAX_CARDS ? 'Maximum order: 10,080 cards (560 sheets).' : quote.savings_message || `The next card adds ${nextRate}¢.${nextShipping ? ` Shipping steps up at ${nextShipping.toLocaleString()} cards.` : ''}`}</p>
        </>}
      </div>
      {quote && <div className={styles.sheetPanel}>
        <div className={styles.sheetTitle}><button type="button" aria-label="Previous sheet" disabled={sheet === 1} onClick={() => setSelectedSheet(sheet - 1)}>‹</button><strong>Sheet {sheet.toLocaleString()} of {quote.sheets.toLocaleString()}</strong><button type="button" aria-label="Next sheet" disabled={sheet === quote.sheets} onClick={() => setSelectedSheet(sheet + 1)}>›</button></div>
        <p className={styles.base}>Base = $34.95 + shipping</p>
        <div className={styles.sheet} aria-hidden="true">{Array.from({ length: 18 }, (_, index) => {
          const card = (sheet - 1) * 18 + index + 1
          const label = card <= 18 ? 'base' : card <= 180 ? '+35¢' : card <= 504 ? '+30¢' : '+26¢'
          return <div key={index} className={index < filled ? styles.card : styles.empty}>{index < filled ? label : ''}</div>
        })}</div>
        <p className={styles.sheetCaption}>{filled} of 18 card spaces filled</p>
      </div>}
    </div>
    <details className={styles.shippingTable}>
      <summary>View all MCP shipping rates</summary>
      <div><table>
        <caption>Shipping in USD · ordinary website and widget rates are separate</caption>
        <thead><tr><th scope="col">Cards</th><th scope="col">US</th><th scope="col">Canada</th><th scope="col">Worldwide</th></tr></thead>
        <tbody>{MCP_SHIPPING_TIERS.map((tier, index) => <tr key={tier.through}>
          <th scope="row">{(index ? MCP_SHIPPING_TIERS[index - 1].through + 1 : 1).toLocaleString()}–{tier.through.toLocaleString()}</th>
          <td>{money(tier.US)}</td><td>{money(tier.CA)}</td><td>{money(tier.INTL)}</td>
        </tr>)}</tbody>
      </table></div>
    </details>
    <div className={styles.notes}>
      <p>Cards will be delivered cut to standard trading card size with rounded corners</p>
      <p>Price is set based on demand, shipping rates, and material availability/cost</p>
      <p>Cards 505–10,080 add 26¢ each. Only requested copies are printed. Discounts cannot reduce the card price below $34.95. Worldwide means supported shipping countries; final tax and total are confirmed at checkout.</p>
    </div>
  </section>
}
