import type { AdminOrder, CheckoutInput, Order, OrderItem, OrderStatus } from "../../model/order.ts"
import { newId, newOrderNumber, randomToken, sha256Hex } from "../lib/crypto.ts"
import { nowIso } from "../lib/http.ts"
import { mediaUrl } from "./catalog.ts"

interface OrderRow {
  id: string
  number: string
  access_token_hash: string
  customer_id: string | null
  email: string
  name: string
  phone: string
  address: string
  status: OrderStatus
  total: number
  currency: "NGN"
  bachs_checkout_id: string | null
  note: string
  created_at: string
  paid_at: string | null
}

interface ItemRow {
  order_id: string
  product_id: string | null
  product_name: string
  image_key: string | null
  unit_price: number
  quantity: number
  size: OrderItem["size"]
  measurements: string | null
}

const toItem = (row: ItemRow): OrderItem => ({
  productId: row.product_id,
  name: row.product_name,
  imageUrl: row.image_key ? mediaUrl(row.image_key) : null,
  unitPrice: row.unit_price,
  quantity: row.quantity,
  size: row.size,
  measurements: row.measurements ? JSON.parse(row.measurements) : null
})

const toOrder = (row: OrderRow, items: ReadonlyArray<ItemRow>): Order => ({
  number: row.number,
  status: row.status,
  total: row.total,
  currency: row.currency,
  name: row.name,
  email: row.email,
  phone: row.phone,
  address: row.address,
  items: items.map(toItem),
  createdAt: row.created_at,
  paidAt: row.paid_at
})

const toAdminOrder = (row: OrderRow, items: ReadonlyArray<ItemRow>): AdminOrder => ({
  ...toOrder(row, items),
  id: row.id,
  note: row.note,
  hasAccount: row.customer_id !== null
})

const withItems = async (db: D1Database, rows: ReadonlyArray<OrderRow>) => {
  if (rows.length === 0) return []
  const { results } = await db
    .prepare(`SELECT * FROM order_items WHERE order_id IN (${rows.map(() => "?").join(",")})`)
    .bind(...rows.map((row) => row.id))
    .all<ItemRow>()
  const byOrder = Map.groupBy(results, (item) => item.order_id)
  return rows.map((row) => [row, byOrder.get(row.id) ?? []] as const)
}

export type PricedItem = {
  productId: string
  name: string
  imageKey: string | null
  unitPrice: number
  item: CheckoutInput["items"][number]
}

export type PriceResult = { items: PricedItem[]; total: number } | { error: string }

export const STANDARD_SIZES = ["S", "M", "L", "XL"]

export const priceCart = async (db: D1Database, input: CheckoutInput): Promise<PriceResult> => {
  const ids = [...new Set(input.items.map((item) => item.productId))]
  const { results } = await db
    .prepare(
      `SELECT p.id, p.name, p.price, p.sizes, p.visible,
        (SELECT key FROM product_images i WHERE i.product_id = p.id ORDER BY position LIMIT 1) AS image_key
       FROM products p WHERE p.id IN (${ids.map(() => "?").join(",")})`
    )
    .bind(...ids)
    .all<{ id: string; name: string; price: number | null; sizes: string; visible: number; image_key: string | null }>()
  const products = new Map(results.map((row) => [row.id, row]))

  const items: PricedItem[] = []
  for (const item of input.items) {
    const product = products.get(item.productId)
    if (!product || product.visible !== 1) return { error: "Something in your cart is no longer available" }
    if (product.price === null) return { error: `${product.name} can't be bought online. Book an appointment instead.` }
    const listed = JSON.parse(product.sizes) as string[]
    const offered = listed.length > 0 ? listed : STANDARD_SIZES
    if (item.size && !offered.includes(item.size)) {
      return { error: `${product.name} isn't available in size ${item.size}` }
    }
    items.push({ productId: product.id, name: product.name, imageKey: product.image_key, unitPrice: product.price, item })
  }
  return { items, total: items.reduce((sum, line) => sum + line.unitPrice * line.item.quantity, 0) }
}

export const createOrder = async (
  db: D1Database,
  input: { contact: CheckoutInput["contact"]; customerId: string | null; items: PricedItem[]; total: number }
) => {
  const id = newId()
  const accessToken = randomToken(24)
  const now = nowIso()
  for (let attempt = 0; attempt < 5; attempt++) {
    const number = newOrderNumber()
    try {
      await db.batch([
        db.prepare(
          `INSERT INTO orders (id, number, access_token_hash, customer_id, email, name, phone, address, status, total,
            currency, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, 'NGN', ?, ?)`
        ).bind(
          id,
          number,
          await sha256Hex(accessToken),
          input.customerId,
          input.contact.email.toLowerCase(),
          input.contact.name,
          input.contact.phone,
          input.contact.address,
          input.total,
          now,
          now
        ),
        ...input.items.map((line) =>
          db.prepare(
            `INSERT INTO order_items (id, order_id, product_id, product_name, image_key, unit_price, quantity, size,
              measurements) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            newId(),
            id,
            line.productId,
            line.name,
            line.imageKey,
            line.unitPrice,
            line.item.quantity,
            line.item.size ?? null,
            line.item.measurements ? JSON.stringify(line.item.measurements) : null
          )
        )
      ])
      return { id, number, accessToken }
    } catch (error) {
      if (!String(error).includes("UNIQUE") || attempt === 4) throw error
    }
  }
  throw new Error("Could not create an order number")
}

export const setCheckoutId = (db: D1Database, orderId: string, checkoutId: string) =>
  db.prepare("UPDATE orders SET bachs_checkout_id = ?, updated_at = ? WHERE id = ?").bind(checkoutId, nowIso(), orderId).run()

export const findOrderRow = (db: D1Database, by: { number?: string; checkoutId?: string; id?: string }) => {
  if (by.id) return db.prepare("SELECT * FROM orders WHERE id = ?").bind(by.id).first<OrderRow>()
  if (by.number) return db.prepare("SELECT * FROM orders WHERE number = ?").bind(by.number).first<OrderRow>()
  if (by.checkoutId) {
    return db.prepare("SELECT * FROM orders WHERE bachs_checkout_id = ?").bind(by.checkoutId).first<OrderRow>()
  }
  return Promise.resolve(null)
}

export const orderWithItems = async (db: D1Database, row: OrderRow) => {
  const [[, items]] = (await withItems(db, [row])) as [[OrderRow, ItemRow[]]]
  return toOrder(row, items)
}

export const getOrderByToken = async (db: D1Database, number: string, token: string) => {
  const row = await findOrderRow(db, { number })
  if (!row || row.access_token_hash !== (await sha256Hex(token))) return null
  return orderWithItems(db, row)
}

export const getOrderByEmail = async (db: D1Database, number: string, email: string) => {
  const row = await findOrderRow(db, { number })
  if (!row || row.email !== email.toLowerCase()) return null
  return orderWithItems(db, row)
}

export const getCustomerOrder = async (db: D1Database, number: string, customerId: string) => {
  const row = await findOrderRow(db, { number })
  if (!row || row.customer_id !== customerId) return null
  return orderWithItems(db, row)
}

export const listCustomerOrders = async (db: D1Database, customerId: string) => {
  const { results } = await db
    .prepare("SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC")
    .bind(customerId)
    .all<OrderRow>()
  return (await withItems(db, results)).map(([row, items]) => toOrder(row, items))
}

export const listAdminOrders = async (db: D1Database) => {
  const { results } = await db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 500").all<OrderRow>()
  return (await withItems(db, results)).map(([row, items]) => toAdminOrder(row, items))
}

export const updateAdminOrder = async (
  db: D1Database,
  id: string,
  update: { status?: "paid" | "in_progress" | "completed" | "cancelled"; note?: string }
) => {
  const row = await findOrderRow(db, { id })
  if (!row) return { error: "not_found" } as const
  const settled = ["paid", "in_progress", "completed", "cancelled"].includes(row.status)
  if (update.status && !settled) return { error: "unpaid" } as const
  const status = update.status ?? row.status
  const note = update.note ?? row.note
  await db.prepare("UPDATE orders SET status = ?, note = ?, updated_at = ? WHERE id = ?").bind(status, note, nowIso(), id).run()
  const [[updated, items]] = (await withItems(db, [{ ...row, status, note }])) as [[OrderRow, ItemRow[]]]
  return { order: toAdminOrder(updated, items) } as const
}

const PAYABLE: ReadonlyArray<OrderStatus> = ["awaiting_payment", "payment_failed", "expired"]

export const markOrderPaid = async (db: D1Database, row: OrderRow, chargeId: string | null) => {
  if (!PAYABLE.includes(row.status)) return false
  const now = nowIso()
  await db
    .prepare(
      `UPDATE orders SET status = 'paid', paid_at = ?, bachs_charge_id = COALESCE(?, bachs_charge_id), updated_at = ?
       WHERE id = ? AND status IN ('awaiting_payment', 'payment_failed', 'expired')`
    )
    .bind(now, chargeId, now, row.id)
    .run()
  return true
}

export const markOrderUnpaid = async (db: D1Database, row: OrderRow, status: "payment_failed" | "expired") => {
  if (row.status !== "awaiting_payment") return false
  await db
    .prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status = 'awaiting_payment'")
    .bind(status, nowIso(), row.id)
    .run()
  return true
}

export const addOrderNote = (db: D1Database, row: OrderRow, line: string) =>
  db
    .prepare("UPDATE orders SET note = ?, updated_at = ? WHERE id = ?")
    .bind(row.note ? `${row.note}\n${line}` : line, nowIso(), row.id)
    .run()
