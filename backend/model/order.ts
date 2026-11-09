import { z } from "zod"
import { Naira, ProductId, Size } from "./product.ts"

export const OrderStatus = z.enum([
  "awaiting_payment",
  "paid",
  "in_progress",
  "completed",
  "cancelled",
  "payment_failed",
  "expired"
])
export type OrderStatus = z.infer<typeof OrderStatus>

const centimetres = z.number().positive("Measurements must be above 0").max(400)

export const Measurements = z.object({
  chest: centimetres,
  waist: centimetres,
  hips: centimetres,
  length: centimetres
})
export type Measurements = z.infer<typeof Measurements>

export const CheckoutItem = z
  .object({
    productId: ProductId,
    quantity: z.int().min(1).max(20),
    size: Size.optional(),
    measurements: Measurements.optional()
  })
  .refine((item) => (item.size === undefined) !== (item.measurements === undefined), {
    message: "Choose a size or enter measurements for each item"
  })
export type CheckoutItem = z.infer<typeof CheckoutItem>

export const Contact = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
  email: z.email("Enter a valid email").max(200),
  phone: z.string().trim().min(5, "Enter a valid phone number").max(30),
  address: z.string().trim().min(5, "Enter your delivery address").max(300)
})
export type Contact = z.infer<typeof Contact>

export const CheckoutInput = z.object({
  items: z.array(CheckoutItem).min(1, "Your cart is empty").max(30),
  contact: Contact
})
export type CheckoutInput = z.infer<typeof CheckoutInput>

export const OrderLookup = z.object({
  number: z.string().trim().toUpperCase().min(1).max(20),
  email: z.email().max(200)
})

export const OrderItem = z.object({
  productId: z.string().nullable(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  unitPrice: Naira,
  quantity: z.int(),
  size: Size.nullable(),
  measurements: Measurements.nullable()
})
export type OrderItem = z.infer<typeof OrderItem>

export const Order = z.object({
  number: z.string(),
  status: OrderStatus,
  total: Naira,
  currency: z.literal("NGN"),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  address: z.string(),
  items: z.array(OrderItem),
  createdAt: z.string(),
  paidAt: z.string().nullable()
})
export type Order = z.infer<typeof Order>

export const AdminOrder = Order.extend({
  id: z.string(),
  note: z.string(),
  hasAccount: z.boolean()
})
export type AdminOrder = z.infer<typeof AdminOrder>

export const AdminOrderUpdate = z.object({
  status: z.enum(["paid", "in_progress", "completed", "cancelled"]).optional(),
  note: z.string().max(2000).optional()
})
