import sharp from 'sharp'
import { api, checked, json, partnerSession } from '@/lib/partner-api'
import { ApiError } from '@/lib/manufacturing-contract'
import { validateBranding } from '@/lib/checkout-branding'
import { supabaseAdmin as db } from '@/lib/supabase-admin'
export const runtime = 'nodejs'
export async function POST(request: Request) { return api(async () => {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError(403, 'origin_not_allowed', 'Save branding from your partner dashboard.')
  const { partner } = await partnerSession()
  if (partner.access_revoked_at) throw new ApiError(403, 'partner_unavailable', 'Partner access is revoked.')
  let branding
  try {
    branding = validateBranding(await json(request))
    if (branding.logo_data_url) {
      const bytes = Buffer.from(branding.logo_data_url.split(',')[1], 'base64')
      if (bytes.length > 204800) throw new Error('Logo must be no larger than 200 KiB.')
      const image = sharp(bytes, { limitInputPixels: 4000000, animated: false })
      const metadata = await image.metadata()
      if (!['png', 'jpeg'].includes(metadata.format || '') || (metadata.pages || 1) !== 1) throw new Error('Choose a single-frame PNG or JPEG logo.')
      const prepared = await image.rotate().resize({ width: 512, height: 128, fit: 'inside', withoutEnlargement: true }).png({ palette: true }).toBuffer()
      branding.logo_data_url = `data:image/png;base64,${prepared.toString('base64')}`
      branding = validateBranding(branding)
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(400, 'invalid_branding', error instanceof Error ? error.message : 'Invalid branding settings.')
  }
  checked(await db.from('partnership_requests').update({ checkout_branding: branding }).eq('id', partner.id))
  return Response.json({ saved: true, branding }, { headers: { 'Cache-Control': 'no-store' } })
}) }
