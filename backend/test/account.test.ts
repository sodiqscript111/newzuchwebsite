import { describe, expect, it } from "vitest"
import { call, contact, seedProduct } from "./helpers.ts"

const register = (email: string, password = "correct horse") =>
  call("/api/account/register", { method: "POST", body: { name: "Ada", email, password } })

describe("accounts", () => {
  it("registers, stays signed in, and signs out", async () => {
    const { status, json, cookie } = await register("reg@example.com")
    expect(status).toBe(201)
    expect(json.customer.email).toBe("reg@example.com")
    expect(cookie).toMatch(/^zuch_session=/)

    expect((await call("/api/account", { cookie })).json.customer.email).toBe("reg@example.com")
    await call("/api/account/logout", { method: "POST", cookie })
    expect((await call("/api/account", { cookie })).json.customer).toBeNull()
  })

  it("refuses a second account for the same email, in any letter case", async () => {
    await register("twice@example.com")
    const again = await register("TWICE@example.com")
    expect(again.status).toBe(409)
  })

  it("signs in with the right password only", async () => {
    await register("login@example.com", "right password")
    const wrong = await call("/api/account/login", {
      method: "POST",
      body: { email: "login@example.com", password: "wrong password" }
    })
    expect(wrong.status).toBe(401)
    const right = await call("/api/account/login", {
      method: "POST",
      body: { email: "Login@Example.com", password: "right password" }
    })
    expect(right.status).toBe(200)
    expect(right.cookie).toMatch(/^zuch_session=/)
  })

  it("rejects short passwords", async () => {
    const { status, json } = await register("short@example.com", "short")
    expect(status).toBe(400)
    expect(json.message).toBe("Use at least 8 characters")
  })

  it("shows customers only their own orders", async () => {
    const product = await seedProduct()
    const ada = (await register("ada-orders@example.com")).cookie
    const ben = (await register("ben-orders@example.com")).cookie
    const order = await call("/api/checkout", {
      method: "POST",
      cookie: ada,
      body: { items: [{ productId: product.id, quantity: 1, size: "M" }], contact }
    })
    await call("/api/checkout", {
      method: "POST",
      body: { items: [{ productId: product.id, quantity: 1, size: "M" }], contact }
    })

    const adaOrders = (await call("/api/account/orders", { cookie: ada })).json
    expect(adaOrders.map((o: { number: string }) => o.number)).toEqual([order.json.number])
    expect((await call("/api/account/orders", { cookie: ben })).json).toEqual([])
    expect((await call(`/api/account/orders/${order.json.number}`, { cookie: ben })).status).toBe(404)
    expect((await call(`/api/account/orders/${order.json.number}`, { cookie: ada })).status).toBe(200)
    expect((await call("/api/account/orders")).status).toBe(401)
  })
})
