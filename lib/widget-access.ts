function attribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function widgetSnippet(platformOrigin: string, checkoutOrigin: string) {
  const platform = new URL(platformOrigin).origin
  const checkout = new URL(checkoutOrigin).origin
  return `<script src="${attribute(platform)}/partner-widget/widget.js" data-cart-endpoint="/api/tcgplaytest/cart" data-checkout-origin="${attribute(checkout)}" data-label="Print with TCGPlaytest" async></script>`
}

export function partnerWidgetCode(partner: { status: string; api_blocked_at?: string | null }, platformOrigin: string, checkoutOrigin: string) {
  if (partner.status !== "approved" || partner.api_blocked_at) return null
  return widgetSnippet(platformOrigin, checkoutOrigin)
}
