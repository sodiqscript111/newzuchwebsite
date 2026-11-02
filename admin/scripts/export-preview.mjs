// Snapshots the running admin into web/public/preview: the catalog as data.json, plus
// small copies of every photo. `npm run build:preview` turns that into a look-only site
// with no server, database or keys.
//
//   npm start                 in one terminal
//   npm run preview:export    in another
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import sharp from "sharp"

const BASE = process.env.ADMIN_URL ?? "http://localhost:4320"
const OUT = path.resolve(import.meta.dirname, "../web/public/preview")

const getJson = async (url) => {
  const response = await fetch(`${BASE}/api${url}`)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.json()
}

const download = async (url) => {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      if (attempt === 4) throw error
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt))
    }
  }
}

const [products, collections] = await Promise.all([getJson("/products"), getJson("/collections")])
const images = products.flatMap((product) => product.images)

rmSync(OUT, { recursive: true, force: true })
mkdirSync(path.join(OUT, "images"), { recursive: true })

const damaged = new Set()
let next = 0
let done = 0
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < images.length) {
    const image = images[next++]
    const source = new URL(image.url, BASE)
    const body = await download(source)
    const file = `${image.id}.webp`
    try {
      await sharp(body)
        .rotate()
        .resize({ width: 900, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(path.join(OUT, "images", file))
      image.url = `/preview/images/${file}`
    } catch (error) {
      // A damaged photo would show half grey, so the preview leaves it out.
      console.warn(`  Skipped damaged photo ${image.url}: ${error.message.split("\n")[0]}`)
      damaged.add(image.id)
    }
    if (++done % 10 === 0) console.log(`  ${done}/${images.length}`)
  }
}))

for (const product of products) product.images = product.images.filter((image) => !damaged.has(image.id))

writeFileSync(path.join(OUT, "data.json"), JSON.stringify({ orders: [], products, collections }))
console.log(`Preview ready: ${products.length} products, ${images.length - damaged.size} photos`)
