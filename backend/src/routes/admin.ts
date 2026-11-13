import { z } from "zod"
import { AdminLogin } from "../../model/account.ts"
import { AdminOrderUpdate } from "../../model/order.ts"
import { CollectionInput, ProductInput } from "../../model/product.ts"
import { newApp } from "../app.ts"
import {
  addImages,
  createCollection,
  createProduct,
  deleteProduct,
  getProduct,
  listCollections,
  listProducts,
  removeImage,
  reorderImages,
  updateProduct
} from "../db/catalog.ts"
import { listAdminOrders, updateAdminOrder } from "../db/orders.ts"
import { sha256Hex, timingSafeEqual } from "../lib/crypto.ts"
import { readJson } from "../lib/http.ts"
import { syncRecentPayments } from "../payments.ts"
import { endSession, readSession, startSession } from "../lib/session.ts"

export const admin = newApp()

admin.post("/login", async (c) => {
  if (!c.env.ADMIN_PASSWORD) return c.json({ message: "The admin password hasn't been set" }, 503)
  const { password } = await readJson(c, AdminLogin)
  const matches = timingSafeEqual(await sha256Hex(password), await sha256Hex(c.env.ADMIN_PASSWORD))
  if (!matches) return c.json({ message: "Wrong password" }, 401)
  await startSession(c, "admin", null)
  return c.body(null, 204)
})

admin.post("/logout", async (c) => {
  await endSession(c, "admin")
  return c.body(null, 204)
})

admin.use("*", async (c, next) => {
  if (!(await readSession(c, "admin"))) return c.json({ message: "Sign in to the admin" }, 401)
  await next()
})

admin.get("/me", (c) => c.json({ signedIn: true }))

admin.get("/orders", async (c) => {
  await syncRecentPayments(c.env)
  return c.json(await listAdminOrders(c.env.DB))
})

admin.patch("/orders/:id", async (c) => {
  const result = await updateAdminOrder(c.env.DB, c.req.param("id"), await readJson(c, AdminOrderUpdate))
  if (result.error === "not_found") return c.json({ message: "Order not found" }, 404)
  if (result.error === "unpaid") return c.json({ message: "This order hasn't been paid yet" }, 409)
  return c.json(result.order)
})

admin.get("/collections", async (c) => c.json(await listCollections(c.env.DB, { withVisibleProductsOnly: false })))

admin.post("/collections", async (c) => {
  const { name } = await readJson(c, CollectionInput)
  const result = await createCollection(c.env.DB, name)
  return "error" in result ? c.json({ message: result.error }, 400) : c.json(result.collection, 201)
})

admin.get("/products", async (c) => c.json(await listProducts(c.env.DB, { visibleOnly: false })))

admin.post("/products", async (c) => {
  const product = await createProduct(c.env.DB, await readJson(c, ProductInput))
  return product ? c.json(product, 201) : c.json({ message: "Pick a collection" }, 400)
})

admin.patch("/products/:id", async (c) => {
  const result = await updateProduct(c.env.DB, c.req.param("id"), await readJson(c, ProductInput))
  if ("error" in result) {
    return result.error === "not_found"
      ? c.json({ message: "Product not found" }, 404)
      : c.json({ message: "Pick a collection" }, 400)
  }
  return c.json(result.product)
})

admin.delete("/products/:id", async (c) => {
  const deleted = await deleteProduct(c.env.DB, c.env.MEDIA, c.req.param("id"))
  return deleted ? c.body(null, 204) : c.json({ message: "Product not found" }, 404)
})

admin.post("/products/:id/images", async (c) => {
  const product = await getProduct(c.env.DB, c.req.param("id"))
  if (!product) return c.json({ message: "Product not found" }, 404)
  const form = await c.req.formData().catch(() => null)
  const files = (form?.getAll("files") ?? []).filter((value): value is File => value instanceof File)
  if (files.length === 0) return c.json({ message: "Choose at least one photo" }, 400)
  const result = await addImages(c.env.DB, c.env.MEDIA, product, files)
  return "error" in result ? c.json({ message: result.error }, 400) : c.json(result.product)
})

admin.put("/products/:id/images/order", async (c) => {
  const id = c.req.param("id")
  const { imageIds } = await readJson(c, z.object({ imageIds: z.array(z.string()).max(50) }))
  if (!(await getProduct(c.env.DB, id))) return c.json({ message: "Product not found" }, 404)
  await reorderImages(c.env.DB, id, imageIds)
  return c.json(await getProduct(c.env.DB, id))
})

admin.delete("/products/:id/images/:imageId", async (c) => {
  const id = c.req.param("id")
  if (!(await removeImage(c.env.DB, c.env.MEDIA, id, c.req.param("imageId")))) {
    return c.json({ message: "Photo not found" }, 404)
  }
  return c.json(await getProduct(c.env.DB, id))
})
