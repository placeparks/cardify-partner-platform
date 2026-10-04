// This version is persisted with each acceptance and manufacturing instruction.
export const TERMS_VERSION = "2026-10-02"
export const CUSTOMER_TERMS_VERSION = "2026-10-04"
export const CERTIFICATION = {
  client_supplied: "The content was supplied by the client or its customer.",
  reproduction_authorized: "The client owns or has permission to reproduce all submitted content.",
  manufacturing_only: "TCGPlaytest is instructed solely to manufacture and fulfill this order.",
} as const

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public item_index?: number) { super(message) }
}

export function httpsUrl(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length > 2048) throw new ApiError(400, "invalid_request", `${field} must be an HTTPS URL`)
  let url: URL
  try { url = new URL(value) } catch { throw new ApiError(400, "invalid_request", `${field} must be an HTTPS URL`) }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || (url.port && url.port !== "443")) {
    throw new ApiError(400, "invalid_request", `${field} must be HTTPS without credentials, fragments, or a custom port`)
  }
  return url.href
}

export function partnerReturnUrl(value: unknown, website: unknown): string {
  const registered = httpsUrl(website, "registered website")
  const destination = value ? httpsUrl(value, "return_url") : registered
  if (new URL(destination).origin !== new URL(registered).origin) {
    throw new ApiError(400, "invalid_request", "return_url must belong to the registered partner website")
  }
  return destination
}

function hash(value: unknown, field: string) {
  if (value === undefined || value === null) return null
  if (typeof value !== "string" || !/^[a-fA-F0-9]{64}$/.test(value)) throw new ApiError(400, "invalid_request", `${field} must be the SHA-256 of the file bytes`)
  return value.toLowerCase()
}

export function validateCart(body: any, maxCards = 1000) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "invalid_request", "Expected a JSON object")
  const allowed = ["items", "back_image_url", "back_sha256", "card_stock", "external_ref", "return_url", "certification"]
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new ApiError(400, "invalid_request", "Unknown field; prices and artwork-library IDs are not accepted")
  if (body.certification != null && (body.certification?.terms_version !== TERMS_VERSION || Object.keys(CERTIFICATION).some(key => body.certification?.[key] !== true))) {
    throw new ApiError(400, "invalid_certification", "If supplied, certification must include all three statements and the current terms_version")
  }
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > maxCards) throw new ApiError(400, "invalid_request", `Submit 1–${maxCards} items`)
  // Thick stock remains unavailable until production confirms its specifications and rate.
  if (body.card_stock && body.card_stock !== "standard") throw new ApiError(400, "invalid_request", "Only standard card stock is currently supported")
  let count = 0
  const items = body.items.map((item: any, index: number) => {
    try {
      if (!item || !Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new ApiError(400, "invalid_request", "quantity must be a positive integer")
      if (Object.keys(item).some(key => !["image_url", "sha256", "quantity", "back_image_url", "back_sha256"].includes(key))) throw new ApiError(400, "invalid_request", "Unknown item field")
      count += item.quantity
      if (count > maxCards) throw new ApiError(400, "invalid_request", `Maximum ${maxCards} cards per cart`)
      return {
        image_url: httpsUrl(item.image_url, "image_url"), sha256: hash(item.sha256, "sha256"), quantity: item.quantity,
        back_image_url: httpsUrl(item.back_image_url ?? body.back_image_url, "client-supplied back_image_url"),
        back_sha256: hash(item.back_image_url ? item.back_sha256 : body.back_sha256, "back_sha256"),
      }
    } catch (error) { if (error instanceof ApiError) error.item_index = index; throw error }
  })
  if (body.external_ref !== undefined && (typeof body.external_ref !== "string" || body.external_ref.length > 200)) throw new ApiError(400, "invalid_request", "external_ref must be at most 200 characters")
  return { items, card_count: count, card_stock: "standard", external_ref: body.external_ref || null,
    return_url: body.return_url ? httpsUrl(body.return_url, "return_url") : null,
    certification: body.certification == null ? null : { ...Object.fromEntries(Object.keys(CERTIFICATION).map(key => [key, true])), terms_version: TERMS_VERSION },
  }
}
