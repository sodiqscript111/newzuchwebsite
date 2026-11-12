import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import app from "../src/index.ts"
import { call, chargeSuccess, contact, orderStatus, postWebhook, seedProduct, signWebhook } from "./helpers.ts"

const newOrder = async (price = 45000) => {
  const product = await seedProduct({ price })
  const { json } = await call("/api/checkout", {
    method: "POST",
    body: { items: [{ productId: product.id, quantity: 1, size: "M" }], contact }
  })
  return json.number as string
}

describe("Paystack webhook", () => {
  it("marks the order paid on charge.success signed with the webhook secret", async () => {
    const number = await newOrder()
    expect(await postWebhook(chargeSuccess(number, 45000))).toBe(200)
    expect((await orderStatus(number)).status).toBe("paid")
  })

  it("accepts the older x-paystack-signature, signed with the secret key", async () => {
    const number = await newOrder()
    const status = await postWebhook(
      chargeSuccess(number, 45000),
      { style: "secret-key", secret: "sk_test_key" },
      { PAYSTACK_SECRET_KEY: "sk_test_key", PAYSTACK_WEBHOOK_SECRET: "" }
    )
    expect(status).toBe(200)
    expect((await orderStatus(number)).status).toBe("paid")
  })

  it("rejects a wrong signature, a wrong secret key or an old timestamp", async () => {
    const number = await newOrder()
    expect(await postWebhook(chargeSuccess(number, 45000), { secret: "whsec_someone_else" })).toBe(401)
    expect(await postWebhook(chargeSuccess(number, 45000), { timestamp: Math.floor(Date.now() / 1000) - 3600 })).toBe(401)
    expect(
      await postWebhook(
        chargeSuccess(number, 45000),
        { style: "secret-key", secret: "sk_test_other" },
        { PAYSTACK_SECRET_KEY: "sk_test_key", PAYSTACK_WEBHOOK_SECRET: "" }
      )
    ).toBe(401)
    const unsigned = await app.request(
      "/api/webhooks/paystack",
      { method: "POST", body: JSON.stringify(chargeSuccess(number, 45000)) },
      env
    )
    expect(unsigned.status).toBe(401)
    expect((await orderStatus(number)).status).toBe("awaiting_payment")
  })

  it("rejects a body changed after signing", async () => {
    const number = await newOrder()
    const signed = await signWebhook(chargeSuccess(number, 45000))
    const tampered = await app.request(
      "/api/webhooks/paystack",
      { method: "POST", headers: signed.headers, body: signed.body.replace("4500000", "4500001") },
      env
    )
    expect(tampered.status).toBe(401)
  })

  it("doesn't mark a short or non-naira payment as paid, and leaves a note", async () => {
    const short = await newOrder(45000)
    expect(await postWebhook(chargeSuccess(short, 100))).toBe(200)
    const order = await orderStatus(short)
    expect(order.status).toBe("awaiting_payment")
    expect(order.note).toMatch(/Check in Paystack/)

    const dollars = await newOrder(45000)
    const usd = chargeSuccess(dollars, 45000)
    usd.data.currency = "USD"
    await postWebhook(usd)
    expect((await orderStatus(dollars)).status).toBe("awaiting_payment")
  })

  it("handles the same event twice without changes", async () => {
    const number = await newOrder()
    const event = chargeSuccess(number, 45000)
    expect(await postWebhook(event)).toBe(200)
    const again = await signWebhook(event)
    const response = await app.request("/api/webhooks/paystack", { method: "POST", headers: again.headers, body: again.body }, env)
    expect(await response.json()).toEqual({ received: true, duplicate: true })
  })

  it("ignores other events and unknown orders", async () => {
    const number = await newOrder()
    expect(await postWebhook({ event: "transfer.success", data: { reference: number, amount: 1 } })).toBe(200)
    expect((await orderStatus(number)).status).toBe("awaiting_payment")
    expect(await postWebhook(chargeSuccess("ZC-NOTREAL", 45000))).toBe(200)
  })

  it("a payment after a failure still counts", async () => {
    const product = await seedProduct()
    const { json } = await call("/api/checkout", {
      method: "POST",
      body: { items: [{ productId: product.id, quantity: 1, size: "M" }], contact }
    })
    await call(json.checkoutUrl.replace("?", "/failed?"), { method: "POST" })
    expect((await orderStatus(json.number)).status).toBe("payment_failed")
    await postWebhook(chargeSuccess(json.number, 45000))
    expect((await orderStatus(json.number)).status).toBe("paid")
  })
})
