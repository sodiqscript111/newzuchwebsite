export type Size = "XS" | "S" | "M" | "L" | "XL" | "XXL"

export interface Collection {
  slug: string
  name: string
}

export interface ProductImage {
  id: string
  url: string
}

export interface Product {
  id: string
  slug: string
  collectionSlug: string
  name: string
  price: number | null
  priceNote: string
  description: string
  sizes: Array<string>
  visible: boolean
  images: Array<ProductImage>
}

export type ProductFields = Pick<
  Product,
  "collectionSlug" | "name" | "price" | "priceNote" | "description" | "sizes" | "visible"
>

export type OrderStatus =
  | "awaiting_payment"
  | "paid"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "payment_failed"
  | "expired"

export interface Measurements {
  chest: number
  waist: number
  hips: number
  length: number
}

export interface OrderItem {
  productId: string | null
  name: string
  imageUrl: string | null
  unitPrice: number
  quantity: number
  size: Size | null
  measurements: Measurements | null
}

export interface Order {
  id: string
  number: string
  status: OrderStatus
  total: number
  name: string
  email: string
  phone: string
  address: string
  note: string
  hasAccount: boolean
  items: Array<OrderItem>
  createdAt: string
  paidAt: string | null
}
