import type { Customer } from "../../model/account.ts"
import { hashPassword, newId, verifyPassword } from "../lib/crypto.ts"
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
