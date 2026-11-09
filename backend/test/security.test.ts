import { afterEach, describe, expect, it, vi } from "vitest"
import { bayseHealthCheck } from "../src/bayse.ts"
import { call } from "./helpers.ts"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("requests from other sites", () => {
  it("blocks changes sent from another website", async () => {
    const response = await call(
      "/api/account/login",
      { method: "POST", body: { email: "a@b.com", password: "x" }, headers: { origin: "https://evil.example" } },
      { ENVIRONMENT: "production" }
    )
    expect(response.status).toBe(403)
  })

  it("allows the shop's own address", async () => {
    const response = await call(
      "/api/account/login",
      { method: "POST", body: { email: "a@b.com", password: "wrong-pass" }, headers: { origin: "https://shop.test" } },
      { ENVIRONMENT: "production" }
    )
    expect(response.status).toBe(401)
  })

  it("lets Bachs webhooks through from anywhere", async () => {
    const response = await call("/api/webhooks/bachs", {
      method: "POST",
      body: {},
      headers: { origin: "https://bachs.io" }
    })
    expect(response.status).toBe(401)
  })
})

describe("health", () => {
  it("answers ok", async () => {
    expect((await call("/api/health")).json).toEqual({ ok: true })
  })

  it("reports Bayse up or down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "ok" })))
    expect(await bayseHealthCheck("https://bayse.test")).toBe(true)
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })))
    expect(await bayseHealthCheck("https://bayse.test")).toBe(false)
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "down" })))
    expect(await bayseHealthCheck("https://bayse.test")).toBe(false)
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed")
    }))
    expect(await bayseHealthCheck("https://bayse.test")).toBe(false)
  })
})
