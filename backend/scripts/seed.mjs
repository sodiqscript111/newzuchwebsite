// Loads the current products and their photos into D1 and R2.
//
//   npm run seed:local    the database and bucket used by `npm run dev`
//   npm run seed:remote   the live ones on Cloudflare (after `npx wrangler login`)
//
// Reads ../scripts/images/catalog.json and manifest.json, and only the collections that
// are on the site. Safe to re-run: nothing that already exists is replaced.
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const target = process.argv.includes("--remote") ? "--remote" : "--local"
const backend = path.resolve(import.meta.dirname, "..")
const images = path.resolve(backend, "../scripts/images")
const work = path.join(backend, "seed")
const wrangler = (...args) =>
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", ...args], {
    cwd: backend,
    stdio: ["ignore", "pipe", "inherit"],
    shell: process.platform === "win32",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" }
  })

const catalog = JSON.parse(readFileSync(path.join(images, "catalog.json"), "utf8"))
const manifest = JSON.parse(readFileSync(path.join(images, "manifest.json"), "utf8"))
const uploaded = new Map(
  manifest.collections.flatMap((c) => c.products.flatMap((p) => p.images.map((i) => [i.key, i.url])))
)

const sql = (value) => (value === null || value === undefined ? "NULL" : `'${String(value).replace(/'/g, "''")}'`)
const CONTENT_TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }

// A JPEG that stops before its end marker shows up half grey, so it is left out.
const isComplete = (bytes, key) => {
  if (!/\.jpe?g$/i.test(key)) return true
  let end = bytes.length
  while (end > 0 && (bytes[end - 1] === 0x00 || bytes[end - 1] === 0x0a || bytes[end - 1] === 0x0d)) end--
  return end >= 2 && bytes[end - 2] === 0xff && bytes[end - 1] === 0xd9
}

const download = async (url) => {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return new Uint8Array(await response.arrayBuffer())
    } catch (error) {
      if (attempt === 4) throw error
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt))
    }
  }
}

mkdirSync(work, { recursive: true })
const statements = []
const photos = []
const now = new Date().toISOString()
const collections = catalog.collections.filter((collection) => collection.listed)

for (const [position, collection] of collections.entries()) {
  statements.push(
    `INSERT OR IGNORE INTO collections (slug, name, position) VALUES (${sql(collection.slug)}, ${sql(collection.name)}, ${position});`
  )
  for (const product of collection.products) {
    const id = `${collection.slug}--${product.slug}`
    const sizes = typeof product.sizes === "string" ? [product.sizes] : product.sizes
    const note = product.priceNote?.startsWith("placeholder") ? "Placeholder price" : product.priceNote ?? ""
    statements.push(
      `INSERT OR IGNORE INTO products (id, collection_slug, slug, name, price, price_note, description, sizes, visible, created_at) VALUES (${sql(id)}, ${sql(collection.slug)}, ${sql(product.slug)}, ${sql(product.name)}, ${product.price ?? "NULL"}, ${sql(note)}, ${sql(product.description)}, ${sql(JSON.stringify(sizes))}, 1, ${sql(now)});`
    )
    for (const [index] of product.images.entries()) {
      const key = [...uploaded.keys()].find((k) => k.startsWith(`products/${collection.slug}/${product.slug}/${String(index + 1).padStart(2, "0")}.`))
      if (key) photos.push({ productId: id, key, url: uploaded.get(key), position: index })
    }
  }
}

console.log(`Downloading ${photos.length} photos...`)
const good = []
let next = 0
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < photos.length) {
    const photo = photos[next++]
    const bytes = await download(photo.url)
    if (!isComplete(bytes, photo.key)) {
      console.warn(`  Skipping damaged photo ${photo.key}`)
      continue
    }
    const file = path.join(work, "media", photo.key)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, bytes)
    good.push({ ...photo, file })
  }
}))

for (const photo of good) {
  statements.push(
    `INSERT OR IGNORE INTO product_images (id, product_id, key, position) VALUES (${sql(`${photo.productId}--${photo.position + 1}`)}, ${sql(photo.productId)}, ${sql(photo.key)}, ${photo.position});`
  )
}

const seedFile = path.join(work, "seed.sql")
writeFileSync(seedFile, statements.join("\n") + "\n")

console.log(`Applying migrations (${target})...`)
wrangler("d1", "migrations", "apply", "zuch", target)
console.log(`Loading ${collections.length} collections and their products...`)
wrangler("d1", "execute", "zuch", target, "--file", seedFile)

console.log(`Uploading ${good.length} photos to R2 (${target})...`)
for (const [index, photo] of good.entries()) {
  const extension = path.extname(photo.key).slice(1).toLowerCase()
  wrangler(
    "r2", "object", "put", `zuch-media/${photo.key}`,
    "--file", photo.file,
    "--content-type", CONTENT_TYPES[extension] ?? "application/octet-stream",
    target
  )
  if ((index + 1) % 10 === 0) console.log(`  ${index + 1}/${good.length}`)
}

const productCount = collections.reduce((n, c) => n + c.products.length, 0)
console.log(`Done: ${collections.length} collections, ${productCount} products, ${good.length} photos`)
