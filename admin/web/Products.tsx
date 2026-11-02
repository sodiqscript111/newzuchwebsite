import { useState } from "react"
import type { Collection, Product } from "./api.ts"

export const formatPrice = (product: Product) =>
  product.price === null ? product.priceNote || "No price" : `₦${product.price.toLocaleString("en-NG")}`

interface Props {
  readonly products: ReadonlyArray<Product>
  readonly collections: ReadonlyArray<Collection>
}

export function Products({ products, collections }: Props) {
  const [search, setSearch] = useState("")
  const [collection, setCollection] = useState("")
  const [visibility, setVisibility] = useState<"all" | "on" | "hidden">("all")

  const term = search.trim().toLowerCase()
  const shown = products.filter((p) =>
    (!term || p.name.toLowerCase().includes(term)) &&
    (!collection || p.collectionSlug === collection) &&
    (visibility === "all" || p.visible === (visibility === "on"))
  )
  const collectionName = (slug: string) => collections.find((c) => c.slug === slug)?.name ?? slug

  return (
    <>
      <div className="page-head">
        <h1>Products</h1>
        <a className="button primary" href="#/products/new">New product</a>
      </div>

      <div className="filters">
        <input
          type="search"
          aria-label="Search products"
          placeholder="Search products"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select aria-label="Collection" value={collection} onChange={(event) => setCollection(event.target.value)}>
          <option value="">All collections</option>
          {collections.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <div className="tabs" role="group" aria-label="Filter by visibility">
          <button aria-pressed={visibility === "all"} onClick={() => setVisibility("all")}>All</button>
          <button aria-pressed={visibility === "on"} onClick={() => setVisibility("on")}>On site</button>
          <button aria-pressed={visibility === "hidden"} onClick={() => setVisibility("hidden")}>Hidden</button>
        </div>
      </div>

      {shown.length === 0
        ? <p className="empty">No products match.</p>
        : (
          <div className="product-grid">
            {shown.map((product) => (
              <a key={product.id} className={`product-card${product.visible ? "" : " is-hidden"}`} href={`#/products/${product.id}`}>
                <div className="product-photo">
                  {product.images[0]
                    ? <img src={product.images[0].url} alt="" loading="lazy" />
                    : <span className="no-photo">No photos</span>}
                  {!product.visible && <span className="tag on-photo">Hidden</span>}
                </div>
                <h2>{product.name}</h2>
                <p>{formatPrice(product)}</p>
                <p className="muted">{collectionName(product.collectionSlug)}</p>
                {product.price !== null && product.priceNote && <p className="warn">{product.priceNote}</p>}
              </a>
            ))}
          </div>
        )}
    </>
  )
}
