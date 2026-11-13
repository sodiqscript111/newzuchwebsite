import { env } from "cloudflare:workers"
import { afterEach, describe, expect, it, vi } from "vitest"
import worker from "../src/index.ts"
import { call, contact, orderStatus, seedProduct } from "./helpers.ts"

const withKey = { PAYSTACK_SECRET_KEY: "sk_test_key" }

afterEach(() => {
  vi.unstubAllGlobals()
})

const placeOrder = async () => {
  const product = await seedProduct({ price: 45000 })
  vi.stubGlobal("fetch", vi.fn(async () =>
    Response.json({ status: true, data: { authorization_url: "https://checkout.paystack.com/x", reference: "x" } })
  ))
  const { json } = await call(
    "/api/checkout",
    { method: "POST", body: { items: [{ productId: product.id, quantity: 1, size: "M" }], contact } },
    withKey
  )
  return json.number as string
}

const paystackSaysPaid = () =>
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const reference = decodeURIComponent(String(url).split("/").pop()!)
    return Response.json({ status: true, data: { id: 1, status: "success", reference, amount: 4500000, currency: "NGN" } })
  }))

describe("payments confirmed without the webhook", () => {
  it("the admin's Orders page checks unpaid orders with Paystack", async () => {
    const number = await placeOrder()
    paystackSaysPaid()
    const cookie = (await call("/api/admin/login", { method: "POST", body: { password: "admin-password" } })).cookie
    const orders = (await call("/api/admin/orders", { cookie }, withKey)).json
    expect(orders.find((o: { number: string }) => o.number === number).status).toBe("paid")
  })

  it("the scheduled task marks paid orders nobody has opened", async () => {
    const number = await placeOrder()
    paystackSaysPaid()
    const waits: Promise<unknown>[] = []
    const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException: () => {} }
    worker.scheduled({} as ScheduledController, { ...env, ...withKey }, ctx as unknown as ExecutionContext)
    await Promise.all(waits)
    expect((await orderStatus(number)).status).toBe("paid")
  })

  it("leaves old orders and orders Paystack hasn't confirmed alone", async () => {
    const recent = await placeOrder()
    await env.DB.prepare("UPDATE orders SET created_at = ? WHERE number = ?")
      .bind(new Date(Date.now() - 10 * 86_400_000).toISOString(), recent)
      .run()
    const pending = await placeOrder()
    const verify = vi.fn(async () =>
      Response.json({ status: true, data: { id: 2, status: "abandoned", reference: pending, amount: 4500000, currency: "NGN" } })
    )
    vi.stubGlobal("fetch", verify)
    const waits: Promise<unknown>[] = []
    worker.scheduled({} as ScheduledController, { ...env, ...withKey }, { waitUntil: (p: Promise<unknown>) => waits.push(p) } as unknown as ExecutionContext)
    await Promise.all(waits)
    expect((await orderStatus(pending)).status).toBe("awaiting_payment")
    expect((await orderStatus(recent)).status).toBe("awaiting_payment")
    const asked = verify.mock.calls.map((args) => String((args as unknown[])[0]))
    expect(asked.some((url) => url.endsWith(pending))).toBe(true)
    expect(asked.some((url) => url.endsWith(recent))).toBe(false)
  })
})
