// Keep in sync with the commerce app's utils/checkoutBranding.ts.
export const BRANDING_DEFAULTS = {
  enabled: false, display_name: '', logo_data_url: '', accent_color: '#059669',
  theme: 'dark', font: 'system', layout: 'classic', heading: 'complete', welcome_message: '',
} as const
export type CheckoutBranding = {
  enabled: boolean; display_name: string; logo_data_url: string; accent_color: string;
  theme: 'light' | 'dark'; font: 'system' | 'rounded' | 'serif'; layout: 'classic' | 'panel';
  heading: 'complete' | 'print' | 'review'; welcome_message: string;
}
export function validateBranding(input: unknown): CheckoutBranding {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Branding settings must be an object.')
  const value = input as Record<string, unknown>
  if (Object.keys(value).some(key => !Object.prototype.hasOwnProperty.call(BRANDING_DEFAULTS, key))) throw new Error('Unsupported branding setting. Custom HTML, CSS and scripts are not allowed.')
  const result = { ...BRANDING_DEFAULTS, ...value } as CheckoutBranding
  if (typeof result.enabled !== 'boolean') throw new Error('Enabled must be true or false.')
  for (const [key, limit] of [['display_name', 60], ['welcome_message', 160]] as const) {
    if (typeof result[key] !== 'string' || result[key].length > limit || /[<>\u0000-\u001f\u007f]/.test(result[key])) throw new Error(`${key} must be plain text, up to ${limit} characters.`)
    result[key] = result[key].trim()
  }
  if (!/^#[0-9a-f]{6}$/i.test(result.accent_color)) throw new Error('Choose a six-digit hex accent color.')
  for (const [key, choices] of Object.entries({ theme: ['light', 'dark'], font: ['system', 'rounded', 'serif'], layout: ['classic', 'panel'], heading: ['complete', 'print', 'review'] })) {
    if (!choices.includes((result as any)[key])) throw new Error(`Invalid ${key} option.`)
  }
  if (typeof result.logo_data_url !== 'string' || result.logo_data_url.length > 280000 || (result.logo_data_url && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(result.logo_data_url))) throw new Error('Use a PNG or JPEG logo up to 200 KiB. Remote URLs and SVG are not supported.')
  return result
}
export function checkoutBranding(input: unknown): CheckoutBranding {
  try { const branding = validateBranding(input); return branding.enabled ? branding : { ...BRANDING_DEFAULTS } } catch { return { ...BRANDING_DEFAULTS } }
}
export function brandingStyle(branding: CheckoutBranding) {
  const rgb = branding.accent_color.slice(1).match(/../g)!.map(hex => {
    const n = parseInt(hex, 16) / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
  return {
    accent: branding.accent_color, buttonText: luminance > 0.179 ? '#000000' : '#ffffff',
    background: branding.theme === 'light' ? '#f8fafc' : '#020617',
    foreground: branding.theme === 'light' ? '#0f172a' : '#f8fafc',
    fontFamily: { system: 'Arial, Helvetica, sans-serif', rounded: 'ui-rounded, system-ui, sans-serif', serif: 'Georgia, serif' }[branding.font],
  }
}
export function brandingHeading(branding: CheckoutBranding) {
  return branding.enabled ? { complete: 'Complete your card order', print: 'Print your cards', review: 'Review your card order' }[branding.heading] : 'Print with TCGPlaytest'
}
