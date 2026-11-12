import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { call, chargeSuccess, contact, postWebhook, seedProduct } from "./helpers.ts"

const signIn = async () =>
  (await call("/api/admin/login", { method: "POST", body: { password: "admin-password" } })).cookie

const productInput = {
  collectionSlug: "poise",
  name: "New Kaftan",
  price: 70000,
  priceNote: "",
  description: "Linen",
  sizes: ["M", "L"],
  visible: true
}

describe("admin", () => {
  it("needs the password", async () => {
    expect((await call("/api/admin/products")).status).toBe(401)
    expect((await call("/api/admin/login", { method: "POST", body: { password: "guess" } })).status).toBe(401)
    const customer = (await call("/api/account/register", {
      method: "POST",
      body: { name: "Eve", email: "eve@example.com", password: "password123" }
    })).cookie
    expect((await call("/api/admin/products", { cookie: customer })).status).toBe(401)
    const admin = await signIn()
    expect(admin).toMatch(/^zuch_admin=/)
    expect((await call("/api/admin/products", { cookie: admin })).status).toBe(200)
  })

  it("is closed when no admin password is set", async () => {
    const unset = await call("/api/admin/login", { method: "POST", body: { password: "x" } }, { ADMIN_PASSWORD: "" })
    expect(unset.status).toBe(503)
  })

  it("sees hidden products and manages products and photos", async () => {
    const cookie = await signIn()
    const hidden = await seedProduct({ visible: false })
    const all = (await call("/api/admin/products", { cookie })).json
    expect(all.map((p: { id: string }) => p.id)).toContain(hidden.id)

    const created = await call("/api/admin/products", { method: "POST", cookie, body: productInput })
    expect(created.status).toBe(201)
    expect(created.json.slug).toBe("new-kaftan")

    const form = new FormData()
    form.append("files", new File([new Uint8Array([255, 216, 255])], "a.jpg", { type: "image/jpeg" }))
    form.append("files", new File([new Uint8Array([137, 80, 78])], "b.png", { type: "image/png" }))
    const uploaded = await call(`/api/admin/products/${created.json.id}/images`, { method: "POST", cookie, body: form })
    expect(uploaded.status).toBe(200)
    expect(uploaded.json.images).toHaveLength(2)
    const key = uploaded.json.images[0].url.replace("/media/", "")
    expect(await env.MEDIA.head(key)).not.toBeNull()

    const reversed = uploaded.json.images.map((i: { id: string }) => i.id).reverse()
    const reordered = await call(`/api/admin/products/${created.json.id}/images/order`, {
      method: "PUT",
      cookie,
      body: { imageIds: reversed }
    })
    expect(reordered.json.images[0].id).toBe(reversed[0])

    const text = new FormData()
    text.append("files", new File(["hi"], "x.txt", { type: "text/plain" }))
    expect((await call(`/api/admin/products/${created.json.id}/images`, { method: "POST", cookie, body: text })).status).toBe(400)

    const renamed = await call(`/api/admin/products/${created.json.id}`, {
      method: "PATCH",
      cookie,
      body: { ...productInput, name: "Renamed", price: null, priceNote: "Book Appointment" }
    })
    expect(renamed.json.name).toBe("Renamed")
    expect(renamed.json.slug).toBe("new-kaftan")

    expect((await call(`/api/admin/products/${created.json.id}`, { method: "DELETE", cookie })).status).toBe(204)
    expect(await env.MEDIA.head(key)).toBeNull()
  })

  it("adds collections without duplicates", async () => {
    const cookie = await signIn()
    expect((await call("/api/admin/collections", { method: "POST", cookie, body: { name: "Summer Drop" } })).json.slug)
      .toBe("summer-drop")
    expect((await call("/api/admin/collections", { method: "POST", cookie, body: { name: "summer drop" } })).status)
      .toBe(400)
  })

  it("moves paid orders along, but not unpaid ones", async () => {
    const cookie = await signIn()
    const product = await seedProduct()
    const unpaid = (await call("/api/checkout", {
      method: "POST",
      body: { items: [{ productId: product.id, quantity: 1, size: "M" }], contact }
    })).json
    const paid = (await call("/api/checkout", {
      method: "POST",
      body: { items: [{ productId: product.id, quantity: 1, size: "M" }], contact }
    })).json
    await postWebhook(chargeSuccess(paid.number, 45000))

    const orders = (await call("/api/admin/orders", { cookie })).json
    const unpaidId = orders.find((o: { number: string }) => o.number === unpaid.number).id
    const paidId = orders.find((o: { number: string }) => o.number === paid.number).id

    const blocked = await call(`/api/admin/orders/${unpaidId}`, { method: "PATCH", cookie, body: { status: "in_progress" } })
    expect(blocked.status).toBe(409)
    const moved = await call(`/api/admin/orders/${paidId}`, {
      method: "PATCH",
      cookie,
      body: { status: "in_progress", note: "Measured" }
    })
    expect(moved.json.status).toBe("in_progress")
    expect(moved.json.note).toBe("Measured")
    expect((await call(`/api/orders/lookup`, { method: "POST", body: { number: paid.number, email: contact.email } })).json.status)
      .toBe("in_progress")
  })
})
