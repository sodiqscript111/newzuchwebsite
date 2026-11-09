import type { Collection, Order, OrderStatus, Product, ProductFields } from "./types.ts"

export type { Collection, Order, OrderStatus, Product, ProductFields }

export class SignedOut extends Error {}

const MAX_PHOTO_BYTES = 1_500_000
const MAX_PHOTO_SIDE = 2000

// Phone photos run to several MB. Anything the browser cannot read is sent as it is,
// so the server can answer with a clear message.
async function shrinkPhoto(file: File): Promise<File> {
  if (file.size <= MAX_PHOTO_BYTES) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85))
    return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file
  } catch {
    return file
  }
}

async function request<A>(method: string, url: string, body?: unknown): Promise<A> {
  const isForm = body instanceof FormData
  const response = await fetch(`/api/admin${url}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined || isForm ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body)
  })
  const text = await response.text()
  if (response.status === 401 && url !== "/login") throw new SignedOut("Signed out")
  if (!response.ok) {
    let message = "Something went wrong. Try again."
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? message
    } catch {
      // Not JSON, keep the generic message.
    }
    throw new Error(message)
  }
  return (text ? JSON.parse(text) : undefined) as A
}

export const api = {
  login: (password: string) => request<void>("POST", "/login", { password }),
  logout: () => request<void>("POST", "/logout"),
  me: () => request<{ signedIn: true }>("GET", "/me"),

  orders: () => request<Array<Order>>("GET", "/orders"),
  updateOrder: (id: string, update: { status?: OrderStatus; note?: string }) =>
    request<Order>("PATCH", `/orders/${id}`, update),

  collections: () => request<Array<Collection>>("GET", "/collections"),
  createCollection: (name: string) => request<Collection>("POST", "/collections", { name }),

  products: () => request<Array<Product>>("GET", "/products"),
  createProduct: (fields: ProductFields) => request<Product>("POST", "/products", fields),
  updateProduct: (id: string, fields: ProductFields) => request<Product>("PATCH", `/products/${id}`, fields),
  removeProduct: (id: string) => request<void>("DELETE", `/products/${id}`),

  addPhotos: async (id: string, files: ReadonlyArray<File>) => {
    let product: Product | undefined
    for (const file of files) {
      const form = new FormData()
      form.append("files", await shrinkPhoto(file))
      product = await request<Product>("POST", `/products/${id}/images`, form)
    }
    return product!
  },
  orderPhotos: (id: string, imageIds: ReadonlyArray<string>) =>
    request<Product>("PUT", `/products/${id}/images/order`, { imageIds }),
  removePhoto: (id: string, imageId: string) => request<Product>("DELETE", `/products/${id}/images/${imageId}`)
}
