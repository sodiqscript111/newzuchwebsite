import { z } from "zod"
import { hmacHex, timingSafeEqual } from "./lib/crypto.ts"

const API = "https://api.paystack.co"

export class PaystackError extends Error {}

const call = async (env: Env, path: string, init: { method: string; body?: unknown }) => {
  const response = await fetch(`${API}${path}`, {
    method: init.method,
    headers: {
      authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      ...(init.body === undefined ? {} : { "content-type": "application/json" })
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15_000)
  })
  const text = await response.text()
  if (!response.ok) throw new PaystackError(`Paystack answered ${response.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text) as unknown
}

const Initialized = z.object({
  status: z.literal(true),
  data: z.object({ authorization_url: z.string(), reference: z.string() })
})

export const initializeTransaction = async (
  env: Env,
  payment: { reference: string; email: string; total: number; callbackUrl: string; cancelUrl: string; orderId: string }
) => {
  const result = Initialized.safeParse(
    await call(env, "/transaction/initialize", {
      method: "POST",
      body: {
        email: payment.email,
        amount: String(payment.total * 100),
        currency: "NGN",
        reference: payment.reference,
        callback_url: payment.callbackUrl,
        metadata: { order_id: payment.orderId, cancel_action: payment.cancelUrl }
      }
    })
  )
  if (!result.success) throw new PaystackError("Paystack sent an unexpected response when starting a payment")
  return { authorizationUrl: result.data.data.authorization_url }
}

export const Transaction = z.object({
  id: z.number().nullish(),
  status: z.string(),
  reference: z.string(),
  amount: z.number(),
  currency: z.string()
})
export type Transaction = z.infer<typeof Transaction>

const Verified = z.object({ status: z.literal(true), data: Transaction })

export const verifyTransaction = async (env: Env, reference: string) => {
  const result = Verified.safeParse(await call(env, `/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" }))
  if (!result.success) throw new PaystackError("Paystack sent an unexpected verification response")
  return result.data.data
}

export const coversOrder = (transaction: Transaction, total: number) =>
  transaction.status === "success" && transaction.currency === "NGN" && transaction.amount >= total * 100

const TOLERANCE_SECONDS = 300

// Paystack-Signature (t=...,v1=<key id>:<hex>) is signed with the whsec_ webhook secret over
// "{t}.{raw body}". Integrations without one get x-paystack-signature, signed with the secret key.
export const verifyWebhook = async (env: Env, headers: Headers, rawBody: string) => {
  const signed = headers.get("paystack-signature")
  if (signed && env.PAYSTACK_WEBHOOK_SECRET) {
    let timestamp: string | undefined
    const signatures: string[] = []
    for (const part of signed.split(",")) {
      const [key, ...rest] = part.trim().split("=")
      const value = rest.join("=")
      if (key === "t") timestamp = value
      if (key === "v1" && value.includes(":")) signatures.push(value.slice(value.indexOf(":") + 1))
    }
    if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false
    const expected = await hmacHex("SHA-512", env.PAYSTACK_WEBHOOK_SECRET, `${timestamp}.${rawBody}`)
    return signatures.some((signature) => timingSafeEqual(signature, expected))
  }

  const legacy = headers.get("x-paystack-signature")
  if (!legacy || !env.PAYSTACK_SECRET_KEY) return false
  return timingSafeEqual(legacy.toLowerCase(), await hmacHex("SHA-512", env.PAYSTACK_SECRET_KEY, rawBody))
}

export const WebhookEvent = z.object({
  event: z.string(),
  data: z.object({
    id: z.number().nullish(),
    status: z.string().nullish(),
    reference: z.string().nullish(),
    amount: z.number().nullish(),
    currency: z.string().nullish()
  }).passthrough()
})
