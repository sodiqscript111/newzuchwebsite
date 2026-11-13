import { env } from "cloudflare:workers"
import { app } from "../src/index.ts"
import { hmacHex } from "../src/lib/crypto.ts"

export type TestEnv = typeof env

export const call = async (
  path: string,
  init: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {},
  overrides: Partial<TestEnv> = {}
) => {
  const headers = new Headers(init.headers)
  if (init.cookie) headers.set("cookie", init.cookie)
  let body: BodyInit | undefined
  if (init.body instanceof FormData) body = init.body
  else if (init.body !== undefined) {
    headers.set("content-type", "application/json")
    body = JSON.stringify(init.body)
  }
  const response = await app.request(path, { method: init.method ?? "GET", headers, body }, { ...env, ...overrides })
  const text = await response.text()
  const json = text ? JSON.parse(text) : null
  const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ")
  return { status: response.status, json, cookie, headers: response.headers }
}

let counter = 0

export const seedProduct = async (
  overrides: Partial<{ name: string; price: number | null; sizes: string[]; visible: boolean; collection: string }> = {}
) => {
  counter++
  const collection = overrides.collection ?? "poise"
  const id = `product-${counter}-${crypto.randomUUID()}`
  const imageKey = `products/${collection}/${id}/01.jpg`
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO collections (slug, name, position) VALUES (?, ?, 1)").bind(collection, "Poise"),
    env.DB.prepare(
      `INSERT INTO products (id, collection_slug, slug, name, price, price_note, description, sizes, visible, created_at)
       VALUES (?, ?, ?, ?, ?, '', '', ?, ?, ?)`
    ).bind(
      id,
      collection,
      `item-${counter}`,
      overrides.name ?? `Item ${counter}`,
      overrides.price === undefined ? 45000 : overrides.price,
      JSON.stringify(overrides.sizes ?? ["S", "M", "L"]),
      overrides.visible === false ? 0 : 1,
      new Date().toISOString()
    ),
    env.DB.prepare("INSERT INTO product_images (id, product_id, key, position) VALUES (?, ?, ?, 0)").bind(
      `${id}-img`,
      id,
      imageKey
    )
  ])
  return { id, imageKey }
}

export const contact = {
  name: "Ada Test",
  email: "ada@example.com",
  phone: "+234 800 000 0000",
  address: "1 Test Street, Lagos"
}

type SignOptions = { secret?: string; timestamp?: number; style?: "signing-secret" | "secret-key" }

export const signWebhook = async (
  payload: unknown,
  options: SignOptions = {}
): Promise<{ body: string; headers: Record<string, string> }> => {
  const body = JSON.stringify(payload)
  if (options.style === "secret-key") {
    const signature = await hmacHex("SHA-512", options.secret ?? "sk_test_key", body)
    return { body, headers: { "x-paystack-signature": signature, "content-type": "application/json" } }
  }
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000))
  const signature = await hmacHex("SHA-512", options.secret ?? "whsec_test", `${timestamp}.${body}`)
  return {
    body,
    headers: { "paystack-signature": `t=${timestamp},v1=whk_test:${signature}`, "content-type": "application/json" }
  }
}

export const postWebhook = async (payload: unknown, options: SignOptions = {}, overrides: Partial<TestEnv> = {}) => {
  const signed = await signWebhook(payload, options)
  const response = await app.request(
    "/api/webhooks/paystack",
    { method: "POST", headers: signed.headers, body: signed.body },
    { ...env, ...overrides }
  )
  return response.status
}

export const chargeSuccess = (reference: string, naira: number, id = Math.floor(Math.random() * 1e9)) => ({
  event: "charge.success",
  data: { id, status: "success", reference, amount: naira * 100, currency: "NGN", channel: "card" }
})

export const orderStatus = async (number: string) =>
  (await env.DB.prepare("SELECT status, note FROM orders WHERE number = ?").bind(number).first<{
    status: string
    note: string
  }>())!
