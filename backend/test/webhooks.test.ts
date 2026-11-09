import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import app from "../src/index.ts"
import { call, contact, orderStatus, postWebhook, seedProduct, signWebhook } from "./helpers.ts"

const newOrder = async (price = 45000) => {
  const product = await seedProduct({ price })
  const { json } = await call("/api/checkout", {
    method: "POST",
    body: { items: [{ productId: product.id, quantity: 1, size: "M" }], contact }
  })
  return json.number as string
}

const succeeded = (number: string, amount = "45000.00", id = crypto.randomUUID()) => ({
  id: `evt_${id}`,
  type: "collection.succeeded",
  created_at: new Date().toISOString(),
  data: { charge_id: "ch_1", checkout_id: "chk_1", reference: number, status: "SUCCEEDED", amount, currency: "NGN" }
})

describe("Bachs webhook", () => {
  it("marks the order paid on a correctly signed success", async () => {
    const number = await newOrder()
    expect(await postWebhook(succeeded(number))).toBe(200)
    expect((await orderStatus(number)).status).toBe("paid")
  })

  it("also accepts checkout.completed with payment_status paid", async () => {
    const number = await newOrder()
    const event = {
      id: `evt_${crypto.randomUUID()}`,
      type: "checkout.completed",
      data: { checkout_id: "chk_2", reference: number, payment_status: "paid", amount: "45000.00", currency: "NGN" }
    }
    expect(await postWebhook(event)).toBe(200)
    expect((await orderStatus(number)).status).toBe("paid")
  })

  it("rejects a wrong signature or an old timestamp", async () => {
    const number = await newOrder()
    expect(await postWebhook(succeeded(number), { secret: "someone-else" })).toBe(401)
    expect(await postWebhook(succeeded(number), { timestamp: Math.floor(Date.now() / 1000) - 3600 })).toBe(401)
    const unsigned = await app.request("/api/webhooks/bachs", { method: "POST", body: JSON.stringify(succeeded(number)) }, env)
    expect(unsigned.status).toBe(401)
    expect((await orderStatus(number)).status).toBe("awaiting_payment")
  })

  it("rejects a body changed after signing", async () => {
    const number = await newOrder()
    const signed = await signWebhook(succeeded(number))
    const tampered = await app.request(
      "/api/webhooks/bachs",
      { method: "POST", headers: signed.headers, body: signed.body.replace("45000.00", "45000.01") },
      env
    )
    expect(tampered.status).toBe(401)
  })

  it("doesn't mark a short payment as paid, and leaves a note", async () => {
    const number = await newOrder(45000)
    expect(await postWebhook(succeeded(number, "100.00"))).toBe(200)
    const order = await orderStatus(number)
    expect(order.status).toBe("awaiting_payment")
    expect(order.note).toMatch(/Check in Bachs/)
  })

  it("handles the same event twice without changes", async () => {
    const number = await newOrder()
    const event = succeeded(number)
    expect(await postWebhook(event)).toBe(200)
    const again = await signWebhook(event)
    const response = await app.request("/api/webhooks/bachs", { method: "POST", headers: again.headers, body: again.body }, env)
    expect(await response.json()).toEqual({ received: true, duplicate: true })
  })

  it("records failures and expiry, but never undoes a payment", async () => {
    const failed = await newOrder()
    await postWebhook({ id: `evt_${crypto.randomUUID()}`, type: "collection.failed", data: { reference: failed } })
    expect((await orderStatus(failed)).status).toBe("payment_failed")

    const expired = await newOrder()
    await postWebhook({ id: `evt_${crypto.randomUUID()}`, type: "checkout.expired", data: { reference: expired } })
    expect((await orderStatus(expired)).status).toBe("expired")

    const paid = await newOrder()
    await postWebhook(succeeded(paid))
    await postWebhook({ id: `evt_${crypto.randomUUID()}`, type: "checkout.expired", data: { reference: paid } })
    expect((await orderStatus(paid)).status).toBe("paid")
  })

  it("a payment that arrives after a failure still counts", async () => {
    const number = await newOrder()
    await postWebhook({ id: `evt_${crypto.randomUUID()}`, type: "collection.failed", data: { reference: number } })
    await postWebhook(succeeded(number))
    expect((await orderStatus(number)).status).toBe("paid")
  })
})
