const encoder = new TextEncoder()

const toHex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("")

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

const fromBase64Url = (text: string) =>
  Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))

export const newId = () => crypto.randomUUID()

export const randomToken = (bytes = 32) => toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)))

const ORDER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

export const newOrderNumber = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(7))
  return "ZC-" + [...bytes].map((b) => ORDER_ALPHABET[b % ORDER_ALPHABET.length]).join("")
}

export const sha256Hex = async (text: string) => toHex(await crypto.subtle.digest("SHA-256", encoder.encode(text)))

export const hmacHex = async (hash: "SHA-256" | "SHA-512", secret: string, message: string) => {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash }, false, ["sign"])
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)))
}

export const timingSafeEqual = (a: string, b: string) => {
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  if (left.length !== right.length) return false
  return crypto.subtle.timingSafeEqual(left, right)
}

const PBKDF2_ITERATIONS = 100_000

const derive = async (password: string, salt: Uint8Array, iterations: number) => {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256)
  return toBase64Url(new Uint8Array(bits))
}

export const hashPassword = async (password: string) => {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${await derive(password, salt, PBKDF2_ITERATIONS)}`
}

export const verifyPassword = async (password: string, stored: string) => {
  const [scheme, iterations, salt, hash] = stored.split("$")
  if (scheme !== "pbkdf2" || !iterations || !salt || !hash) return false
  return timingSafeEqual(await derive(password, fromBase64Url(salt), Number(iterations)), hash)
}
