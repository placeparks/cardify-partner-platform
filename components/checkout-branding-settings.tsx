'use client'
import { useState } from 'react'
import { BRANDING_DEFAULTS, CheckoutBranding, validateBranding, brandingHeading, brandingStyle } from '@/lib/checkout-branding'
export function CheckoutBrandingSettings({ initial }: { initial: unknown }) {
  const [value, setValue] = useState<CheckoutBranding>(() => { try { return validateBranding(initial || {}) } catch { return { ...BRANDING_DEFAULTS } } })
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const update = (key: keyof CheckoutBranding, content: string | boolean) => { setValue(v => ({ ...v, [key]: content })); setMessage(''); setError('') }
  const style = brandingStyle(value)
  return <section className="glass-panel space-y-5 p-4 sm:p-6">
    <h2 className="text-2xl font-bold">4. Checkout branding</h2>
    <p>Style the hosted card checkout. Prices, required fields, quality warnings, rights confirmation, payment and seller disclosures stay managed by TCGPlaytest.</p>
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(''); setMessage('')
      try {
        const response = await fetch('/api/partnership/branding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
        const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || 'Could not save branding.')
        setValue(data.branding); setMessage('Branding saved. Open or reload your hosted checkout to see the changes.')
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save branding.') } finally { setBusy(false) }
    }}>
      <fieldset disabled={busy} className="space-y-4">
        <label className="flex gap-3"><input type="checkbox" checked={value.enabled} onChange={e => update('enabled', e.target.checked)} />Enable partner branding</label>
        <label className="grid gap-1">Store display name<input className="input-recessed p-3" maxLength={60} value={value.display_name} onChange={e => update('display_name', e.target.value)} /></label>
        <label className="grid gap-1">Logo (PNG/JPEG, up to 200 KiB)<input type="file" accept="image/png,image/jpeg" onChange={async e => {
          const file = e.target.files?.[0]; if (!file) return
          if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 204800) { setError('Choose a PNG or JPEG no larger than 200 KiB.'); return }
          try { const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file) }); update('logo_data_url', data) } catch { setError('Could not read this logo.') }
        }} /></label>
        {value.logo_data_url && <button type="button" className="underline" onClick={() => update('logo_data_url', '')}>Remove logo</button>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">Accent color<input type="color" value={value.accent_color} onChange={e => update('accent_color', e.target.value)} /></label>
          {([['theme', ['dark', 'light']], ['font', ['system', 'rounded', 'serif']], ['layout', ['classic', 'panel']], ['heading', ['complete', 'print', 'review']]] as const).map(([key, options]) => <label className="grid gap-1 capitalize" key={key}>{key}<select className="input-recessed p-3" value={value[key]} onChange={e => update(key, e.target.value)}>{options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>)}
        </div>
        <label className="grid gap-1">Welcome message (optional)<input className="input-recessed p-3" maxLength={160} value={value.welcome_message} onChange={e => update('welcome_message', e.target.value)} /></label>
        <button className="button-primary" type="submit">{busy ? 'Saving…' : 'Save checkout branding'}</button>
      </fieldset>
    </form>
    {error && <p role="alert" className="text-red-300">{error}</p>}{message && <p role="status" className="text-emerald-300">{message}</p>}
    <div className="rounded-xl border p-5" style={{ background: style.background, color: style.foreground, fontFamily: style.fontFamily }} aria-label="Checkout branding preview">
      <p className="mb-3 text-xs uppercase">Style preview {value.enabled ? '' : '(branding disabled)'}</p>
      {value.logo_data_url && <img src={value.logo_data_url} alt="Store logo preview" className="mb-3 max-h-16 max-w-full object-contain" />}
      <p>{value.display_name}</p><h3 className="text-xl font-bold">{brandingHeading({ ...value, enabled: true })}</h3><p className="my-2">{value.welcome_message}</p>
      <p className="my-3 text-sm">Sold, printed and shipped by TCGPlaytest / Cardify LLC.</p>
      <div className="rounded border border-amber-600 bg-amber-50 p-3 text-amber-950">Quality warnings and customer rights confirmation remain visible.</div>
      <div className="mt-3 rounded p-3 text-center font-bold" style={{ backgroundColor: style.accent, color: style.buttonText }}>Review price and pay</div>
    </div>
    <p className="text-sm">The logo is resized and stored with your account. No external logo requests, custom HTML, CSS or JavaScript. These settings apply to both API and widget carts, but do not style the widget modal or Stripe/PayPal payment screens. The return link uses your registered website; the success destination uses the cart’s return_url.</p>
  </section>
}
