import type { CSSProperties } from 'react'
import { partnerPlatform } from '@/lib/server/partnerHandoff'
import PartnerCheckoutForm from './form'
import { CheckoutIcon } from './icons'
import { checkoutBranding, brandingStyle, brandingHeading } from '@/utils/checkoutBranding'
import styles from './checkout.module.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'TCGPlaytest manufacturing checkout', robots: { index: false, follow: false }, referrer: 'no-referrer' }
export default async function PartnerCheckout({ params }: { params: { token: string } }) {
  try {
    const cart = await partnerPlatform('checkout',{token:params.token})
    const branding = checkoutBranding(cart.branding)
    const style = brandingStyle(branding)
    let website: string | null = null
    try { const url = new URL(cart.partner_website); if (url.protocol === 'https:' && !url.username && !url.password) website = url.href } catch {}
    const brandName = branding.display_name || 'TCGPlaytest'
    const themeStyle = { fontFamily: style.fontFamily, '--pc-accent': style.accent, '--pc-accent-text': style.buttonText } as CSSProperties
    return <main className={styles.page} data-theme={branding.theme} style={themeStyle}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div className={styles.brand}>
            {branding.logo_data_url
              ? <img src={branding.logo_data_url} alt={`${brandName} logo`} className={styles.logo} />
              : <span className={styles.brandMark}><CheckoutIcon name="cards" /></span>}
            <span className={styles.brandName}>{brandName}</span>
          </div>
          <span className={styles.secure}><CheckoutIcon name="lock" />Secure checkout</span>
        </header>

        <ol className={styles.steps} aria-label="Checkout progress">
          <li aria-current="step"><span className={styles.stepNumber}>1</span>Your details</li>
          <li><span className={styles.stepNumber}>2</span>Payment</li>
          <li><span className={styles.stepNumber}>3</span>Confirmation</li>
        </ol>

        <div className={`${styles.layout} ${branding.layout === 'classic' ? styles.classic : ''}`}>
          <aside className={styles.overview} aria-label="Your card order">
            <p className={styles.eyebrow}>From your artwork to your tabletop</p>
            <h1 className={styles.title}>{brandingHeading(branding)}</h1>
            <p className={styles.welcome}>{branding.welcome_message || 'A few details, then your cards are one step closer to the table.'}</p>

            <section className={styles.orderSummary} aria-labelledby="order-summary-title">
              <h2 id="order-summary-title" className={styles.summaryHeading}>Your order</h2>
              <div className={styles.product}>
                <span className={styles.cardArt}><CheckoutIcon name="cards" /></span>
                <div><p className={styles.productName}>Custom printed cards</p><p className={styles.productDetail}>Made with your supplied artwork</p></div>
              </div>
              <dl className={styles.summaryRows}>
                <div><dt>Quantity</dt><dd>{cart.card_count} {cart.card_count === 1 ? 'card' : 'cards'}</dd></div>
                <div><dt>Card stock</dt><dd>Standard</dd></div>
                <div><dt>Finished size</dt><dd>63 × 88 mm</dd></div>
              </dl>
              <p className={styles.priceNote}>Your final total, including shipping and any taxes, is shown in the next step before you pay.</p>
            </section>

            <div className={styles.fulfillment}><CheckoutIcon name="truck" /><p>Sold, printed and shipped by<span className={styles.sellerName}>TCGPlaytest / Cardify LLC</span></p></div>
            <nav className={styles.legalLinks} aria-label="Order help"><a href="/terms">Purchase terms</a><a href="/privacy">Privacy</a><a href="mailto:support@tcgplaytest.com">Order support</a></nav>
            {website && <a href={website} className={styles.returnLink} rel="noreferrer"><CheckoutIcon name="back" />Return to partner website</a>}
          </aside>

          <section className={styles.formCard} aria-labelledby="delivery-title">
            <div className={styles.formHeader}><h2 id="delivery-title">Delivery details</h2><p>Where should we send your cards?</p></div>
            <PartnerCheckoutForm token={params.token} initialAffiliateCode={cart.affiliate_code || ''} warnings={cart.warnings || []} accentColor={style.accent} buttonTextColor={style.buttonText} />
          </section>
        </div>
        <p className={styles.bottomNote}>Custom card printing, fulfilled by TCGPlaytest.</p>
      </div>
    </main>
  } catch {
    return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-bold">Cart unavailable</h1><p>This cart has expired, was blocked, or has already been ordered. Return to the partner website to start again.</p></main>
  }
}
