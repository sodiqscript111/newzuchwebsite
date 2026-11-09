import { z } from "zod"
import { hmacSha256Hex, timingSafeEqual } from "./lib/crypto.ts"

const CheckoutSession = z.object({
  checkout_id: z.string(),
  checkout_url: z.string()
})

export class BachsError extends Error {}

export const createCheckoutSession = async (
  env: Env,
  order: {
    id: string
    number: string
    total: number
    contact: { name: string; email: string; phone: string }
    successUrl: string
    cancelUrl: string
  }
) => {
  const response = await fetch(`${env.BACHS_API_URL}/v1/checkout-sessions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.BACHS_SECRET_KEY}`,
      "content-type": "application/json",
      "idempotency-key": `checkout-${order.id}`
    },
    body: JSON.stringify({
      pricing: { currency: "NGN", amount: `${order.total}.00` },
      customer: { email: order.contact.email, name: order.contact.name, phone_number: order.contact.phone },
      reference: order.number,
      metadata: { order_id: order.id },
      success_url: order.successUrl,
      cancel_url: order.cancelUrl,
      expires_in_minutes: 60
    }),
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) {
    throw new BachsError(`Bachs answered ${response.status}: ${(await response.text()).slice(0, 300)}`)
  }
  const session = CheckoutSession.safeParse(await response.json())
  if (!session.success) throw new BachsError("Bachs sent an unexpected checkout response")
  return { checkoutId: session.data.checkout_id, checkoutUrl: session.data.checkout_url }
}

const TOLERANCE_SECONDS = 300

export const verifyWebhook = async (secret: string, headers: Headers, rawBody: string) => {
  const v2 = headers.get("x-bachs-signature-v2")
  let timestamp = headers.get("x-bachs-timestamp")
  let signatures = headers.get("x-bachs-signature") ? [headers.get("x-bachs-signature")!] : []
  if (v2) {
    const parts = v2.split(",").map((part) => part.trim().split("="))
    timestamp = parts.find(([name]) => name === "t")?.[1] ?? timestamp
    signatures = parts.filter(([name]) => name === "v1").map(([, value]) => value ?? "")
  }
  if (!timestamp || signatures.length === 0) return false
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false
  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`)
  return signatures.some((signature) => timingSafeEqual(signature.toLowerCase(), expected))
}

export const WebhookEvent = z.object({
  id: z.string(),
  type: z.string(),
  created_at: z.string().optional(),
  data: z
    .object({
      charge_id: z.string().nullish(),
      checkout_id: z.string().nullish(),
      reference: z.string().nullish(),
      status: z.string().nullish(),
      payment_status: z.string().nullish(),
      amount: z.string().nullish(),
      currency: z.string().nullish(),
      charge: z.object({ id: z.string().nullish(), status: z.string().nullish() }).nullish()
    })
    .passthrough()
})
export type WebhookEvent = z.infer<typeof WebhookEvent>

export const nairaFromAmount = (amount: string | null | undefined) => {
  const value = Number(amount)
  return Number.isFinite(value) ? value : null
}
