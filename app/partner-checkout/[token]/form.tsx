'use client'
import { useEffect, useState } from 'react'
import { checkPartnerCheckoutCode } from '@/utils/partnerAffiliate'
import { PARTNER_CUSTOMER_TERMS_VERSION, PARTNER_RIGHTS_STATEMENT } from '@/utils/partnerRights'
import { CheckoutIcon } from './icons'
import styles from './checkout.module.css'
type QualityWarning = { item_index: number; side: string; width: number; height: number; code: string }
export default function PartnerCheckoutForm({ token, initialAffiliateCode = '', warnings = [], accentColor = '#059669', buttonTextColor = '#ffffff' }: { token: string; initialAffiliateCode?: string; warnings?: QualityWarning[]; accentColor?: string; buttonTextColor?: string }) {
  const [busy,setBusy] = useState(false), [error,setError] = useState('')
  const [rightsAccepted,setRightsAccepted] = useState(false)
  const [qualityAccepted,setQualityAccepted] = useState(false)
  const lowQuality = warnings.filter(warning => warning.code === 'image_low_resolution')
  const [affiliate,setAffiliate] = useState(initialAffiliateCode)
  const [automatic,setAutomatic] = useState(Boolean(initialAffiliateCode))
  const [checkRequested,setCheckRequested] = useState(0)
  const [checkingCode,setCheckingCode] = useState(false), [codeMessage,setCodeMessage] = useState('')
  const [shipping,setShipping] = useState({name:'',email:'',line1:'',line2:'',city:'',state:'',postal_code:'',country:'US'})
  useEffect(() => {
    setCodeMessage(''); setCheckingCode(false)
    if (!(automatic || checkRequested) || !affiliate.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shipping.email.trim())) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setCheckingCode(true)
      try {
        const result = await checkPartnerCheckoutCode(affiliate, shipping.email, automatic, controller.signal)
        if (!controller.signal.aborted) setCodeMessage(result.message)
      } catch (caught) {
        if (!controller.signal.aborted) setCodeMessage(caught instanceof Error ? caught.message : 'Could not check this code.')
      } finally { if (!controller.signal.aborted) setCheckingCode(false) }
    }, 400)
    return () => { clearTimeout(timer); controller.abort() }
  }, [affiliate, shipping.email, automatic, checkRequested])
  function changeCode(value: string) {
    setAffiliate(value.toUpperCase()); setAutomatic(false); setCheckRequested(0); setCodeMessage('')
  }
  const field = (key: keyof typeof shipping, label: string, autoComplete: string, placeholder: string, wide = false) => <label className={`${styles.field} ${wide ? styles.fullWidth : ''}`} key={key}>
    <span>{label}{key === 'line2' && <span className={styles.optional}> (optional)</span>}</span>
    <input className={styles.input} name={key} autoComplete={autoComplete} required={key !== 'line2'} disabled={busy} type={key === 'email' ? 'email' : 'text'} value={shipping[key]} placeholder={placeholder} maxLength={key === 'country' ? 2 : 200} aria-describedby={key === 'country' ? 'country-hint' : undefined} onChange={e => setShipping({ ...shipping, [key]: key === 'country' ? e.target.value.toUpperCase() : e.target.value })} />
    {key === 'country' && <span id="country-hint" className={styles.fieldHint}>Two-letter code, e.g. US or GB</span>}
  </label>
  return <form className={styles.form} onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const result = await checkPartnerCheckoutCode(affiliate, shipping.email, automatic)
      setCodeMessage(result.message)
      if (!rightsAccepted) throw new Error('Accept the image-rights terms before continuing.')
      if (lowQuality.length && !qualityAccepted) throw new Error('Please acknowledge the image-quality warning.')
      const response = await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({partnerCartToken:token,shippingAddress:shipping,affiliateCode:result.code,imageRightsAccepted:rightsAccepted,imageRightsTermsVersion:PARTNER_CUSTOMER_TERMS_VERSION,imageQualityAccepted:qualityAccepted})})
      const data = await response.json()
      if (!response.ok || !data.url) throw new Error(data.message || data.error || 'Checkout unavailable')
      window.location.assign(data.url)
    } catch (caught) {setError(caught instanceof Error?caught.message:'Checkout unavailable');setBusy(false)}
  }}>
    {lowQuality.length > 0 && <div className={styles.quality} role="note">
      <h3 className={styles.qualityTitle}><CheckoutIcon name="warning" />Some images are low resolution</h3>
      <p>You can still order them, but they may print blurry or pixelated.</p>
      <ul>{lowQuality.map((warning,index) => <li key={index}>Card {warning.item_index + 1} {warning.side}: {warning.width} × {warning.height} pixels.</li>)}</ul>
      <label><input className={styles.checkbox} type="checkbox" required disabled={busy} checked={qualityAccepted} onChange={event=>setQualityAccepted(event.target.checked)}/>I understand and want to print these images.</label>
    </div>}

    <fieldset className={styles.fieldSection} disabled={busy}>
      <legend>Contact information</legend>
      <div className={`${styles.fieldGrid} ${styles.contactGrid}`}>
        {field('name', 'Full name', 'shipping name', 'Full name')}
        {field('email', 'Email address', 'email', 'you@example.com')}
      </div>
    </fieldset>
    <fieldset className={`${styles.fieldSection} ${styles.shippingSection}`} disabled={busy}>
      <legend>Shipping address</legend>
      <div className={styles.fieldGrid}>
        {field('line1', 'Street address', 'shipping address-line1', 'Street and house number', true)}
        {field('line2', 'Apartment, suite, etc.', 'shipping address-line2', 'Apartment, suite, unit', true)}
        {field('city', 'City', 'shipping address-level2', 'City')}
        {field('state', 'State / province', 'shipping address-level1', 'State or province')}
        {field('postal_code', 'Postal code', 'shipping postal-code', 'ZIP or postal code')}
        {field('country', 'Country code', 'shipping country', 'US')}
      </div>
    </fieldset>

    <details className={styles.affiliate} open={Boolean(initialAffiliateCode)}>
      <summary>Have an affiliate code?</summary>
      <div className={styles.affiliateRow}>
        <label className={styles.field}>Affiliate code <input className={styles.input} disabled={busy} value={affiliate} placeholder="Enter code" onChange={e=>changeCode(e.target.value)}/></label>
        <button type="button" className={styles.secondary} disabled={checkingCode||busy||!affiliate.trim()} onClick={()=>{if(!shipping.email.trim())setCodeMessage('Enter your email to check eligibility.');else setCheckRequested(value=>value+1)}}>{checkingCode?'Checking…':'Apply'}</button>
        {affiliate&&<button type="button" className={styles.secondary} disabled={busy} onClick={()=>changeCode('')}>Remove</button>}
      </div>
      {codeMessage&&<p role="status" className={styles.codeMessage}>{codeMessage}</p>}
      {automatic&&!codeMessage&&<p className={styles.codeMessage}>Your partner’s affiliate code is prefilled. Enter your email to check eligibility.</p>}
    </details>

    {error&&<p role="alert" className={styles.error}>{error}</p>}
    <label className={styles.rights}><input className={styles.checkbox} type="checkbox" required checked={rightsAccepted} disabled={busy} onChange={event=>setRightsAccepted(event.target.checked)}/><span>{PARTNER_RIGHTS_STATEMENT} <a href="/partner-checkout/terms" target="_blank" rel="noopener noreferrer">Read terms ({PARTNER_CUSTOMER_TERMS_VERSION})</a>.</span></label>
    <div className={styles.payArea}>
      <button disabled={busy||checkingCode||!rightsAccepted||(lowQuality.length > 0 && !qualityAccepted)} className={styles.submit} style={{ backgroundColor: accentColor, color: buttonTextColor }}>{busy?'Preparing checkout…':'Continue to payment'}<CheckoutIcon name="arrow" /></button>
      <p className={styles.paymentNote}>Review your final total before paying.</p>
    </div>
  </form>
}
