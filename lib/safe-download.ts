import { lookup } from "node:dns/promises"
import { request } from "node:https"
import { isIP } from "node:net"
import { ApiError, httpsUrl } from "@/lib/manufacturing-contract"

export function publicIPv4(ip: string) {
  if (isIP(ip) !== 4) return false
  const [a,b,c] = ip.split(".").map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || b === 2))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113))
}
type Options = { method?: string; body?: string; headers?: Record<string,string>; maxBytes?: number; maxRedirects?: number }
// DNS, TLS and body reads share a deadline. Every redirect is resolved and pinned
// independently. Webhooks keep redirects disabled: never forward their credentials.
export async function safeRequest(raw: string, options: Options = {}) {
  const deadline = Date.now()+15000
  const maxBytes = Math.min(options.maxBytes ?? 20*1024*1024,20*1024*1024)
  let current = raw
  for (let hop=0; ; hop++) {
    let url: URL
    try { url = new URL(httpsUrl(current,"URL")) } catch { throw new ApiError(422,"image_url_unsafe","Public HTTPS artwork URL required") }
    const hostname = url.hostname.replace(/^\[|\]$/g,"")
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || isIP(hostname) === 6) throw new ApiError(422,"image_url_unsafe","Public IPv4 address required")
    let timer: ReturnType<typeof setTimeout> | undefined
    let addresses: {address:string;family:number}[]
    try {
      addresses = await Promise.race([
        lookup(hostname,{all:true,family:4}),
        new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new ApiError(422,"image_timeout","Download timed out")),Math.max(1,deadline-Date.now()))}),
      ])
    } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(422,"image_unreachable","Image host could not be reached") }
    finally { clearTimeout(timer) }
    if (!addresses.length || addresses.some(item=>!publicIPv4(item.address))) throw new ApiError(422,"image_url_unsafe","URL must resolve to public IPv4 addresses")
    if (Date.now()>=deadline) throw new ApiError(422,"image_timeout","Download timed out")
    const response = await new Promise<{bytes:Buffer;contentType:string;status:number;location?:string}>((resolve,reject)=>{
      const req=request(url,{method:options.method||"GET",headers:options.headers,
        lookup:((_host:any,opts:any,cb:any)=>opts?.all ? cb(null,[{address:addresses[0].address,family:4}]) : cb(null,addresses[0].address,4)) as any,
      },res=>{
        const status=res.statusCode||500
        if ([301,302,303,307,308].includes(status)) { resolve({bytes:Buffer.alloc(0),contentType:"",status,location:res.headers.location});res.destroy();return }
        if (Number(res.headers["content-length"])>maxBytes) { req.destroy(new ApiError(422,"image_too_large","Image exceeds size limit"));return }
        const chunks:Buffer[]=[];let size=0
        res.on("data",chunk=>{
          size+=chunk.length
          if (size>maxBytes) { req.destroy(new ApiError(422,"image_too_large","Image exceeds size limit"));return }
          chunks.push(chunk)
        })
        res.on("error",reject)
        res.on("aborted",()=>reject(new ApiError(422,"image_unreachable","Incomplete image response")))
        res.on("end",()=>resolve({bytes:Buffer.concat(chunks),contentType:String(res.headers["content-type"]||"").split(";")[0],status}))
      })
      const timeout=setTimeout(()=>req.destroy(new ApiError(422,"image_timeout","Download timed out")),Math.max(1,deadline-Date.now()))
      req.on("close",()=>clearTimeout(timeout));req.on("error",error=>reject(error instanceof ApiError ? error : new ApiError(422,"image_unreachable","Image could not be downloaded")))
      req.end(options.body)
    })
    if (![301,302,303,307,308].includes(response.status)) return response
    if (hop>=Math.min(options.maxRedirects||0,3) || options.method && options.method!=="GET") throw new ApiError(422,"image_redirect_limit","Image exceeded redirect limit")
    if (!response.location) throw new ApiError(422,"image_unreachable","Redirect has no destination")
    try { current=new URL(response.location,url).href } catch { throw new ApiError(422,"image_url_unsafe","Invalid redirect destination") }
  }
}
