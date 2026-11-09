import { newApp } from "../app.ts"
import { getProduct, listCollections, listProducts } from "../db/catalog.ts"

export const shop = newApp()

shop.get("/collections", async (c) => c.json(await listCollections(c.env.DB, { withVisibleProductsOnly: true })))

shop.get("/products", async (c) => c.json(await listProducts(c.env.DB, { visibleOnly: true })))

shop.get("/products/:id", async (c) => {
  const product = await getProduct(c.env.DB, c.req.param("id"))
  if (!product || !product.visible) return c.json({ message: "Product not found" }, 404)
  return c.json(product)
})
