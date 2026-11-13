import type { Customer } from "../../model/account.ts"
import { hashPassword, newId, randomToken, sha256Hex, verifyPassword } from "../lib/crypto.ts"
import { nowIso } from "../lib/http.ts"

export const createCustomer = async (
  db: D1Database,
  input: { name: string; email: string; phone: string; password: string }
) => {
  const existing = await db.prepare("SELECT id FROM customers WHERE email = ?").bind(input.email).first()
  if (existing) return null
  const customer: Customer = { id: newId(), name: input.name, email: input.email.toLowerCase(), phone: input.phone }
  await db
    .prepare("INSERT INTO customers (id, email, name, phone, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(customer.id, customer.email, customer.name, customer.phone, await hashPassword(input.password), nowIso())
    .run()
  return customer
}

export const checkLogin = async (db: D1Database, email: string, password: string) => {
  const row = await db
    .prepare("SELECT id, name, email, phone, password_hash FROM customers WHERE email = ?")
    .bind(email)
    .first<Customer & { password_hash: string }>()
  if (!row || !(await verifyPassword(password, row.password_hash))) return null
  const { password_hash: _, ...customer } = row
  return customer
}

export const getCustomer = (db: D1Database, id: string) =>
  db.prepare("SELECT id, name, email, phone FROM customers WHERE id = ?").bind(id).first<Customer>()

const RESET_MINUTES = 60
const RESET_COOLDOWN_MS = 2 * 60_000

export const createPasswordReset = async (db: D1Database, email: string) => {
  const customer = await db.prepare("SELECT id, name, email FROM customers WHERE email = ?").bind(email).first<{
    id: string
    name: string
    email: string
  }>()
  if (!customer) return null
  const recent = await db
    .prepare("SELECT 1 FROM password_resets WHERE customer_id = ? AND created_at > ?")
    .bind(customer.id, new Date(Date.now() - RESET_COOLDOWN_MS).toISOString())
    .first()
  if (recent) return null
  const token = randomToken()
  const now = new Date()
  await db
    .prepare("INSERT INTO password_resets (token_hash, customer_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), customer.id, now.toISOString(), new Date(now.getTime() + RESET_MINUTES * 60_000).toISOString())
    .run()
  return { customer, token }
}

export const resetPassword = async (db: D1Database, token: string, password: string) => {
  const tokenHash = await sha256Hex(token)
  const reset = await db
    .prepare("SELECT customer_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
    .bind(tokenHash, nowIso())
    .first<{ customer_id: string }>()
  if (!reset) return null
  await db.batch([
    db.prepare("UPDATE customers SET password_hash = ? WHERE id = ?").bind(await hashPassword(password), reset.customer_id),
    db.prepare("UPDATE password_resets SET used_at = ? WHERE customer_id = ? AND used_at IS NULL").bind(nowIso(), reset.customer_id),
    db.prepare("DELETE FROM sessions WHERE customer_id = ?").bind(reset.customer_id)
  ])
  return getCustomer(db, reset.customer_id)
}
