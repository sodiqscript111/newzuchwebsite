import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react"
import { api, type Collection, type Product, type ProductFields } from "./api.ts"

const STANDARD_SIZES = ["XS", "S", "M", "L", "XL", "XXL"]
const PLACEHOLDER_NOTE = "Placeholder price"

interface Props {
  readonly product: Product | undefined
  readonly collections: ReadonlyArray<Collection>
  readonly onCollectionAdded: (collection: Collection) => void
  readonly onSaved: (product: Product) => void
  readonly onDeleted: (id: string) => void
  readonly notify: (text: string, isError?: boolean) => void
}

const fieldsOf = (product: Product | undefined): ProductFields => ({
  collectionSlug: product?.collectionSlug ?? "",
  name: product?.name ?? "",
  price: product?.price ?? null,
  priceNote: product?.priceNote ?? "",
  description: product?.description ?? "",
  sizes: product?.sizes ?? ["S", "M", "L", "XL"],
  visible: product?.visible ?? true
})

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong")

export function ProductEditor({ product, collections, onCollectionAdded, onSaved, onDeleted, notify }: Props) {
  const [fields, setFields] = useState(() => fieldsOf(product))
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [addingCollection, setAddingCollection] = useState(false)
  const [newCollection, setNewCollection] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  // A new product has no id yet, so its photos wait here until the first save.
  const [pending, setPending] = useState<ReadonlyArray<{ file: File; preview: string }>>([])
  const fileInput = useRef<HTMLInputElement>(null)

  const previews = useRef(pending)
  previews.current = pending
  useEffect(() => () => previews.current.forEach((photo) => URL.revokeObjectURL(photo.preview)), [])

  const set = <K extends keyof ProductFields>(key: K, value: ProductFields[K]) =>
    setFields((current) => ({ ...current, [key]: value }))

  const dirty = !product || JSON.stringify(fields) !== JSON.stringify(fieldsOf(product))
  const sizes = [...new Set([...STANDARD_SIZES, ...fields.sizes])]

  const toggleSize = (size: string) =>
    set("sizes", fields.sizes.includes(size) ? fields.sizes.filter((s) => s !== size) : [...fields.sizes, size])

  const changePrice = (value: string) => {
    const price = value === "" ? null : Math.max(0, Math.round(Number(value)))
    // Typing a real price replaces the placeholder from the old site.
    setFields((current) => ({
      ...current,
      price,
      priceNote: current.priceNote === PLACEHOLDER_NOTE ? "" : current.priceNote
    }))
  }

  const addCollection = async () => {
    try {
      const collection = await api.createCollection(newCollection.trim())
      onCollectionAdded(collection)
      set("collectionSlug", collection.slug)
      setAddingCollection(false)
      setNewCollection("")
    } catch (error) {
      notify(messageOf(error), true)
    }
  }

  const addPhotos = async (files: ReadonlyArray<File>) => {
    if (files.length === 0) return
    if (!product) {
      setPending((current) => [...current, ...files.map((file) => ({ file, preview: URL.createObjectURL(file) }))])
      return
    }
    setUploading(true)
    try {
      onSaved(await api.addPhotos(product.id, files))
      notify(files.length === 1 ? "Photo added" : `${files.length} photos added`)
    } catch (error) {
      notify(messageOf(error), true)
    } finally {
      setUploading(false)
    }
  }

  const movePhoto = async (index: number, offset: number) => {
    if (!product) return
    const ids = product.images.map((image) => image.id)
    const [moved] = ids.splice(index, 1)
    ids.splice(index + offset, 0, moved)
    try {
      onSaved(await api.orderPhotos(product.id, ids))
    } catch (error) {
      notify(messageOf(error), true)
    }
  }

  const removePhoto = async (imageId: string) => {
    if (!product) return
    try {
      onSaved(await api.removePhoto(product.id, imageId))
    } catch (error) {
      notify(messageOf(error), true)
    }
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      if (product) {
        onSaved(await api.updateProduct(product.id, fields))
        notify("Saved")
      } else {
        let created = await api.createProduct(fields)
        if (pending.length > 0) created = await api.addPhotos(created.id, pending.map((photo) => photo.file))
        onSaved(created)
        notify("Product created")
        window.location.hash = `/products/${created.id}`
      }
    } catch (error) {
      notify(messageOf(error), true)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!product) return
    try {
      await api.removeProduct(product.id)
      onDeleted(product.id)
      notify("Product deleted")
      window.location.hash = "/products"
    } catch (error) {
      notify(messageOf(error), true)
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    addPhotos([...event.dataTransfer.files])
  }

  const images = product?.images ?? []
  const photoCount = images.length + pending.length

  return (
    <form className="editor" onSubmit={save}>
      <a className="back" href="#/products">← Products</a>
      <h1>{product ? product.name : "New product"}</h1>

      <section
        className={`photos${dragOver ? " drag-over" : ""}`}
        aria-label="Photos"
        onDragOver={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div className="photo-grid">
          {images.map((image, index) => (
            <figure key={image.id}>
              <img src={image.url} alt="" />
              {index === 0 && <span className="tag on-photo">Main</span>}
              <figcaption>
                <button type="button" aria-label="Move photo left" disabled={index === 0} onClick={() => movePhoto(index, -1)}>←</button>
                <button type="button" aria-label="Move photo right" disabled={index === images.length - 1} onClick={() => movePhoto(index, 1)}>→</button>
                <button type="button" aria-label="Remove photo" onClick={() => removePhoto(image.id)}>×</button>
              </figcaption>
            </figure>
          ))}
          {pending.map((photo, index) => (
            <figure key={photo.preview}>
              <img src={photo.preview} alt="" />
              {index === 0 && <span className="tag on-photo">Main</span>}
              <figcaption>
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => setPending((current) => current.filter((p) => p !== photo))}
                >
                  ×
                </button>
              </figcaption>
            </figure>
          ))}
          <button type="button" className="add-photo" disabled={uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? "Uploading…" : photoCount === 0 ? "Add photos" : "Add more"}
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          hidden
          onChange={(event) => {
            addPhotos([...(event.target.files ?? [])])
            event.target.value = ""
          }}
        />
        <p className="muted hint">
          The first photo is the main one. JPG, PNG or WebP. Large photos are resized for you.
          {product && " Photo changes save straight away."}
        </p>
      </section>

      <label className="field">
        <span>Name</span>
        <input required value={fields.name} onChange={(event) => set("name", event.target.value)} />
      </label>

      <div className="field">
        <label htmlFor="collection">Collection</label>
        {addingCollection
          ? (
            <div className="inline">
              <input
                autoFocus
                aria-label="New collection name"
                placeholder="Collection name"
                value={newCollection}
                onChange={(event) => setNewCollection(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    addCollection()
                  }
                }}
              />
              <button type="button" className="button" disabled={!newCollection.trim()} onClick={addCollection}>Add</button>
              <button type="button" className="button" onClick={() => setAddingCollection(false)}>Cancel</button>
            </div>
          )
          : (
            <div className="inline">
              <select
                id="collection"
                required
                value={fields.collectionSlug}
                onChange={(event) => set("collectionSlug", event.target.value)}
              >
                <option value="" disabled>Choose a collection</option>
                {collections.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
              <button type="button" className="button" onClick={() => setAddingCollection(true)}>New</button>
            </div>
          )}
      </div>

      <div className="field-row">
        <label className="field">
          <span>Price (₦)</span>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={fields.price ?? ""}
            onChange={(event) => changePrice(event.target.value)}
          />
        </label>
        <label className="field">
          <span>{fields.price === null ? "Show instead of a price" : "Price note"}</span>
          <input
            value={fields.priceNote}
            placeholder={fields.price === null ? "Book Appointment" : ""}
            onChange={(event) => set("priceNote", event.target.value)}
          />
        </label>
      </div>

      <label className="field">
        <span>Description</span>
        <textarea rows={4} value={fields.description} onChange={(event) => set("description", event.target.value)} />
      </label>

      <div className="field">
        <span>Sizes</span>
        <div className="chips">
          {sizes.map((size) => (
            <button key={size} type="button" aria-pressed={fields.sizes.includes(size)} onClick={() => toggleSize(size)}>
              {size}
            </button>
          ))}
        </div>
      </div>

      <label className="switch">
        <input type="checkbox" checked={fields.visible} onChange={(event) => set("visible", event.target.checked)} />
        <span>Show on the site</span>
      </label>

      <div className="editor-actions">
        <button type="submit" className="button primary" disabled={saving || !dirty}>
          {saving ? "Saving…" : product ? (dirty ? "Save changes" : "Saved") : "Create product"}
        </button>
        {product && (
          confirmDelete
            ? (
              <>
                <button type="button" className="button danger" onClick={remove}>Yes, delete</button>
                <button type="button" className="button" onClick={() => setConfirmDelete(false)}>Keep it</button>
              </>
            )
            : <button type="button" className="button quiet" onClick={() => setConfirmDelete(true)}>Delete product</button>
        )}
      </div>
    </form>
  )
}
