"use client"

/**
 * Revenue calculator - interactive economics section.
 * Pricing mirrors the live rate config:
 *   fulfillment = $0.35/card + shipping tier + 3% processing buffer
 * Partner take = retail - fulfillment. Update RATES here if rate_config changes.
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import { TrendingUp } from "lucide-react"

const BASE_CARD_RATE_CENTS = 35
const BUFFER_PCT = 3
const US_SHIPPING_TIERS = [
  { maxCards: 100, cents: 499 },
  { maxCards: 500, cents: 899 },
  { maxCards: 2000, cents: 1499 },
]

function shippingCents(cards: number) {
  const tier = US_SHIPPING_TIERS.find((t) => cards <= t.maxCards)
  return (tier ?? US_SHIPPING_TIERS[US_SHIPPING_TIERS.length - 1]).cents
}

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })

export default function RevenueCalculator() {
  const [priceDollars, setPriceDollars] = useState(10) // retail price per order
  const [cardsPerOrder, setCardsPerOrder] = useState(10)
  const [ordersPerMonth, setOrdersPerMonth] = useState(300)

  const calc = useMemo(() => {
    const retailCents = Math.round(priceDollars * 100)
    const baseCents = cardsPerOrder * BASE_CARD_RATE_CENTS
    const shipCents = shippingCents(cardsPerOrder)
    const bufferCents = Math.ceil(((baseCents + shipCents) * BUFFER_PCT) / 100)
    const fulfillmentCents = baseCents + shipCents + bufferCents
    const marginCents = retailCents - fulfillmentCents
    return {
      retailCents,
      fulfillmentCents,
      marginCents,
      monthlyCents: marginCents * ordersPerMonth,
      viable: marginCents > 0,
    }
  }, [priceDollars, cardsPerOrder, ordersPerMonth])

  return (
    <section id="calculator" className="mx-auto max-w-[1280px] border-t border-[#3b4a3f]/20 px-4 py-24 md:px-6">
      <div className="mb-12 text-center">
        <div className="mb-4 inline-flex items-center border border-[#00ff9d]/30 bg-[#f4fff3]/10 px-3 py-1">
          <TrendingUp className="mr-2 h-3.5 w-3.5 text-[#00ff9d]" />
          <span className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-[#56ffa8]">
            Partner economics
          </span>
        </div>
        <h2 className="font-sora text-4xl font-bold text-[#f4fff3]">What would you earn?</h2>
        <p className="mx-auto mt-3 max-w-xl text-[#b9cbbc]">
          Fulfillment is one transparent quote - $0.35 per card, plus shipping and a 3% processing
          buffer. Everything above it is yours, paid out automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Controls */}
        <div className="glass-card rounded-xl border border-[#3b4a3f]/40 bg-[#0b1020]/60 p-6 lg:col-span-3">
          <Slider
            label="Your price per order"
            value={priceDollars}
            display={usd(priceDollars * 100)}
            min={1}
            max={100}
            step={1}
            onChange={setPriceDollars}
          />
          <Slider
            label="Cards per order"
            value={cardsPerOrder}
            display={`${cardsPerOrder} card${cardsPerOrder === 1 ? "" : "s"}`}
            min={1}
            max={150}
            step={1}
            onChange={setCardsPerOrder}
          />
          <Slider
            label="Orders per month"
            value={ordersPerMonth}
            display={ordersPerMonth.toLocaleString("en-US")}
            min={10}
            max={2000}
            step={10}
            onChange={setOrdersPerMonth}
          />

          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-[#3b4a3f]/30 pt-5 font-mono text-sm">
            <p className="text-[#b9cbbc]">Fulfillment quote</p>
            <p className="text-right text-[#f4fff3]">{usd(calc.fulfillmentCents)} / order</p>
            <p className="text-[#b9cbbc]">You keep</p>
            <p className={`text-right font-semibold ${calc.viable ? "text-[#00ff9d]" : "text-[#ff6b8a]"}`}>
              {usd(calc.marginCents)} / order
            </p>
          </div>
        </div>

        {/* Result */}
        <div className="holographic-edge relative flex flex-col justify-center overflow-hidden rounded-xl border border-[#00ff9d]/30 bg-[#0b1020] p-8 text-center lg:col-span-2">
          {calc.viable ? (
            <>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#56ffa8]">
                Your estimated earnings
              </p>
              <p className="mt-4 font-sora text-5xl font-extrabold text-[#00ff9d] [text-shadow:0_0_24px_rgba(0,255,157,0.35)]">
                {usd(calc.monthlyCents)}
              </p>
              <p className="mt-2 font-mono text-sm text-[#b9cbbc]">per month</p>
              <p className="mt-5 text-sm leading-6 text-[#b9cbbc]">
                {ordersPerMonth.toLocaleString("en-US")} orders x {usd(calc.marginCents)} margin -
                transferred to your Stripe account automatically on every sale.
              </p>
              <Link
                href="/partnership"
                className="mx-auto mt-6 inline-flex rounded-lg bg-[#00ff9d] px-6 py-3 font-bold text-[#007143] shadow-[0_0_20px_rgba(0,255,157,0.4)] transition hover:-translate-y-0.5 hover:shadow-[0_0_30px_rgba(0,255,157,0.6)]"
              >
                Start earning
              </Link>
            </>
          ) : (
            <>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#ff9db4]">
                Price below fulfillment cost
              </p>
              <p className="mt-4 font-sora text-4xl font-extrabold text-[#ff6b8a]">
                {usd(calc.marginCents)}
              </p>
              <p className="mt-5 text-sm leading-6 text-[#b9cbbc]">
                An order of {cardsPerOrder} cards costs {usd(calc.fulfillmentCents)} to print and
                ship. Raise your price above that and the rest is yours.
              </p>
            </>
          )}
        </div>
      </div>

      <p className="mt-6 text-center font-mono text-xs text-[#b9cbbc]/60">
        Estimates use US shipping tiers. Live quotes are confirmed per order at checkout.
      </p>
    </section>
  )
}

function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-baseline justify-between">
        <label className="text-sm font-medium text-[#dce1fb]">{label}</label>
        <span className="font-mono text-lg font-semibold text-[#00ff9d]">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="cardify-slider w-full"
        aria-label={label}
      />
      <div className="mt-1 flex justify-between font-mono text-[10px] text-[#b9cbbc]/50">
        <span>{label.includes("price") ? usd(min * 100) : min.toLocaleString("en-US")}</span>
        <span>{label.includes("price") ? usd(max * 100) : max.toLocaleString("en-US")}</span>
      </div>
    </div>
  )
}


