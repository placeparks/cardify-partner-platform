import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
function key() {
  const value = process.env.PARTNER_SECRET_ENCRYPTION_KEY || ""
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("Configure PARTNER_SECRET_ENCRYPTION_KEY with 32 random bytes as hex")
  return Buffer.from(value, "hex")
}
export function encrypt(value: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), bytes].map(part => part.toString("base64")).join(".")
}
export function decrypt(value: string) {
  const [iv, tag, bytes] = value.split(".").map(part => Buffer.from(part,"base64"))
  const cipher = createDecipheriv("aes-256-gcm", key(), iv); cipher.setAuthTag(tag)
  return Buffer.concat([cipher.update(bytes), cipher.final()]).toString("utf8")
}
