import type { Context } from "hono"
import { CheckoutInput, OrderLookup } from "../../model/order.ts"
import { type AppEnv, newApp } from "../app.ts"
import { BachsError, createCheckoutSession } from "../bachs.ts"
import { createOrder, getOrderByEmail, getOrderByToken, priceCart, setCheckoutId } from "../db/orders.ts"
import { readJson } from "../lib/http.ts"
import { readSession } from "../lib/session.ts"

export const checkout = newApp()

export const publicUrl = (c: Context<AppEnv>) => (c.env.PUBLIC_URL || new URL(c.req.url).origin).replace(/\/+$/, "")

checkout.post("/checkout", async (c) => {
  const input = await readJson(c, CheckoutInput)
  const priced = await priceCart(c.env.DB, input)
  if ("error" in priced) return c.json({ message: priced.error }, 409)

  const usingPretendCheckout = !c.env.BACHS_SECRET_KEY && c.env.ENVIRONMENT === "development"
  if (!c.env.BACHS_SECRET_KEY && !usingPretendCheckout) {
    return c.json({ message: "Payments aren't set up yet. Please try again later." }, 503)
  }

  const session = await readSession(c, "customer")
  const order = await createOrder(c.env.DB, {
    contact: input.contact,
    customerId: session?.customerId ?? null,
    items: priced.items,
    total: priced.total
  })
  const orderPath = `/orders/${order.number}/${order.accessToken}`

  if (usingPretendCheckout) {
    return c.json({
      number: order.number,
      orderPath,
      checkoutUrl: `/api/dev/checkout/${order.id}?return=${encodeURIComponent(orderPath)}`
    })
  }

  const base = publicUrl(c)
  try {
    const bachs = await createCheckoutSession(c.env, {
      id: order.id,
      number: order.number,
      total: priced.total,
      contact: input.contact,
      successUrl: `${base}${orderPath}`,
      cancelUrl: `${base}/cart`
    })
    await setCheckoutId(c.env.DB, order.id, bachs.checkoutId)
    return c.json({ number: order.number, orderPath, checkoutUrl: bachs.checkoutUrl })
  } catch (error) {
    if (!(error instanceof BachsError) && !(error instanceof DOMException)) throw error
    console.error("Bachs checkout failed", order.number, String(error))
    return c.json({ message: "We couldn't reach the payment service. Please try again." }, 502)
  }
})

checkout.get("/orders/:number/:token", async (c) => {
  const order = await getOrderByToken(c.env.DB, c.req.param("number"), c.req.param("token"))
  return order ? c.json(order) : c.json({ message: "Order not found" }, 404)
})

checkout.post("/orders/lookup", async (c) => {
  const { number, email } = await readJson(c, OrderLookup)
  const order = await getOrderByEmail(c.env.DB, number, email)
  return order ? c.json(order) : c.json({ message: "We couldn't find an order with that number and email" }, 404)
})
