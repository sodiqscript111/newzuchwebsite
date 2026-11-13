import { ForgotPassword, Login, Register, ResetPassword } from "../../model/account.ts"
import { newApp } from "../app.ts"
import { checkLogin, createCustomer, createPasswordReset, getCustomer, resetPassword } from "../db/customers.ts"
import { sendPasswordResetEmail } from "../email.ts"
import { getCustomerOrder, listCustomerOrders } from "../db/orders.ts"
import { readJson } from "../lib/http.ts"
import { endSession, readSession, startSession } from "../lib/session.ts"
import { syncPayment } from "../payments.ts"

export const account = newApp()

account.post("/register", async (c) => {
  const input = await readJson(c, Register)
  const customer = await createCustomer(c.env.DB, input)
  if (!customer) return c.json({ message: "An account with this email already exists. Sign in instead." }, 409)
  await startSession(c, "customer", customer.id)
  return c.json({ customer }, 201)
})

account.post("/login", async (c) => {
  const { email, password } = await readJson(c, Login)
  const customer = await checkLogin(c.env.DB, email, password)
  if (!customer) return c.json({ message: "That email and password don't match" }, 401)
  await startSession(c, "customer", customer.id)
  return c.json({ customer })
})

account.post("/forgot", async (c) => {
  const { email } = await readJson(c, ForgotPassword)
  const reset = await createPasswordReset(c.env.DB, email)
  if (reset) {
    const link = `${c.env.PUBLIC_URL.replace(/\/+$/, "")}/reset-password/${reset.token}`
    await sendPasswordResetEmail(c.env, reset.customer.email, reset.customer.name, link)
  }
  return c.json({ message: "If that email has an account, we've sent a link to reset the password." })
})

account.post("/reset", async (c) => {
  const { token, password } = await readJson(c, ResetPassword)
  const customer = await resetPassword(c.env.DB, token, password)
  if (!customer) return c.json({ message: "This link has expired or was already used. Ask for a new one." }, 400)
  await startSession(c, "customer", customer.id)
  return c.json({ customer })
})

account.post("/logout", async (c) => {
  await endSession(c, "customer")
  return c.body(null, 204)
})

account.get("/", async (c) => {
  const session = await readSession(c, "customer")
  const customer = session?.customerId ? await getCustomer(c.env.DB, session.customerId) : null
  return c.json({ customer })
})

account.get("/orders", async (c) => {
  const session = await readSession(c, "customer")
  if (!session?.customerId) return c.json({ message: "Sign in to see your orders" }, 401)
  return c.json(await listCustomerOrders(c.env.DB, session.customerId))
})

account.get("/orders/:number", async (c) => {
  const session = await readSession(c, "customer")
  if (!session?.customerId) return c.json({ message: "Sign in to see your orders" }, 401)
  await syncPayment(c.env, c.req.param("number"))
  const order = await getCustomerOrder(c.env.DB, c.req.param("number"), session.customerId)
  return order ? c.json(order) : c.json({ message: "Order not found" }, 404)
})
