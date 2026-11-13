import { env } from "cloudflare:workers"
import { afterEach, describe, expect, it, vi } from "vitest"
import { call, chargeSuccess, contact, postWebhook, seedProduct } from "./helpers.ts"

const withResend = { RESEND_API_KEY: "re_test_key" }

afterEach(() => {
  vi.unstubAllGlobals()
})

type Sent = { to: string[]; subject: string; html: string; text: string; from: string; reply_to?: string }

const captureEmails = () => {
  const sent: Sent[] = []
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url) === "https://api.resend.com/emails") {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer re_test_key")
      sent.push(JSON.parse(init!.body as string))
      return Response.json({ id: "email_1" })
    }
    return new Response("unexpected", { status: 500 })
  }))
  return sent
}

const newOrder = async () => {
  const product = await seedProduct({ price: 45000, name: "Poise <Black>" })
  const { json } = await call("/api/checkout", {
    method: "POST",
    body: { items: [{ productId: product.id, quantity: 2, size: "M" }], contact }
  })
  return json.number as string
}

describe("order emails", () => {
  it("emails the customer and the owner once when an order is paid", async () => {
    const number = await newOrder()
    const sent = captureEmails()
    expect(await postWebhook(chargeSuccess(number, 90000), {}, withResend)).toBe(200)

    expect(sent).toHaveLength(2)
    const customer = sent.find((m) => m.to[0] === contact.email)!
    expect(customer.subject).toBe(`Your Zuch order ${number} is confirmed`)
    expect(customer.from).toBe("Zuch <orders@shop.test>")
    expect(customer.text).toContain("₦90,000")
    expect(customer.text).toContain(`https://shop.test/track?number=${number}`)
    expect(customer.html).toContain("Poise &lt;Black&gt;")
    expect(customer.html).not.toContain("Poise <Black>")

    const owner = sent.find((m) => m.to[0] === "owner@shop.test")!
    expect(owner.subject).toBe(`New paid order ${number}: ₦90,000`)
    expect(owner.reply_to).toBe(contact.email)
    expect(owner.text).toContain(contact.phone)

    await postWebhook(chargeSuccess(number, 90000, 777), {}, withResend)
    expect(sent).toHaveLength(2)
  })

  it("sends nothing for an unpaid or short payment", async () => {
    const number = await newOrder()
    const sent = captureEmails()
    await postWebhook(chargeSuccess(number, 100), {}, withResend)
    expect(sent).toHaveLength(0)
  })

  it("still marks the order paid when there is no Resend key or Resend fails", async () => {
    const quiet = await newOrder()
    const fetchSpy = vi.fn(async () => new Response("down", { status: 500 }))
    vi.stubGlobal("fetch", fetchSpy)
    expect(await postWebhook(chargeSuccess(quiet, 90000))).toBe(200)
    expect(fetchSpy).not.toHaveBeenCalled()

    const failing = await newOrder()
    expect(await postWebhook(chargeSuccess(failing, 90000), {}, withResend)).toBe(200)
    const status = await env.DB.prepare("SELECT status FROM orders WHERE number = ?").bind(failing).first<{ status: string }>()
    expect(status!.status).toBe("paid")
  })
})

describe("password reset", () => {
  const register = (email: string) =>
    call("/api/account/register", { method: "POST", body: { name: "Ada", email, password: "first-password" } })

  it("emails a link that sets a new password once, and signs out other devices", async () => {
    const oldSession = (await register("reset@example.com")).cookie
    const sent = captureEmails()
    const asked = await call("/api/account/forgot", { method: "POST", body: { email: "Reset@Example.com" } }, withResend)
    expect(asked.status).toBe(200)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.to).toEqual(["reset@example.com"])
    const token = sent[0]!.text.match(/reset-password\/([A-Za-z0-9_-]+)/)![1]!

    const reset = await call("/api/account/reset", { method: "POST", body: { token, password: "second-password" } })
    expect(reset.status).toBe(200)
    expect(reset.cookie).toMatch(/^zuch_session=/)

    expect((await call("/api/account", { cookie: oldSession })).json.customer).toBeNull()
    const login = (password: string) =>
      call("/api/account/login", { method: "POST", body: { email: "reset@example.com", password } })
    expect((await login("first-password")).status).toBe(401)
    expect((await login("second-password")).status).toBe(200)

    const again = await call("/api/account/reset", { method: "POST", body: { token, password: "third-password" } })
    expect(again.status).toBe(400)
  })

  it("answers the same for unknown emails and sends nothing", async () => {
    const sent = captureEmails()
    const unknown = await call("/api/account/forgot", { method: "POST", body: { email: "nobody@example.com" } }, withResend)
    await register("known@example.com")
    const known = await call("/api/account/forgot", { method: "POST", body: { email: "known@example.com" } }, withResend)
    expect(unknown.json).toEqual(known.json)
    expect(sent.map((m) => m.to[0])).toEqual(["known@example.com"])
  })

  it("doesn't send a second link within two minutes", async () => {
    await register("twice-reset@example.com")
    const sent = captureEmails()
    await call("/api/account/forgot", { method: "POST", body: { email: "twice-reset@example.com" } }, withResend)
    await call("/api/account/forgot", { method: "POST", body: { email: "twice-reset@example.com" } }, withResend)
    expect(sent).toHaveLength(1)
  })

  it("refuses a made-up or expired token", async () => {
    expect((await call("/api/account/reset", { method: "POST", body: { token: "made-up-token-123", password: "whatever-123" } })).status)
      .toBe(400)
    await register("expired@example.com")
    const sent = captureEmails()
    await call("/api/account/forgot", { method: "POST", body: { email: "expired@example.com" } }, withResend)
    const token = sent[0]!.text.match(/reset-password\/([A-Za-z0-9_-]+)/)![1]!
    await env.DB.prepare("UPDATE password_resets SET expires_at = ?").bind(new Date(Date.now() - 1000).toISOString()).run()
    expect((await call("/api/account/reset", { method: "POST", body: { token, password: "new-password-1" } })).status).toBe(400)
  })
})
