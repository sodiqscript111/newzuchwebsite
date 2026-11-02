// Loads the product catalog into the admin database, then copies each photo into
// Photos (the bucket or the local data folder). ImgBB refuses bursts of requests, so a page
// of hotlinked photos loads half blank.
//
//   npm run seed                    products from ../scripts/images, then photos
//   npm run seed -- --sample-orders also adds made-up orders to try the Orders page
//
// Safe to re-run: products only load into an empty catalog, so edits are kept, and
// photo copying picks up the ones still on their old links. ImgBB fails often, so
// a second run is normal. Photos in manifest.json are already in the bucket and are linked
// directly.
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { randomUUID } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { DatabaseLive } from "./Database.ts"
import { Photos } from "./Photos.ts"

const REPO_ROOT = path.resolve(import.meta.dirname, "../..")
const IMAGES_DIR = path.join(REPO_ROOT, "scripts/images")

interface CatalogImage {
  readonly source: "remote" | "local"
  readonly url?: string
  readonly path?: string
}

interface CatalogProduct {
  readonly slug: string
  readonly name: string
  readonly price: number | null
  readonly priceNote?: string
  readonly description: string
  readonly sizes: ReadonlyArray<string> | string
  readonly images: ReadonlyArray<CatalogImage>
}

interface CatalogCollection {
  readonly slug: string
  readonly name: string
  readonly listed: boolean
  readonly products: ReadonlyArray<CatalogProduct>
}

interface ManifestCollection {
  readonly slug: string
  readonly products: ReadonlyArray<{
    readonly slug: string
    readonly images: ReadonlyArray<{ readonly key: string; readonly url: string | null }>
  }>
}

const readJson = <A>(file: string) => JSON.parse(readFileSync(file, "utf8")) as A

const CONTENT_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" }

const extensionOf = (source: string) => path.extname(new URL(source, "file:///").pathname).slice(1).toLowerCase()

const photoKey = (collectionSlug: string, productSlug: string, position: number, extension: string) =>
  `products/${collectionSlug}/${productSlug}/${String(position + 1).padStart(2, "0")}.${extension}`

const seedProducts = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const photos = yield* Photos

  const [{ count }] = yield* sql<{ count: number }>`SELECT COUNT(*) AS count FROM products`
  if (count > 0) {
    yield* Effect.log(`Catalog already has ${count} products, leaving them alone`)
    return
  }

  // Old collections stay in the catalog and the bucket, but only current ones load.
  const collections = readJson<{ collections: ReadonlyArray<CatalogCollection> }>(
    path.join(IMAGES_DIR, "catalog.json")
  ).collections.filter((collection) => collection.listed)
  const manifestFile = path.join(IMAGES_DIR, "manifest.json")
  const manifest = existsSync(manifestFile)
    ? readJson<{ collections: ReadonlyArray<ManifestCollection> }>(manifestFile).collections
    : []

  let imageCount = 0
  for (const collection of collections) {
    yield* sql`INSERT INTO collections (slug, name) VALUES (${collection.slug}, ${collection.name})`
    const uploaded = manifest.find((c) => c.slug === collection.slug)?.products

    for (const product of collection.products) {
      const productId = randomUUID()
      const sizes = typeof product.sizes === "string" ? [product.sizes] : product.sizes
      yield* sql`
        INSERT INTO products (id, collection_slug, slug, name, price, price_note, description, sizes, visible, created_at)
        VALUES (
          ${productId}, ${collection.slug}, ${product.slug}, ${product.name}, ${product.price},
          ${product.priceNote?.startsWith("placeholder") ? "Placeholder price" : (product.priceNote ?? "")},
          ${product.description}, ${JSON.stringify(sizes)}, ${collection.listed ? 1 : 0}, ${new Date().toISOString()}
        )
      `

      const inBucket = uploaded?.find((p) => p.slug === product.slug)?.images
      for (const [position, image] of product.images.entries()) {
        const stored = inBucket?.[position]
        let url = stored?.url ?? image.url ?? null
        let key = stored?.url ? stored.key : null

        if (!stored?.url && image.path) {
          const extension = extensionOf(image.path)
          key = photoKey(collection.slug, product.slug, position, extension)
          url = yield* photos.put(key, readFileSync(path.join(REPO_ROOT, image.path)), CONTENT_TYPES[extension])
        }
        if (!url) continue

        yield* sql`
          INSERT INTO product_images (id, product_id, url, storage_key, position)
          VALUES (${randomUUID()}, ${productId}, ${url}, ${key}, ${position})
        `
        imageCount++
      }
    }
  }

  const productCount = collections.reduce((n, c) => n + c.products.length, 0)
  yield* Effect.log(`Added ${collections.length} collections, ${productCount} products and ${imageCount} images`)
})

// ImgHippo answers 403 to requests without a browser user agent.
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

// ImgBB can stall for 30 seconds before answering 503, so the limit has to outlast that.
const download = async (url: string) => {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(45_000) })
      const contentType = response.headers.get("content-type") ?? ""
      if (!response.ok || !contentType.startsWith("image/")) throw new Error(`HTTP ${response.status}`)
      return new Uint8Array(await response.arrayBuffer())
    } catch (error) {
      if (attempt === 3) throw error
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt))
    }
  }
}

const copyHostedPhotos = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const photos = yield* Photos

  const waiting = yield* sql<{ id: string; url: string; position: number; slug: string; collection_slug: string }>`
    SELECT i.id, i.url, i.position, p.slug, p.collection_slug
    FROM product_images i JOIN products p ON p.id = i.product_id
    WHERE i.storage_key IS NULL
  `
  if (waiting.length === 0) return

  yield* Effect.log(`Copying ${waiting.length} photos from ImgBB and ImgHippo...`)
  let copied = 0
  yield* Effect.forEach(
    waiting,
    (image) =>
      Effect.gen(function*() {
        const body = yield* Effect.tryPromise(() => download(image.url))
        const extension = extensionOf(image.url)
        const key = photoKey(image.collection_slug, image.slug, image.position, extension)
        const url = yield* photos.put(key, body, CONTENT_TYPES[extension] ?? "image/jpeg")
        yield* sql`UPDATE product_images SET url = ${url}, storage_key = ${key} WHERE id = ${image.id}`
        copied++
        if (copied % 10 === 0) yield* Effect.log(`  ${copied}/${waiting.length}`)
      }).pipe(
        Effect.catch(() => Effect.logWarning(`Could not copy ${image.url} yet`))
      ),
    { concurrency: 3, discard: true }
  )

  const left = waiting.length - copied
  yield* Effect.log(
    left === 0
      ? `Copied all ${copied} photos`
      : `Copied ${copied} photos. ${left} still use their old links; run npm run seed again to retry them`
  )
})

const seedSampleOrders = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const [{ count }] = yield* sql<{ count: number }>`SELECT COUNT(*) AS count FROM orders`
  if (count > 0) {
    yield* Effect.log(`There are already ${count} orders, not adding samples`)
    return
  }

  const picture = (slug: string) =>
    sql<{ url: string }>`
      SELECT i.url FROM product_images i JOIN products p ON p.id = i.product_id
      WHERE p.slug = ${slug} ORDER BY i.position LIMIT 1
    `.pipe(Effect.map(([row]) => row?.url ?? null))

  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

  const samples = [
    {
      reference: "SAMPLE-1001",
      email: "sample.buyer.one@example.com",
      phone: "+234 800 000 0001",
      address: "1 Sample Street, Lekki, Lagos",
      status: "new",
      createdAt: hoursAgo(3),
      items: [
        { name: "Poise (Black)", quantity: 1, imageUrl: yield* picture("poise-black"), options: { size: "L" } },
        { name: "Alpha 01", quantity: 2, imageUrl: yield* picture("alpha-01"), options: { size: "M" } }
      ]
    },
    {
      reference: "SAMPLE-1002",
      email: "sample.buyer.two@example.com",
      phone: "+234 800 000 0002",
      address: "2 Example Close, Wuse II, Abuja",
      status: "new",
      createdAt: hoursAgo(20),
      items: [
        {
          name: "Y-Cut Kaftan",
          quantity: 1,
          imageUrl: yield* picture("y-cut-kaftan"),
          options: { chest: "44", waist: "36", hips: "42", length: "58" }
        }
      ]
    },
    {
      reference: "SAMPLE-1003",
      email: "sample.buyer.three@example.com",
      phone: "+234 800 000 0003",
      address: "3 Test Avenue, Port Harcourt",
      status: "in_progress",
      createdAt: hoursAgo(52),
      items: [{ name: "Black", quantity: 1, imageUrl: yield* picture("black"), options: { size: "XL" } }]
    },
    {
      reference: "SAMPLE-1004",
      email: "sample.buyer.four@example.com",
      phone: "+234 800 000 0004",
      address: "4 Demo Road, Ikeja, Lagos",
      status: "done",
      createdAt: hoursAgo(120),
      items: [{ name: "Vogue Jalabiya 02", quantity: 1, imageUrl: yield* picture("vogue-jalabiya-02"), options: { size: "M" } }]
    }
  ]

  for (const order of samples) {
    yield* sql`
      INSERT INTO orders (id, reference, email, phone, address, items, status, is_sample, created_at, handled_at)
      VALUES (
        ${randomUUID()}, ${order.reference}, ${order.email}, ${order.phone}, ${order.address},
        ${JSON.stringify(order.items)}, ${order.status}, 1, ${order.createdAt},
        ${order.status === "done" ? hoursAgo(96) : null}
      )
    `
  }
  yield* Effect.log(`Added ${samples.length} sample orders`)
})

const program = Effect.gen(function*() {
  yield* seedProducts
  yield* copyHostedPhotos
  if (process.argv.includes("--sample-orders")) yield* seedSampleOrders
})

program.pipe(
  Effect.provide(Layer.merge(DatabaseLive, Photos.layer)),
  NodeRuntime.runMain
)
