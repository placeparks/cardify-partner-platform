import { lookup } from "node:dns/promises"
import { request } from "node:https"
import { isIP } from "node:net"
import { ApiError, httpsUrl } from "@/lib/manufacturing-contract"

export function publicIPv4(ip: string) {
  if (isIP(ip) !== 4) return false
  const [a,b,c] = ip.split(".").map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 2)))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113))
}

// Pin DNS resolution to the vetted IP while preserving TLS hostname verification.
// Redirects are deliberately unsupported; accepting them would bypass origin checks.
export async function safeRequest(raw: string, options: { method?: string; body?: string; headers?: Record<string,string>; maxBytes?: number } = {}) {
  const url = new URL(httpsUrl(raw, "URL"))
  const addresses = await lookup(url.hostname, { all: true, family: 4 })
  if (!addresses.length || addresses.some(item => !publicIPv4(item.address))) throw new ApiError(422, "image_unreachable", "URL must resolve to a public IPv4 address")
  return await new Promise<{ bytes: Buffer; contentType: string; status: number }>((resolve, reject) => {
    const req = request(url, { method: options.method || "GET", headers: options.headers,
      lookup: ((_host: any, _opts: any, cb: any) => { if (_opts?.all) cb(null, [{ address: addresses[0].address, family: 4 }]); else cb(null, addresses[0].address, 4) }) as any,
    }, res => {
      const chunks: Buffer[] = []; let size = 0
      res.on("data", chunk => { size += chunk.length; if (size > (options.maxBytes ?? 20 * 1024 * 1024)) { req.destroy(new Error("Response exceeds size limit")); return }; chunks.push(chunk) })
      res.on("error", reject)
      res.on("end", () => resolve({ bytes: Buffer.concat(chunks), contentType: String(res.headers["content-type"] || "").split(";")[0], status: res.statusCode || 500 }))
    })
    const timeout = setTimeout(() => req.destroy(new Error("Request timed out")), 15000)
    req.on("close", () => clearTimeout(timeout)); req.on("error", reject)
    req.end(options.body)
  })
}
