import { hasPartnerTerms } from "@/lib/manufacturing-contract"

function attribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function widgetSnippet(platformOrigin: string, checkoutOrigin: string, partnerKey: string, mode: "test" | "live" = "live") {
  const platform = new URL(platformOrigin).origin
  const checkout = new URL(checkoutOrigin).origin
  return `<script
  src="${attribute(platform)}/partner-widget/widget.js"
  data-partner-key="${attribute(partnerKey)}"
  data-mode="${mode}"
  data-checkout-origin="${attribute(checkout)}"
  data-label="Print with TCGPlaytest"
  async
></script>`
}

export function partnerWidgetCode(partner: { status: string; api_blocked_at?: string | null; access_revoked_at?: string | null; widget_partner_key?: string | null; terms_version?: string | null; terms_accepted_at?: string | null }, platformOrigin: string, checkoutOrigin: string) {
  if (partner.status !== "approved" || partner.api_blocked_at || partner.access_revoked_at || !hasPartnerTerms(partner) || !partner.widget_partner_key) return null
  return widgetSnippet(platformOrigin, checkoutOrigin, partner.widget_partner_key)
}
