import { Context, Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { randomUUID } from "node:crypto"
import { readFile, rm } from "node:fs/promises"
import { BadRequest, Collection, NotFound, Product, ProductImage, type ProductInput } from "../shared/api.ts"
import { Photos } from "./Photos.ts"

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
  url: string
  storage_key: string | null
  position: number
}

export interface Upload {
  readonly path: string
  readonly contentType: string
}

// SVG is left out on purpose: uploads are served from the admin's own origin.
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif"
}

export const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")

const toProduct = (row: ProductRow, images: ReadonlyArray<ImageRow>) =>
  new Product({
    id: row.id,
    collectionSlug: row.collection_slug,
    slug: row.slug,
    name: row.name,
    price: row.price,
    priceNote: row.price_note,
    description: row.description,
    sizes: JSON.parse(row.sizes) as Array<string>,
    visible: row.visible === 1,
    images: images.map((image) => new ProductImage({ id: image.id, url: image.url }))
  })

export class Catalog extends Context.Service<Catalog, {
  readonly collections: Effect.Effect<Array<Collection>>
  createCollection(name: string): Effect.Effect<Collection, BadRequest>
  readonly products: Effect.Effect<Array<Product>>
  createProduct(input: ProductInput): Effect.Effect<Product, BadRequest>
  updateProduct(id: string, input: ProductInput): Effect.Effect<Product, NotFound | BadRequest>
  removeProduct(id: string): Effect.Effect<void, NotFound>
  addImages(id: string, uploads: ReadonlyArray<Upload>): Effect.Effect<Product, NotFound | BadRequest>
  orderImages(id: string, imageIds: ReadonlyArray<string>): Effect.Effect<Product, NotFound>
  removeImage(id: string, imageId: string): Effect.Effect<Product, NotFound>
}>()("zuch/Catalog") {
  static readonly layer = Layer.effect(
    Catalog,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const photos = yield* Photos

      const imagesFor = (id: string) =>
        sql<ImageRow>`SELECT * FROM product_images WHERE product_id = ${id} ORDER BY position`.pipe(Effect.orDie)

      const productRow = (id: string) =>
        sql<ProductRow>`SELECT * FROM products WHERE id = ${id}`.pipe(
          Effect.orDie,
          Effect.flatMap(([row]) =>
            row ? Effect.succeed(row) : Effect.fail(new NotFound({ message: "Product not found" }))
          )
        )

      const load = (id: string) =>
        Effect.gen(function*() {
          const row = yield* productRow(id)
          return toProduct(row, yield* imagesFor(id))
        })

      const collections = sql<{ slug: string; name: string }>`SELECT slug, name FROM collections ORDER BY name`.pipe(
        Effect.map((rows) => rows.map((row) => new Collection(row))),
        Effect.orDie
      )

      const createCollection = Effect.fn("Catalog.createCollection")(function*(name: string) {
        const slug = slugify(name)
        if (!slug) return yield* new BadRequest({ message: "Give the collection a name" })
        const existing = yield* sql`SELECT slug FROM collections WHERE slug = ${slug}`.pipe(Effect.orDie)
        if (existing.length > 0) return yield* new BadRequest({ message: "That collection already exists" })
        yield* sql`INSERT INTO collections (slug, name) VALUES (${slug}, ${name.trim()})`.pipe(Effect.orDie)
        return new Collection({ slug, name: name.trim() })
      })

      const products = Effect.gen(function*() {
        const rows = yield* sql<ProductRow>`
          SELECT * FROM products ORDER BY visible DESC, collection_slug, created_at, name
        `.pipe(Effect.orDie)
        const images = yield* sql<ImageRow>`SELECT * FROM product_images ORDER BY position`.pipe(Effect.orDie)
        return rows.map((row) => toProduct(row, images.filter((image) => image.product_id === row.id)))
      })

      const requireCollection = (slug: string) =>
        sql`SELECT slug FROM collections WHERE slug = ${slug}`.pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows.length > 0 ? Effect.void : Effect.fail(new BadRequest({ message: "Pick a collection" }))
          )
        )

      // Product URLs and photo folders use the slug, so it stays fixed after a rename.
      const uniqueSlug = (collectionSlug: string, name: string) =>
        Effect.gen(function*() {
          const base = slugify(name) || "product"
          const taken = yield* sql<{ slug: string }>`
            SELECT slug FROM products WHERE collection_slug = ${collectionSlug}
          `.pipe(Effect.orDie)
          const slugs = new Set(taken.map((row) => row.slug))
          let slug = base
          for (let n = 2; slugs.has(slug); n++) slug = `${base}-${n}`
          return slug
        })

      const createProduct = Effect.fn("Catalog.createProduct")(function*(input: ProductInput) {
        yield* requireCollection(input.collectionSlug)
        const id = randomUUID()
        const slug = yield* uniqueSlug(input.collectionSlug, input.name)
        yield* sql`
          INSERT INTO products (id, collection_slug, slug, name, price, price_note, description, sizes, visible, created_at)
          VALUES (
            ${id}, ${input.collectionSlug}, ${slug}, ${input.name}, ${input.price}, ${input.priceNote},
            ${input.description}, ${JSON.stringify(input.sizes)}, ${input.visible ? 1 : 0}, ${new Date().toISOString()}
          )
        `.pipe(Effect.orDie)
        return yield* load(id).pipe(Effect.orDie)
      })

      const updateProduct = Effect.fn("Catalog.updateProduct")(function*(id: string, input: ProductInput) {
        const row = yield* productRow(id)
        yield* requireCollection(input.collectionSlug)
        const slug = row.collection_slug === input.collectionSlug
          ? row.slug
          : yield* uniqueSlug(input.collectionSlug, row.slug)
        yield* sql`
          UPDATE products SET
            collection_slug = ${input.collectionSlug}, slug = ${slug}, name = ${input.name}, price = ${input.price},
            price_note = ${input.priceNote}, description = ${input.description},
            sizes = ${JSON.stringify(input.sizes)}, visible = ${input.visible ? 1 : 0}
          WHERE id = ${id}
        `.pipe(Effect.orDie)
        return yield* load(id)
      })

      const removeStored = (images: ReadonlyArray<ImageRow>) =>
        Effect.forEach(images, (image) => image.storage_key ? photos.remove(image.storage_key) : Effect.void, {
          discard: true
        })

      const removeProduct = Effect.fn("Catalog.removeProduct")(function*(id: string) {
        yield* productRow(id)
        const images = yield* imagesFor(id)
        yield* sql`DELETE FROM product_images WHERE product_id = ${id}`.pipe(Effect.orDie)
        yield* sql`DELETE FROM products WHERE id = ${id}`.pipe(Effect.orDie)
        yield* removeStored(images)
      })

      const addImages = Effect.fn("Catalog.addImages")(function*(id: string, uploads: ReadonlyArray<Upload>) {
        const row = yield* productRow(id)
        const unsupported = uploads.find((upload) => !IMAGE_EXTENSIONS[upload.contentType])
        if (unsupported) {
          return yield* new BadRequest({ message: "Photos must be JPG, PNG, WebP or AVIF" })
        }

        const existing = yield* imagesFor(id)
        let position = existing.reduce((max, image) => Math.max(max, image.position + 1), 0)
        for (const upload of uploads) {
          const imageId = randomUUID()
          const key = `products/${row.collection_slug}/${row.slug}/${imageId}.${IMAGE_EXTENSIONS[upload.contentType]}`
          const body = yield* Effect.promise(() => readFile(upload.path))
          const url = yield* photos.put(key, body, upload.contentType)
          yield* sql`
            INSERT INTO product_images (id, product_id, url, storage_key, position)
            VALUES (${imageId}, ${id}, ${url}, ${key}, ${position++})
          `.pipe(Effect.orDie)
          yield* Effect.promise(() => rm(upload.path, { force: true }))
        }
        return yield* load(id)
      })

      const orderImages = Effect.fn("Catalog.orderImages")(function*(id: string, imageIds: ReadonlyArray<string>) {
        yield* productRow(id)
        yield* Effect.forEach(
          imageIds,
          (imageId, position) =>
            sql`UPDATE product_images SET position = ${position} WHERE id = ${imageId} AND product_id = ${id}`.pipe(
              Effect.orDie
            ),
          { discard: true }
        )
        return yield* load(id)
      })

      const removeImage = Effect.fn("Catalog.removeImage")(function*(id: string, imageId: string) {
        yield* productRow(id)
        const [image] = yield* sql<ImageRow>`
          SELECT * FROM product_images WHERE id = ${imageId} AND product_id = ${id}
        `.pipe(Effect.orDie)
        if (!image) return yield* new NotFound({ message: "Photo not found" })
        yield* sql`DELETE FROM product_images WHERE id = ${imageId}`.pipe(Effect.orDie)
        yield* removeStored([image])
        return yield* load(id)
      })

      return Catalog.of({
        collections,
        createCollection,
        products,
        createProduct,
        updateProduct,
        removeProduct,
        addImages,
        orderImages,
        removeImage
      })
    })
  )
}
