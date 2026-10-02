"use client"

import { useEffect, useState } from "react"

export function AffiliatePreference({ disabled, onChange, onPending }: {
  disabled: boolean
  onChange: (value: boolean | undefined) => void
  onPending: (value: boolean) => void
}) {
  const [offer, setOffer] = useState<any>(null)
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setError(""); onChange(undefined); onPending(true)
    fetch("/api/partnership/affiliate", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error("Affiliate lookup unavailable. You can still create an API key.")
        if (controller.signal.aborted) return
        setOffer(data)
        const choice = Boolean(data.enabled && data.approved)
        setEnabled(choice); onChange(choice)
      }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
      .finally(() => { if (!controller.signal.aborted) onPending(false) })
    return () => controller.abort()
  }, [attempt, onChange, onPending])

  async function save() {
    setSaving(true); onPending(true); setError(""); setMessage("")
    try {
      const response = await fetch("/api/partnership/affiliate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || "Could not save affiliate preference.")
      setMessage("Saved for new API and widget orders.")
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save preference.") }
    finally { setSaving(false); onPending(false) }
  }

  return <div className="space-y-3 border border-white/10 p-4">
    <h3 className="font-bold">Your affiliate link (optional)</h3>
    {!offer && !error && <p role="status">Checking your affiliate account…</p>}
    {offer?.approved && <>
      <p>Automatically apply your affiliate code <strong>{offer.code}</strong> to API and widget checkouts?</p>
      <div className="flex gap-6">{[true, false].map(choice => <label key={String(choice)} className="flex items-center gap-2">
        <input type="radio" name="checkout-affiliate" checked={enabled === choice} disabled={disabled || saving}
          onChange={() => { setEnabled(choice); onChange(choice); setMessage("") }} />
        {choice ? "Yes" : "No"}
      </label>)}</div>
      <p className="text-sm text-slate-300">Saved when you create a key. Applies to new API and widget orders.</p>
    </>}
    {offer && !offer.approved && <p>No approved affiliate code is linked to your sign-in email.</p>}
    {offer && (offer.approved || offer.enabled) && <button type="button" className="button-secondary" disabled={disabled || saving} onClick={save}>
      {saving ? "Saving…" : offer.approved ? "Save without rotating a key" : "Turn off saved affiliate code"}
    </button>}
    {message && <p role="status" className="text-emerald-300">{message}</p>}
    {error && <p role="alert" className="text-amber-200">{error} <button type="button" className="underline" disabled={disabled || saving} onClick={() => setAttempt(value => value + 1)}>Retry lookup</button></p>}
  </div>
}
