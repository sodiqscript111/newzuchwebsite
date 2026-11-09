import { html } from "hono/html"
import { newApp } from "../app.ts"
import { findOrderRow, markOrderPaid, markOrderUnpaid } from "../db/orders.ts"

export const dev = newApp()

dev.use("*", async (c, next) => {
  if (c.env.ENVIRONMENT !== "development") return c.notFound()
  await next()
})

const safeReturn = (value: string | undefined) => (value && value.startsWith("/") && !value.startsWith("//") ? value : "/")

dev.get("/checkout/:orderId", async (c) => {
  const order = await findOrderRow(c.env.DB, { id: c.req.param("orderId") })
  if (!order) return c.notFound()
  const back = encodeURIComponent(safeReturn(c.req.query("return")))
  return c.html(html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Pretend checkout</title>
        <style>
          body { font-family: system-ui, sans-serif; max-width: 420px; margin: 48px auto; padding: 0 16px; }
          button { font: inherit; padding: 12px 16px; margin: 6px 6px 0 0; cursor: pointer; }
          .note { color: #92400e; background: #fef3c7; padding: 10px 12px; border-radius: 8px; }
        </style>
      </head>
      <body>
        <p class="note">Local testing only. No real payment happens here.</p>
        <h1>Pay ₦${order.total.toLocaleString("en-NG")}</h1>
        <p>Order ${order.number} for ${order.email}</p>
        <form method="post" action="/api/dev/checkout/${order.id}/paid?return=${back}"><button>Pay (succeeds)</button></form>
        <form method="post" action="/api/dev/checkout/${order.id}/failed?return=${back}"><button>Payment fails</button></form>
        <form method="get" action="/cart"><button>Cancel</button></form>
      </body>
    </html>`)
})

dev.post("/checkout/:orderId/:result", async (c) => {
  const order = await findOrderRow(c.env.DB, { id: c.req.param("orderId") })
  if (!order) return c.notFound()
  if (c.req.param("result") === "paid") await markOrderPaid(c.env.DB, order, "dev")
  else await markOrderUnpaid(c.env.DB, order, "payment_failed")
  return c.redirect(`${safeReturn(c.req.query("return"))}?checkout_id=dev`, 303)
})
