import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { call, seedProduct } from "./helpers.ts"

describe("shop", () => {
  it("lists visible products with their photos and hides hidden ones", async () => {
    const shown = await seedProduct({ name: "Shown" })
    const hidden = await seedProduct({ name: "Hidden", visible: false })
    const { status, json } = await call("/api/products")
    expect(status).toBe(200)
    const ids = json.map((product: { id: string }) => product.id)
    expect(ids).toContain(shown.id)
    expect(ids).not.toContain(hidden.id)
    const product = json.find((p: { id: string }) => p.id === shown.id)
    expect(product.images[0].url).toBe(`/media/${shown.imageKey}`)
    expect(product.sizes).toEqual(["S", "M", "L"])
  })

  it("returns one product, and 404 for hidden or missing ones", async () => {
    const shown = await seedProduct()
    const hidden = await seedProduct({ visible: false })
    expect((await call(`/api/products/${shown.id}`)).status).toBe(200)
    expect((await call(`/api/products/${hidden.id}`)).status).toBe(404)
    expect((await call("/api/products/nope")).status).toBe(404)
  })

  it("lists only collections that have something on sale", async () => {
    await seedProduct({ collection: "alpha" })
    await env.DB.prepare("INSERT INTO collections (slug, name, position) VALUES ('empty', 'Empty', 9)").run()
    const slugs = (await call("/api/collections")).json.map((c: { slug: string }) => c.slug)
    expect(slugs).toContain("alpha")
    expect(slugs).not.toContain("empty")
  })

  it("serves photos from R2", async () => {
    await env.MEDIA.put("products/test/photo.jpg", new Uint8Array([1, 2, 3]), {
      httpMetadata: { contentType: "image/jpeg" }
    })
    const response = await (await import("../src/index.ts")).app.request("/media/products/test/photo.jpg", {}, env)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/jpeg")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })
})
