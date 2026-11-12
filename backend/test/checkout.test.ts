import { afterEach, describe, expect, it, vi } from "vitest"
import { call, contact, orderStatus, seedProduct } from "./helpers.ts"

afterEach(() => {
  vi.unstubAllGlobals()
})

const checkoutWith = (items: unknown[], overrides = {}) => call("/api/checkout", { method: "POST", body: { items, contact } }, overrides)

describe("checkout", () => {
  it("prices the cart on the server and uses the pretend checkout locally", async () => {
    const a = await seedProduct({ price: 45000 })
    const b = await seedProduct({ price: 60000 })
    const { status, json } = await checkoutWith([
      { productId: a.id, quantity: 2, size: "M" },
      { productId: b.id, quantity: 1, measurements: { chest: 100, waist: 80, hips: 95, length: 140 } }
    ])
    expect(status).toBe(200)
    expect(json.number).toMatch(/^ZC-[A-Z2-9]{7}$/)
    expect(json.checkoutUrl).toMatch(/^\/api\/dev\/checkout\//)

    const order = await call(`/api${json.orderPath}`)
    expect(order.status).toBe(200)
    expect(order.json.total).toBe(150000)
    expect(order.json.status).toBe("awaiting_payment")
    expect(order.json.items).toHaveLength(2)
    expect(order.json.items[1].measurements).toEqual({ chest: 100, waist: 80, hips: 95, length: 140 })
  })

  it("ignores any price the browser sends", async () => {
    const product = await seedProduct({ price: 45000 })
    const { json } = await call("/api/checkout", {
      method: "POST",
      body: { items: [{ productId: product.id, quantity: 1, size: "M", price: 1 }], contact, total: 1 }
    })
    expect((await call(`/api${json.orderPath}`)).json.total).toBe(45000)
  })

  it("refuses hidden products, unpriced products and sizes the product doesn't come in", async () => {
    const hidden = await seedProduct({ visible: false })
    const unpriced = await seedProduct({ price: null })
    const small = await seedProduct({ sizes: ["S"] })
    expect((await checkoutWith([{ productId: hidden.id, quantity: 1, size: "M" }])).status).toBe(409)
    expect((await checkoutWith([{ productId: unpriced.id, quantity: 1, size: "M" }])).status).toBe(409)
    expect((await checkoutWith([{ productId: small.id, quantity: 1, size: "XL" }])).json.message).toMatch(/size XL/)
  })

  it("offers standard sizes when a product has none saved, like the shop page does", async () => {
    const product = await seedProduct({ sizes: [] })
    expect((await checkoutWith([{ productId: product.id, quantity: 1, size: "M" }])).status).toBe(200)
    expect((await checkoutWith([{ productId: product.id, quantity: 1, size: "XXL" }])).status).toBe(409)
  })

  it("needs exactly one of a size or measurements, and valid contact details", async () => {
    const product = await seedProduct()
    expect((await checkoutWith([{ productId: product.id, quantity: 1 }])).status).toBe(400)
    const bad = await call("/api/checkout", {
      method: "POST",
      body: { items: [{ productId: product.id, quantity: 1, size: "M" }], contact: { ...contact, email: "nope" } }
    })
    expect(bad.status).toBe(400)
    expect(bad.json.message).toBe("Enter a valid email")
  })

  it("pretend payment marks the order paid, and failure marks it failed", async () => {
    const product = await seedProduct()
    const paid = (await checkoutWith([{ productId: product.id, quantity: 1, size: "M" }])).json
    const pay = await call(`${paid.checkoutUrl.replace("?", "/paid?")}`, { method: "POST" })
    expect(pay.status).toBe(303)
    expect((await orderStatus(paid.number)).status).toBe("paid")

    const failed = (await checkoutWith([{ productId: product.id, quantity: 1, size: "M" }])).json
    await call(`${failed.checkoutUrl.replace("?", "/failed?")}`, { method: "POST" })
    expect((await orderStatus(failed.number)).status).toBe("payment_failed")
  })

  it("the pretend checkout doesn't exist outside development", async () => {
    const product = await seedProduct()
    const { json } = await checkoutWith([{ productId: product.id, quantity: 1, size: "M" }])
    const page = await call(json.checkoutUrl, {}, { ENVIRONMENT: "production" })
    expect(page.status).toBe(404)
    const refused = await checkoutWith([{ productId: product.id, quantity: 1, size: "M" }], { ENVIRONMENT: "production" })
    expect(refused.status).toBe(503)
  })

  it("starts a Paystack transaction for the server's total, in kobo", async () => {
    const product = await seedProduct({ price: 45000 })
    const fetchMock = vi.fn(async () =>
      Response.json({
        status: true,
        message: "Authorization URL created",
        data: { authorization_url: "https://checkout.paystack.com/abc123", access_code: "abc123", reference: "x" }
      })
    )
    vi.stubGlobal("fetch", fetchMock)
    const { status, json } = await checkoutWith([{ productId: product.id, quantity: 2, size: "M" }], {
      PAYSTACK_SECRET_KEY: "sk_test_key",
      ENVIRONMENT: "production"
    })
    expect(status).toBe(200)
    expect(json.checkoutUrl).toBe("https://checkout.paystack.com/abc123")

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://api.paystack.co/transaction/initialize")
    expect(init.method).toBe("POST")
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer sk_test_key")
    const body = JSON.parse(init.body as string)
    expect(body.amount).toBe("9000000")
    expect(body.currency).toBe("NGN")
    expect(body.reference).toBe(json.number)
    expect(body.email).toBe(contact.email)
    expect(body.callback_url).toBe(`https://shop.test${json.orderPath}`)
    expect(body.metadata.cancel_action).toBe("https://shop.test/cart")
  })

  it("tells the customer to retry when Paystack fails", async () => {
    const product = await seedProduct()
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })))
    const { status, json } = await checkoutWith([{ productId: product.id, quantity: 1, size: "M" }], {
      PAYSTACK_SECRET_KEY: "sk_test_key"
    })
    expect(status).toBe(502)
    expect(json.message).toMatch(/payment service/)
  })
})

describe("checking with Paystack when the customer comes back", () => {
  const placeOrder = async () => {
    const product = await seedProduct({ price: 45000 })
    const fetchMock = vi.fn(async () =>
      Response.json({ status: true, data: { authorization_url: "https://checkout.paystack.com/x", reference: "x" } })
    )
    vi.stubGlobal("fetch", fetchMock)
    const { json } = await checkoutWith([{ productId: product.id, quantity: 1, size: "M" }], {
      PAYSTACK_SECRET_KEY: "sk_test_key"
    })
    return json as { number: string; orderPath: string }
  }

  const paystackSays = (transaction: Record<string, unknown>) =>
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: true, message: "Verification successful", data: transaction })))

  it("marks the order paid when Paystack confirms the full amount", async () => {
    const order = await placeOrder()
    paystackSays({ id: 4099260516, status: "success", reference: order.number, amount: 4500000, currency: "NGN" })
    const seen = await call(`/api${order.orderPath}`, {}, { PAYSTACK_SECRET_KEY: "sk_test_key" })
    expect(seen.json.status).toBe("paid")
    const [url] = (fetch as unknown as { mock: { calls: [string][] } }).mock.calls[0]!
    expect(url).toBe(`https://api.paystack.co/transaction/verify/${order.number}`)
  })

  it("doesn't trust a short amount or an unfinished payment", async () => {
    const short = await placeOrder()
    paystackSays({ id: 1, status: "success", reference: short.number, amount: 100, currency: "NGN" })
    expect((await call(`/api${short.orderPath}`, {}, { PAYSTACK_SECRET_KEY: "sk_test_key" })).json.status)
      .toBe("awaiting_payment")

    const abandoned = await placeOrder()
    paystackSays({ id: 2, status: "abandoned", reference: abandoned.number, amount: 4500000, currency: "NGN" })
    expect((await call(`/api${abandoned.orderPath}`, {}, { PAYSTACK_SECRET_KEY: "sk_test_key" })).json.status)
      .toBe("awaiting_payment")
  })

  it("records a failed payment", async () => {
    const order = await placeOrder()
    paystackSays({ id: 3, status: "failed", reference: order.number, amount: 4500000, currency: "NGN" })
    expect((await call(`/api${order.orderPath}`, {}, { PAYSTACK_SECRET_KEY: "sk_test_key" })).json.status)
      .toBe("payment_failed")
  })

  it("still shows the order when Paystack can't be reached", async () => {
    const order = await placeOrder()
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })))
    const seen = await call(`/api${order.orderPath}`, {}, { PAYSTACK_SECRET_KEY: "sk_test_key" })
    expect(seen.status).toBe(200)
    expect(seen.json.status).toBe("awaiting_payment")
  })
})

describe("finding an order", () => {
  it("needs the right link, or the order number with its email", async () => {
    const product = await seedProduct()
    const { json } = await checkoutWith([{ productId: product.id, quantity: 1, size: "M" }])
    expect((await call(`/api/orders/${json.number}/wrong-token`)).status).toBe(404)

    const found = await call("/api/orders/lookup", {
      method: "POST",
      body: { number: json.number.toLowerCase(), email: "ADA@example.com" }
    })
    expect(found.status).toBe(200)
    expect(found.json.number).toBe(json.number)

    const wrongEmail = await call("/api/orders/lookup", { method: "POST", body: { number: json.number, email: "x@y.com" } })
    expect(wrongEmail.status).toBe(404)
  })
})
