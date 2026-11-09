import type { Context } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import type { AppEnv } from "../app.ts"
import { randomToken, sha256Hex } from "./crypto.ts"

type SessionKind = "customer" | "admin"

const COOKIE: Record<SessionKind, string> = { customer: "zuch_session", admin: "zuch_admin" }
const LIFETIME_DAYS: Record<SessionKind, number> = { customer: 30, admin: 1 }

export const startSession = async (c: Context<AppEnv>, kind: SessionKind, customerId: string | null) => {
  const token = randomToken()
  const days = LIFETIME_DAYS[kind]
  const expiresAt = new Date(Date.now() + days * 86_400_000)
  await c.env.DB.prepare("INSERT INTO sessions (token_hash, kind, customer_id, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), kind, customerId, expiresAt.toISOString())
    .run()
  setCookie(c, COOKIE[kind], token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    expires: expiresAt
  })
}

export const readSession = async (c: Context<AppEnv>, kind: SessionKind) => {
  const token = getCookie(c, COOKIE[kind])
  if (!token) return null
  const session = await c.env.DB.prepare(
    "SELECT customer_id FROM sessions WHERE token_hash = ? AND kind = ? AND expires_at > ?"
  )
    .bind(await sha256Hex(token), kind, new Date().toISOString())
    .first<{ customer_id: string | null }>()
  return session ? { customerId: session.customer_id } : null
}

export const endSession = async (c: Context<AppEnv>, kind: SessionKind) => {
  const token = getCookie(c, COOKIE[kind])
  if (token) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run()
  }
  deleteCookie(c, COOKIE[kind], { path: "/", secure: true })
}
