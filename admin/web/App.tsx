import { useCallback, useEffect, useRef, useState } from "react"
import { api, isPreview, type Collection, type Order, type Product } from "./api.ts"
import { Orders } from "./Orders.tsx"
import { ProductEditor } from "./ProductEditor.tsx"
import { Products } from "./Products.tsx"

const useHash = () => {
  const [hash, setHash] = useState(() => window.location.hash.slice(1))
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash.slice(1))
      window.scrollTo(0, 0)
    }
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])
  return hash
}

export function App() {
  const hash = useHash()
  const [orders, setOrders] = useState<ReadonlyArray<Order> | null>(null)
  const [products, setProducts] = useState<ReadonlyArray<Product> | null>(null)
  const [collections, setCollections] = useState<ReadonlyArray<Collection>>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; isError: boolean } | null>(null)
  const toastTimer = useRef<number>(undefined)

  const notify = useCallback((text: string, isError = false) => {
    window.clearTimeout(toastTimer.current)
    setToast({ text, isError })
    toastTimer.current = window.setTimeout(() => setToast(null), isError ? 6000 : 2500)
  }, [])

  const load = useCallback(() => {
    setLoadError(null)
    Promise.all([api.orders(), api.products(), api.collections()])
      .then(([orders, products, collections]) => {
        setOrders(orders)
        setProducts(products)
        setCollections(collections)
      })
      .catch(() => setLoadError("Could not reach the server."))
  }, [])

  useEffect(load, [load])

  const updateOrder = (next: Order) => setOrders((all) => all?.map((o) => (o.id === next.id ? next : o)) ?? null)

  const saveProduct = (next: Product) =>
    setProducts((all) => {
      if (!all) return all
      return all.some((p) => p.id === next.id) ? all.map((p) => (p.id === next.id ? next : p)) : [next, ...all]
    })

  const dropProduct = (id: string) => setProducts((all) => all?.filter((p) => p.id !== id) ?? null)

  const [path, productId] = hash.split("/").filter(Boolean)
  // Open on Orders when there is something to handle, otherwise on Products.
  const section = path ?? (orders?.length ? "orders" : "products")
  const openOrders = orders?.filter((o) => o.status !== "done").length ?? 0

  let page = <p className="empty">Loading…</p>
  if (loadError) {
    page = (
      <div className="empty">
        <p>{loadError}</p>
        <button className="button" onClick={load}>Try again</button>
      </div>
    )
  } else if (orders && products) {
    if (section === "products" && productId) {
      const product = products.find((p) => p.id === productId)
      page = productId === "new" || product
        ? (
          <ProductEditor
            key={productId}
            product={product}
            collections={collections}
            onCollectionAdded={(c) => setCollections((all) => [...all, c].sort((a, b) => a.name.localeCompare(b.name)))}
            onSaved={saveProduct}
            onDeleted={dropProduct}
            notify={notify}
          />
        )
        : <p className="empty">That product no longer exists.</p>
    } else if (section === "products") {
      page = <Products products={products} collections={collections} />
    } else {
      page = <Orders orders={orders} onChange={updateOrder} notify={notify} />
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="brand-row">
          <a className="brand" href="#/">ZUCH</a>
          {isPreview && <span className="tag">Preview</span>}
        </div>
        <nav aria-label="Main">
          <a href="#/orders" aria-current={section !== "products" ? "page" : undefined}>
            Orders{openOrders > 0 && <span className="count">{openOrders}</span>}
          </a>
          <a href="#/products" aria-current={section === "products" ? "page" : undefined}>Products</a>
        </nav>
      </header>
      <main>{page}</main>
      {toast && <div className={`toast${toast.isError ? " error" : ""}`} role="status">{toast.text}</div>}
    </>
  )
}
