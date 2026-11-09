import type { Collection, Product, ProductInput } from "../../model/product.ts"
import { newId } from "../lib/crypto.ts"
import { nowIso } from "../lib/http.ts"

interface ProductRow {
  id: string
  collection_slug: string
  slug: string
  name: string
  price: number | null
  price_note: string
  description: string
  sizes: string
  visible: number
}

interface ImageRow {
  id: string
  product_id: string
  key: string
  position: number
}

export const mediaUrl = (key: string) => `/media/${key}`

export const slugify = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")

const toProduct = (row: ProductRow, images: ReadonlyArray<ImageRow>) =>
  ({
    id: row.id,
    slug: row.slug,
    collectionSlug: row.collection_slug,
    name: row.name,
    price: row.price,
    priceNote: row.price_note,
    description: row.description,
    sizes: JSON.parse(row.sizes),
    visible: row.visible === 1,
    images: images.map((image) => ({ id: image.id, url: mediaUrl(image.key) }))
  }) as Product

export const listCollections = async (db: D1Database, options: { withVisibleProductsOnly: boolean }) => {
  const sql = options.withVisibleProductsOnly
    ? `SELECT slug, name FROM collections c
       WHERE EXISTS (SELECT 1 FROM products p WHERE p.collection_slug = c.slug AND p.visible = 1)
       ORDER BY position, name`
    : "SELECT slug, name FROM collections ORDER BY position, name"
  const { results } = await db.prepare(sql).all<Collection>()
  return results
}

export const createCollection = async (db: D1Database, name: string) => {
  const slug = slugify(name)
  if (!slug) return { error: "Give the collection a name" } as const
  const existing = await db.prepare("SELECT slug FROM collections WHERE slug = ?").bind(slug).first()
  if (existing) return { error: "That collection already exists" } as const
  const { position } = (await db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS position FROM collections").first<{
    position: number
  }>())!
  await db.prepare("INSERT INTO collections (slug, name, position) VALUES (?, ?, ?)").bind(slug, name, position).run()
  return { collection: { slug, name } as Collection } as const
}

export const listProducts = async (db: D1Database, options: { visibleOnly: boolean }) => {
  const where = options.visibleOnly ? "WHERE p.visible = 1" : ""
  const [products, images] = await db.batch([
    db.prepare(
      `SELECT p.* FROM products p JOIN collections c ON c.slug = p.collection_slug ${where}
       ORDER BY p.visible DESC, c.position, p.created_at, p.name`
    ),
    db.prepare("SELECT * FROM product_images ORDER BY position")
  ])
  const byProduct = Map.groupBy(images!.results as ImageRow[], (image) => image.product_id)
  return (products!.results as ProductRow[]).map((row) => toProduct(row, byProduct.get(row.id) ?? []))
}

export const getProduct = async (db: D1Database, id: string) => {
  const [product, images] = await db.batch([
    db.prepare("SELECT * FROM products WHERE id = ?").bind(id),
    db.prepare("SELECT * FROM product_images WHERE product_id = ? ORDER BY position").bind(id)
  ])
  const row = product!.results[0] as ProductRow | undefined
  return row ? toProduct(row, images!.results as ImageRow[]) : null
}

const collectionExists = async (db: D1Database, slug: string) =>
  (await db.prepare("SELECT 1 FROM collections WHERE slug = ?").bind(slug).first()) !== null

const uniqueSlug = async (db: D1Database, collectionSlug: string, name: string, exceptId?: string) => {
  const base = slugify(name) || "product"
  const { results } = await db
    .prepare("SELECT slug FROM products WHERE collection_slug = ? AND id != ?")
    .bind(collectionSlug, exceptId ?? "")
    .all<{ slug: string }>()
  const taken = new Set(results.map((row) => row.slug))
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`
  return slug
}

export const createProduct = async (db: D1Database, input: ProductInput) => {
  if (!(await collectionExists(db, input.collectionSlug))) return null
  const id = newId()
  const slug = await uniqueSlug(db, input.collectionSlug, input.name)
  await db
    .prepare(
      `INSERT INTO products (id, collection_slug, slug, name, price, price_note, description, sizes, visible, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.collectionSlug,
      slug,
      input.name,
      input.price,
      input.priceNote,
      input.description,
      JSON.stringify(input.sizes),
      input.visible ? 1 : 0,
      nowIso()
    )
    .run()
  return getProduct(db, id)
}

export const updateProduct = async (db: D1Database, id: string, input: ProductInput) => {
  const current = await getProduct(db, id)
  if (!current) return { error: "not_found" } as const
  if (!(await collectionExists(db, input.collectionSlug))) return { error: "bad_collection" } as const
  const slug = current.collectionSlug === input.collectionSlug
    ? current.slug
    : await uniqueSlug(db, input.collectionSlug, current.slug, id)
  await db
    .prepare(
      `UPDATE products SET collection_slug = ?, slug = ?, name = ?, price = ?, price_note = ?, description = ?,
       sizes = ?, visible = ? WHERE id = ?`
    )
    .bind(
      input.collectionSlug,
      slug,
      input.name,
      input.price,
      input.priceNote,
      input.description,
      JSON.stringify(input.sizes),
      input.visible ? 1 : 0,
      id
    )
    .run()
  return { product: (await getProduct(db, id))! } as const
}

export const deleteProduct = async (db: D1Database, media: R2Bucket, id: string) => {
  const { results } = await db.prepare("SELECT key FROM product_images WHERE product_id = ?").bind(id).all<{
    key: string
  }>()
  const deleted = await db.batch([
    db.prepare("DELETE FROM product_images WHERE product_id = ?").bind(id),
    db.prepare("DELETE FROM products WHERE id = ?").bind(id)
  ])
  if (deleted[1]!.meta.changes === 0) return false
  if (results.length > 0) await media.delete(results.map((row) => row.key))
  return true
}

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif"
}

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024

export const addImages = async (db: D1Database, media: R2Bucket, product: Product, files: ReadonlyArray<File>) => {
  const unsupported = files.find((file) => !IMAGE_TYPES[file.type])
  if (unsupported) return { error: "Photos must be JPG, PNG, WebP or AVIF" } as const
  const tooBig = files.find((file) => file.size > MAX_PHOTO_BYTES)
  if (tooBig) return { error: "Each photo must be under 10 MB" } as const

  const { next } = (await db
    .prepare("SELECT COALESCE(MAX(position) + 1, 0) AS next FROM product_images WHERE product_id = ?")
    .bind(product.id)
    .first<{ next: number }>())!
  const statements = []
  for (const [index, file] of files.entries()) {
    const id = newId()
    const key = `products/${product.collectionSlug}/${product.slug}/${id}.${IMAGE_TYPES[file.type]}`
    await media.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" }
    })
    statements.push(
      db.prepare("INSERT INTO product_images (id, product_id, key, position) VALUES (?, ?, ?, ?)").bind(
        id,
        product.id,
        key,
        next + index
      )
    )
  }
  if (statements.length > 0) await db.batch(statements)
  return { product: (await getProduct(db, product.id))! } as const
}

export const reorderImages = async (db: D1Database, productId: string, imageIds: ReadonlyArray<string>) => {
  if (imageIds.length === 0) return
  await db.batch(
    imageIds.map((imageId, position) =>
      db.prepare("UPDATE product_images SET position = ? WHERE id = ? AND product_id = ?").bind(
        position,
        imageId,
        productId
      )
    )
  )
}

export const removeImage = async (db: D1Database, media: R2Bucket, productId: string, imageId: string) => {
  const image = await db
    .prepare("SELECT key FROM product_images WHERE id = ? AND product_id = ?")
    .bind(imageId, productId)
    .first<{ key: string }>()
  if (!image) return false
  await db.prepare("DELETE FROM product_images WHERE id = ?").bind(imageId).run()
  await media.delete(image.key)
  return true
}
